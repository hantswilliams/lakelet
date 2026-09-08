# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""The ``lakelet`` command (brief §3.6, D17, D22, D28, D33): one verb per core operation
with the same name and arguments. The gauge line goes to stderr and results to stdout, a
table on a terminal and CSV when piped, so it pipes (PRD F0.6.2). Exit codes: 0 ok, 1
anything else, 2 Red refused, 4 catalog conflict after retries (D23)."""

from __future__ import annotations

import csv
import json
import os
import sys
import time
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from lakelet import __version__

app = typer.Typer(no_args_is_help=True, add_completion=False, rich_markup_mode=None)
tables_app = typer.Typer(no_args_is_help=True, help="List, describe and sample tables.")
catalog_app = typer.Typer(no_args_is_help=True, help="The Iceberg REST catalog.")
question_app = typer.Typer(no_args_is_help=True, help="Saved questions: dbt models with checks.")
gauge_app = typer.Typer(no_args_is_help=True, help="The gauge's record.")
audit_app = typer.Typer(no_args_is_help=True, help="Prove what leaves the machine.")
for name, sub in (
    ("tables", tables_app),
    ("catalog", catalog_app),
    ("question", question_app),
    ("gauge", gauge_app),
    ("audit", audit_app),
):
    app.add_typer(sub, name=name)

out = Console()
err = Console(stderr=True)
PROJECT_ENV = "LAKELET_PROJECT"
EXIT_RED = 2
EXIT_CONFLICT = 4
VERDICT_STYLE = {"green": "green", "yellow": "yellow", "red": "red"}


def _print_version(value: bool) -> None:
    if value:
        typer.echo(f"lakelet {__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: Annotated[
        bool,
        typer.Option(
            "--version", callback=_print_version, is_eager=True, help="Print the version and exit."
        ),
    ] = False,
    project: Annotated[
        Path | None,
        typer.Option("--project", "-C", help="The project folder; the current folder by default."),
    ] = None,
) -> None:
    """Your laptop is the warehouse until it can't be."""
    if project is not None:
        os.environ[PROJECT_ENV] = str(project)


def _root() -> Path:
    return Path(os.environ.get(PROJECT_ENV, ".")).resolve()


def _open():
    from lakelet import Project
    from lakelet.project import NotAProject

    try:
        return Project.open(_root())
    except NotAProject:
        err.print(
            f"[red]not a Lakelet project:[/red] no lakelet.toml in {_root()}; run `lakelet init`"
        )
        raise typer.Exit(1) from None


def _sql_text(sql: str | None, file: Path | None) -> str:
    if file is not None:
        return file.read_text(encoding="utf-8")
    if sql:
        return sql
    err.print("[red]give the SQL as an argument or with -f file.sql[/red]")
    raise typer.Exit(1)


def _gauge_line(estimate) -> None:
    style = VERDICT_STYLE[estimate.verdict]
    err.print(f"[{style}]●[/{style}] {estimate.words} · {estimate.reason}", highlight=False)


def _fail(message: str, code: int = 1) -> None:
    err.print(f"[red]{message}[/red]", highlight=False)
    raise typer.Exit(code)


# -- init ---------------------------------------------------------------------------


@app.command()
def init(
    directory: Annotated[Path, typer.Argument(help="The folder to turn into a lakehouse.")] = Path(
        "."
    ),
    name: Annotated[
        str | None, typer.Option(help="Project name; the folder's name by default.")
    ] = None,
    probe_mb: Annotated[
        int, typer.Option(help="Size of the disk-throughput probe; 0 skips it.")
    ] = 512,
) -> None:
    """Turn a folder into a lakehouse: catalog, warehouse, lakelet.toml, AGENTS.md, dbt project."""
    from lakelet import Project
    from lakelet.project import ProjectExists

    try:
        report = Project.init(directory, name=name, probe_mb=probe_mb)
    except ProjectExists:
        _fail(f"{Path(directory).resolve()} is already a Lakelet project")
    for relative in report.created:
        out.print(f"  {relative}", highlight=False)
    if report.extensions_installed:
        out.print(
            f"  installed DuckDB extensions {', '.join(report.extensions_installed)} into "
            f"{report.extension_directory} (the one download; nothing else fetches at query time)",
            highlight=False,
        )
    else:
        out.print(f"  DuckDB extensions already in {report.extension_directory}", highlight=False)
    if report.throughput_local_mbps:
        out.print(
            f"  local disk reads at {report.throughput_local_mbps:,.0f} MB/s", highlight=False
        )
    out.print(f"lakehouse ready in {report.root}", highlight=False)


