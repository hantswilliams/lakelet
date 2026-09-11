# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""A Lakelet project on disk (brief §3.2) and the process that has it open (brief D3): one
``Project`` owns the embedded catalog thread and the DuckDB engine for the life of the
process."""

from __future__ import annotations

import json
import os
import re
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

from lakelet.catalog import EmbeddedCatalog, Store, create_app
from lakelet.catalog.commit import MetadataIO
from lakelet.catalog.store import NotFound
from lakelet.config import Config, render_default
from lakelet.engine import Engine, install_extensions
from lakelet.remote import S3Settings, load_public_buckets, save_public_bucket

if TYPE_CHECKING:
    from lakelet.gauge.manifests import ManifestCache
    from lakelet.gauge.model import Estimate
    from lakelet.history import History
    from lakelet.query import Result
    from lakelet.questions import Questions
    from lakelet.tables import Tables

NAMESPACE = "main"
GITIGNORE_LINES = ("warehouse/", ".lakelet/", ".DS_Store")
TABLES_START = "<!-- lakelet:tables:start -->"
TABLES_END = "<!-- lakelet:tables:end -->"


class ProjectExists(Exception):
    pass


class NotAProject(Exception):
    pass


def identifier(name: str) -> str:
    """Brief D36: lower-case, runs of non-alphanumerics become one underscore, a leading
    digit gets a ``t_`` prefix. Used for dbt project names now and table names in step 3."""
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "project"
    return f"t_{slug}" if slug[0].isdigit() else slug


def agents_md(name: str) -> str:
    return f"""# {name} · Lakelet project

This folder is a Lakelet lakehouse: DuckDB + Apache Iceberg + dbt. Local Iceberg tables live in
`./warehouse`; the catalog is `./.lakelet/catalog.db`; every operation is a `lakelet` verb.

## Tables
{TABLES_START}
No tables yet. `lakelet import <file>` adds one; this block is regenerated on every import.
{TABLES_END}

## Rules
- Run `lakelet estimate` before `lakelet sql` on anything large. Red means do not run locally.
- Save reusable questions with `lakelet question save`; they become dbt models with checks.
- Do not modify `lakelet.toml`, `AGENTS.md`, or anything under `.lakelet/`.

