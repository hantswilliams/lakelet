---
title: Install from source and the quickstart
description: A lakehouse in a folder in under ten minutes, from a clone of the repo.
section: Start
order: 1
---

There are no installers yet. The package runs from a clone with [uv](https://docs.astral.sh/uv/). You need uv 0.11 or newer and Python 3.12 or newer; uv will fetch 3.13 if the machine has nothing suitable. macOS and Linux are what the suite runs on.

## Install

```bash
git clone https://github.com/hantswilliams/lakelet.git
cd lakelet/core
uv sync
uv run lakelet --version        # lakelet 0.1.0.dev0
```

`uv sync` creates `core/.venv` with the runtime and the development dependencies (pytest, dbt, the S3 mock); an install from the package needs the `dbt` extra (`lakelet[dbt]`) for `lakelet run`. To use `lakelet` from any folder, `uv tool install --editable .` in `core/` puts it on your path; the examples below use `uv run` from `core/` and point at a project folder with `-C`.

## The quickstart

The same eight commands the test suite runs end to end. Nothing here leaves the machine except the one extension download in `init`. The output shown is the shape of each command's output; the numbers are from one machine and yours will differ.

### 1. Turn a folder into a lakehouse

```bash
mkdir ~/acme && cd ~/acme
uv run --project ~/lakelet/core lakelet init
```

```text
  lakelet.toml
  AGENTS.md
  dbt_project.yml
  models/.gitkeep
  macros/lakelet.sql
  .gitignore
  .lakelet/catalog.db
  installed DuckDB extensions iceberg, httpfs, excel, aws into ~/.duckdb/extensions/… (the one download; nothing else fetches at query time)
  local disk reads at 2,140 MB/s
lakehouse ready in /Users/you/acme
```

`init` writes the [project layout](/docs/config), creates the `main` namespace in a SQLite catalog, downloads the four DuckDB extensions if they are not already in `~/.duckdb`, and times a 512 MB read of local disk for the gauge (`--probe-mb 0` skips it). It refuses to run twice in the same folder and never overwrites a `dbt_project.yml`, `macros/lakelet.sql`, `.gitignore` or `AGENTS.md` that is already there.

### 2. Import a file

```bash
uv run --project ~/lakelet/core lakelet import orders.csv --preview   # the schema it would create, and stop
uv run --project ~/lakelet/core lakelet import orders.csv
```

```text
orders: 4,500,000 rows, 173.2 MB, 9 columns
```

CSV, TSV, Parquet, JSON, JSON Lines and Excel, or a folder of them (one table per file). The table is Iceberg, written by DuckDB through the catalog into `./warehouse/main/orders/`. See [Tables](/docs/tables) for `--replace`, `--append` and the type coercions the preview shows.

### 3. Run SQL and get a verdict first

```bash
uv run --project ~/lakelet/core lakelet sql "select country, count(*) from orders group by 1 order by 2 desc"
```

```text
● Runs here · scans 61.4 MB · fits in memory · ~0.3 s
┏━━━━━━━━━┳━━━━━━━━━━┓
┃ country ┃ count(*) ┃
┡━━━━━━━━━╇━━━━━━━━━━┩
│ US      │ 2811040  │
│ DE      │  944511  │
…
```

The gauge line goes to stderr and the rows to stdout, so `lakelet sql "…" > out.csv` writes CSV with the verdict still on your terminal. `--format json` streams one object per line; `--format parquet --output out.parquet` writes a file. Bare table names work; `orders` is `lakelet.main.orders`.

### 4. Ask without running

```bash
uv run --project ~/lakelet/core lakelet estimate "select * from orders o join orders p on o.id = p.id"
```

```text
● Needs more machine · scans 346.4 MB · peak 14.2 GB of 12.8 GB limit · spills · ~11 min · burst ~2 min · cap $0.50
```

`estimate` runs the [gauge](/docs/gauge) and nothing else. A Red verdict on `sql` is refused with exit code 2 unless you add `--run-anyway`.

### 5. Let another engine read the table

```bash
uv run --project ~/lakelet/core lakelet catalog serve --port 8181
```

```text
catalog at http://127.0.0.1:8181 (Iceberg REST, warehouse file:///Users/you/acme/warehouse)
```

In another terminal, pyiceberg, DuckDB, Spark or Trino read and write the same tables through the [catalog](/docs/catalog):

```python
from pyiceberg.catalog.rest import RestCatalog
table = RestCatalog("lakelet", uri="http://127.0.0.1:8181").load_table("main.orders")
print(table.scan(limit=5).to_arrow())
```

### 6. Save the question

```bash
uv run --project ~/lakelet/core lakelet question save "Orders by country" --sql "select country, count(*) as n from orders group by 1"
uv run --project ~/lakelet/core lakelet question run orders_by_country
```

A saved question is a dbt model under `models/questions/` with two checks; see [Questions](/docs/questions).

### 7. Look at the record

```bash
uv run --project ~/lakelet/core lakelet gauge history
```

Every `sql`, `estimate` and question run is a row in `.lakelet/history.db`: verdict, the estimate, the actuals from DuckDB's profiler.

### 8. Prove nothing left the machine

```bash
uv run --project ~/lakelet/core lakelet audit network
```

Runs the quickstart in a subprocess with a socket guard in Python and a recording proxy in front of DuckDB, and reports every outbound attempt at either layer. On a project whose extensions are installed the number is zero, and the command refuses to run before they are, since the download would be the one attempt.

## What is in the folder afterwards

```text
acme/
  lakelet.toml            project, catalog, engine and gauge settings
  AGENTS.md               a block per table, refreshed on import, for coding agents
  dbt_project.yml         a dbt project pointed at the catalog
  models/questions/       saved questions as dbt models, with schema.yml
  macros/lakelet.sql      the table materialisation dbt uses against the catalog
  warehouse/main/<table>/ the Iceberg tables: data/ and metadata/
  .lakelet/catalog.db     the catalog, SQLite
  .lakelet/history.db     every run
  .lakelet/cache/         manifest and machine caches; safe to delete
```

Delete the folder and Lakelet is gone. Copy `warehouse/` anywhere and any Iceberg reader can open the tables by their `metadata.json`.
