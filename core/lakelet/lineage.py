# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Table-level lineage (versions brief G8): what a table, a view or a model reads and what
reads it, from what the project already knows — the dbt manifest of the last compile
(compiled first when it is missing or older than the models) and the catalog. Nothing is
parsed here: a `ref()` or `source()` is the manifest's, a table a model names bare in its
SQL and the tables a catalog view binds to come from DuckDB's own parse of the statement,
the way the gauge resolves a view (`query._through_views`). Column-level lineage is Day 3."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from lakelet.gauge import inputs

if TYPE_CHECKING:
    from lakelet.project import Project

#: How an edge is known: a dbt `ref()`, a dbt `source()`, a table named bare in a model's
#: SQL, or the SQL of a catalog view that did not come from dbt.
VIAS = ("ref", "source", "sql", "view")
KINDS = ("table", "view", "model")


class NoSuchNode(Exception):
    """Not a table or view in the catalog, and not a model in the project."""


@dataclass
class Edge:
    name: str
    #: "table" or "view" in the catalog, or "model" for a dbt model not built yet.
    kind: str
    via: str
    #: 1 for what the node reads (or what reads it) directly; more with `--depth`.
    depth: int = 1


@dataclass
class Lineage:
    name: str
    kind: str
    upstream: list[Edge] = field(default_factory=list)
    downstream: list[Edge] = field(default_factory=list)
    #: The dbt model that builds this table or view; `imported` for a table Lakelet wrote
    #: from files or SQL; `attached from <prefix>` for one registered in place; None for a
    #: model never built and for a view put in the catalog by hand.
    built_by: str | None = None
    #: When: the model's last successful `lakelet run` from history, or the table's
    #: current snapshot; ISO 8601, UTC.
    last_built: str | None = None
    #: True when this call compiled the models first because the manifest was stale.
    compiled: bool = False


@dataclass
class _Node:
    name: str
    kind: str
    model_uid: str | None = None
    source: str | None = None  # an attached table's prefix
    freshness: datetime | None = None
    upstream: list[Edge] = field(default_factory=list)


class Graph:
    """Every table and view in the catalog and every model in the manifest, one node per
    name (a table model and the table it built are the same node), with its upstream
    edges; downstream is the reverse. Built once per call; a project's graph is small."""

    def __init__(self, project: Project, compile_if_stale: bool = True) -> None:
        self.project = project
        self.nodes: dict[str, _Node] = {}
        self.compiled = False
        for info in project.tables.list(views=False):
            self.nodes[info.name] = _Node(
                info.name, "table", source=info.source, freshness=info.freshness
            )
        views = {v.name: v for v in project.views.list()}
        for v in views.values():
            self.nodes[v.name] = _Node(
                v.name,
                "view",
                model_uid=v.properties.get("lakelet.dbt-model"),
                freshness=datetime.fromtimestamp(v.timestamp_ms / 1000, tz=UTC),
            )
        models = self._models(compile_if_stale)
        for uid, node in models.items():
            name = node["name"]
            ours = self.nodes.get(name)
            if ours is None:
                ours = self.nodes[name] = _Node(name, "model")
            ours.model_uid = uid
        # edges: the manifest's first, then what the SQL names that the manifest did not
        for node in models.values():
            ours = self.nodes[node["name"]]
            for dep in node.get("depends_on", {}).get("nodes", []):
                if dep in models:
                    ours.upstream.append(self._edge(models[dep]["name"], "ref"))
                elif dep.startswith("source."):
                    ours.upstream.append(self._edge(dep.rsplit(".", 1)[1], "source"))
            self._add_sql_edges(ours, node.get("compiled_code") or "", "sql")
        for v in views.values():
            ours = self.nodes[v.name]
            if ours.model_uid is None or ours.model_uid not in models:
                self._add_sql_edges(ours, v.sql, "view")

    def _models(self, compile_if_stale: bool) -> dict[str, dict[str, Any]]:
        from lakelet.dbt import runner

        try:
            manifest, self.compiled = runner.manifest(self.project, compile_if_stale)
        except runner.DbtMissing:
            return {}  # the catalog's half of the graph is still true
        return {
            uid: node
            for uid, node in manifest.get("nodes", {}).items()
            if node.get("resource_type") == "model"
        }

    def _edge(self, name: str, via: str) -> Edge:
        node = self.nodes.get(name)
        return Edge(name=name, kind=node.kind if node else "table", via=via)

    def _add_sql_edges(self, node: _Node, sql: str, via: str) -> None:
        if not sql.strip():
            return
        try:
            names = inputs.base_tables(self.project.engine, sql)
        except Exception:  # noqa: BLE001 - SQL DuckDB cannot parse has no lineage of its own
            return
        known = {e.name for e in node.upstream}
        for name in names:
            if name in self.nodes and name != node.name and name not in known:
                node.upstream.append(self._edge(name, via))
                known.add(name)

    def downstream_of(self, name: str) -> list[Edge]:
        out = []
        for other in self.nodes.values():
            for e in other.upstream:
                if e.name == name:
                    out.append(Edge(name=other.name, kind=other.kind, via=e.via))
        return out

    def _walk(self, name: str, depth: int, step) -> list[Edge]:
        """Breadth first to ``depth`` levels, each name once at the level it was first
        reached; a cycle (a view over itself cannot exist, but a stale manifest could say
        anything) ends where it started."""
        out: list[Edge] = []
        seen = {name}
        queue = deque([(name, 0)])
        while queue:
            current, level = queue.popleft()
            if level >= depth:
                continue
            for e in step(current):
                if e.name in seen:
                    continue
                seen.add(e.name)
                out.append(Edge(e.name, e.kind, e.via, level + 1))
                queue.append((e.name, level + 1))
        return out

    def lineage(self, name: str, depth: int = 1) -> Lineage:
        node = self.nodes.get(name)
        if node is None:
            raise NoSuchNode(f"no table, view or model named {name}")
        result = Lineage(name=name, kind=node.kind, compiled=self.compiled)
        # a `source()` can name a table the catalog does not have: an edge, not a node
        result.upstream = self._walk(
            name, depth, lambda n: self.nodes[n].upstream if n in self.nodes else []
        )
        result.downstream = self._walk(name, depth, self.downstream_of)
        result.built_by, result.last_built = self._built(node)
        return result

    def _built(self, node: _Node) -> tuple[str | None, str | None]:
        when = node.freshness.isoformat() if node.freshness else None
        if node.kind == "model":
            return None, None  # never built: nothing in the catalog carries its name
        if node.model_uid is not None:
            # history's run first; a table built by a bare `dbt run` has only its snapshot
            run = self.project.history.model_last_run(node.model_uid)
            if run is not None and run.ran and run.ts:
                when = run.ts.isoformat()
            return node.model_uid.rsplit(".", 1)[1], when
        if node.kind == "view":
            return None, when
        if node.source:
            return f"attached from {node.source}", when
        return "imported", when


def lineage(project: Project, name: str, depth: int = 1) -> Lineage:
    """`lakelet lineage <name>` and `GET /api/lineage/{name}`."""
    return Graph(project).lineage(name, depth)


__all__ = ["KINDS", "VIAS", "Edge", "Graph", "Lineage", "NoSuchNode", "lineage"]
