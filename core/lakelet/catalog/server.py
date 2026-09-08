# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""The Iceberg REST catalog's routes (brief D4, D6, D22). Paths and JSON shapes follow the
spec; request and response bodies are pyiceberg's own models where it has them.

Namespaces are single level in v0 (brief D36); a multi-level name is a 400, not a misparse.
No token on ``/v1`` in local mode (brief D22).

What the two clients actually do, learned in step 1: pyiceberg creates tables in one
request; DuckDB stages the create, writes its data files, then commits through the
single-table commit endpoint with an ``assert-create`` requirement, and expects the
table's ``data/`` directory to exist on a local warehouse.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pyiceberg.catalog.rest import (
    CommitTableResponse,
    ConfigResponse,
    ListNamespaceResponse,
    ListTableResponseEntry,
    ListTablesResponse,
    NamespaceResponse,
    RegisterTableRequest,
    TableIdentifier,
    TableResponse,
)
from pyiceberg.exceptions import CommitFailedException
from pyiceberg.partitioning import PartitionSpec
from pyiceberg.schema import Schema
from pyiceberg.table.sorting import SortOrder
from pyiceberg.table.update import TableRequirement, TableUpdate
from pyiceberg.typedef import IcebergBaseModel

from lakelet.catalog import commit as ic
from lakelet.catalog.store import AlreadyExists, Conflict, NotFound, Store

PREFIX = "lakelet"
NAMESPACE_SEPARATOR = "\x1f"


class BadRequest(Exception):
    pass


class CreateTableBody(IcebergBaseModel):
    """The spec's CreateTableRequest with the optional fields optional; pyiceberg's own
    model requires ``location`` although its client omits it."""

    name: str
    location: str | None = None
    table_schema: Schema = Field(alias="schema")
    partition_spec: PartitionSpec | None = Field(default=None, alias="partition-spec")
    write_order: SortOrder | None = Field(default=None, alias="write-order")
    stage_create: bool = Field(default=False, alias="stage-create")
    properties: dict[str, str] = Field(default_factory=dict)


class CommitTableBody(IcebergBaseModel):
    """The spec's CommitTableRequest with ``identifier`` optional, as the spec says and as
    the Java client (Spark, Trino) sends it on the per-table endpoint."""

    identifier: TableIdentifier | None = None
    requirements: tuple[TableRequirement, ...] = ()
    updates: tuple[TableUpdate, ...] = ()


class CreateNamespaceRequest(BaseModel):
    namespace: list[str]
    properties: dict[str, str] = Field(default_factory=dict)


class RenameTableRequest(BaseModel):
    source: TableIdentifier
    destination: TableIdentifier


class CommitTransactionRequest(BaseModel):
    table_changes: list[CommitTableBody] = Field(alias="table-changes")


def _error(status: int, kind: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"error": {"message": message, "type": kind, "code": status}}
    )


def _json(model: Any, status: int = 200) -> Response:
    return Response(
        content=model.model_dump_json(), media_type="application/json", status_code=status
    )


def _namespace(encoded: str) -> str:
    parts = encoded.split(NAMESPACE_SEPARATOR)
    if len(parts) != 1 or not parts[0]:
        raise BadRequest("Lakelet namespaces are single level in v0")
    return parts[0]


def _identifier_namespace(identifier: TableIdentifier) -> str:
    """pyiceberg's TableIdentifier wraps the namespace in a root model."""
    parts = identifier.namespace.root
    return _namespace(NAMESPACE_SEPARATOR.join(parts))


def _ensure_local_layout(location: str) -> None:
    """DuckDB writes data files under ``<location>/data`` and does not create the directory;
    on a local warehouse the catalog owns the layout, so it makes both directories."""
    if location.startswith("file://"):
        path = location.removeprefix("file://")
    elif "://" not in location:
        path = location
    else:
        return
    for sub in ("data", "metadata"):
        os.makedirs(os.path.join(path, sub), exist_ok=True)


