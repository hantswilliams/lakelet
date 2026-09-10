# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Step 9 gate (brief §4, D3, D17, D22): the API on the same loopback server as the catalog
under `serve`; 401 without the token; /v1 open; health with versions, machine profile and
cached bandwidth; the operations over HTTP with Arrow IPC results and the verdict in the
headers; serve.json at 0600 and gone on close; the CLI's serve; non-loopback refused."""

import json
import os
import stat
import subprocess
import sys
import time
import tomllib

import duckdb
import httpx
import pyarrow as pa
import pytest
from typer.testing import CliRunner

from lakelet import Project
from lakelet.cli import app


@pytest.fixture
def served(tmp_path):
    root = tmp_path / "proj"
    Project.init(root, probe_mb=8)
    con = duckdb.connect()
    con.execute(
        f"COPY (SELECT range AS id, 'c' || (range % 10) AS customer, range * 1.5 AS amt "
        f"FROM range(1000)) TO '{tmp_path}/orders.csv' (HEADER)"
    )
    p = Project.open(root, serve=True)
    client = httpx.Client(base_url=p.catalog_url, headers={"Authorization": f"Bearer {p.token}"})
    yield p, client, tmp_path
    client.close()
    p.close()


def test_token_health_and_the_open_catalog(served) -> None:
    p, client, _ = served
    health = client.get("/api/health")
    assert health.status_code == 200, health.text
    data = health.json()
    assert data["lakelet"] and data["duckdb"] == duckdb.__version__
    assert {"ram", "cores", "memory_limit"} <= set(data["machine"])
    assert data["throughput_local_mbps"] and data["throughput_local_mbps"] > 0
    assert "bandwidth_mbps" in data

    bare = httpx.get(f"{p.catalog_url}/api/health")
    assert bare.status_code == 401 and bare.json()["detail"]["error"] == "unauthorised"
    wrong = httpx.get(f"{p.catalog_url}/api/health", headers={"Authorization": "Bearer nope"})
    assert wrong.status_code == 401
    assert httpx.get(f"{p.catalog_url}/v1/config").status_code == 200  # the catalog, no token

    info = p.serve_json.read_text()
    data = json.loads(info)
    assert data["port"] == int(p.catalog_url.rsplit(":", 1)[1]) and data["pid"] == os.getpid()
    assert data["token"] == p.token and data["started"]
    assert stat.S_IMODE(p.serve_json.stat().st_mode) == 0o600


def test_tables_over_http(served) -> None:
    p, client, tmp_path = served
    csv = str(tmp_path / "orders.csv")
    preview = client.post("/api/preview", json={"path": csv})
    assert preview.status_code == 200 and preview.json()["name"] == "orders"
    imported = client.post("/api/import", json={"path": csv})
    assert imported.status_code == 200 and imported.json()[0]["rows"] == 1000
    assert client.post("/api/import", json={"path": csv}).status_code == 409
    assert (
        client.post("/api/import", json={"path": csv, "mode": "append"}).json()[0]["rows"] == 2000
    )
    assert client.post("/api/import", json={"path": str(tmp_path / "nope.csv")}).status_code == 400

    listed = client.get("/api/tables").json()
    assert [t["name"] for t in listed] == ["orders"] and listed[0]["rows"] == 2000
    assert listed[0]["freshness"].startswith("20"), "an ISO timestamp for the panel"
    folder = client.post("/api/preview", json={"path": str(tmp_path)})
    assert folder.status_code == 200 and [p["name"] for p in folder.json()] == ["orders"]
    assert client.post("/api/preview", json={"path": str(tmp_path / "gone")}).status_code == 400
    described = client.get("/api/tables/orders").json()
    assert described["partitioning"] == "unpartitioned" and described["snapshots"] == 2
    sampled = client.get("/api/tables/orders/sample", params={"n": 2}).json()
    assert len(sampled) == 2 and set(sampled[0]) == {"id", "customer", "amt"}
    assert client.get("/api/tables/nope").status_code == 404
    assert client.post("/api/tables/nope/refresh").status_code == 404


def _rows(response: httpx.Response) -> pa.Table:
    assert response.headers["content-type"].startswith("application/vnd.apache.arrow.stream")
    return pa.ipc.open_stream(response.content).read_all()


def test_estimate_and_query_stream_arrow_with_the_verdict(served) -> None:
    p, client, tmp_path = served
    client.post("/api/import", json={"path": str(tmp_path / "orders.csv")})
    sql = "select customer, count(*) as n from orders group by 1 order by 1"
    est = client.post("/api/estimate", json={"sql": sql})
    assert est.status_code == 200
    body = est.json()
    assert (
        body["verdict"] == "green" and body["line"].startswith("● Runs here") and "plan" not in body
    )

    response = client.post("/api/query", json={"sql": sql})
    assert response.status_code == 200
    assert response.headers["x-lakelet-verdict"] == "green"
    assert response.headers["x-lakelet-words"] == "Runs here"
    table = _rows(response)
    assert table.num_rows == 10 and table.column("n")[0].as_py() == 100

    bad = client.post("/api/query", json={"sql": "select * from nope"})
    assert bad.status_code == 400 and bad.json()["error"] == "sql_error"
    assert client.post("/api/query", json={"nope": 1}).status_code == 422

    runs = client.get("/api/history", params={"last": 5}).json()
    assert runs[0]["sql_text"] == "select * from nope" and runs[0]["error"]  # failures count too
    good = next(r for r in runs if r["sql_text"] == sql)
    assert good["verdict"] == "green" and good["ran"] and good["actual_wall"]


