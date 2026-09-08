# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Gauge inputs (brief §4.1 of the architecture, D20, D21, D36): the optimised plan, the
tables a statement reads, and the machine profile."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import re
import shutil
from typing import TYPE_CHECKING, Any

import psutil

if TYPE_CHECKING:
    from lakelet.engine import Engine

SCAN_NODES = ("ICEBERG_SCAN", "TABLE_SCAN", "PARQUET_SCAN", "READ_PARQUET")
_UNITS = {"B": 1, "KB": 10**3, "MB": 10**6, "GB": 10**9, "TB": 10**12}
_UNITS |= {"KIB": 2**10, "MIB": 2**20, "GIB": 2**30, "TIB": 2**40}


def parse_memory(text: str) -> int | None:
    """DuckDB prints ``51.2 GiB``; config says ``8GB``. Bytes, or None for anything else."""
    match = re.fullmatch(r"\s*([\d.]+)\s*([A-Za-z]+)\s*", text or "")
    if not match:
        return None
    unit = _UNITS.get(match.group(2).upper())
    return int(float(match.group(1)) * unit) if unit else None


def plan_json(engine: Engine, sql: str) -> list[dict[str, Any]]:
    """``EXPLAIN (FORMAT JSON)``: the optimised plan, with filters and projections already
    pushed down to the scan nodes (brief D20)."""
    return json.loads(engine.execute(f"EXPLAIN (FORMAT JSON) {sql}").fetchone()[1])


def walk(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """All plan nodes in tree order."""
    out: list[dict[str, Any]] = []

    def visit(node: dict[str, Any]) -> None:
        out.append(node)
        for child in node.get("children", []):
            visit(child)

    for node in nodes:
        visit(node)
    return out


def scan_nodes(plan: list[dict[str, Any]]) -> list[dict[str, Any]]:
    scans = []
    for node in walk(plan):
        if node.get("name") in SCAN_NODES:
            extra = node.get("extra_info", {})
            projections = extra.get("Projections", [])
            if isinstance(projections, str):
                projections = [projections]
            scans.append(
                {
                    "name": node["name"],
                    "projections": list(projections),
                    "filters": extra.get("Filters"),
                    "estimated_cardinality": int(extra.get("Estimated Cardinality", 0) or 0),
                }
            )
    return scans


def operator_counts(plan: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for node in walk(plan):
        name = node.get("name", "?")
        counts[name] = counts.get(name, 0) + 1
    return counts


_TABLE_REF = re.compile(
    r"\b(?:from|join|into|update|table)\s+((?:\"[^\"]+\"|[\w]+)(?:\.(?:\"[^\"]+\"|[\w]+))*)",
    re.IGNORECASE,
)


def base_tables(engine: Engine, sql: str) -> list[str]:
    """Table names the statement refers to, in order of appearance. DuckDB's own parse of
    the SQL for a SELECT (``json_serialize_sql`` serialises nothing else); a keyword scan
    for writes. CTE names come out too; the caller keeps the ones the catalog knows."""
    data = json.loads(engine.execute("select json_serialize_sql(?)", [sql]).fetchone()[0])
    names: list[str] = []

    def add(name: str) -> None:
        bare = name.split(".")[-1].strip('"')
        if bare and bare not in names:
            names.append(bare)

    def visit(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "BASE_TABLE" and node.get("table_name"):
                add(node["table_name"])
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)

    if "statements" in data:
        visit(data)
    else:
        for match in _TABLE_REF.finditer(sql):
            add(match.group(1))
    return names


def machine_profile(engine: Engine, root: str) -> dict[str, Any]:
    limit_text = engine.execute("select current_setting('memory_limit')").fetchone()[0]
    threads = engine.execute("select current_setting('threads')").fetchone()[0]
    battery = psutil.sensors_battery()
    return {
        "platform": platform.system(),
        "machine": platform.machine(),
        "ram": psutil.virtual_memory().total,
        "memory_limit": parse_memory(limit_text),
        "memory_limit_text": limit_text,
        "cores": os.cpu_count(),
        "threads": int(threads),
        "free_disk": shutil.disk_usage(root).free,
        "on_battery": (not battery.power_plugged) if battery is not None else None,
    }


def machine_hash(profile: dict[str, Any]) -> str:
    key = f"{profile['platform']}|{profile['machine']}|{profile['ram']}|{profile['cores']}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]
