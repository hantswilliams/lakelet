# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Decisions P1: `lakelet bucket check` tries a prefix the way a project would — the
credentials, a list, one object written and removed — and says so in one sentence; the
route says the same for the app. Against the suite's store (Moto by default)."""

from __future__ import annotations

import json

import httpx
import pytest
from typer.testing import CliRunner

from lakelet import Project
from lakelet.cli import app
from lakelet.remote import check_prefix
from tests.s3_helpers import open_store


@pytest.fixture(scope="module")
def s3():
    store = open_store()
    yield store
    store.stop()


@pytest.fixture
def env(s3, monkeypatch):
    for k, v in s3.environment().items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    return s3


def test_a_writable_prefix_passes_and_leaves_nothing_behind(env) -> None:
    prefix = env.uri(env.key("check-ok"))
    before = env.keys(env.key("check-ok"))
    r = check_prefix(prefix)
    assert r.ok and r.read and r.write and r.error is None
    assert r.credentials["source"] == "environment"
    assert r.sentence() == (
        f"{prefix} is writable with keys from the environment; one object was written and removed."
    )
    # the probe object is gone; pyarrow leaves the prefix's zero-byte folder marker, as the
    # S3 console does when a folder is made there
    assert env.keys(env.key("check-ok")) - {env.key("check-ok") + "/"} == before
    d = r.to_dict()
    assert d["ok"] is True and d["sentence"] == r.sentence()


def test_a_bucket_that_is_not_there_and_a_bad_prefix_say_why(env) -> None:
    r = check_prefix("s3://lakelet-no-such-bucket-zz/acme")
    assert not r.ok and r.write is False
    assert "bucket does not exist" in r.error
    assert "Request ID" not in r.sentence()
    for bad in ("s3://bucket", "s3://", "/data/warehouse", ""):
        r = check_prefix(bad)
        assert not r.ok and r.read is False and "s3://bucket/prefix" in r.error


def test_no_credentials_is_said_in_the_sentence(env, monkeypatch) -> None:
    monkeypatch.delenv("AWS_ACCESS_KEY_ID")
    monkeypatch.delenv("AWS_SECRET_ACCESS_KEY")
    r = check_prefix(env.uri(env.key("check-nokeys")))
    assert r.credentials["source"] == "none" and r.credentials["configured"] is False
    assert "no credentials in the environment" in r.sentence()


def test_the_cli_and_the_route(env, tmp_path) -> None:
    prefix = env.uri(env.key("check-cli"))
    r = CliRunner().invoke(app, ["bucket", "check", prefix])
    assert r.exit_code == 0, r.output
    assert "is writable with keys from the environment" in " ".join(r.output.split())
    r = CliRunner().invoke(app, ["bucket", "check", prefix, "--json"])
    assert r.exit_code == 0, r.output
    data = json.loads(r.output)
    assert data["ok"] is True and data["prefix"] == prefix and data["credentials"]["configured"]
    r = CliRunner().invoke(app, ["bucket", "check", "s3://lakelet-no-such-bucket-zz/x", "--json"])
    assert r.exit_code == 1
    assert json.loads(r.output)["ok"] is False

    root = tmp_path / "proj"
    Project.init(root, probe_mb=0)
    p = Project.open(root, serve=True)
    try:
        client = httpx.Client(
            base_url=p.catalog_url, headers={"Authorization": f"Bearer {p.token}"}, timeout=60
        )
        body = client.post("/api/bucket/check", json={"prefix": prefix}).json()
        assert body["ok"] is True and body["sentence"].startswith(prefix)
        body = client.post("/api/bucket/check", json={"prefix": "s3://bucket"}).json()
        assert body["ok"] is False and "s3://bucket/prefix" in body["error"]
        client.close()
    finally:
        p.close()