def test_red_is_409_with_the_estimate_unless_allowed(served) -> None:
    p, client, tmp_path = served
    client.post("/api/import", json={"path": str(tmp_path / "orders.csv")})
    toml = p.root / "lakelet.toml"
    toml.write_text(
        toml.read_text()
        .replace("green_max_seconds = 60", "green_max_seconds = 0.0000001")
        .replace("yellow_max_seconds = 600", "yellow_max_seconds = 0.0000002")
    )
    p.config = type(p.config).load(toml)  # the running server re-reads its thresholds
    refused = client.post("/api/query", json={"sql": "select count(*) from orders"})
    assert refused.status_code == 409
    body = refused.json()
    assert body["error"] == "red_refused" and body["estimate"]["verdict"] == "red"
    assert "cap $" in body["estimate"]["reason"]
    allowed = client.post(
        "/api/query", json={"sql": "select count(*) from orders", "allow_red": True}
    )
    assert allowed.status_code == 200 and _rows(allowed).num_rows == 1
    assert client.get("/api/history", params={"last": 2}).json()[1]["ran_where"] == "refused"


def test_questions_over_http(served) -> None:
    p, client, tmp_path = served
    client.post("/api/import", json={"path": str(tmp_path / "orders.csv")})
    saved = client.post(
        "/api/questions",
        json={
            "title": "Revenue by customer",
            "sql": "select customer, sum(amt) as revenue from orders group by 1",
        },
    )
    assert saved.status_code == 200 and saved.json()["slug"] == "revenue_by_customer"
    assert saved.json()["last_run"] is None
    assert [q["slug"] for q in client.get("/api/questions").json()] == ["revenue_by_customer"]
    ran = client.post("/api/questions/revenue_by_customer/run")
    assert ran.status_code == 200 and _rows(ran).num_rows == 10
    assert client.get("/api/questions").json()[0]["last_run"] is not None
    assert client.post("/api/questions/nope/run").status_code == 404


def test_cors_is_for_the_tauri_origin_only(served) -> None:
    p, client, _ = served
    headers = {"Origin": "tauri://localhost", "Access-Control-Request-Method": "POST"}
    allowed = httpx.options(f"{p.catalog_url}/api/query", headers=headers)
    assert allowed.headers.get("access-control-allow-origin") == "tauri://localhost"
    other = httpx.options(
        f"{p.catalog_url}/api/query",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in other.headers


def test_serve_json_is_removed_on_close(tmp_path) -> None:
    root = tmp_path / "proj"
    Project.init(root, probe_mb=8)
    p = Project.open(root, serve=True)
    assert p.serve_json.exists()
    p.close()
    assert not p.serve_json.exists()


def test_the_cli_serve_from_another_process(tmp_path) -> None:
    root = tmp_path / "proj"
    Project.init(root, probe_mb=8)
    proc = subprocess.Popen(
        [sys.executable, "-m", "lakelet.cli", "-C", str(root), "serve"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        line = proc.stdout.readline()
        assert line.startswith("serving http://127.0.0.1:"), line
        info = json.loads((root / ".lakelet/serve.json").read_text())
        assert info["pid"] == proc.pid
        health = httpx.get(
            f"http://127.0.0.1:{info['port']}/api/health",
            headers={"Authorization": f"Bearer {info['token']}"},
        )
        assert health.status_code == 200 and health.json()["project"] == "proj"
    finally:
        proc.terminate()
        proc.wait(timeout=10)
    for _ in range(20):
        if not (root / ".lakelet/serve.json").exists():
            break
        time.sleep(0.1)
    assert not (root / ".lakelet/serve.json").exists()
    refused = CliRunner().invoke(app, ["-C", str(root), "serve", "--host", "0.0.0.0"])
    assert refused.exit_code == 1 and "loopback" in refused.output


def test_serve_memory_limit_and_the_dev_origin(tmp_path, monkeypatch) -> None:
    """App brief A8 and A12 (September 10): ``serve --memory-limit`` overrides ``[engine]``
    for this process only, and ``LAKELET_DEV_ORIGIN`` joins the CORS list when set, so the
    frontend can be driven from a browser against a real sidecar; the shell never sets it."""
    root = tmp_path / "proj"
    Project.init(root, probe_mb=8)
    monkeypatch.setenv("LAKELET_DEV_ORIGIN", "http://localhost:5173")
    with Project.open(root, serve=True, memory_limit="1GB") as p:
        token = json.loads(p.serve_json.read_text())["token"]
        health = httpx.get(
            f"{p.catalog_url}/api/health", headers={"Authorization": f"Bearer {token}"}
        )
        limit = health.json()["machine"]["memory_limit"]  # DuckDB reports 1GB as 953.6 MiB
        assert 900_000_000 <= limit <= 1_100_000_000, health.json()["machine"]
        headers = {"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"}
        allowed = httpx.options(f"{p.catalog_url}/api/query", headers=headers)
        assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    monkeypatch.delenv("LAKELET_DEV_ORIGIN")
    with Project.open(root, serve=True) as p:
        refused = httpx.options(
            f"{p.catalog_url}/api/query",
            headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
        )
        assert "access-control-allow-origin" not in refused.headers
        assert (
            tomllib.loads((root / "lakelet.toml").read_text())["engine"]["memory_limit"] == "auto"
        )
