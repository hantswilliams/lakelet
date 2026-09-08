# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""``lakelet.toml`` (brief §3.3). The core validates the sections it reads and carries every
other section and unknown key through untouched, so a file written by a later version still
opens here."""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

READ_SECTIONS = ("project", "catalog", "engine", "gauge")


class _Section(BaseModel):
    model_config = ConfigDict(extra="allow")


class ProjectSection(_Section):
    name: str
    warehouse: str = "./warehouse"


class CatalogSection(_Section):
    mode: Literal["local", "team", "external"] = "local"
    url: str | None = None


class EngineSection(_Section):
    memory_limit: str = "auto"
    threads: int | str = "auto"


class GaugeSection(_Section):
    green_max_seconds: float = 60
    yellow_max_seconds: float = 600
    green_max_memory_fraction: float = 0.6
    share_calibration: bool = False


class Config(BaseModel):
    project: ProjectSection
    catalog: CatalogSection = Field(default_factory=CatalogSection)
    engine: EngineSection = Field(default_factory=EngineSection)
    gauge: GaugeSection = Field(default_factory=GaugeSection)
    extra: dict[str, Any] = Field(default_factory=dict)
    """Sections the core does not read (``burst``, ``agents``, anything newer), verbatim."""

    @classmethod
    def load(cls, path: Path) -> Config:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
        known = {section: data.pop(section) for section in READ_SECTIONS if section in data}
        return cls(**known, extra=data)


def render_default(name: str) -> str:
    """The file ``init`` writes: the brief's §3.3, with the sections core v0 does not read
    present so the file is already valid for the sessions that will."""
    return f'''[project]
name = "{name}"
warehouse = "./warehouse"        # or s3://bucket/prefix, later

[catalog]
mode = "local"                    # local | team | external

[engine]
memory_limit = "auto"             # DuckDB default, 80% of RAM
threads = "auto"

[gauge]
green_max_seconds = 60
yellow_max_seconds = 600
green_max_memory_fraction = 0.6
share_calibration = false         # CLI default off; the app asks on first run

[burst]                           # read from session 8 on
default = "prompt"
max_cost_per_run_usd = 5.00

[agents]                          # read from session 5 on
allow = []
'''