def create_app(
    store: Store, warehouse: str, io_properties: dict[str, str] | None = None
) -> FastAPI:
    app = FastAPI(title="Lakelet Iceberg REST catalog", docs_url=None, redoc_url=None)
    mio = ic.MetadataIO(io_properties or {})
    warehouse = warehouse.rstrip("/")

    @app.exception_handler(NotFound)
    async def _not_found(_: Request, e: NotFound) -> JSONResponse:
        return _error(404, "NoSuchTableException", str(e))

    @app.exception_handler(AlreadyExists)
    async def _exists(_: Request, e: AlreadyExists) -> JSONResponse:
        return _error(409, "AlreadyExistsException", str(e))

    @app.exception_handler(Conflict)
    async def _conflict(_: Request, e: Conflict) -> JSONResponse:
        return _error(409, "CommitFailedException", str(e))

    @app.exception_handler(CommitFailedException)
    async def _commit_failed(_: Request, e: CommitFailedException) -> JSONResponse:
        return _error(409, "CommitFailedException", str(e))

    @app.exception_handler(BadRequest)
    async def _bad_request(_: Request, e: BadRequest) -> JSONResponse:
        return _error(400, "BadRequestException", str(e))

    @app.get("/v1/config")
    def config(warehouse: str | None = None) -> Response:  # noqa: ARG001  the client's hint
        return _json(ConfigResponse(defaults={}, overrides={"prefix": PREFIX}))

    # -- namespaces -----------------------------------------------------------------

    @app.get("/v1/{prefix}/namespaces")
    def list_namespaces(prefix: str) -> Response:
        return _json(ListNamespaceResponse(namespaces=[(n,) for n in store.list_namespaces()]))

    @app.post("/v1/{prefix}/namespaces")
    def create_namespace(prefix: str, body: CreateNamespaceRequest) -> Response:
        name = _namespace(NAMESPACE_SEPARATOR.join(body.namespace))
        store.create_namespace(name, body.properties)
        return _json(NamespaceResponse(namespace=(name,), properties=body.properties))

    @app.get("/v1/{prefix}/namespaces/{ns}")
    def get_namespace(prefix: str, ns: str) -> Response:
        name = _namespace(ns)
        return _json(NamespaceResponse(namespace=(name,), properties=store.get_namespace(name)))

    @app.head("/v1/{prefix}/namespaces/{ns}")
    def head_namespace(prefix: str, ns: str) -> Response:
        store.get_namespace(_namespace(ns))
        return Response(status_code=204)

    @app.delete("/v1/{prefix}/namespaces/{ns}")
    def drop_namespace(prefix: str, ns: str) -> Response:
        store.drop_namespace(_namespace(ns))
        return Response(status_code=204)

    # -- tables ---------------------------------------------------------------------

    def _load(ns: str, table: str) -> TableResponse:
        location = store.get_table(ns, table)
        return TableResponse(metadata_location=location, metadata=mio.read(location), config={})

    @app.get("/v1/{prefix}/namespaces/{ns}/tables")
    def list_tables(prefix: str, ns: str) -> Response:
        name = _namespace(ns)
        entries = [
            ListTableResponseEntry(namespace=(name,), name=t) for t in store.list_tables(name)
        ]
        return _json(ListTablesResponse(identifiers=entries))

    @app.post("/v1/{prefix}/namespaces/{ns}/tables")
    def create_table(prefix: str, ns: str, body: CreateTableBody) -> Response:
        name = _namespace(ns)
        store.get_namespace(name)
        location = (body.location or f"{warehouse}/{name}/{body.name}").rstrip("/")
        table_metadata = ic.create_metadata(
            body.table_schema, location, body.partition_spec, body.write_order, body.properties
        )
        _ensure_local_layout(location)
        if body.stage_create:
            return _json(TableResponse(metadata_location=None, metadata=table_metadata, config={}))
        metadata_location = ic.metadata_location(location, 0)
        mio.write(table_metadata, metadata_location)
        store.create_table(name, body.name, metadata_location)
        return _json(
            TableResponse(metadata_location=metadata_location, metadata=table_metadata, config={})
        )

    @app.post("/v1/{prefix}/namespaces/{ns}/register")
    def register_table(prefix: str, ns: str, body: RegisterTableRequest) -> Response:
        name = _namespace(ns)
        table_metadata = mio.read(body.metadata_location)
        store.create_table(name, body.name, body.metadata_location)
        return _json(
            TableResponse(
                metadata_location=body.metadata_location, metadata=table_metadata, config={}
            )
        )

    @app.get("/v1/{prefix}/namespaces/{ns}/tables/{table}")
    def load_table(prefix: str, ns: str, table: str) -> Response:
        return _json(_load(_namespace(ns), table))

    @app.head("/v1/{prefix}/namespaces/{ns}/tables/{table}")
    def head_table(prefix: str, ns: str, table: str) -> Response:
        store.get_table(_namespace(ns), table)
        return Response(status_code=204)

    def _commit(ns: str, table: str, body: CommitTableBody) -> CommitTableResponse:
        current_location = store.get_table(ns, table)
        base = mio.read(current_location)
        new_metadata = ic.apply_commit(base, current_location, body.requirements, body.updates)
        new_location = ic.metadata_location(
            new_metadata.location, ic.parse_version(current_location) + 1
        )
        mio.write(new_metadata, new_location)
        store.update_table(ns, table, expected=current_location, new=new_location)
        return CommitTableResponse(metadata_location=new_location, metadata=new_metadata)

    def _commit_create(ns: str, table: str, body: CommitTableBody) -> CommitTableResponse:
        """The second half of a staged create."""
        new_metadata = ic.apply_commit(None, None, body.requirements, body.updates)
        _ensure_local_layout(new_metadata.location)
        new_location = ic.metadata_location(new_metadata.location, 0)
        mio.write(new_metadata, new_location)
        store.create_table(ns, table, new_location)
        return CommitTableResponse(metadata_location=new_location, metadata=new_metadata)

    @app.post("/v1/{prefix}/namespaces/{ns}/tables/{table}")
    def commit_table(prefix: str, ns: str, table: str, body: CommitTableBody) -> Response:
        name = _namespace(ns)
        try:
            store.get_table(name, table)
        except NotFound:
            if any(r.type == "assert-create" for r in body.requirements):
                return _json(_commit_create(name, table, body))
            raise
        return _json(_commit(name, table, body))

    @app.post("/v1/{prefix}/transactions/commit")
    def commit_transaction(prefix: str, body: CommitTransactionRequest) -> Response:
        for change in body.table_changes:
            if change.identifier is None:
                raise BadRequest("every table change in a transaction needs an identifier")
            ns = _identifier_namespace(change.identifier)
            try:
                store.get_table(ns, change.identifier.name)
            except NotFound:
                _commit_create(ns, change.identifier.name, change)
            else:
                _commit(ns, change.identifier.name, change)
        return Response(status_code=204)

    @app.delete("/v1/{prefix}/namespaces/{ns}/tables/{table}")
    def drop_table(
        prefix: str,
        ns: str,
        table: str,
        purgeRequested: bool = False,  # noqa: N803
    ) -> Response:
        store.drop_table(_namespace(ns), table)
        return Response(status_code=204)

    @app.post("/v1/{prefix}/tables/rename")
    def rename_table(prefix: str, body: RenameTableRequest) -> Response:
        store.rename_table(
            _identifier_namespace(body.source),
            body.source.name,
            _identifier_namespace(body.destination),
            body.destination.name,
        )
        return Response(status_code=204)

    @app.post("/v1/{prefix}/namespaces/{ns}/tables/{table}/metrics")
    def report_metrics(prefix: str, ns: str, table: str) -> Response:
        return Response(status_code=204)

    return app
