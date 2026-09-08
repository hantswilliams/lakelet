# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""``.lakelet/history.db`` (brief D7, §3.4): every run, with everything the calibration
model will ever need, including the SQL text, which never leaves the machine."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import sqlalchemy as sa
from sqlalchemy import event

SCHEMA_VERSION = 1

metadata = sa.MetaData()

runs = sa.Table(
    "runs",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
    sa.Column("lakelet_version", sa.String(32), nullable=False),
    sa.Column("duckdb_version", sa.String(32), nullable=False),
    sa.Column("fingerprint", sa.String(64), nullable=False),
    sa.Column("sql_hash", sa.String(64), nullable=False),
    sa.Column("sql_text", sa.Text, nullable=False),
    sa.Column("tables", sa.Text, nullable=False),  # JSON
    sa.Column("operator_counts", sa.Text, nullable=False),  # JSON
    sa.Column("pruning", sa.String(16)),
    sa.Column("machine_hash", sa.String(64), nullable=False),
    sa.Column("machine", sa.Text, nullable=False),  # JSON
    sa.Column("throughput_local_mbps", sa.Float),
    sa.Column("bandwidth_mbps", sa.Float),
    sa.Column("est_bytes", sa.BigInteger),
    sa.Column("est_peak_mem", sa.BigInteger),
    sa.Column("est_wall_local", sa.Float),
    sa.Column("est_wall_burst", sa.Float),
    sa.Column("est_cost_burst", sa.Float),
    sa.Column("verdict", sa.String(16)),
    sa.Column("reason", sa.Text),
    sa.Column("ran", sa.Boolean, nullable=False),
    sa.Column("ran_where", sa.String(16), nullable=False),
    sa.Column("actual_rows_scanned", sa.BigInteger),
    sa.Column("actual_bytes", sa.BigInteger),
    sa.Column("actual_peak_mem", sa.BigInteger),
    sa.Column("actual_peak_rss", sa.BigInteger),
    sa.Column("actual_spill", sa.BigInteger),
    sa.Column("actual_wall", sa.Float),
    sa.Column("actual_cost", sa.Float),
    sa.Column("retries", sa.Integer, nullable=False, default=0),
    sa.Column("error", sa.Text),
)

question_runs = sa.Table(
    "question_runs",
    metadata,
    sa.Column("slug", sa.String(255), primary_key=True),
    sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
    sa.Column("run_id", sa.Integer, sa.ForeignKey("runs.id"), nullable=False),
)

corrections = sa.Table(
    "corrections",
    metadata,
    sa.Column("machine_hash", sa.String(64), primary_key=True),
    sa.Column("operator_class", sa.String(64), primary_key=True),
    sa.Column("factor", sa.Float, nullable=False),
    sa.Column("n", sa.Integer, nullable=False),
    sa.Column("updated", sa.DateTime(timezone=True), nullable=False),
)

meta = sa.Table(
    "meta",
    metadata,
    sa.Column("key", sa.String(64), primary_key=True),
    sa.Column("value", sa.Text, nullable=False),
)

JSON_COLUMNS = ("tables", "operator_counts", "machine")


@dataclass
class Run:
    fingerprint: str
    sql_hash: str
    sql_text: str
    lakelet_version: str
    duckdb_version: str
    machine_hash: str
    machine: dict[str, Any]
    tables: list[dict[str, Any]] = field(default_factory=list)
    operator_counts: dict[str, int] = field(default_factory=dict)
    pruning: str | None = None
    throughput_local_mbps: float | None = None
    bandwidth_mbps: float | None = None
    est_bytes: int | None = None
    est_peak_mem: int | None = None
    est_wall_local: float | None = None
    est_wall_burst: float | None = None
    est_cost_burst: float | None = None
    verdict: str | None = None
    reason: str | None = None
    ran: bool = False
    ran_where: str = "local"
    actual_rows_scanned: int | None = None
    actual_bytes: int | None = None
    actual_peak_mem: int | None = None
    actual_peak_rss: int | None = None
    actual_spill: int | None = None
    actual_wall: float | None = None
    actual_cost: float | None = None
    retries: int = 0
    error: str | None = None
    id: int | None = None
    ts: datetime | None = None


class History:
    def __init__(self, path: Path) -> None:
        self.engine = sa.create_engine(
            f"sqlite:///{path}", connect_args={"check_same_thread": False, "timeout": 5}
        )

        @event.listens_for(self.engine, "connect")
        def _pragmas(dbapi_conn, _record) -> None:
            dbapi_conn.execute("PRAGMA journal_mode=WAL")
            dbapi_conn.execute("PRAGMA busy_timeout=5000")

        metadata.create_all(self.engine)
        with self.engine.begin() as c:
            if (
                c.execute(sa.select(meta.c.value).where(meta.c.key == "schema_version")).scalar()
                is None
            ):
                c.execute(meta.insert().values(key="schema_version", value=str(SCHEMA_VERSION)))

    def record(self, run: Run) -> int:
        values = {k: v for k, v in asdict(run).items() if k not in ("id", "ts")}
        for column in JSON_COLUMNS:
            values[column] = json.dumps(values[column])
        values["ts"] = datetime.now(UTC)
        with self.engine.begin() as c:
            run_id = c.execute(runs.insert().values(**values)).inserted_primary_key[0]
        run.id, run.ts = run_id, values["ts"]
        return run_id

    def recent(self, n: int = 50) -> list[Run]:
        with self.engine.connect() as c:
            rows = c.execute(runs.select().order_by(runs.c.id.desc()).limit(n)).mappings().all()
        out = []
        for row in rows:
            data = dict(row)
            for column in JSON_COLUMNS:
                data[column] = json.loads(data[column])
            out.append(Run(**data))
        return out

    def record_question_run(self, slug: str, run_id: int) -> None:
        now = datetime.now(UTC)
        with self.engine.begin() as c:
            c.execute(question_runs.delete().where(question_runs.c.slug == slug))
            c.execute(question_runs.insert().values(slug=slug, ts=now, run_id=run_id))

    def question_last_run(self, slug: str) -> datetime | None:
        with self.engine.connect() as c:
            return c.execute(
                sa.select(question_runs.c.ts).where(question_runs.c.slug == slug)
            ).scalar()
