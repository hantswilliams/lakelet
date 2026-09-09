---
title: Saved questions
description: A question is a dbt model in the project with two checks; saving, listing and running one, and what dbt sees.
section: Guide
order: 4
---

A saved question is SQL with a title, kept as a dbt model in the project so it is a file in git, a node in a dbt DAG, and something `dbt test` can check. `lakelet init` writes a `dbt_project.yml` for this; you do not need dbt installed to save or run questions, only to run dbt itself.

## Saving

```bash
lakelet question save "Revenue by customer" --sql "select customer, sum(amount) as revenue from orders group by 1"
lakelet question save "Revenue by customer" -f revenue.sql
```

The slug is the title through the [naming rule](/docs/config): `revenue_by_customer`. Saving writes three things:

`models/questions/revenue_by_customer.sql`, the SQL under a two-line comment header:

```sql
-- Revenue by customer
-- saved by lakelet on 2026-09-09
select customer, sum(amount) as revenue from orders group by 1
```

An entry in `models/questions/schema.yml`, with the title as the description, `materialized: table`, and two default checks: a model-level `returns_rows` test, and `not_null` on the first column:

```yaml
models:
  - name: revenue_by_customer
    description: Revenue by customer
    config: {materialized: table}
    meta: {lakelet: {title: Revenue by customer, created: "2026-09-09T13:02:11+00:00"}}
    data_tests: [returns_rows]
    columns:
      - name: customer
        data_tests: [not_null]
```

And, the first time, `tests/generic/returns_rows.sql`, the generic test the first check names. The SQL is checked with `DESCRIBE` before anything is written, so a question that does not bind is refused. Saving the same title again updates the model in place and keeps its `created` date.

## Listing and running

```bash
lakelet question list                    # slug, title, created, last run
lakelet question run revenue_by_customer # the gauge line, then the rows; --format, --output, --run-anyway as for sql
```

`run` executes the question's SQL through the [gauge](/docs/gauge) exactly like `lakelet sql`, and when the result completes it records the run against the question, which is where `last_run` comes from. Nothing under `models/` is touched by a run. Over the [HTTP API](/docs/api) it is `GET /questions`, `POST /questions` and `POST /questions/{slug}/run`.

## What dbt sees

`init`'s `dbt_project.yml` is minimal: the project's name, `models/` as the model path, and `models: +database: lakelet`, so anything dbt builds lands in the catalog beside the tables it reads. With `dbt-core` and `dbt-duckdb` installed and a profile that attaches the catalog, `dbt parse` accepts the generated project and `dbt test` runs both checks against the question's table.

The attach happens through a dbt-duckdb plugin: a `configure_connection` hook that runs the same `ATTACH … TYPE ICEBERG` as the CLI on every connection dbt opens, and a `configure_cursor` hook that sets `USE lakelet.main` on each cursor, because dbt-duckdb runs models on cursors that do not inherit the session's search path. That plugin lives in the test suite today (`core/tests/dbt_plugin.py`) and moves into the package with the dbt work.

**What is not there yet.** The model says `materialized: table`, but `lakelet question run` does not build that table; it runs the SQL. Building it with `dbt run` hits a known limit: dbt's `table` materialisation creates `<model>__dbt_tmp` and renames it, and DuckDB's Iceberg catalog refuses to rename a table modified in the same transaction. The `incremental` materialisation with a `merge` strategy does not rename and works through the catalog today. A Lakelet materialisation, or a dbt-duckdb setting that avoids the swap, is the open item for the dbt session; until then the checks are tested against a table Lakelet builds.
