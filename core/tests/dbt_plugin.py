# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""The step 2 dbt spike's adapter plugin: dbt-duckdb calls ``configure_connection`` on every
connection it opens, which is where Lakelet's catalog gets attached (brief D9). If the spike
holds, session 9 lifts this into the package."""

from typing import Any

from dbt.adapters.duckdb.plugins import BasePlugin
from duckdb import DuckDBPyConnection


class Plugin(BasePlugin):
    def initialize(self, config: dict[str, Any]) -> None:
        self.catalog_url = config["catalog_url"]

    def configure_connection(self, conn: DuckDBPyConnection) -> None:
        conn.execute("LOAD iceberg; LOAD httpfs")
        conn.execute(
            f"ATTACH 'lakelet' AS lakelet (TYPE ICEBERG, ENDPOINT '{self.catalog_url}', "
            "AUTHORIZATION_TYPE 'none', DEFAULT_SCHEMA 'main')"
        )