# -- import and tables -----------------------------------------------------------


def _print_preview(preview) -> None:
    t = Table(title=f"{preview.source} → {preview.name}", show_lines=False)
    for column in ("column", "duckdb type", "iceberg type", "note"):
        t.add_column(column)
    for c in preview.columns:
        t.add_row(c.name, c.duckdb_type, c.iceberg_type, c.note)
    out.print(t)
    sample = Table(title="first rows")
    for c in preview.columns:
        sample.add_column(c.name)
    for row in preview.sample:
        sample.add_row(*[str(v) for v in row])
    out.print(sample)


def _human_bytes(n: int) -> str:
    from lakelet.gauge.verdict import human_bytes

    return human_bytes(n)


@app.command("import")
def import_(
    path: Annotated[
        Path, typer.Argument(help="A .csv .tsv .parquet .json .jsonl .xlsx file, or a folder.")
    ],
    name: Annotated[
        str | None, typer.Option(help="Table name; from the file name by default.")
    ] = None,
    replace: Annotated[
        bool, typer.Option("--replace", help="Drop and recreate an existing table.")
    ] = False,
    append: Annotated[bool, typer.Option("--append", help="Append to an existing table.")] = False,
    preview: Annotated[
        bool, typer.Option("--preview", help="Show the inferred schema and stop.")
    ] = False,
) -> None:
    """Import a file or a folder of files into Iceberg tables."""
    from lakelet.tables import TableExists, UnsupportedFile

    if replace and append:
        _fail("--replace and --append are exclusive")
    mode = "replace" if replace else "append" if append else "create"
    with _open() as p:
        try:
            if preview:
                _print_preview(p.tables.preview(path, name=name))
                return
            infos = (
                p.tables.import_dir(path, mode=mode)
                if path.is_dir()
                else [p.tables.import_file(path, name=name, mode=mode)]
            )
        except TableExists as e:
            _fail(f"table {e} exists; --replace drops and recreates it, --append adds to it")
        except (UnsupportedFile, FileNotFoundError) as e:
            _fail(str(e))
    for info in infos:
        out.print(
            f"{info.name}: {info.rows:,} rows, {_human_bytes(info.bytes)}, "
            f"{len(info.columns)} columns",
            highlight=False,
        )


@tables_app.command("list")
def tables_list() -> None:
    """Tables in the catalog with rows, size and location."""
    with _open() as p:
        infos = p.tables.list()
    t = Table()
    for column in ("table", "rows", "size", "columns", "where"):
        t.add_column(column)
    for i in infos:
        t.add_row(
            i.name,
            f"{i.rows:,}",
            _human_bytes(i.bytes),
            str(len(i.columns)),
            "local" if i.location.startswith("file://") else i.location,
        )
    out.print(t)


@tables_app.command("describe")
def tables_describe(name: str) -> None:
    """Columns, types, partitioning, freshness and the last commit of a table."""
    from lakelet.tables import NoSuchTable

    with _open() as p:
        try:
            d = p.tables.describe(name)
        except NoSuchTable:
            _fail(f"no table named {name}")
    out.print(
        f"{d.name}: {d.rows:,} rows, {_human_bytes(d.bytes)}, {d.snapshots} snapshot(s), "
        f"Iceberg v{d.format_version}",
        highlight=False,
    )
    out.print(f"partitioning: {d.partitioning}", highlight=False)
    if d.freshness:
        out.print(
            f"freshness: {d.freshness.isoformat(timespec='seconds')}  "
            f"last commit: {d.last_commit.get('operation')} {d.last_commit.get('snapshot_id')}",
            highlight=False,
        )
    t = Table()
    t.add_column("column")
    t.add_column("type")
    for c, typ in d.columns:
        t.add_row(c, typ)
    out.print(t)


