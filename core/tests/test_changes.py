# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Decisions L2: `lakelet changes` — an import, a run, a save and a restore appear in
order with the right shapes, merged from the catalog's snapshots, history's runs and git's
commits; `--since` and a name filter; the route. Against a real dbt project."""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx
import pytest
from typer.testing import CliRunner

from lakelet import Project
from lakelet.changes import changes, parse_since
from lakelet.cli import app
from lakelet.dbt import runner

pytest.importorskip("dbt.cli.main")


@pytest.fixture
def project(tmp_path):
    root = tmp_path / "proj"
    Project.init(root, probe_mb=0)
    (root / "models" / "by_c.sql").write_text(
        "{{ config(materialized='table') }}\nselect c, sum(amt) as total from src group by 1\n"
    )
    p = Project.open(root, serve=True)
    p.engine.execute(
        "create table lakelet.main.src as "
        "select range as id, 'c' || (range % 3) as c, range * 1.5 as amt from range(300)"
    )
    yield p
    p.close()


def _kinds(feed) -> list[tuple[str, str | None]]:
    return [(c.kind, c.name) for c in feed]


def test_an_import_a_run_a_save_and_a_restore_in_order(project) -> None:
    p = project
    # before anything but the create: one snapshot, and init's own version (its dbt files
    # under models/), about the project rather than a model
    feed = changes(p)
    assert _kinds(feed) == [("snapshot", "src"), ("version", None)]
    assert feed[1].target == "project" and feed[1].message == "lakelet init"
    assert feed[1].names == [] and feed[1].sentence().startswith("lakelet init · by ")
    src = feed[0]
    assert src.target == "table" and src.operation == "append" and src.added_rows == 300
    assert src.affects == [] and src.sentence() == "src: 300 rows added"

    # a run: the model's run and, with auto_commit, the run-time version of its file. A
    # commit's time is whole seconds, so each step waits a second to keep the order plain.
    report = runner.run(p)
    assert report.ok
    time.sleep(1.1)
    # a save, twice (the second is an update), then a restore of the first
    first = p.questions.save("Total", "select sum(amt) as total from src")
    time.sleep(1.1)
    p.questions.save("Total", "select sum(amt) as total from src where amt > 1")
    time.sleep(1.1)
    p.versions.restore("total", first.commit)
    time.sleep(1.1)
    # an append to src: the newest snapshot names the model it made out of date (L3)
    p.engine.execute("insert into lakelet.main.src values (999, 'c9', 9.0)")

    feed = changes(p)
    kinds = _kinds(feed)
    assert kinds[0] == ("snapshot", "src")
    assert feed[0].affects == ["by_c"] and "made out of date: by_c" in feed[0].sentence()
    assert kinds[1] == ("version", "total") and feed[1].message.startswith("restore question:")
    assert feed[1].target == "question" and feed[1].names == ["total"] and len(feed[1].id) == 7
    assert kinds[2] == ("version", "total") and feed[2].message == "update question: Total"
    assert kinds[3] == ("version", "total") and feed[3].message == "save question: Total"
    # the run's entries: by_c's snapshot (dbt built a table), its run, the run-time version
    run_entries = [c for c in feed if c.kind == "run"]
    assert [(c.name, c.target, c.ok) for c in run_entries] == [("by_c", "model", True)]
    assert run_entries[0].seconds is not None and run_entries[0].verdict in ("green", "yellow")
    assert run_entries[0].sentence().startswith("by_c built in ")
    assert ("snapshot", "by_c") in kinds
    run_version = [c for c in feed if c.kind == "version" and c.message.startswith("run:")]
    assert len(run_version) == 1 and run_version[0].names == ["by_c"]
    assert run_version[0].target == "model" and run_version[0].name == "by_c"
    assert kinds[-2:] == [("snapshot", "src"), ("version", None)]  # the create, then init
    assert all(feed[i].when >= feed[i + 1].when for i in range(len(feed) - 1))
    for c in feed:
        assert c.sentence()

    # the name filter: only what happened to total (its versions), then to src
    total = changes(p, name="total")
    assert {c.kind for c in total} == {"version"} and len(total) == 3
    assert [c.kind for c in changes(p, name="src")] == ["snapshot", "snapshot"]
    assert [c.name for c in changes(p, name="by_c")] == ["by_c"] * 3  # snapshot, run, version
    assert changes(p, name="nowhere") == []
    # since: a cutoff after the restore leaves the insert alone; last caps
    cutoff = feed[1].when
    assert _kinds(changes(p, since=cutoff)) == kinds[:2]
    assert len(changes(p, last=2)) == 2 and _kinds(changes(p, last=2)) == kinds[:2]


def test_since_parsing() -> None:
    from datetime import UTC, datetime, timedelta

    now = datetime.now(UTC)
    assert abs((now - parse_since("2d")) - timedelta(days=2)) < timedelta(seconds=5)
    assert abs((now - parse_since("12h")) - timedelta(hours=12)) < timedelta(seconds=5)
    assert parse_since("2026-09-01") == datetime(2026, 9, 1, tzinfo=UTC)
    assert parse_since("2026-09-01T10:00:00+02:00").isoformat() == "2026-09-01T10:00:00+02:00"
    with pytest.raises(ValueError, match="--since takes"):
        parse_since("yesterday")


def test_the_cli_and_the_route(project) -> None:
    p = project
    runner.run(p)
    p.questions.save("Total", "select sum(amt) as total from src")
    r = CliRunner().invoke(app, ["-C", str(p.root), "changes"])
    assert r.exit_code == 0, r.output
    text = "".join(r.output.split())
    assert "versionsavequestion:Total" in text and "runby_cbuiltin" in text
    assert "snapshotsrc:300rowsadded" in text
    r = CliRunner().invoke(app, ["-C", str(p.root), "changes", "total", "--json"])
    assert r.exit_code == 0, r.output
    data = json.loads(r.output)
    assert [d["kind"] for d in data] == ["version"] and data[0]["when"].endswith("+00:00")
    r = CliRunner().invoke(app, ["-C", str(p.root), "changes", "nowhere"])
    assert r.exit_code == 0 and "nothing about nowhere" in r.output
    r = CliRunner().invoke(app, ["-C", str(p.root), "changes", "--since", "yesterday"])
    assert r.exit_code == 1 and "--since takes" in r.output

    client = httpx.Client(
        base_url=p.catalog_url, headers={"Authorization": f"Bearer {p.token}"}, timeout=60
    )
    body = client.get("/api/changes").json()
    assert body == json.loads(
        CliRunner().invoke(app, ["-C", str(p.root), "changes", "--json"]).output
    )
    assert {c["kind"] for c in body} == {"snapshot", "run", "version"}
    two = client.get("/api/changes", params={"last": 2, "since": "1d"}).json()
    assert len(two) == 2
    assert client.get("/api/changes", params={"name": "by_c"}).json()[0]["name"] == "by_c"
    assert client.get("/api/changes", params={"since": "soon"}).status_code == 400
    client.close()


def test_a_project_without_git_or_models_still_answers(tmp_path) -> None:
    """A folder that is no repository and has never compiled: the snapshots alone."""
    root = tmp_path / "bare"
    Project.init(root, probe_mb=0)
    import shutil

    shutil.rmtree(root / ".git", ignore_errors=True)
    p = Project.open(root, serve=False)
    try:
        p.engine.execute("create table lakelet.main.t as select 1 as x")
        feed = changes(p)
        assert _kinds(feed) == [("snapshot", "t")] and feed[0].affects == []
        assert Path(root / ".git").exists() is False
    finally:
        p.close()
