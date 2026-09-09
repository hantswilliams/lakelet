# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Step 8 gate (brief §4, D25, D26, D27, D36, M3): a Parquet prefix attaches in place without
copying, DuckDB and pyiceberg both read it, refresh adds a new file and refuses a missing
one, metadata local or in the bucket, register by metadata location, discover, the
bandwidth probe, the Red bandwidth sentence, and the second estimate under 150 ms with the
manifests cached. Runs against Moto in the default suite; LAKELET_TEST_S3_ENDPOINT points it
at a real store. The schema-drift and hive fixtures are here; ten thousand files is gated."""

import logging
import os
import time
from types import SimpleNamespace

import boto3
import duckdb
import pytest
from pyiceberg.catalog.rest import RestCatalog

from lakelet import Project
from lakelet.gauge import inputs
from lakelet.register import MissingFiles, NotRegistrable, SchemaDrift
from lakelet.tables import TableExists

BUCKET = "lakelet-test"


@pytest.fixture(scope="module")
def s3():
    endpoint = os.environ.get("LAKELET_TEST_S3_ENDPOINT")
    if endpoint:
        creds = SimpleNamespace(
            endpoint=endpoint,
            key=os.environ["AWS_ACCESS_KEY_ID"],
            secret=os.environ["AWS_SECRET_ACCESS_KEY"],
            real=True,
        )
    else:
        logging.getLogger("werkzeug").setLevel(logging.ERROR)
        from moto.server import ThreadedMotoServer

        server = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)
        server.start()
        time.sleep(0.3)
        port = server._server.socket.getsockname()[1]
        creds = SimpleNamespace(
            endpoint=f"http://127.0.0.1:{port}", key="test", secret="test", real=False
        )
    client = boto3.client(
        "s3",
        endpoint_url=creds.endpoint,
        aws_access_key_id=creds.key,
        aws_secret_access_key=creds.secret,
        region_name="us-east-1",
    )
    if BUCKET not in {b["Name"] for b in client.list_buckets().get("Buckets", [])}:
        client.create_bucket(Bucket=BUCKET)
    creds.client = client
    yield creds
    if not creds.real:
        server.stop()


@pytest.fixture
def env(s3, monkeypatch):
    monkeypatch.setenv("AWS_ENDPOINT_URL", s3.endpoint)
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", s3.key)
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", s3.secret)
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    return s3


def writer(s3) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs")
    host = s3.endpoint.removeprefix("http://").removeprefix("https://")
    ssl = "true" if s3.endpoint.startswith("https") else "false"
    con.execute(
        f"CREATE SECRET (TYPE s3, KEY_ID '{s3.key}', SECRET '{s3.secret}', REGION 'us-east-1', "
        f"ENDPOINT '{host}', URL_STYLE 'path', USE_SSL {ssl})"
    )
    return con


def write_part(con, key: str, start: int, rows: int, extra: str = "") -> None:
    con.execute(
        f"COPY (SELECT range AS id, 'c' || (range % 10) AS customer, range * 1.5 AS amt{extra} "
        f"FROM range({start}, {start + rows})) TO 's3://{BUCKET}/{key}' (FORMAT parquet)"
    )


@pytest.fixture
def project(env, tmp_path):
    root = tmp_path / "proj"
    Project.init(root, probe_mb=8)
    p = Project.open(root)
    yield p
    p.close()


@pytest.fixture
def events(env, tmp_path):
    """Three plain Parquet files under a unique prefix, written by a non-Iceberg writer."""
    prefix = f"raw-{tmp_path.name}/events"
    con = writer(env)
    for i in range(3):
        write_part(con, f"{prefix}/part-{i}.parquet", i * 1000, 1000)
    return SimpleNamespace(prefix=f"s3://{BUCKET}/{prefix}/", key=prefix, con=con)


def object_keys(s3, prefix: str) -> set[str]:
    pages = s3.client.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix)
    return {o["Key"] for page in pages for o in page.get("Contents", [])}


def test_attach_registers_in_place_and_both_engines_read_it(project, events, env) -> None:
    before = object_keys(env, events.key)
    info = project.tables.attach("events", events.prefix)
    assert info.rows == 3000 and info.location.startswith(project.warehouse_url + "/main/events")
    assert object_keys(env, events.key) == before, "registration must not copy or write data"
    assert list((project.root / "warehouse/main/events/metadata").glob("*.metadata.json"))

    assert project.engine.execute("select count(*) from events").fetchone()[0] == 3000
    assert project.engine.execute("select max(id) from events where id < 1000").fetchone()[0] == 999
    table = RestCatalog("lakelet", uri=project.catalog_url, **project.io_properties).load_table(
        "main.events"
    )
    assert table.scan().to_arrow().num_rows == 3000
    assert all(t.file.file_path.startswith(f"s3://{BUCKET}/") for t in table.scan().plan_files())

    desc = project.tables.describe("events")
    assert desc.rows == 3000 and desc.snapshots == 1
    assert "s3://" in (project.root / "AGENTS.md").read_text()
    with pytest.raises(TableExists):
        project.tables.attach("events", events.prefix)


def test_metadata_in_the_bucket_and_register_by_metadata_location(project, events, env) -> None:
    info = project.tables.attach("events_b", events.prefix, metadata_in_bucket=True)
    assert info.location == f"s3://{BUCKET}/_lakelet/events_b"
    assert any(k.endswith(".metadata.json") for k in object_keys(env, "_lakelet/events_b/"))
    assert project.engine.execute("select count(*) from events_b").fetchone()[0] == 3000

    location = project.store.get_table("main", "events_b")
    again = project.tables.attach("events_c", location)
    assert (
        again.rows == 3000
        and project.engine.execute("select count(*) from events_c").fetchone()[0] == 3000
    )


def test_refresh_adds_new_files_and_refuses_missing_ones(project, events, env) -> None:
    project.tables.attach("events", events.prefix)
    assert project.tables.refresh("events").added == 0
    write_part(events.con, f"{events.key}/part-3.parquet", 3000, 500)
    report = project.tables.refresh("events")
    assert (report.added, report.files, report.rows) == (1, 4, 3500)
    assert project.engine.execute("select count(*) from events").fetchone()[0] == 3500
    assert project.tables.describe("events").snapshots == 2

    env.client.delete_object(Bucket=BUCKET, Key=f"{events.key}/part-1.parquet")
    with pytest.raises(MissingFiles, match="part-1.parquet"):
        project.tables.refresh("events")


def test_schema_drift_is_refused_with_the_file_and_column_named(project, env, tmp_path) -> None:
    key = f"drift-{tmp_path.name}/t"
    con = writer(env)
    write_part(con, f"{key}/part-0.parquet", 0, 10)
    write_part(con, f"{key}/part-1.parquet", 10, 10)
    write_part(con, f"{key}/part-2.parquet", 20, 10, extra=", 'x' AS region")
    with pytest.raises(SchemaDrift, match=r"part-2\.parquet.*adds \['region'\]"):
        project.tables.attach("drift", f"s3://{BUCKET}/{key}/")
    assert project.tables.list() == []


def test_hive_partition_only_in_the_path_is_refused_by_name(project, env, tmp_path) -> None:
    key = f"hive-{tmp_path.name}/t"
    con = writer(env)
    write_part(con, f"{key}/country=US/part-0.parquet", 0, 10)
    write_part(con, f"{key}/country=DE/part-0.parquet", 10, 10)
    with pytest.raises(NotRegistrable, match="country"):
        project.tables.attach("hive", f"s3://{BUCKET}/{key}/")


def test_discover_lists_candidate_prefixes(project, events, env) -> None:
    bucket_prefix = events.prefix.rsplit("/", 2)[0] + "/"
    found = {d.prefix: d for d in project.tables.discover(bucket_prefix)}
    assert events.prefix in found
    assert found[events.prefix].kind == "parquet" and found[events.prefix].files == 3
    assert found[events.prefix].bytes > 0


def test_bandwidth_probe_red_sentence_and_the_cached_second_estimate(project, events) -> None:
    project.tables.attach("events", events.prefix, metadata_in_bucket=True)
    cache = inputs.load_machine_cache(project.cache_dir)
    assert cache.get("bandwidth_mbps", 0) > 0, "the probe should have run on first attach"

    est = project.estimate("select sum(amt) from events")
    assert est.remote and events.prefix.rstrip("/") in est.reason and "from s3://" in est.reason

    # A slow link and the thresholds of a tiny fixture: 60 KB at 0.5 Mbps must read as Red.
    cache["bandwidth_mbps"] = 0.5
    inputs.save_machine_cache(project.cache_dir, cache)
    toml = project.root / "lakelet.toml"
    toml.write_text(
        toml.read_text()
        .replace("green_max_seconds = 60", "green_max_seconds = 0.01")
        .replace("yellow_max_seconds = 600", "yellow_max_seconds = 0.1")
    )
    root = project.root
    project.close()
    p = Project.open(root)
    try:
        red = p.estimate("select sum(amt) from events")
        assert red.verdict == "red" and red.words == "Needs more machine", red.reason
        assert (
            "at your 0.5 Mbps" in red.reason and "burst ~" in red.reason and "cap $" in red.reason
        )
        assert red.line.startswith("● Needs more machine · scans ")

        started = time.perf_counter()
        p.estimate("select sum(amt) from events where id > 2500")
        second = time.perf_counter() - started
        print(f"\nsecond estimate on a bucket-metadata table: {second * 1000:.0f} ms")
        assert list((p.cache_dir / "objects").rglob("*.avro")), "manifests should be cached on disk"
        load, cores = os.getloadavg()[0], os.cpu_count() or 1
        if load > cores:
            pytest.skip(
                f"machine under load ({load:.0f} on {cores} cores); the budget cannot be measured"
            )
        assert second < 0.150
    finally:
        p.close()


def test_cli_attach_refresh_discover(project, events, env) -> None:
    from typer.testing import CliRunner

    from lakelet.cli import app

    project.close()
    runner = CliRunner()
    root = str(project.root)
    attached = runner.invoke(app, ["-C", root, "tables", "attach", "events", events.prefix])
    assert attached.exit_code == 0, attached.output
    assert "3,000 rows" in attached.output and "in place" in attached.output
    write_part(events.con, f"{events.key}/part-9.parquet", 9000, 100)
    refreshed = runner.invoke(app, ["-C", root, "tables", "refresh", "events"])
    assert refreshed.exit_code == 0 and "1 file(s) added" in refreshed.output
    discovered = runner.invoke(
        app, ["-C", root, "tables", "discover", events.prefix.rsplit("/", 2)[0] + "/"]
    )
    assert discovered.exit_code == 0 and "parquet" in discovered.output
    twice = runner.invoke(app, ["-C", root, "tables", "attach", "events", events.prefix])
    assert twice.exit_code == 1


@pytest.mark.skipif(os.environ.get("LAKELET_PERF") != "1", reason="set LAKELET_PERF=1")
def test_ten_thousand_small_files(project, env, tmp_path) -> None:
    key = f"many-{tmp_path.name}/t"
    con = writer(env)
    started = time.perf_counter()
    for i in range(10_000):
        write_part(con, f"{key}/part-{i:05}.parquet", i * 10, 10)
    written = time.perf_counter() - started
    started = time.perf_counter()
    info = project.tables.attach("many", f"s3://{BUCKET}/{key}/")
    registered = time.perf_counter() - started
    print(f"\n10,000 files: written in {written:.0f}s, registered in {registered:.0f}s")
    assert info.rows == 100_000