@tables_app.command("sample")
def tables_sample(
    name: str, n: Annotated[int, typer.Option("-n", help="Rows to show.")] = 5
) -> None:
    """The first rows of a table."""
    from lakelet.tables import NoSuchTable

    with _open() as p:
        try:
            rows = p.tables.sample(name, n=n)
        except NoSuchTable:
            _fail(f"no table named {name}")
    _print_rows(
        [list(r.keys()) for r in rows[:1]][0] if rows else [], [list(r.values()) for r in rows]
    )


@tables_app.command("attach")
def tables_attach(
    name: str,
    source: Annotated[
        str, typer.Argument(help="s3://bucket/prefix/ of Parquet, or a …metadata.json")
    ],
    metadata_in_bucket: Annotated[
        bool,
        typer.Option(
            "--metadata-in-bucket", help="Keep the Iceberg metadata under s3://bucket/_lakelet/."
        ),
    ] = False,
) -> None:
    """Register remote data as a read-only Iceberg table without copying it."""
    from lakelet.register import NotRegistrable
    from lakelet.tables import TableExists

    with _open() as p:
        try:
            info = p.tables.attach(name, source, metadata_in_bucket=metadata_in_bucket)
        except TableExists:
            _fail(f"table {name} exists")
        except NotRegistrable as e:
            _fail(str(e))
    placement = "in the bucket" if metadata_in_bucket else "local"
    out.print(
        f"{info.name}: {info.rows:,} rows, {_human_bytes(info.bytes)} in place at {source}; "
        f"metadata {placement}",
        highlight=False,
    )


@tables_app.command("refresh")
def tables_refresh(name: str) -> None:
    """Add the files new under a registered prefix since it was attached."""
    from lakelet.register import MissingFiles, NotRegistrable
    from lakelet.tables import NoSuchTable

    with _open() as p:
        try:
            report = p.tables.refresh(name)
        except NoSuchTable:
            _fail(f"no table named {name}")
        except (NotRegistrable, MissingFiles) as e:
            _fail(str(e))
    out.print(
        f"{report.name}: {report.added} file(s) added; {report.files} files, {report.rows:,} rows",
        highlight=False,
    )


@tables_app.command("discover")
def tables_discover(
    prefix: Annotated[str, typer.Argument(help="s3://bucket/ or s3://bucket/prefix/")],
) -> None:
    """Candidate prefixes under a bucket, with their size and kind."""
    with _open() as p:
        found = p.tables.discover(prefix)
    t = Table()
    for column in ("prefix", "kind", "files", "size"):
        t.add_column(column)
    for d in found:
        t.add_row(d.prefix, d.kind, str(d.files), _human_bytes(d.bytes))
    out.print(t)


# -- sql and estimate ------------------------------------------------------------


def _print_rows(columns: list[str], rows: list[list], title: str | None = None) -> None:
    t = Table(title=title)
    for c in columns:
        t.add_column(str(c))
    for row in rows:
        t.add_row(*[str(v) for v in row])
    out.print(t)


def _emit(result, fmt: str, output: Path | None, limit: int) -> int:
    """Stream the result to stdout (or a file) in the chosen format; returns the row count."""

    if fmt == "parquet":
        import pyarrow.parquet as pq

        if output is None:
            _fail("--format parquet needs --output <file.parquet>")
        table = result.to_arrow()
        pq.write_table(table, output)
        return table.num_rows
    sink = output.open("w", encoding="utf-8", newline="") if output else sys.stdout
    total = 0
    try:
        if fmt == "csv":
            writer = None
            for batch in result:
                if writer is None:
                    writer = csv.writer(sink)
                    writer.writerow(batch.schema.names)
                for row in zip(*[c.to_pylist() for c in batch.columns], strict=True):
                    writer.writerow(row)
                total += batch.num_rows
        elif fmt == "json":
            for batch in result:
                for row in batch.to_pylist():
                    sink.write(json.dumps(row, default=str) + "\n")
                total += batch.num_rows
        else:  # table
            shown: list[list] = []
            columns: list[str] = []
            for batch in result:
                columns = columns or batch.schema.names
                if len(shown) < limit:
                    rows = zip(*[c.to_pylist() for c in batch.columns], strict=True)
                    for row in rows:
                        if len(shown) >= limit:
                            break
                        shown.append(list(row))
                total += batch.num_rows
            _print_rows(columns, shown)
            if total > limit:
                out.print(
                    f"showing {limit:,} of {total:,} rows; --format csv streams them all",
                    highlight=False,
                )
    finally:
        if output:
            sink.close()
    return total


