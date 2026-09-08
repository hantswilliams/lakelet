# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""A query (brief §3.6, D10, D21, D23): gauge (step 5), then execute through the attached
catalog, stream Arrow record batches, retry a catalog conflict, and record the run with
the profiler's actuals in history."""

from __future__ import annotations

import hashlib
import re
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import duckdb
import psutil
import pyarrow as pa

from lakelet import __version__
from lakelet.catalog.store import NotFound
from lakelet.engine import CatalogConflict, is_conflict
from lakelet.gauge import inputs, manifests
from lakelet.history import Run
from lakelet.project import NAMESPACE

if TYPE_CHECKING:
    from lakelet.project import Project

CONFLICT_ATTEMPTS = 3


# -- identity (brief D10) --------------------------------------------------------------


def normalise(sql: str) -> str:
    """Comments stripped, whitespace collapsed, everything outside string literals
    lower-cased, literals kept."""
    out, i, n = [], 0, len(sql)
    while i < n:
        ch = sql[i]
        if ch == "'":
            end = i + 1
            while end < n:
                if sql[end] == "'" and not (end + 1 < n and sql[end + 1] == "'"):
                    break
                end += 2 if sql[end] == "'" else 1
            out.append(sql[i : end + 1])
            i = end + 1
        elif sql.startswith("--", i):
            i = sql.find("\n", i)
            i = n if i == -1 else i
        elif sql.startswith("/*", i):
            end = sql.find("*/", i + 2)
            i = n if end == -1 else end + 2
        else:
            out.append(ch.lower())
            i += 1
    return re.sub(r"\s+", " ", "".join(out)).strip()


def sql_hash(sql: str) -> str:
    return hashlib.sha256(normalise(sql).encode()).hexdigest()


def fingerprint(sql: str, tables: list[tuple[str, int | None]]) -> str:
    snapshots = ";".join(f"{name}={snapshot}" for name, snapshot in sorted(tables))
    return hashlib.sha256(f"{normalise(sql)}|{snapshots}".encode()).hexdigest()


# -- the run ------------------------------------------------------------------------


@dataclass
class Actual:
    wall: float
    rows_returned: int
    rows_scanned: int | None = None
    bytes: int | None = None
    peak_mem: int | None = None
    peak_rss: int | None = None
    spill: int | None = None


class _RssSampler(threading.Thread):
    """Peak process RSS during execution, the cross-check of D21."""

    def __init__(self) -> None:
        super().__init__(daemon=True)
        self.peak = 0
        self._stop = threading.Event()

    def run(self) -> None:
        process = psutil.Process()
        while not self._stop.is_set():
            self.peak = max(self.peak, process.memory_info().rss)
            self._stop.wait(0.05)

    def stop(self) -> int:
        self._stop.set()
        self.join(timeout=1)
        return self.peak


