# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Lakelet: a local-first lakehouse.

The build brief is build-sessions/core-v0.N-plan.md at the repo root; each step of
the brief adds a module here and a test under tests/.
"""

from lakelet.project import Project

__version__ = "0.1.0.dev0"
__all__ = ["Project", "__version__"]
