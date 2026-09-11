# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""`lakelet run` (real-data brief R5; PRD F0.7.3): compile the project's dbt models, run
each one's compiled SQL through the gauge in dependency order, print the DAG with a verdict
per model, then run it through dbt with Lakelet's plugin. A `view` model is recorded in
Lakelet's catalog afterwards (R6). Every model's estimate and actual go into history like
a query's. `--burst auto` is session 8's and refuses until then."""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

import duckdb

from lakelet import __version__
from lakelet.gauge import inputs
from lakelet.history import Run
from lakelet.query import sql_hash

if TYPE_CHECKING:
    from lakelet.project import Project

DBT_MODEL_PROPERTY = "lakelet.dbt-model"


class DbtMissing(Exception):
    """dbt-core and dbt-duckdb are not installed: `pip install 'lakelet[dbt]'`."""


class NoBurstYet(Exception):
    """`--burst auto`: there is no burst yet (session 8); `--burst never` runs everything here."""


class RedRefusedRun(Exception):
    """A model the gauge calls Red; `--run-anyway` runs the DAG regardless."""


class DbtFailed(Exception):
    pass


@dataclass
class PlannedModel:
    name: str
    unique_id: str
    materialized: str
    depends_on: list[str]
    compiled_sql: str
    verdict: str | None = None
    words: str | None = None
    reason: str | None = None
    est_wall_local: float | None = None
    est_bytes: int | None = None
    error: str | None = None
    estimate: Any = None


@dataclass
class ModelResult:
    name: str
    status: str
    seconds: float
    message: str | None = None


@dataclass
class RunReport:
    models: list[PlannedModel]
    results: list[ModelResult] = field(default_factory=list)
    views_recorded: list[str] = field(default_factory=list)
    views_dropped: list[str] = field(default_factory=list)
    seconds: float = 0.0

    @property
    def ok(self) -> bool:
        return all(r.status == "success" for r in self.results)


def _dbt():
    try:
        from dbt.cli.main import dbtRunner
    except ImportError as e:  # pragma: no cover - the extra is in the dev environment
        raise DbtMissing(
            "dbt is not installed: `pip install 'lakelet[dbt]'` (or `uv sync` in a clone)"
        ) from e
    return dbtRunner()


def profiles_yml(catalog_url: str) -> str:
    return f"""# Written by Lakelet (`lakelet run`, `lakelet serve`, `lakelet catalog serve`) with
# the address of the catalog that process serves; it is good while that process runs.
# For a `dbt run` or `dbt test` by hand: `lakelet catalog serve` in one terminal, then
# `dbt run --profiles-dir .lakelet/dbt` in another. Build with `lakelet run` to record views.
lakelet:
  target: local
  outputs:
    local:
      type: duckdb
      path: ":memory:"
      schema: main
      threads: 1
      plugins:
        - module: lakelet.dbt.plugin
          config:
            catalog_url: "{catalog_url}"
