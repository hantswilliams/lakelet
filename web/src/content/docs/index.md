---
title: Lakelet developer docs
description: What is built, what is not, and how to run the core from source today.
section: Start
order: 0
---

Lakelet is a local-first lakehouse: Apache Iceberg tables on Parquet in a folder you own, a catalog that speaks the Iceberg REST spec, DuckDB as the engine, and a pre-flight gauge that says whether this machine can run a query before it runs. The Python package `lakelet` in `core/` is the core, driven by a CLI; the desktop app in `app/` is a window over it, running from source. Bursting to a cloud worker, the ask box and the MCP server are on the [marketing pages](/) as plans; they are not built yet.

## What exists

| Surface | State | Page |
|---|---|---|
| `lakelet init`, `import`, `sql`, `estimate`, `tables` | Built, tested on macOS; Ubuntu in CI | [Quickstart](/docs/install), [CLI](/docs/cli) |
| The gauge: Green, Yellow, Red, the sentence, exit codes, history | Built; constants are v0, tuned on one machine | [The gauge](/docs/gauge) |
| Importing files and folders into Iceberg, with the type coercion table | Built; six file types | [Tables](/docs/tables) |
| `tables attach`, `refresh`, `discover` for Parquet already in S3 | Built, tested against an in-process S3 mock and RustFS; the same suite runs against a real bucket by hand | [Tables](/docs/tables), [A real bucket](/docs/remote) |
| The Iceberg REST catalog, `catalog serve`; DuckDB, pyiceberg, Spark 3.5 and Trino as clients | Built; Spark and Trino verified through Docker Compose | [Catalog](/docs/catalog) |
| Saved questions as dbt models with two checks; `dbt run` builds them through the catalog | Built; `dbt run` and `dbt test` pass on the generated project | [Questions](/docs/questions) |
| `lakelet serve`: the local HTTP API with a bearer token and Arrow results | Built; the app runs one per window | [HTTP API](/docs/api) |
| The desktop app: projects, drop-to-import with a preview, the SQL screen with the verdict before the rows, the streaming grid, the auto-chart, crash recovery, settings | Built, from source; tested with Playwright against real sidecars on macOS and Ubuntu; no installer yet | [The desktop app](/docs/app) |
| `lakelet tables expire`, `lakelet gauge probe`, `lakelet config` | Built | [Tables](/docs/tables), [The gauge](/docs/gauge), [Config](/docs/config) |
| `lakelet audit network` | Built; measures zero outbound attempts on the quickstart | [Quickstart](/docs/install) |
| Installers, brew tap, a PyPI release | Not yet | |
| Burst, `ask`, `mcp`, correction factors, `catalog attach` | Not yet | |

## Versions

The package is `0.1.0.dev0` and is not on PyPI. It needs Python 3.12 or newer (3.13 is what the repo pins), DuckDB 1.5.x, pyiceberg 0.12, and the four DuckDB extensions `iceberg`, `httpfs`, `excel` and `aws`, which `lakelet init` downloads once. Every version ceiling is in `core/pyproject.toml`.

## How to read these pages

Start with the [quickstart](/docs/install), which is the same sequence the test suite runs end to end. The [CLI reference](/docs/cli) is generated from the CLI's own help text and cannot drift from the code. Everything else describes what a test asserts; where a page names a number (a budget, a timing), the number was measured on one machine and says so.

The source of truth for the design is `build-sessions/core-v0.5-plan.md` in the repo, and for the running state, `build-sessions/TASKS.md`. Where a doc page and the brief disagree, the brief wins and the page is wrong; [edit it](https://github.com/hantswilliams/lakelet/tree/main/web/src/content/docs).
