# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Tables (brief §3.6, D16, D24, D36, M3): preview a file, import a file or a folder into an
Iceberg table through the catalog, list, describe, sample. Every write is a DuckDB
statement through the attached catalog; the catalog does the commit."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from lakelet import types
from lakelet.catalog.store import NotFound
from lakelet.engine import run_with_retry
from lakelet.project import NAMESPACE, TABLES_END, TABLES_START, identifier

if TYPE_CHECKING:
    from lakelet.project import Project

READERS = {
    ".csv": "read_csv_auto({path})",
    ".tsv": "read_csv_auto({path})",
    ".parquet": "read_parquet({path})",
    ".json": "read_json_auto({path})",
    ".jsonl": "read_json_auto({path})",
    ".xlsx": "read_xlsx({path})",
}
Mode = Literal["create", "replace", "append"]


class UnsupportedFile(Exception):
    pass


class TableExists(Exception):
    """The table is there already; the caller offers replace, append or another name."""


class NotExpirable(Exception):
    """A table `expire` will not touch: one registered with `tables attach` (its files are
    not Lakelet's), or one whose location is outside the project's warehouse."""


class NoSuchTable(Exception):
    pass


@dataclass
class Column:
    name: str
    duckdb_type: str
    iceberg_type: str
    note: str = ""


@dataclass
class Preview:
    name: str
    source: str
    columns: list[Column]
    sample: list[tuple]


@dataclass
class TableInfo:
    name: str
    rows: int
    bytes: int
    columns: list[tuple[str, str]]
    location: str
    snapshot_id: int | None
    #: When the current snapshot was committed: the table's freshness, in the list too so
    #: the app's tables panel can show it without a describe per table.
    freshness: datetime | None


@dataclass
class ExpireReport:
    name: str
    keep_days: int
    snapshots_before: int
    snapshots_removed: int
    files_removed: int
    bytes_reclaimed: int


@dataclass
class TableDescription(TableInfo):
    partitioning: str = "unpartitioned"
    #: Snapshots `lakelet tables expire` would remove at the project's retention, and the
    #: bytes of the files only they reference (decision 4, September 11, 2026).
    expirable_snapshots: int = 0
    reclaimable_bytes: int = 0
    keep_days: int = 7
    last_commit: dict[str, Any] = field(default_factory=dict)
    snapshots: int = 0
    format_version: int = 2


def _sql_literal(text: str) -> str:
    return "'" + text.replace("'", "''") + "'"


