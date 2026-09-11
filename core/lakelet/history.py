# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""``.lakelet/history.db`` (brief D7, §3.4): every run, with everything the calibration
model will ever need, including the SQL text, which never leaves the machine."""

from __future__ import annotations

import json
from collections.abc import Iterator
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

# A dbt model's last `lakelet run` (real-data brief R5, the app's Models panel): the
# model's unique id to the run that recorded it, the way a question's last run is kept.
model_runs = sa.Table(
    "model_runs",
    metadata,
    sa.Column("unique_id", sa.String(255), primary_key=True),
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

    def close(self) -> None:
        self.engine.dispose()

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

    def all_runs(self) -> Iterator[Run]:
        """Every run, oldest first, one at a time (the export, the summary)."""
        with self.engine.connect() as c:
            for row in c.execute(runs.select().order_by(runs.c.id)).mappings():
                data = dict(row)
                for column in JSON_COLUMNS:
                    data[column] = json.loads(data[column])
                yield Run(**data)

    def summary(self) -> dict[str, Any]:
        """What the Gauge screen's tiles say (real-data brief R8): runs recorded, the share
        of completed local runs whose actual wall time is within 2x of the estimate either
        way, and Green runs that took over three minutes (the gauge's promise broken)."""
        recorded = compared = within = green_over = 0
        for run in self.all_runs():
            recorded += 1
            if run.ran_where != "local" or not run.ran or run.error:
                continue
            est, actual = run.est_wall_local, run.actual_wall
            if est and actual and est > 0 and actual > 0:
                compared += 1
                if 0.5 <= actual / est <= 2.0:
                    within += 1
            if run.verdict == "green" and actual and actual > 180:
                green_over += 1
        return {
            "runs": recorded,
            "compared": compared,
            "within_2x": within,
            "within_2x_share": (within / compared) if compared else None,
            "green_over_3min": green_over,
        }

    def reset(self) -> int:
        """`lakelet gauge reset`: forget every recorded run, the questions' last runs and
        the correction factors. Returns the runs removed."""
        with self.engine.begin() as c:
            c.execute(question_runs.delete())
            c.execute(model_runs.delete())
            c.execute(corrections.delete())
            removed = c.execute(runs.delete()).rowcount
        return removed

    def record_model_run(self, unique_id: str, run_id: int) -> None:
        now = datetime.now(UTC)
        with self.engine.begin() as c:
            c.execute(model_runs.delete().where(model_runs.c.unique_id == unique_id))
            c.execute(model_runs.insert().values(unique_id=unique_id, ts=now, run_id=run_id))

    def model_last_run(self, unique_id: str) -> Run | None:
        with self.engine.connect() as c:
            row = (
                c.execute(
                    runs.select()
                    .join(model_runs, model_runs.c.run_id == runs.c.id)
                    .where(model_runs.c.unique_id == unique_id)
                )
                .mappings()
                .first()
            )
        if row is None:
            return None
        data = dict(row)
        for column in JSON_COLUMNS:
            data[column] = json.loads(data[column])
        return Run(**data)

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