def _run_sql(
    p, sql: str, fmt: str | None, output: Path | None, run_anyway: bool, limit: int
) -> None:
    from lakelet.engine import CatalogConflict
    from lakelet.query import RedRefused

    if fmt is None:
        fmt = "table" if sys.stdout.isatty() else "csv"
    try:
        result = p.query(sql, allow_red=run_anyway)
    except RedRefused as e:
        _gauge_line(e.estimate)
        err.print("refused; --run-anyway runs it here regardless", highlight=False)
        raise typer.Exit(EXIT_RED) from None
    except CatalogConflict as e:
        _fail(f"catalog conflict after retries: {e}", EXIT_CONFLICT)
    if result.estimate is not None:
        _gauge_line(result.estimate)
    else:
        err.print("[dim]couldn't estimate; running anyway[/dim]")
    started = time.perf_counter()
    try:
        rows = _emit(result, fmt, output, limit)
    except CatalogConflict as e:
        _fail(f"catalog conflict after retries: {e}", EXIT_CONFLICT)
    actual = result.actual
    elapsed = actual.wall if actual else time.perf_counter() - started
    err.print(f"✓ {rows:,} rows · {elapsed:.2f} s", highlight=False)


@app.command()
def sql(
    query: Annotated[str | None, typer.Argument(help="The SQL; or use -f.")] = None,
    file: Annotated[
        Path | None, typer.Option("-f", "--file", help="Read the SQL from a file.")
    ] = None,
    fmt: Annotated[
        str | None,
        typer.Option(
            "--format", help="table, csv, json or parquet; table on a terminal, csv when piped."
        ),
    ] = None,
    output: Annotated[
        Path | None, typer.Option("-o", "--output", help="Write the result to a file.")
    ] = None,
    run_anyway: Annotated[
        bool, typer.Option("--run-anyway", help="Run a Red verdict here regardless.")
    ] = False,
    limit: Annotated[int, typer.Option(help="Rows shown as a table.")] = 1000,
) -> None:
    """Run SQL: the gauge line first (stderr), then the rows (stdout)."""
    if fmt is not None and fmt not in ("table", "csv", "json", "parquet"):
        _fail("--format must be table, csv, json or parquet")
    text = _sql_text(query, file)
    with _open() as p:
        _run_sql(p, text, fmt, output, run_anyway, limit)


@app.command()
def estimate(
    query: Annotated[str | None, typer.Argument(help="The SQL; or use -f.")] = None,
    file: Annotated[
        Path | None, typer.Option("-f", "--file", help="Read the SQL from a file.")
    ] = None,
    as_json: Annotated[
        bool, typer.Option("--json", help="The numbers as JSON instead of the line.")
    ] = False,
) -> None:
    """The gauge only: verdict, bytes, memory, time, the burst half. Nothing runs."""
    text = _sql_text(query, file)
    with _open() as p:
        e = p.estimate(text)
    if as_json:
        out.print_json(
            json.dumps(
                {
                    "verdict": e.verdict,
                    "words": e.words,
                    "bytes_scanned": e.bytes_scanned,
                    "peak_memory": e.peak_memory,
                    "wall_local": e.wall_local,
                    "worker": e.worker,
                    "wall_burst": e.wall_burst,
                    "cost_burst": e.cost_burst,
                    "cap": e.cap,
                    "pruning": e.pruning,
                    "reason": e.reason,
                }
            )
        )
    else:
        style = VERDICT_STYLE[e.verdict]
        out.print(f"[{style}]●[/{style}] {e.words} · {e.reason}", highlight=False)


# -- catalog ----------------------------------------------------------------------


