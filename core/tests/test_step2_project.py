# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Step 2 gate: ``init`` lays the project out (brief §3.2, D14, D30, D33), ``open`` runs
the catalog and the engine in-process (D3), bare table names work (D9), the config carries
unknown keys through (§3.3), and the profiler is on for every statement (D21)."""

import tomllib

import pytest
import yaml

from lakelet import Project
from lakelet.config import Config
from lakelet.project import TABLES_END, TABLES_START, ProjectExists, identifier


@pytest.fixture
def root(tmp_path):
    return tmp_path / "acme analytics"


def test_init_lays_out_the_project(root) -> None:
    report = Project.init(root)
    assert report.root == root.resolve()
    for relative in ("lakelet.toml", "AGENTS.md", "dbt_project.yml", ".gitignore", "models"):
        assert (root / relative).exists(), relative
    assert (root / "warehouse").is_dir() and (root / ".lakelet/cache").is_dir()
    assert (root / ".lakelet/catalog.db").exists()

    config = tomllib.loads((root / "lakelet.toml").read_text())
    assert config["project"]["name"] == "acme analytics"
    assert set(config) == {"project", "catalog", "engine", "gauge", "burst", "agents"}
    assert (root / ".gitignore").read_text().splitlines() == [
        "warehouse/",
        ".lakelet/",
        ".DS_Store",
    ]
    assert yaml.safe_load((root / "dbt_project.yml").read_text()) == {
        "name": "acme_analytics",
        "version": "1.0.0",
        "profile": "lakelet",
        "model-paths": ["models"],
        "models": {"+database": "lakelet"},
    }
    agents = (root / "AGENTS.md").read_text()
    assert TABLES_START in agents and TABLES_END in agents
    assert report.extension_directory
    assert set(report.extensions_installed) <= {"iceberg", "httpfs", "excel"}


def test_init_respects_an_existing_dbt_project_and_gitignore(root) -> None:
    root.mkdir(parents=True)
    (root / "dbt_project.yml").write_text("name: theirs\nversion: '2'\nprofile: theirs\n")
    (root / ".gitignore").write_text("target/\n.DS_Store\n")
    Project.init(root)
    assert yaml.safe_load((root / "dbt_project.yml").read_text())["name"] == "theirs"
    assert (root / ".gitignore").read_text().splitlines() == [
        "target/",
        ".DS_Store",
        "warehouse/",
        ".lakelet/",
    ]


def test_init_twice_refuses(root) -> None:
    Project.init(root)
    with pytest.raises(ProjectExists):
        Project.init(root)


def test_identifier_rule() -> None:
    assert identifier("Orders 2026-01.csv") == "orders_2026_01_csv"
    assert identifier("2026 events") == "t_2026_events"
    assert identifier("--") == "project"


def test_config_carries_unknown_keys_and_sections_through(tmp_path) -> None:
    path = tmp_path / "lakelet.toml"
    path.write_text(
        '[project]\nname = "x"\nfuture_key = 1\n[engine]\nthreads = 2\n'
        '[burst]\ndefault = "auto"\n[newer]\nthing = true\n'
    )
    config = Config.load(path)
    assert config.project.name == "x"
    assert config.project.model_extra == {"future_key": 1}
    assert config.engine.threads == 2 and config.engine.memory_limit == "auto"
    assert config.extra == {"burst": {"default": "auto"}, "newer": {"thing": True}}


def test_gate_bare_names_and_the_profiler(root) -> None:
    Project.init(root)
    with Project.open(root) as p:
        assert p.catalog_url.startswith("http://127.0.0.1:")
        p.engine.execute("CREATE TABLE lakelet.main.orders (id BIGINT, amt DOUBLE)")
        p.engine.execute("INSERT INTO orders VALUES (1, 1.0), (2, 2.0)")
        assert p.engine.execute("select * from orders order by id").fetchall() == [
            (1, 1.0),
            (2, 2.0),
        ]
        assert p.engine.execute("select count(*) from lakelet.main.orders").fetchone()[0] == 2
        profile = p.engine.last_profile()
    assert profile is not None
    assert "system_peak_buffer_memory" in profile

    def nodes(node):
        yield node
        for child in node.get("children", []):
            yield from nodes(child)

    scans = [
        n
        for n in nodes(profile)
        if "operator_rows_scanned" in n and "SCAN" in n.get("operator_type", "")
    ]
    assert scans, "the profile has no scan operator with rows scanned"


def test_engine_limits_come_from_the_config(root) -> None:
    Project.init(root)
    toml = root / "lakelet.toml"
    toml.write_text(toml.read_text().replace('threads = "auto"', "threads = 2"))
    with Project.open(root) as p:
        assert p.engine.execute("select current_setting('threads')").fetchone()[0] == 2


def test_reopen_sees_the_same_table(root) -> None:
    Project.init(root)
    with Project.open(root) as p:
        p.engine.execute("CREATE TABLE lakelet.main.t (id BIGINT)")
        p.engine.execute("INSERT INTO t VALUES (7)")
    with Project.open(root) as p:
        assert p.engine.execute("select * from t").fetchall() == [(7,)]


def test_open_works_with_no_aws_credentials_anywhere(root, monkeypatch, tmp_path) -> None:
    """A laptop with no AWS account is the normal case (brief D36): opening a project and
    local work must not depend on the default chain resolving, and the first s3://
    operation says what to set. Found by the first CI run, where the chain resolved
    nothing and every test that opened a project failed."""
    from lakelet.register import NotRegistrable

    for key in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("AWS_CONFIG_FILE", str(tmp_path / "no-config"))
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", str(tmp_path / "no-credentials"))
    monkeypatch.setenv("AWS_EC2_METADATA_DISABLED", "true")
    Project.init(root)
    with Project.open(root) as p:
        p.engine.execute("CREATE TABLE lakelet.main.t (id BIGINT)")
        p.engine.execute("INSERT INTO t VALUES (7)")
        assert p.engine.execute("select * from t").fetchall() == [(7,)]
        if p.engine.s3_error is None:
            pytest.skip(
                "the AWS default chain resolves on this machine; the refusal cannot be shown"
            )
        with pytest.raises(NotRegistrable, match="AWS_ACCESS_KEY_ID"):
            p.tables.discover("s3://nowhere/")


def test_open_and_close_release_their_file_descriptors(root) -> None:
    """Opening and closing a project must hand back every file and socket it took. Found
    by the suite on a Mac at the shell's 256-descriptor default: the SQLite pools of the
    catalog and the history were never disposed, and the run collapsed at the 113th test
    with "Too many open files"."""
    import psutil

    Project.init(root)
    process = psutil.Process()
    with Project.open(root) as p:  # warm-up: extension loads and first-use allocations
        p.engine.execute("select 1").fetchall()
    before = process.num_fds()
    for _ in range(20):
        with Project.open(root) as p:
            p.engine.execute("CREATE TABLE IF NOT EXISTS lakelet.main.t (id BIGINT)")
            p.query("select * from t").close()
            p.history.recent(1)
    after = process.num_fds()
    assert after - before <= 6, f"{after - before} descriptors leaked over 20 open/close cycles"
