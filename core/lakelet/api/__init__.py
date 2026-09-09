# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""The local HTTP API (brief §3.6, D3, D17, D22): the same operations as the CLI verbs over
loopback, on the same server as the catalog, under ``lakelet serve``. Every ``/api`` route
needs the per-launch bearer token from ``serve.json``; ``/v1`` stays open on loopback. Query
results stream as Arrow IPC with the gauge's verdict in the response headers.

The engine is one DuckDB connection, so requests that touch it are serialised."""

from __future__ import annotations

import dataclasses
import threading
from collections.abc import Iterator
from datetime import datetime
from typing import TYPE_CHECKING, Any

import duckdb
import pyarrow as pa
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from lakelet import __version__
from lakelet.engine import CatalogConflict
from lakelet.gauge import inputs
from lakelet.query import RedRefused
from lakelet.questions import NoSuchQuestion
from lakelet.register import MissingFiles, NotRegistrable
from lakelet.tables import NoSuchTable, TableExists, UnsupportedFile

if TYPE_CHECKING:
    from lakelet.project import Project

ARROW_STREAM = "application/vnd.apache.arrow.stream"
TAURI_ORIGINS = ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]


class ImportBody(BaseModel):
    path: str
    name: str | None = None
    mode: str = "create"


class PreviewBody(BaseModel):
    path: str
    name: str | None = None


class AttachBody(BaseModel):
    name: str
    source: str
    metadata_in_bucket: bool = False


class SqlBody(BaseModel):
    sql: str
    allow_red: bool = False
    batch_rows: int = 1000


class EstimateBody(BaseModel):
    sql: str


class QuestionBody(BaseModel):
    title: str
    sql: str


class RunBody(BaseModel):
    allow_red: bool = False


def _plain(value: Any) -> Any:
    """Dataclasses, datetimes and paths into JSON-ready values."""
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {k: _plain(v) for k, v in dataclasses.asdict(value).items()}
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_plain(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "__fspath__"):
        return str(value)
    return value


def _estimate_json(estimate) -> dict[str, Any]:
    data = _plain(estimate)
    data.pop("plan", None)
    data["line"] = estimate.line
    return data


def _arrow_stream(result, lock: threading.Lock) -> Iterator[bytes]:
    class Sink:
        """The file-like surface pyarrow expects of a Python sink; bytes are handed to the
        response as each batch is written."""

        closed = False

        def __init__(self) -> None:
            self.parts: list[bytes] = []
            self.written = 0

        def write(self, data: bytes) -> int:
            self.parts.append(bytes(data))
            self.written += len(data)
            return len(data)

        def writable(self) -> bool:
            return True

        def readable(self) -> bool:
            return False

        def seekable(self) -> bool:
            return False

        def tell(self) -> int:
            return self.written

        def flush(self) -> None:
            pass

        def close(self) -> None:
            pass

    sink = Sink()
    writer = None
    try:
        for batch in result:
            if writer is None:
                writer = pa.ipc.new_stream(sink, batch.schema)
            writer.write_batch(batch)
            yield b"".join(sink.parts)
            sink.parts.clear()
        if writer is None:
            writer = pa.ipc.new_stream(sink, result._reader.schema)
        writer.close()
        yield b"".join(sink.parts)
    finally:
        result.close()
        lock.release()


def create_router(project: Project, token: str) -> APIRouter:
    router = APIRouter(prefix="/api")
    lock = threading.Lock()

    def authorised(request: Request) -> None:
        header = request.headers.get("authorization", "")
        if header != f"Bearer {token}":
            raise HTTPException(401, {"error": "unauthorised", "message": "bearer token required"})

    def error(status: int, kind: str, message: str, **extra: Any) -> JSONResponse:
        return JSONResponse({"error": kind, "message": message, **extra}, status_code=status)

    guarded = [Depends(authorised)]

    # -- health -----------------------------------------------------------------------

    @router.get("/health", dependencies=guarded)
    def health() -> dict[str, Any]:
        with lock:
            machine = inputs.machine_profile(project.engine, str(project.root))
        cache = inputs.load_machine_cache(project.cache_dir)
        return {
            "lakelet": __version__,
            "duckdb": duckdb.__version__,
            "project": project.config.project.name,
            "root": str(project.root),
            "machine": machine,
            "throughput_local_mbps": cache.get("throughput_local_mbps"),
            "bandwidth_mbps": cache.get("bandwidth_mbps"),
        }

    # -- tables -----------------------------------------------------------------------

    @router.get("/tables", dependencies=guarded)
    def tables() -> list[dict[str, Any]]:
        with lock:
            return _plain(project.tables.list())

    @router.get("/tables/discover", dependencies=guarded)
    def discover(prefix: str) -> list[dict[str, Any]]:
        with lock:
            return _plain(project.tables.discover(prefix))

    @router.get("/tables/{name}", dependencies=guarded)
    def describe(name: str):
        with lock:
            try:
                return _plain(project.tables.describe(name))
            except NoSuchTable:
                return error(404, "no_such_table", f"no table named {name}")

    @router.get("/tables/{name}/sample", dependencies=guarded)
    def sample(name: str, n: int = 5, truncate: int | None = 80):
        with lock:
            try:
                return _plain(project.tables.sample(name, n=n, truncate=truncate))
            except NoSuchTable:
                return error(404, "no_such_table", f"no table named {name}")

    @router.post("/preview", dependencies=guarded)
    def preview(body: PreviewBody):
        with lock:
            try:
                return _plain(project.tables.preview(body.path, name=body.name))
            except (UnsupportedFile, FileNotFoundError) as e:
                return error(400, "bad_file", str(e))

    @router.post("/import", dependencies=guarded)
    def import_(body: ImportBody):
        from pathlib import Path

        with lock:
            try:
                if Path(body.path).is_dir():
                    infos = project.tables.import_dir(body.path, mode=body.mode)
                else:
                    infos = [project.tables.import_file(body.path, name=body.name, mode=body.mode)]
            except TableExists as e:
                return error(409, "table_exists", f"table {e} exists; use mode replace or append")
            except (UnsupportedFile, FileNotFoundError) as e:
                return error(400, "bad_file", str(e))
            except CatalogConflict as e:
                return error(409, "catalog_conflict", str(e))
        return _plain(infos)

    @router.post("/tables/attach", dependencies=guarded)
    def attach(body: AttachBody):
        with lock:
            try:
                return _plain(
                    project.tables.attach(
                        body.name, body.source, metadata_in_bucket=body.metadata_in_bucket
                    )
                )
            except TableExists:
                return error(409, "table_exists", f"table {body.name} exists")
            except NotRegistrable as e:
                return error(400, "not_registrable", str(e))

    @router.post("/tables/{name}/refresh", dependencies=guarded)
    def refresh(name: str):
        with lock:
            try:
                return _plain(project.tables.refresh(name))
            except NoSuchTable:
                return error(404, "no_such_table", f"no table named {name}")
            except (NotRegistrable, MissingFiles) as e:
                return error(409, "refresh_failed", str(e))

    # -- the gauge and queries ------------------------------------------------------

    @router.post("/estimate", dependencies=guarded)
    def estimate(body: EstimateBody):
        with lock:
            try:
                return _estimate_json(project.estimate(body.sql))
            except duckdb.Error as e:
                return error(400, "sql_error", str(e).splitlines()[0])

    def _run(sql: str, allow_red: bool, batch_rows: int, question_slug: str | None = None):
        lock.acquire()
        try:
            result = project.query(sql, allow_red=allow_red, batch_rows=batch_rows)
        except RedRefused as e:
            lock.release()
            return error(409, "red_refused", e.estimate.reason, estimate=_estimate_json(e.estimate))
        except CatalogConflict as e:
            lock.release()
            return error(409, "catalog_conflict", str(e))
        except duckdb.Error as e:
            lock.release()
            return error(400, "sql_error", str(e).splitlines()[0])
        if question_slug:
            result.question_slug = question_slug
        headers = {}
        if result.estimate is not None:
            headers = {
                "X-Lakelet-Verdict": result.estimate.verdict,
                "X-Lakelet-Words": result.estimate.words,
                "X-Lakelet-Reason": result.estimate.reason,
            }
        return StreamingResponse(
            _arrow_stream(result, lock), media_type=ARROW_STREAM, headers=headers
        )

    @router.post("/query", dependencies=guarded)
    def query(body: SqlBody):
        return _run(body.sql, body.allow_red, body.batch_rows)

    # -- questions --------------------------------------------------------------------

    @router.get("/questions", dependencies=guarded)
    def questions() -> list[dict[str, Any]]:
        return _plain(project.questions.list())

    @router.post("/questions", dependencies=guarded)
    def save_question(body: QuestionBody):
        with lock:
            try:
                return _plain(project.questions.save(body.title, body.sql))
            except duckdb.Error as e:
                return error(400, "sql_error", str(e).splitlines()[0])

    @router.post("/questions/{slug}/run", dependencies=guarded)
    def run_question(slug: str, body: RunBody | None = None):
        try:
            question = project.questions.get(slug)
        except NoSuchQuestion:
            return error(404, "no_such_question", f"no question named {slug}")
        return _run(question.sql, body.allow_red if body else False, 1000, question_slug=slug)

    # -- history ----------------------------------------------------------------------

    @router.get("/history", dependencies=guarded)
    def history(last: int = 50) -> list[dict[str, Any]]:
        return _plain(project.history.recent(last))

    return router