## Conventions
dbt project at `./` (dbt-duckdb). Models in `models/`; saved questions in `models/questions/`.
`macros/lakelet.sql` is Lakelet's `table` materialisation for the catalog; leave it in place.
Tests are "checks".
"""


# dbt's built-in ``table`` materialisation swaps a temp table into place by renames inside one
# transaction, which DuckDB-Iceberg refuses (brief §7, step 6, September 9). This override,
# written by ``init`` into ``macros/lakelet.sql``, asks the catalog only for what it does:
# rebuild in place when the columns are unchanged (one transaction, the table keeps its
# identity and history), drop and create in separate transactions when they changed.
LAKELET_MACROS = """\
{#- Lakelet's table materialisation for the Iceberg catalog, written by `lakelet init`.
    DuckDB-Iceberg refuses CREATE OR REPLACE, and a rename or a drop-then-create inside one
    transaction, so a rebuild keeps the table and replaces its rows (one transaction, two
    snapshots) and falls back to drop-then-create in separate transactions when the columns
    changed. Overrides dbt's built-in `table` for this project; models need no config. -#}

{% macro lakelet__columns_of_query(sql) -%}
  {%- set rows = run_query("DESCRIBE (" ~ sql ~ ")") -%}
  {%- set cols = [] -%}
  {%- for row in rows.rows -%}{%- do cols.append((row[0] | lower, row[1] | upper)) -%}{%- endfor -%}
  {{ return(cols) }}
{%- endmacro %}

{% macro lakelet__columns_of_relation(relation) -%}
  {%- set cols = [] -%}
  {%- for c in adapter.get_columns_in_relation(relation) -%}
    {%- do cols.append((c.name | lower, c.dtype | upper)) -%}
  {%- endfor -%}
  {{ return(cols) }}
{%- endmacro %}

{% materialization table, adapter="duckdb" %}
  {%- set target_relation = this.incorporate(type='table') -%}
  {%- set existing_relation = load_cached_relation(this) -%}
  {{ run_hooks(pre_hooks, inside_transaction=False) }}

  {%- set in_place = existing_relation is not none
        and existing_relation.is_table
        and lakelet__columns_of_relation(existing_relation)
            == lakelet__columns_of_query(compiled_code) -%}

  {% if in_place %}
    {{ run_hooks(pre_hooks, inside_transaction=True) }}
    {% call statement('delete') -%}
      delete from {{ target_relation }}
    {%- endcall %}
    {% call statement('main') -%}
      insert into {{ target_relation }} {{ compiled_code }}
    {%- endcall %}
    {{ run_hooks(post_hooks, inside_transaction=True) }}
    {{ adapter.commit() }}
  {% else %}
    {#- the column check above opened dbt's transaction; the drop must commit on its own
        before the create, or the catalog refuses to create a table deleted in the same one -#}
    {% if existing_relation is not none %}
      {% call statement('drop') -%}
        drop table {{ existing_relation }}
      {%- endcall %}
      {{ adapter.commit() }}
    {% endif %}
    {% call statement('main') -%}
      create table {{ target_relation }} as {{ compiled_code }}
    {%- endcall %}
    {{ run_hooks(post_hooks, inside_transaction=True) }}
    {{ adapter.commit() }}
  {% endif %}

  {{ run_hooks(post_hooks, inside_transaction=False) }}
  {{ return({'relations': [target_relation]}) }}
{% endmaterialization %}
"""


def dbt_project_yml(name: str) -> str:
    return f'''name: "{identifier(name)}"
version: "1.0.0"
profile: "lakelet"
model-paths: ["models"]
models:
  +database: lakelet   # models land in the Lakelet catalog, next to the tables they read
'''


@dataclass
class InitReport:
    root: Path
    created: list[str] = field(default_factory=list)
    extensions_installed: list[str] = field(default_factory=list)
    extension_directory: str = ""
    throughput_local_mbps: float | None = None
    throughput_probe: str | None = None


def run_probe(root: Path, probe_mb: int = 512):
    """The disk-throughput probe, at `init` and on `lakelet gauge probe`: the figure and its
    method are what the gauge reads from `.lakelet/cache/machine.json`."""
    from lakelet.gauge import inputs

    cache_dir = root / ".lakelet" / "cache"
    probe = inputs.probe_throughput(root / "warehouse", probe_mb)
    cache = inputs.load_machine_cache(cache_dir)
    cache.update({"throughput_local_mbps": probe.mbps, "probe_mb": probe_mb, "probe": probe.method})
    inputs.save_machine_cache(cache_dir, cache)
    return probe


class Project:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.config = Config.load(root / "lakelet.toml")
        self.lakelet_dir = root / ".lakelet"
        self.cache_dir = self.lakelet_dir / "cache"
        self.catalog_db = self.lakelet_dir / "catalog.db"
        self.history_db = self.lakelet_dir / "history.db"
        self.store: Store = Store(f"sqlite:///{self.catalog_db}")
        self.s3 = S3Settings.from_env()
        self.io_properties: dict[str, str] = self.s3.io_properties()
        self.metadata_io = MetadataIO(self.io_properties, cache_dir=self.cache_dir / "objects")
        self._manifests: ManifestCache | None = None
        self._catalog: EmbeddedCatalog | None = None
        self._engine: Engine | None = None
        self._tables: Tables | None = None
        self._history: History | None = None
        self._questions: Questions | None = None
        self.token: str | None = None

    # -- on disk --------------------------------------------------------------------

    @classmethod
    def init(
        cls, path: str | Path = ".", name: str | None = None, probe_mb: int = 512
    ) -> InitReport:
        root = Path(path).resolve()
        root.mkdir(parents=True, exist_ok=True)
        if (root / "lakelet.toml").exists():
            raise ProjectExists(str(root))
        name = name or root.name
        report = InitReport(root=root)

        def write_if_absent(relative: str, content: str) -> None:
            target = root / relative
            if target.exists():
                return
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            report.created.append(relative)

        write_if_absent("lakelet.toml", render_default(name))
        write_if_absent("AGENTS.md", agents_md(name))
        write_if_absent("dbt_project.yml", dbt_project_yml(name))
        write_if_absent("models/.gitkeep", "")
        write_if_absent("macros/lakelet.sql", LAKELET_MACROS)
        gitignore = root / ".gitignore"
        text = gitignore.read_text(encoding="utf-8") if gitignore.exists() else ""
        missing = [line for line in GITIGNORE_LINES if line not in text.splitlines()]
        if missing:
            with gitignore.open("a", encoding="utf-8") as f:
                if text and not text.endswith("\n"):
                    f.write("\n")
                f.write("\n".join(missing) + "\n")
            report.created.append(".gitignore")
        for directory in ("warehouse", ".lakelet/cache"):
            (root / directory).mkdir(parents=True, exist_ok=True)
        cls._ensure_namespace(Store(f"sqlite:///{root / '.lakelet' / 'catalog.db'}"))
        report.created.append(".lakelet/catalog.db")
        report.extensions_installed, report.extension_directory = install_extensions()
        if probe_mb:
            probe = run_probe(root, probe_mb)
            report.throughput_local_mbps = probe.mbps
            report.throughput_probe = probe.method
        return report

    @classmethod
    def open(
        cls,
        path: str | Path = ".",
        serve: bool = False,
        port: int = 0,
        memory_limit: str | None = None,
    ) -> Project:
        """Open the project in this process. With ``serve`` the one loopback server also
        carries the API (brief D3) and ``.lakelet/serve.json`` names it. ``memory_limit``
        overrides ``[engine]`` for this process only: the app sets one per window (app brief
        A8), the CLI keeps the file's value."""
        root = Path(path).resolve()
        if not (root / "lakelet.toml").exists():
            raise NotAProject(str(root))
        project = cls(root)
        project.token = secrets.token_urlsafe(32) if serve else None
        project._start(port=port, memory_limit=memory_limit)
        if serve:
            project._write_serve_json()
        return project

    @staticmethod
    def _ensure_namespace(store: Store) -> None:
        try:
            store.get_namespace(NAMESPACE)
        except NotFound:
            store.create_namespace(NAMESPACE, {})

    @property
    def warehouse_url(self) -> str:
        warehouse = self.config.project.warehouse
        if "://" in warehouse:
            return warehouse
        return f"file://{(self.root / warehouse).resolve()}"

    # -- in process -----------------------------------------------------------------

    def _start(self, port: int = 0, memory_limit: str | None = None) -> None:
        self.lakelet_dir.mkdir(exist_ok=True)
        self.cache_dir.mkdir(exist_ok=True)
        self._ensure_namespace(self.store)
        app = create_app(
            self.store,
            warehouse=self.warehouse_url,
            io_properties=self.io_properties,
            cache_dir=self.cache_dir / "objects",
        )
        if self.token:
            from fastapi.middleware.cors import CORSMiddleware

            from lakelet.api import TAURI_ORIGINS, VERDICT_HEADERS, create_router

            app.include_router(create_router(self, self.token))
            # LAKELET_DEV_ORIGIN lets the app's frontend be driven from a browser against a
            # real sidecar in development and tests (app brief A12); the shell never sets it.
            dev_origin = os.environ.get("LAKELET_DEV_ORIGIN")
            app.add_middleware(
                CORSMiddleware,
                allow_origins=TAURI_ORIGINS + ([dev_origin] if dev_origin else []),
                allow_methods=["*"],
                allow_headers=["*"],
                expose_headers=VERDICT_HEADERS,
            )
        self._catalog = EmbeddedCatalog(app, port=port)
        url = self._catalog.start()
        self._engine = Engine(
            url,
            self.lakelet_dir / "last-profile.json",
            memory_limit=memory_limit or self.config.engine.memory_limit,
            threads=self.config.engine.threads,
            s3_secret=self.s3.duckdb_secret(),
        )
        for bucket, region in load_public_buckets(self.lakelet_dir).items():
            self._engine.allow_public(self.s3.anonymous_secret(bucket, region))

    def export_gauge(self, out: Path | None = None) -> tuple[Path, int]:
        """`lakelet gauge export`: the calibration record as JSON lines, the F0.3.9 fields
        only (gauge/export.py), to ``.lakelet/exports/gauge-<utc time>.jsonl`` unless a
        path is given. Returns the path and the runs written."""
        from datetime import UTC, datetime

        from lakelet.gauge.export import export_lines

        if out is None:
            out = self.lakelet_dir / "exports" / f"gauge-{datetime.now(UTC):%Y%m%d-%H%M%S}.jsonl"
        out.parent.mkdir(parents=True, exist_ok=True)
        count = 0
        with out.open("w") as f:
            for line in export_lines(self.history.all_runs()):
                f.write(line + "\n")
                count += 1
        return out, count

    def allow_public_bucket(self, bucket: str) -> str:
        """Remember a public bucket for this project and open it to the engine now; returns
        the region S3 reports for it."""
        region = self.s3.bucket_region(bucket)
        save_public_bucket(self.lakelet_dir, bucket, region)
        self.engine.allow_public(self.s3.anonymous_secret(bucket, region))
        return region

    @property
    def catalog_url(self) -> str:
        assert self._catalog is not None, "the project is not open"
        return self._catalog.url

    @property
    def engine(self) -> Engine:
        assert self._engine is not None, "the project is not open"
        return self._engine

    @property
    def history(self) -> History:
        if self._history is None:
            from lakelet.history import History

            self.lakelet_dir.mkdir(exist_ok=True)
            self._history = History(self.history_db)
        return self._history

    def query(self, sql: str, allow_red: bool = False, batch_rows: int = 1000) -> Result:
        from lakelet.query import query

        return query(self, sql, allow_red=allow_red, batch_rows=batch_rows)

    def estimate(self, sql: str) -> Estimate:
        from lakelet.query import estimate

        return estimate(self, sql)

    @property
    def manifests(self) -> ManifestCache:
        if self._manifests is None:
            from lakelet.gauge.manifests import ManifestCache

            self._manifests = ManifestCache(self)
        return self._manifests

    @property
    def questions(self) -> Questions:
        if self._questions is None:
            from lakelet.questions import Questions

            self._questions = Questions(self)
        return self._questions

    @property
    def tables(self) -> Tables:
        if self._tables is None:
            from lakelet.tables import Tables

            self._tables = Tables(self)
        return self._tables

    @property
    def serve_json(self) -> Path:
        return self.lakelet_dir / "serve.json"

    def _write_serve_json(self) -> None:
        """``{port, pid, token, started}`` at mode 0600 (brief D3)."""
        port = int(self.catalog_url.rsplit(":", 1)[1])
        data = {
            "port": port,
            "pid": os.getpid(),
            "token": self.token,
            "started": datetime.now(UTC).isoformat(),
        }
        tmp = self.serve_json.with_suffix(".tmp")
        tmp.write_text(json.dumps(data), encoding="utf-8")
        os.chmod(tmp, 0o600)
        tmp.replace(self.serve_json)

    def close(self) -> None:
        """Everything that holds a file or a socket, so a process can open and close projects
        without running out of descriptors (found by the suite on a Mac at the 256 default)."""
        if self._engine is not None:
            self._engine.close()
            self._engine = None
        if self._catalog is not None:
            self._catalog.stop()
            self._catalog = None
        if self._history is not None:
            self._history.close()
            self._history = None
        self._manifests = None
        self.store.close()
        if self.token and self.serve_json.exists():
            self.serve_json.unlink()

    def __enter__(self) -> Project:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