class Result:
    """Iterates ``pyarrow.RecordBatch``; ``actual`` is set once the batches are exhausted or
    the result is closed; ``run_id`` is the history row."""

    def __init__(self, project: Project, sql: str, run: Run, scans: list[dict[str, Any]]) -> None:
        self.project = project
        self.sql = sql
        self.run = run
        self.scans = scans
        self.estimate = None  # step 5
        self.actual: Actual | None = None
        self.run_id: int | None = None
        self._reader: pa.RecordBatchReader | None = None
        self._rows = 0
        self._started = 0.0
        self._sampler = _RssSampler()

    def _execute(self, batch_rows: int) -> None:
        self._sampler.start()
        self._started = time.perf_counter()
        for attempt in range(CONFLICT_ATTEMPTS):
            try:
                cursor = self.project.engine.execute(self.sql)
                break
            except duckdb.Error as e:
                if not is_conflict(e):
                    self._finish(error=str(e))
                    raise
                self.run.retries = attempt + 1
                if attempt == CONFLICT_ATTEMPTS - 1:
                    self.run.retries = attempt
                    self._finish(error=str(e))
                    raise CatalogConflict(str(e)) from e
                time.sleep(0.1 * (attempt + 1))
        self._reader = cursor.to_arrow_reader(batch_rows)

    def __iter__(self) -> Iterator[pa.RecordBatch]:
        assert self._reader is not None
        try:
            for batch in self._reader:
                self._rows += batch.num_rows
                yield batch
        except duckdb.Error as e:
            self._finish(error=str(e))
            raise
        self._finish()

    def to_arrow(self) -> pa.Table:
        assert self._reader is not None
        schema = self._reader.schema
        return pa.Table.from_batches(list(self), schema=schema)

    def close(self) -> None:
        """Record what is known if the consumer stopped early."""
        if self.actual is None:
            self._finish(complete=False)

    def _finish(self, error: str | None = None, complete: bool = True) -> None:
        if self.actual is not None:
            return
        wall = time.perf_counter() - self._started
        peak_rss = self._sampler.stop()
        self.actual = Actual(wall=wall, rows_returned=self._rows, peak_rss=peak_rss)
        if complete and error is None:
            self._read_profile()
        run = self.run
        run.ran = True
        run.error = error
        run.actual_wall = wall
        run.actual_peak_rss = peak_rss
        run.actual_rows_scanned = self.actual.rows_scanned
        run.actual_bytes = self.actual.bytes
        run.actual_peak_mem = self.actual.peak_mem
        run.actual_spill = self.actual.spill
        self.run_id = self.project.history.record(run)

    def _read_profile(self) -> None:
        profile = self.project.engine.last_profile()
        if not profile:
            return
        self.actual.peak_mem = profile.get("system_peak_buffer_memory")
        self.actual.spill = profile.get("system_peak_temp_dir_size")
        scan_rows = [
            node.get("operator_cardinality", 0)
            for node in inputs.walk([profile])
            if node.get("operator_type") in inputs.SCAN_NODES
        ]
        self.actual.rows_scanned = sum(scan_rows) if scan_rows else None
        # Derived (D21): rows each scan produced times the bytes per row of its columns.
        total = 0.0
        for scan, rows in zip(self.scans, scan_rows, strict=False):
            total += rows * scan.get("bytes_per_row", 0.0)
        self.actual.bytes = int(total) if scan_rows else None


def _table_scans(project: Project, sql: str, plan: list[dict[str, Any]]) -> tuple[list, list]:
    """The catalog tables the statement reads with their current snapshot ids, and the
    plan's scan nodes each attributed to one of them (by projected columns, then by
    order) with the bytes per row of the projected columns."""
    known = []
    for name in inputs.base_tables(project.engine, sql):
        try:
            location = project.store.get_table(NAMESPACE, name)
        except NotFound:
            continue  # a CTE, a temp table, or something outside the catalog
        md = project.metadata_io.read(location)
        snapshot = md.current_snapshot()
        known.append(
            {
                "name": name,
                "snapshot_id": snapshot.snapshot_id if snapshot else None,
                "locality": "local" if md.location.startswith("file://") else "remote",
                "columns": {f.name: f.field_id for f in md.schema().fields},
                "metadata": md,
            }
        )
    scans = inputs.scan_nodes(plan)
    unassigned = list(known)
    for scan in scans:
        projected = set(scan["projections"])
        candidates = [t for t in known if projected and projected <= set(t["columns"])]
        table = candidates[0] if len(candidates) == 1 else (unassigned[0] if unassigned else None)
        if table is None:
            continue
        if table in unassigned:
            unassigned.remove(table)
        stats = manifests.file_stats(project.metadata_io, table["metadata"])
        ids = {table["columns"][c] for c in projected if c in table["columns"]} or None
        scan["table"] = table["name"]
        scan["bytes_per_row"] = manifests.bytes_per_row(stats, ids)
    tables = [
        {"name": t["name"], "snapshot_id": t["snapshot_id"], "locality": t["locality"]}
        for t in known
    ]
    return tables, scans


def query(project: Project, sql: str, allow_red: bool = False, batch_rows: int = 1000) -> Result:
    engine = project.engine
    try:
        plan = inputs.plan_json(engine, sql)
        tables, scans = _table_scans(project, sql, plan)
    except duckdb.Error:
        # Planning failed (an unknown table, a syntax error, an unsupported statement). The
        # gauge never blocks execution (PRD F0.3): run anyway and let DuckDB say why.
        plan, tables, scans = [], [], []
    profile = inputs.machine_profile(engine, str(project.root))
    run = Run(
        fingerprint=fingerprint(sql, [(t["name"], t["snapshot_id"]) for t in tables]),
        sql_hash=sql_hash(sql),
        sql_text=sql,
        lakelet_version=__version__,
        duckdb_version=duckdb.__version__,
        machine_hash=inputs.machine_hash(profile),
        machine=profile,
        tables=tables,
        operator_counts=inputs.operator_counts(plan),
    )
    result = Result(project, sql, run, scans)
    result._execute(batch_rows)
    return result
