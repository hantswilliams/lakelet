# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""PRD F0.7 AC: Spark 3.5 and Trino read and write a Lakelet-created table through the
catalog. Opt-in: needs the compose ``engines`` profile up and LAKELET_SMOKE=1.

    docker compose --profile engines up -d --wait
    cd core && LAKELET_SMOKE=1 uv run pytest tests/smoke -s
"""

import os
import subprocess
from pathlib import Path

import pyarrow as pa
import pytest
from pyiceberg.catalog.rest import RestCatalog
from pyiceberg.exceptions import NamespaceAlreadyExistsError, NoSuchTableError

from tests.catalog_helpers import SCHEMA, attach

pytestmark = pytest.mark.skipif(
    os.environ.get("LAKELET_SMOKE") != "1", reason="set LAKELET_SMOKE=1 with the engines profile up"
)

ROOT = Path(__file__).resolve().parents[3]
CATALOG = "http://127.0.0.1:8181"
S3 = "http://127.0.0.1:9000"
PROPS = {
    "s3.endpoint": S3,
    "s3.access-key-id": "lakelet",
    "s3.secret-access-key": "lakeletlakelet",
    "s3.region": "us-east-1",
}


def compose_exec(service: str, *args: str) -> str:
    result = subprocess.run(
        ["docker", "compose", "exec", "-T", service, *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=900,
    )
    assert result.returncode == 0, f"{service}: {result.stderr[-3000:]}"
    return result.stdout


def spark_sql(sql: str) -> str:
    out = compose_exec("spark", "/opt/spark/bin/spark-sql", "-S", "-e", sql)
    lines = [line.strip() for line in out.splitlines() if line.strip()]
    return lines[-1] if lines else ""


def trino_sql(sql: str) -> str:
    out = compose_exec("trino", "trino", "--output-format", "CSV_UNQUOTED", "--execute", sql)
    lines = [line.strip() for line in out.splitlines() if line.strip()]
    return lines[-1] if lines else ""


def test_spark_and_trino_read_and_write_a_lakelet_table() -> None:
    cat = RestCatalog("lakelet", uri=CATALOG, **PROPS)
    try:
        cat.create_namespace("main")
    except NamespaceAlreadyExistsError:
        pass
    try:
        cat.drop_table("main.orders")
    except NoSuchTableError:
        pass
    table = cat.create_table("main.orders", schema=SCHEMA)
    table.append(pa.table({"id": [1, 2, 3], "amt": [1.0, 2.0, 3.0]}))

    def rows() -> int:
        return cat.load_table("main.orders").scan().to_arrow().num_rows

    assert spark_sql("SELECT count(*) FROM lakelet.main.orders") == "3"
    spark_sql("INSERT INTO lakelet.main.orders VALUES (4, 4.0)")
    assert rows() == 4, "Spark's insert did not land in the Lakelet catalog"

    assert trino_sql("SELECT count(*) FROM lakelet.main.orders") == "4"
    trino_sql("INSERT INTO lakelet.main.orders VALUES (5, 5.0)")
    assert rows() == 5, "Trino's insert did not land in the Lakelet catalog"

    con = attach(
        CATALOG,
        secret_sql=(
            "CREATE SECRET (TYPE s3, KEY_ID 'lakelet', SECRET 'lakeletlakelet', "
            "REGION 'us-east-1', ENDPOINT '127.0.0.1:9000', URL_STYLE 'path', USE_SSL false)"
        ),
    )
    assert con.execute("SELECT count(*) FROM lakelet.main.orders").fetchone()[0] == 5
    print("\nSpark and Trino both read and wrote the Lakelet table; DuckDB sees all five rows")