"""


def write_profile(project: Project, catalog_url: str | None = None) -> Path:
    """`.lakelet/dbt/profiles.yml` for the catalog at ``catalog_url`` (this process's by
    default). `lakelet run` writes it before every dbt call; `lakelet serve` and
    `lakelet catalog serve` write it when they start, so `dbt run --profiles-dir
    .lakelet/dbt` works by hand for as long as one of them is up."""
    dbt_dir = project.lakelet_dir / "dbt"
    dbt_dir.mkdir(parents=True, exist_ok=True)
    path = dbt_dir / "profiles.yml"
    path.write_text(profiles_yml(catalog_url or project.catalog_url))
    return path


def _paths(project: Project) -> tuple[Path, Path, Path]:
    from lakelet.project import LAKELET_VIEW_MACROS

    dbt_dir = project.lakelet_dir / "dbt"
    write_profile(project)
    # A project set up before views existed gets Lakelet's view macros the way `init`
    # writes them: only if the file is absent, never over a file that is there.
    view_macros = project.root / "macros" / "lakelet_views.sql"
    if not view_macros.exists():
        view_macros.parent.mkdir(parents=True, exist_ok=True)
        view_macros.write_text(LAKELET_VIEW_MACROS)
    return dbt_dir, dbt_dir / "target", dbt_dir / "logs"


def _invoke(project: Project, verb: str, args: list[str]) -> Any:
    dbt_dir, target, logs = _paths(project)
    runner = _dbt()
    # The view materialisation warns under a bare `dbt run` (its views are that session's
    # only); under `lakelet run` they are recorded afterwards, so it stays quiet.
    os.environ["LAKELET_RUN"] = "1"
    result = runner.invoke(
        [
            verb,
            "--project-dir",
            str(project.root),
            "--profiles-dir",
            str(dbt_dir),
            "--target-path",
            str(target),
            "--log-path",
            str(logs),
            "--no-use-colors",
            "--quiet",
            *args,
        ]
    )
    if not result.success and result.exception is not None:
        raise DbtFailed(str(result.exception).splitlines()[0])
    return result


def _selection(select: list[str]) -> list[str]:
    return ["--select", *select] if select else []


def _ordered(models: dict[str, PlannedModel]) -> list[PlannedModel]:
    """Dependency order: a model after everything it refs."""
    done: list[PlannedModel] = []
    seen: set[str] = set()

    def visit(uid: str) -> None:
        if uid in seen or uid not in models:
            return
        seen.add(uid)
        for dep in models[uid].depends_on:
            visit(dep)
        done.append(models[uid])

    for uid in sorted(models):
        visit(uid)
    return done


def plan(project: Project, select: list[str] | None = None) -> list[PlannedModel]:
    """Compile, then estimate every model's compiled SQL in dependency order, giving the
    engine each view model as it goes so the models after it bind."""
    _invoke(project, "compile", _selection(select or []))
    _, target, _ = _paths(project)
    manifest = json.loads((target / "manifest.json").read_text())
    models: dict[str, PlannedModel] = {}
    for uid, node in manifest["nodes"].items():
        if node.get("resource_type") != "model" or not node.get("compiled_code"):
            continue
        models[uid] = PlannedModel(
            name=node["name"],
            unique_id=uid,
            materialized=node.get("config", {}).get("materialized", "view"),
            depends_on=[
                d for d in node.get("depends_on", {}).get("nodes", []) if d in manifest["nodes"]
            ],
            compiled_sql=node["compiled_code"].strip(),
        )
    ordered = _ordered(models)
    existing = set(project.store.list_tables("main"))
    stand_ins: list[str] = []
    try:
        for m in ordered:
            try:
                est = project.estimate(_stand_in(m.compiled_sql, stand_ins))
            except Exception as e:  # noqa: BLE001 - the gauge never blocks; the run will say
                m.error = str(e).splitlines()[0]
                continue
            m.estimate = est
            m.verdict, m.words, m.reason = est.verdict, est.words, est.reason
            m.est_wall_local, m.est_bytes = est.wall_local, est.bytes_scanned
            if m.materialized == "view" or m.name not in existing:
                # A view model, or a table not built yet: the models after it bind
                # against its query, which for a table is a stand-in until the run.
                try:
                    project.engine.put_view(m.name, _stand_in(m.compiled_sql, stand_ins))
                    if m.materialized != "view":
                        stand_ins.append(m.name)
                except Exception as e:  # noqa: BLE001
                    m.error = str(e).splitlines()[0]
    finally:
        for name in stand_ins:
            project.engine.drop_view(name)
    return ordered


def unqualified(sql: str) -> str:
    """dbt qualifies every `ref()` with the database (`"lakelet"."main"."t"`, or
    `"memory"."main"."v"` for a view); the view recorded in the catalog says `"main"."t"`,
    which DuckDB resolves through the search path and Spark through the default
    namespace, so the same SQL reads in both."""
    return sql.replace('"lakelet"."main".', '"main".').replace('"memory"."main".', '"main".')


def _stand_in(sql: str, names: list[str]) -> str:
    """For the estimate only: a table model not built yet is referred to by dbt as
    `"lakelet"."main"."name"`; the stand-in view for it lives in `memory.main`."""
    for name in names:
        for pattern in (f'"lakelet"."main"."{name}"', f"lakelet.main.{name}"):
            sql = sql.replace(pattern, f'"memory"."main"."{name}"')
    return sql


def run(
    project: Project,
    select: list[str] | None = None,
    burst: str = "never",
    run_anyway: bool = False,
) -> RunReport:
    if burst != "never":
        raise NoBurstYet(
            "--burst auto is session 8's; there is no burst yet. `--burst never` runs "
            "everything here."
        )
    started = time.perf_counter()
    planned = plan(project, select)
    report = RunReport(models=planned)
    red = [m.name for m in planned if m.verdict == "red"]
    if red and not run_anyway:
        raise RedRefusedRun(
            f"{len(red)} model(s) need more machine: {', '.join(red)}. `--run-anyway` runs "
            "the DAG here regardless."
        )
    result = _invoke(project, "run", _selection(select or []))
    by_name = {m.name: m for m in planned}
    for r in result.result.results if result.result else []:
        name = r.node.name
        report.results.append(
            ModelResult(
                name=name,
                status=str(r.status),
                seconds=float(r.execution_time or 0.0),
                message=(str(r.message).splitlines()[0] if r.message else None),
            )
        )
        m = by_name.get(name)
        if m is not None and m.estimate is not None:
            _record(project, m, str(r.status), float(r.execution_time or 0.0))
    _record_views(project, planned, report, prune=not select)
    report.seconds = time.perf_counter() - started
    return report


def _record(project: Project, m: PlannedModel, status: str, seconds: float) -> None:
    """A model's run in history, as a query's would be (D7): the estimate from the plan,
    the actual wall time from dbt."""
    est = m.estimate
    profile = inputs.machine_profile(project.engine, str(project.root))
    cache = inputs.load_machine_cache(project.cache_dir)
    run = Run(
        fingerprint=est.fingerprint,
        sql_hash=sql_hash(m.compiled_sql),
        sql_text=m.compiled_sql,
        lakelet_version=__version__,
        duckdb_version=duckdb.__version__,
        machine_hash=inputs.machine_hash(profile),
        machine=profile,
        tables=[{k: v for k, v in t.items() if k != "source"} for t in est.tables],
        operator_counts=inputs.operator_counts(est.plan),
        pruning=est.pruning,
        throughput_local_mbps=cache.get("throughput_local_mbps"),
        bandwidth_mbps=cache.get("bandwidth_mbps"),
        est_bytes=est.bytes_scanned,
        est_peak_mem=est.peak_memory,
        est_wall_local=est.wall_local,
        est_wall_burst=est.wall_burst,
        est_cost_burst=est.cost_burst,
        verdict=est.verdict,
        reason=est.reason,
        ran=status == "success",
        ran_where="local",
        actual_wall=seconds if status == "success" else None,
        error=None if status == "success" else f"dbt: {status}",
    )
    project.history.record(run)


def _record_views(
    project: Project, planned: list[PlannedModel], report: RunReport, prune: bool
) -> None:
    """After the run: every view model that built becomes (or updates) a catalog view; on
    a run of the whole project, a catalog view that came from a dbt model no longer in
    the project is dropped."""
    ok = {r.name for r in report.results if r.status == "success"}
    for m in planned:
        if m.materialized == "view" and m.name in ok:
            project.views.put(
                m.name, unqualified(m.compiled_sql), {DBT_MODEL_PROPERTY: m.unique_id}
            )
            report.views_recorded.append(m.name)
    if not prune:
        return
    names = {m.name for m in planned}
    for view in project.views.list():
        if DBT_MODEL_PROPERTY in view.properties and view.name not in names:
            project.views.drop(view.name)
            report.views_dropped.append(view.name)


def dag_lines(models: list[PlannedModel]) -> list[str]:
    """One line per model, the CLI's DAG: name, materialisation, verdict, the estimate."""
    from lakelet.gauge.verdict import human_seconds

    width = max((len(m.name) for m in models), default=4)
    out = []
    for m in models:
        if m.error:
            out.append(f"  {m.name:<{width}}  {m.materialized:<5}  ?      {m.error}")
            continue
        est = human_seconds(m.est_wall_local) if m.est_wall_local is not None else ""
        out.append(f"  {m.name:<{width}}  {m.materialized:<5}  {m.verdict or '?':<6} {est}")
    return out
