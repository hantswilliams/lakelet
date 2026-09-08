# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""The DuckDB connection (brief D9, D15, D21, D33): the three extensions loaded from the
machine's cache, the catalog attached as ``lakelet`` with ``main`` as the default schema so
bare table names work, limits from the config, and the profiler on for every statement."""

from __future__ import annotations

import json
import os
import random
import time
from pathlib import Path

import duckdb

EXTENSIONS = ("iceberg", "httpfs", "excel")

PROFILE_METRICS = (
    "LATENCY",
    "ROWS_RETURNED",
    "CUMULATIVE_ROWS_SCANNED",
    "OPERATOR_ROWS_SCANNED",
    "OPERATOR_CARDINALITY",
    "OPERATOR_TIMING",
    "SYSTEM_PEAK_BUFFER_MEMORY",
    "SYSTEM_PEAK_TEMP_DIR_SIZE",
)


class ExtensionsMissing(RuntimeError):
    pass


class CatalogConflict(RuntimeError):
    """A commit lost the race three times (brief D23); the CLI maps it to exit 4."""


CONFLICT_MARKERS = ("Failed to commit Iceberg transaction", "409")


def is_conflict(error: Exception) -> bool:
    return all(marker in str(error) for marker in CONFLICT_MARKERS)


def run_with_retry(engine: Engine, sql: str, attempts: int = 3) -> None:
    """DuckDB does not retry a 409 (step 1); Lakelet re-runs the statement with jittered
    backoff, then raises CatalogConflict."""
    for attempt in range(attempts):
        try:
            engine.execute(sql)
            return
        except duckdb.Error as e:
            if not is_conflict(e) or attempt == attempts - 1:
                if is_conflict(e):
                    raise CatalogConflict(str(e)) from e
                raise
            time.sleep(random.uniform(0.1, 0.5) * (attempt + 1))


def install_extensions() -> tuple[list[str], str]:
    """``lakelet init``'s one network fetch (brief D33). Returns the extensions that were
    downloaded now and the directory they live in."""
    con = duckdb.connect()

    def installed() -> set[str]:
        rows = con.execute(
            "select extension_name from duckdb_extensions() where installed"
        ).fetchall()
        return {name for (name,) in rows}

    before = installed()
    con.execute("; ".join(f"INSTALL {name}" for name in EXTENSIONS))
    downloaded = sorted(installed() - before)
    directory = con.execute("select current_setting('extension_directory')").fetchone()[0]
    con.close()
    return downloaded, directory or os.path.expanduser("~/.duckdb/extensions")


class Engine:
    def __init__(
        self,
        catalog_url: str,
        profile_path: Path,
        memory_limit: str = "auto",
        threads: int | str = "auto",
    ) -> None:
        self.con = duckdb.connect()
        self.profile_path = profile_path
        try:
            self.con.execute("; ".join(f"LOAD {name}" for name in EXTENSIONS))
        except duckdb.IOException as e:
            raise ExtensionsMissing(
                "DuckDB's iceberg, httpfs and excel extensions are not installed on this machine; "
                "`lakelet init` installs them once"
            ) from e
        if memory_limit != "auto":
            self.con.execute("SET memory_limit = ?", [memory_limit])
        if threads != "auto":
            self.con.execute("SET threads = ?", [int(threads)])
        self.con.execute(
            f"ATTACH 'lakelet' AS lakelet (TYPE ICEBERG, ENDPOINT '{catalog_url}', "
            "AUTHORIZATION_TYPE 'none', DEFAULT_SCHEMA 'main')"
        )
        self.con.execute("USE lakelet.main")
        settings = json.dumps({metric: "true" for metric in PROFILE_METRICS})
        self.con.execute("SET custom_profiling_settings = ?", [settings])
        self.con.execute("SET enable_profiling = 'json'")
        self.con.execute("SET profiling_output = ?", [str(profile_path)])

    def execute(self, sql: str, parameters: list | None = None) -> duckdb.DuckDBPyConnection:
        return self.con.execute(sql, parameters) if parameters else self.con.execute(sql)

    def last_profile(self) -> dict | None:
        """The profiler's JSON for the last statement that produced one."""
        if not self.profile_path.exists():
            return None
        return json.loads(self.profile_path.read_text(encoding="utf-8"))

    def close(self) -> None:
        self.con.close()