@catalog_app.command("serve")
def catalog_serve(
    port: Annotated[
        int, typer.Option(help="A fixed port for Spark, Trino, pyiceberg and other DuckDBs.")
    ] = 8181,
    host: Annotated[str, typer.Option(help="Loopback only in v0.")] = "127.0.0.1",
) -> None:
    """Expose the project's Iceberg REST catalog on a fixed loopback port."""
    import signal
    import threading

    from lakelet.catalog import EmbeddedCatalog, create_app

    if host not in ("127.0.0.1", "localhost", "::1"):
        _fail(f"v0 binds loopback only; {host} refused (brief D22)")
    p = _open()
    server = EmbeddedCatalog(create_app(p.store, warehouse=p.warehouse_url), port=port)
    url = server.start()
    out.print(f"catalog at {url} (Iceberg REST, warehouse {p.warehouse_url})", highlight=False)
    out.print(
        f'pyiceberg: RestCatalog("lakelet", uri="{url}")\n'
        f"duckdb:    ATTACH 'lakelet' AS lakelet (TYPE ICEBERG, ENDPOINT '{url}', "
        "AUTHORIZATION_TYPE 'none', DEFAULT_SCHEMA 'main')\n"
        "Ctrl-C stops it.",
        highlight=False,
    )
    sys.stdout.flush()
    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    stop.wait()
    server.stop()
    p.close()


# -- questions -------------------------------------------------------------------


@question_app.command("save")
def question_save(
    title: str,
    file: Annotated[
        Path | None, typer.Option("-f", "--file", help="Read the SQL from a file.")
    ] = None,
    query: Annotated[str | None, typer.Option("--sql", help="The SQL inline.")] = None,
) -> None:
    """Save a question as a dbt model with two default checks."""
    text = _sql_text(query, file)
    with _open() as p:
        q = p.questions.save(title, text)
    out.print(
        f"saved {q.slug}: {q.path.relative_to(p.root)} (+ schema.yml entry with 2 checks)",
        highlight=False,
    )


@question_app.command("list")
def question_list() -> None:
    """Saved questions with their last run."""
    with _open() as p:
        questions = p.questions.list()
    t = Table()
    for column in ("slug", "title", "last run"):
        t.add_column(column)
    for q in questions:
        t.add_row(
            q.slug, q.title, q.last_run.isoformat(timespec="seconds") if q.last_run else "never"
        )
    out.print(t)


@question_app.command("run")
def question_run(
    slug: str,
    fmt: Annotated[
        str | None, typer.Option("--format", help="table, csv, json or parquet.")
    ] = None,
    output: Annotated[Path | None, typer.Option("-o", "--output")] = None,
    run_anyway: Annotated[bool, typer.Option("--run-anyway")] = False,
    limit: Annotated[int, typer.Option()] = 1000,
) -> None:
    """Run a saved question: the gauge first."""
    from lakelet.questions import NoSuchQuestion

    with _open() as p:
        try:
            q = p.questions.get(slug)
        except NoSuchQuestion:
            _fail(f"no question named {slug}")
        _run_sql(p, q.sql, fmt, output, run_anyway, limit)
        if p.history.recent(1) and p.history.recent(1)[0].sql_text == q.sql:
            p.history.record_question_run(slug, p.history.recent(1)[0].id)


# -- gauge history and audit -----------------------------------------------------


@gauge_app.command("history")
def gauge_history(last: Annotated[int, typer.Option("--last", help="Runs to show.")] = 20) -> None:
    """Recent runs: verdict, estimate, actual."""
    from lakelet.gauge.verdict import human_bytes, human_seconds

    with _open() as p:
        runs = p.history.recent(last)
    t = Table()
    for column in ("when", "verdict", "est", "actual", "bytes", "where", "sql"):
        t.add_column(column)
    for r in runs:
        t.add_row(
            r.ts.strftime("%H:%M:%S") if r.ts else "",
            r.verdict or "?",
            human_seconds(r.est_wall_local) if r.est_wall_local else "",
            human_seconds(r.actual_wall) if r.actual_wall else "",
            human_bytes(r.est_bytes) if r.est_bytes else "",
            r.ran_where,
            (r.sql_text or "").replace("\n", " ")[:60],
        )
    out.print(t)


@audit_app.command("network")
def audit_network() -> None:
    """Run the quickstart with outbound connections blocked and report every attempt."""
    import subprocess

    completed = subprocess.run(
        [sys.executable, "-m", "lakelet.audit"], capture_output=True, text=True
    )
    out.print(completed.stdout.rstrip(), highlight=False)
    if completed.returncode != 0:
        err.print(completed.stderr[-2000:], highlight=False)
        raise typer.Exit(1)


def run() -> None:
    app()
