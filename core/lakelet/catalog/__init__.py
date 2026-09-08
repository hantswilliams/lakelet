# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""The Iceberg REST catalog: state in SQLAlchemy Core (store), Iceberg semantics from
pyiceberg (commit), FastAPI routes (server), and a loopback thread (embedded). Brief D4, D5, D19."""

from lakelet.catalog.embedded import EmbeddedCatalog
from lakelet.catalog.server import create_app
from lakelet.catalog.store import Store

__all__ = ["EmbeddedCatalog", "Store", "create_app"]