def _quoted(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


class Tables:
    def __init__(self, project: Project) -> None:
        self.project = project

    # -- reading files -------------------------------------------------------------

    @staticmethod
    def _reader(path: Path) -> str:
        template = READERS.get(path.suffix.lower())
        if template is None:
            raise UnsupportedFile(f"{path.name}: Lakelet imports {', '.join(READERS)}")
        if not path.exists():
            raise FileNotFoundError(path)
        return template.format(path=_sql_literal(str(path)))

    def _inferred(self, reader: str) -> list[Column]:
        rows = self.project.engine.execute(f"DESCRIBE SELECT * FROM {reader}").fetchall()
        columns = []
        for name, duckdb_type, *_ in rows:
            c = types.coerce(duckdb_type)
            columns.append(Column(name, duckdb_type, c.iceberg_type, c.note))
        return columns

    @staticmethod
    def _select(columns: list[Column]) -> str:
        parts = []
        for col in columns:
            cast_to = types.coerce(col.duckdb_type).cast_to
            q = _quoted(col.name)
            parts.append(f"CAST({q} AS {cast_to}) AS {q}" if cast_to else q)
        return ", ".join(parts)

    def preview(self, path: str | Path, name: str | None = None, sample: int = 5) -> Preview:
        path = Path(path)
        reader = self._reader(path)
        columns = self._inferred(reader)
        rows = self.project.engine.execute(
            f"SELECT {self._select(columns)} FROM {reader} LIMIT {int(sample)}"
        ).fetchall()
        return Preview(name or identifier(path.stem), str(path), columns, rows)

    def preview_dir(self, path: str | Path, sample: int = 5) -> list[Preview]:
        """One preview per file `import_dir` would import, in the same order, so a folder
        can be looked at before it is imported (CLI `--preview`, the app's drop zone)."""
        return [
            self.preview(file, name=name, sample=sample)
            for name, file in self._dir_files(path).items()
        ]

    # -- importing -----------------------------------------------------------------

    def import_file(
        self, path: str | Path, name: str | None = None, mode: Mode = "create"
    ) -> TableInfo:
        path = Path(path)
        reader = self._reader(path)
        name = name or identifier(path.stem)
        target = f"lakelet.{NAMESPACE}.{_quoted(name)}"
        exists = self._exists(name)
        if mode == "create" and exists:
            raise TableExists(name)
        if mode == "append" and not exists:
            mode = "create"
        if mode == "append":
            columns = self._existing_columns(name)
            statement = f"INSERT INTO {target} SELECT {self._select(columns)} FROM {reader}"
        else:
            if exists:
                run_with_retry(self.project.engine, f"DROP TABLE {target}")
            columns = self._inferred(reader)
            statement = f"CREATE TABLE {target} AS SELECT {self._select(columns)} FROM {reader}"
        run_with_retry(self.project.engine, statement)
        self.refresh_agents_md()
        return self._info(name)

    def import_dir(self, path: str | Path, mode: Mode = "create") -> list[TableInfo]:
        """One table per file (brief D16). Files with an unsupported extension are skipped."""
        return [
            self.import_file(file, name=name, mode=mode)
            for name, file in self._dir_files(path).items()
        ]

    @staticmethod
    def _dir_files(path: str | Path) -> dict[str, Path]:
        root = Path(path)
        if not root.is_dir():
            raise FileNotFoundError(root)
        files = sorted(p for p in root.iterdir() if p.is_file() and p.suffix.lower() in READERS)
        names: dict[str, Path] = {}
        for file in files:
            name = identifier(file.stem)
            if name in names:
                raise TableExists(f"{names[name].name} and {file.name} would both be {name}")
            names[name] = file
        return names

    def _existing_columns(self, name: str) -> list[Column]:
        rows = self.project.engine.execute(
            f"DESCRIBE lakelet.{NAMESPACE}.{_quoted(name)}"
        ).fetchall()
        return [Column(n, t, types.coerce(t).iceberg_type) for n, t, *_ in rows]

    # -- reading the catalog -------------------------------------------------------

    def _exists(self, name: str) -> bool:
        try:
            self.project.store.get_table(NAMESPACE, name)
        except NotFound:
            return False
        return True

    def _metadata(self, name: str):
        try:
            location = self.project.store.get_table(NAMESPACE, name)
        except NotFound as e:
            raise NoSuchTable(name) from e
        return self.project.metadata_io.read(location)

    def _info(self, name: str) -> TableInfo:
        md = self._metadata(name)
        snapshot = md.current_snapshot()
        rows, size = self.project.metadata_io.table_stats(md)
        return TableInfo(
            name=name,
            rows=rows,
            bytes=size,
            columns=[(f.name, str(f.field_type)) for f in md.schema().fields],
            location=md.location,
            snapshot_id=snapshot.snapshot_id if snapshot else None,
            freshness=datetime.fromtimestamp(snapshot.timestamp_ms / 1000, tz=UTC)
            if snapshot
            else None,
        )

    def list(self) -> list[TableInfo]:
        return [self._info(name) for name in self.project.store.list_tables(NAMESPACE)]

    def describe(self, name: str) -> TableDescription:
        md = self._metadata(name)
        info = self._info(name)
        snapshot = md.current_snapshot()
        spec = md.spec()
        partitioning = (
            ", ".join(
                f"{f.name} = {f.transform}({md.schema().find_column_name(f.source_id)})"
                for f in spec.fields
            )
            if spec.fields
            else "unpartitioned"
        )
        expirable = self._expirable(md, self.project.config.catalog.keep_snapshots_days)
        reclaimable = 0
        if expirable:
            kept = self._referenced_files(md, exclude={s.snapshot_id for s in expirable})
            gone = self._referenced_files(md, only={s.snapshot_id for s in expirable})
            reclaimable = sum(size for path, size in gone.items() if path not in kept)
        return TableDescription(
            **info.__dict__,
            partitioning=partitioning,
            expirable_snapshots=len(expirable),
            reclaimable_bytes=reclaimable,
            keep_days=self.project.config.catalog.keep_snapshots_days,
            last_commit=(
                {
                    "snapshot_id": snapshot.snapshot_id,
                    "operation": snapshot.summary.operation.value if snapshot.summary else None,
                    "timestamp": datetime.fromtimestamp(
                        snapshot.timestamp_ms / 1000, tz=UTC
                    ).isoformat(),
                }
                if snapshot
                else {}
            ),
            snapshots=len(md.snapshots),
            format_version=md.format_version,
        )

    def sample(self, name: str, n: int = 5, truncate: int | None = None) -> list[dict[str, Any]]:
        if not self._exists(name):
            raise NoSuchTable(name)
        cursor = self.project.engine.execute(
            f"SELECT * FROM lakelet.{NAMESPACE}.{_quoted(name)} LIMIT {int(n)}"
        )
        names = [d[0] for d in cursor.description]
        rows = cursor.fetchall()

        def cut(value: Any) -> Any:
            if truncate and isinstance(value, str) and len(value) > truncate:
                return value[:truncate]
            return value

        return [{col: cut(v) for col, v in zip(names, row, strict=True)} for row in rows]

    # -- remote, read-only (brief D25, D26, D27, M3) ----------------------------------

    def discover(self, prefix: str):
        from lakelet import register

        return register.discover(self.project, prefix)

    def attach(self, name: str, source: str, metadata_in_bucket: bool = False) -> TableInfo:
        """A Parquet prefix registered in place, or an existing Iceberg table by its
        metadata location. Nothing is copied."""
        from lakelet import register

        if self._exists(name):
            raise TableExists(name)
        if source.endswith(".metadata.json"):
            register.attach_metadata(self.project, name, source)
        else:
            register.attach_prefix(
                self.project, name, source, metadata_in_bucket=metadata_in_bucket
            )
        self.refresh_agents_md()
        return self._info(name)

    # -- expiry (decision 4, September 11, 2026) ---------------------------------------

    @staticmethod
    def _expirable(md, keep_days: int) -> list:
        """Snapshots older than the retention, other than the current one and any a branch
        or tag points at; what `expire` removes."""
        cutoff_ms = (time.time() - keep_days * 86400) * 1000
        protected = {md.current_snapshot_id} | {ref.snapshot_id for ref in md.refs.values()}
        return [
            s for s in md.snapshots if s.snapshot_id not in protected and s.timestamp_ms < cutoff_ms
        ]

    def _referenced_files(self, md, only=None, exclude=None) -> dict[str, int]:
        """Every file the given snapshots reference (manifest lists, manifests, data and
        delete files) with its size; the sweep deletes what the expired ones referenced and
        the kept ones do not."""
        io = self.project.metadata_io.io
        files: dict[str, int] = {}
        for snap in md.snapshots:
            if only is not None and snap.snapshot_id not in only:
                continue
            if exclude is not None and snap.snapshot_id in exclude:
                continue
            if snap.manifest_list:
                try:
                    files[snap.manifest_list] = len(io.new_input(snap.manifest_list))
                except Exception:  # noqa: BLE001 - a missing list is nothing to reclaim
                    files[snap.manifest_list] = 0
            for manifest in snap.manifests(io):
                files[manifest.manifest_path] = manifest.manifest_length
                for entry in manifest.fetch_manifest_entry(io, discard_deleted=False):
                    files[entry.data_file.file_path] = entry.data_file.file_size_in_bytes
        return files

    #: An unreferenced file younger than this is left alone: it may be a write in flight.
    ORPHAN_GRACE_SECONDS = 3600

    def expire(
        self, name: str, keep_days: int | None = None, orphan_grace_seconds: int | None = None
    ) -> ExpireReport:
        """`lakelet tables expire`: drop the snapshots older than the retention through the
        catalog (pyiceberg's `expire_snapshots`), then delete the files that only they
        referenced, and any data or manifest file under the table's own location that no
        remaining snapshot references (a previous `import --replace` leaves those) once it
        is older than the grace period. Only a table Lakelet wrote into the project's
        warehouse; an attached table is refused."""
        from pyiceberg.catalog.rest import RestCatalog

        from lakelet.register import SOURCE_PROPERTY

        if keep_days is None:
            keep_days = self.project.config.catalog.keep_snapshots_days
        md = self._metadata(name)
        if SOURCE_PROPERTY in md.properties:
            source = md.properties[SOURCE_PROPERTY]
            raise NotExpirable(f"{name} is registered from {source}; its files are not Lakelet's")
        if not md.location.startswith(self.project.warehouse_url):
            raise NotExpirable(f"{name} lives outside the warehouse ({md.location})")
        grace = self.ORPHAN_GRACE_SECONDS if orphan_grace_seconds is None else orphan_grace_seconds
        before = len(md.snapshots)
        expirable = self._expirable(md, keep_days)
        was = self._referenced_files(md)
        if expirable:
            catalog = RestCatalog(
                "lakelet", uri=self.project.catalog_url, **self.project.io_properties
            )
            table = catalog.load_table(f"{NAMESPACE}.{name}")
            newest_ms = max(s.timestamp_ms for s in expirable)
            table.maintenance.expire_snapshots().older_than(
                datetime.fromtimestamp((newest_ms + 1) / 1000, tz=UTC)
            ).commit()
        md_after = self._metadata(name)
        kept = self._referenced_files(md_after)
        doomed: dict[str, int] = {p: s for p, s in was.items() if p not in kept}
        doomed.update(self._orphans(md_after.location, kept, grace))
        io = self.project.metadata_io.io
        removed = 0
        reclaimed = 0
        for path, size in doomed.items():
            try:
                io.delete(path)
            except FileNotFoundError:
                continue
            removed += 1
            reclaimed += size
        # the manifest cache is keyed by the current snapshot, which expiry never touches
        return ExpireReport(
            name, keep_days, before, before - len(md_after.snapshots), removed, reclaimed
        )

    @staticmethod
    def _orphans(location: str, kept: dict[str, int], grace_seconds: int) -> dict[str, int]:
        """Data and manifest files under a local table's location that no snapshot
        references and that are older than the grace period; metadata JSON files stay."""
        if not location.startswith("file://"):
            return {}  # a remote warehouse has no listing here; expired files only
        root = Path(location.removeprefix("file://"))
        kept_paths = {Path(p.removeprefix("file://")) for p in kept}
        cutoff = time.time() - grace_seconds
        found: dict[str, int] = {}
        for sub in ("data", "metadata"):
            folder = root / sub
            if not folder.is_dir():
                continue
            for f in folder.rglob("*"):
                if not f.is_file() or f.suffix not in (".parquet", ".avro") or f in kept_paths:
                    continue
                if f.stat().st_mtime > cutoff:
                    continue
                found[f"file://{f}"] = f.stat().st_size
        return found

    def refresh(self, name: str):
        from lakelet import register

        if not self._exists(name):
            raise NoSuchTable(name)
        report = register.refresh(self.project, name)
        self.refresh_agents_md()
        return report

    # -- AGENTS.md -------------------------------------------------------------------

    def _where(self, name: str) -> str:
        """``local``, or the remote prefix the data lives under (D25)."""
        try:
            _, stats = self.project.manifests.get(
                name, self.project.store.get_table(NAMESPACE, name)
            )
        except Exception:  # noqa: BLE001  stats are a nicety here, never a reason to fail
            return "local"
        return "local" if stats.locality == "local" else stats.source

    def refresh_agents_md(self) -> None:
        """Regenerate the tables block between the markers (brief D16); leave the file alone
        if someone removed them."""
        path = self.project.root / "AGENTS.md"
        if not path.exists():
            return
        text = path.read_text(encoding="utf-8")
        if TABLES_START not in text or TABLES_END not in text:
            return
        lines = [
            f"- `{t.name}` ({_human_bytes(t.bytes)}, {t.rows:,} rows, {self._where(t.name)})"
            for t in self.list()
        ] or [
            "No tables yet. `lakelet import <file>` adds one; "
            "this block is regenerated on every import."
        ]
        block = f"{TABLES_START}\n" + "\n".join(lines) + f"\n{TABLES_END}"
        text = re.sub(
            re.escape(TABLES_START) + ".*?" + re.escape(TABLES_END),
            block,
            text,
            count=1,
            flags=re.S,
        )
        path.write_text(text, encoding="utf-8")


def _human_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"
