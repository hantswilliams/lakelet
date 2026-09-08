# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Step 0 gate: the skeleton imports, the entry point answers, the engines are the ones
the brief pins (D15), and the three DuckDB extensions load from the cache the CI warms."""

import duckdb
import pyiceberg
from typer.testing import CliRunner

import lakelet
from lakelet.cli import app


def test_package_has_a_version() -> None:
    assert lakelet.__version__


def test_cli_prints_the_version() -> None:
    result = CliRunner().invoke(app, ["--version"])
    assert result.exit_code == 0
    assert result.output.strip() == f"lakelet {lakelet.__version__}"


def test_engine_versions_match_the_brief() -> None:
    major, minor = (int(part) for part in duckdb.__version__.split(".")[:2])
    assert (major, minor) == (1, 5), duckdb.__version__
    assert pyiceberg.__version__.startswith("0.12."), pyiceberg.__version__


def test_the_three_extensions_load() -> None:
    con = duckdb.connect()
    con.execute("INSTALL iceberg; INSTALL httpfs; INSTALL excel")
    con.execute("LOAD iceberg; LOAD httpfs; LOAD excel")
    loaded = {
        name
        for (name,) in con.execute(
            "select extension_name from duckdb_extensions() where loaded"
        ).fetchall()
    }
    assert {"iceberg", "httpfs", "excel"} <= loaded
