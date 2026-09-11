---
title: dbt and views
description: lakelet run builds the project's dbt models through the gauge and the catalog; a view model is an Iceberg view in Lakelet's catalog that every session and engine sees.
section: Guide
order: 5
---

A Lakelet project is a dbt project: `init` writes `dbt_project.yml` with `models: +database: lakelet`, and every saved question is a model under `models/questions/`. `lakelet run` is how the models get built.

> **If you already use dbt, the one thing to know: build with `lakelet run`, not `dbt run`.** Both build your `table` models the same way, through the catalog. The difference is `view` models. `lakelet run` records every view in Lakelet's catalog when the run finishes, so the app, the next `lakelet serve`, the CLI and Spark all see it. A bare `dbt run` cannot do that recording (the reason is under *Views*), so a view it builds exists for that dbt session only and is gone afterwards; dbt prints a line saying so for each one. `dbt run` can still *read* the views Lakelet has recorded, so it is fine for checking a model or running `dbt test`. `lakelet run` also shows each model's verdict before anything is built, which `dbt run` never will.

```bash
lakelet run                       # every model, each with its verdict first
lakelet run stg_orders+           # dbt selectors, as `dbt run --select` takes them
lakelet run --plan                # the DAG with verdicts, nothing built
lakelet run --run-anyway          # build even where a model is Red
```

Needs dbt: `pip install 'lakelet[dbt]'` (dbt-core and dbt-duckdb; a clone's `uv sync` has them). Without it `lakelet run` says so and nothing else changes.

## What a run does

`lakelet run` compiles the project with dbt (into `.lakelet/dbt/`, with a `profiles.yml` it writes on every run, because the catalog's address is per process), then takes the models in dependency order and asks [the gauge](/docs/gauge) about each one's compiled SQL, giving the engine a view for each model as it goes so the models after it bind: a `view` model as itself, a `table` model not built yet as a stand-in over its query. That is the DAG it prints:

```
  stg_orders  view   green  ~0.0 s
  by_c        table  green  ~2 s
  top         view   green  ~0.0 s
```

If any model is Red the run stops there, the way `lakelet sql` refuses a Red statement, until `--run-anyway`; `--burst auto` is session 8's and refuses today with that sentence. Then dbt runs the DAG through Lakelet's plugin (`lakelet.dbt.plugin`, which attaches the catalog to every connection dbt opens and sets the search path the engine uses), each model's estimate and dbt's actual time go into [history](/docs/gauge) like a query's, and every `view` model that built is recorded in the catalog as described next. `table` models build through the materialisation `init` writes into `macros/lakelet.sql` ([Transactions and the catalog](/docs/transactions) says why dbt's own cannot).

## Views

**Why `dbt run` cannot record a view.** A dbt materialisation is SQL and only SQL. DuckDB has no SQL that creates a view inside an Iceberg catalog (`CREATE VIEW lakelet.main.v` is refused as not implemented), and the only other way for a dbt plugin to reach the catalog from inside a run, a Python function registered on the connection, needs numpy, which Lakelet does not carry. So the recording has to happen from outside the run, and `lakelet run` is that outside: it runs dbt, then writes every `view` model that built into the catalog. A bare `dbt run` has no such afterwards, and its view models stay in that session.

DuckDB's Iceberg catalog cannot hold a view, so a `materialized: view` model lives in the session's `memory` database while dbt runs (`macros/lakelet_views.sql`, written by `init`, sends it there and every `ref()` to it follows), and `lakelet run` then records it in Lakelet's catalog as an **Iceberg view**: a metadata file under `warehouse/main/<name>/metadata/` in the shape of the Iceberg view spec (format version 1), with one SQL representation in DuckDB's dialect and the schema of its result, and a row in the catalog. Every replace is a new version in that file; the earlier versions stay.

From then on the view is there for everyone: the engine of every later session (the CLI, `lakelet serve`, the app) creates a DuckDB view of the same name at start and after every change, so `select … from top` and the gauge work on it as on a table (the gauge sees through it to the tables it reads); a bare `dbt run` gets the catalog's views from the plugin, so a model may read a view that is not a dbt model; `lakelet tables list` shows it as `view`; and Spark or Trino read it through the [REST catalog](/docs/catalog)'s view routes. A view model removed from the project is dropped from the catalog on the next full run (a run with selectors drops nothing).

The recorded SQL names tables as `"main"."by_c"`, which DuckDB resolves through the search path (`lakelet.main`, then `memory.main`) and Spark through the default namespace, so the same text reads in both; a view that uses a DuckDB-only function is Spark's to refuse.

A view that is not a dbt model can be recorded from Python (`project.views.put(name, sql)`) and is listed and dropped the same way; `lakelet tables list` and `/api/tables` show `kind: view` with its SQL. A CLI verb for that waits until someone asks for it.

## Running dbt yourself

`dbt test`, `dbt compile`, `dbt docs`, or a `dbt run` to check one model: all fine, with two things in place. dbt needs a live catalog to attach to, and the profile that names it. `lakelet run` starts and stops its own catalog, so the profile it leaves in `.lakelet/dbt/profiles.yml` points at a port that is gone once it exits (a bare `dbt run` against it says *Could not connect to server*). Start one that stays up, and its profile is written for you:

```bash
lakelet catalog serve            # terminal 1: a catalog on a fixed port; prints the dbt line
dbt test --profiles-dir .lakelet/dbt      # terminal 2, in the project
dbt run  --profiles-dir .lakelet/dbt --select stg_orders
```

The app's core (`lakelet serve`) writes the same profile when it starts, so with the project open in the app the profile is live too. Whichever wrote it, the profile is good for as long as that process runs. And `view` models built this way are that session's only, as the callout at the top says; `lakelet run` is what records them.

## What dbt sees

The plugin runs on every connection: `LOAD iceberg; LOAD httpfs`, `ATTACH 'lakelet' … TYPE ICEBERG`, `SET search_path = 'lakelet.main,memory.main'`, then the catalog's views as DuckDB views in `memory.main`; on every cursor, the search path again, because dbt-duckdb runs models on cursors that do not inherit it. The profile is `.lakelet/dbt/profiles.yml`, written by whichever Lakelet process is serving the catalog (`lakelet run` for its own run, `lakelet serve`, `lakelet catalog serve`), naming the plugin module `lakelet.dbt.plugin` and that catalog's URL.
