# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Step 1 gate, s3:// warehouse: the same catalog with its metadata and data files on S3.
Runs against Moto's threaded server in the default suite; against a real endpoint when
LAKELET_TEST_S3_ENDPOINT (and the usual AWS credentials) are set (brief D16)."""

import logging
import os
import time
from types import SimpleNamespace

import boto3
import pytest
from pyiceberg.catalog.rest import RestCatalog

from tests.catalog_helpers import attach, pyiceberg_round_trip, serve

BUCKET = "lakelet-test"


@pytest.fixture(scope="module")
def s3():
    endpoint = os.environ.get("LAKELET_TEST_S3_ENDPOINT")
    if endpoint:
        creds = {
            "s3.endpoint": endpoint,
            "s3.access-key-id": os.environ["AWS_ACCESS_KEY_ID"],
            "s3.secret-access-key": os.environ["AWS_SECRET_ACCESS_KEY"],
            "s3.region": os.environ.get("AWS_REGION", "us-east-1"),
        }
        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=creds["s3.access-key-id"],
            aws_secret_access_key=creds["s3.secret-access-key"],
            region_name=creds["s3.region"],
        )
        if BUCKET not in {b["Name"] for b in client.list_buckets().get("Buckets", [])}:
            client.create_bucket(Bucket=BUCKET)
        yield SimpleNamespace(endpoint=endpoint, props=creds, real=True)
        return
    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    from moto.server import ThreadedMotoServer

    server = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)
    server.start()
    time.sleep(0.3)
    port = server._server.socket.getsockname()[1]
    endpoint = f"http://127.0.0.1:{port}"
    creds = {
        "s3.endpoint": endpoint,
        "s3.access-key-id": "test",
        "s3.secret-access-key": "test",
        "s3.region": "us-east-1",
    }
    boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id="test",
        aws_secret_access_key="test",
        region_name="us-east-1",
    ).create_bucket(Bucket=BUCKET)
    yield SimpleNamespace(endpoint=endpoint, props=creds, real=False)
    server.stop()


@pytest.fixture
def served(tmp_path, s3):
    prefix = f"s3://{BUCKET}/{tmp_path.name}"
    s = serve(f"sqlite:///{tmp_path}/catalog.db", prefix, io_properties=s3.props)
    s.s3 = s3
    yield s
    s.stop()


def test_pyiceberg_round_trip_on_s3(served) -> None:
    pyiceberg_round_trip(served.url, served.warehouse, client_properties=served.s3.props)


def test_duckdb_writes_to_an_s3_warehouse(served) -> None:
    RestCatalog("lakelet", uri=served.url, **served.s3.props).create_namespace("main")
    host = served.s3.endpoint.removeprefix("http://").removeprefix("https://")
    ssl = "true" if served.s3.endpoint.startswith("https") else "false"
    secret = (
        f"CREATE SECRET (TYPE s3, KEY_ID '{served.s3.props['s3.access-key-id']}', "
        f"SECRET '{served.s3.props['s3.secret-access-key']}', REGION 'us-east-1', "
        f"ENDPOINT '{host}', URL_STYLE 'path', USE_SSL {ssl})"
    )
    con = attach(served.url, secret_sql=secret)
    con.execute("CREATE TABLE lakelet.main.orders (id BIGINT, amt DOUBLE)")
    con.execute("INSERT INTO lakelet.main.orders VALUES (1, 1.0), (2, 2.0)")
    assert con.execute("SELECT sum(amt) FROM lakelet.main.orders").fetchone()[0] == 3.0
    table = RestCatalog("lakelet", uri=served.url, **served.s3.props).load_table("main.orders")
    assert table.scan().to_arrow().num_rows == 2
    assert table.metadata_location.startswith("s3://")
