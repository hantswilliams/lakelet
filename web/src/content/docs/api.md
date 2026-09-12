---
title: The local HTTP API
description: lakelet serve, the per-launch token, every route, and how query results stream as Arrow with the verdict in the headers.
section: Reference
order: 3
---

`lakelet serve` runs the core as a sidecar: one loopback HTTP server that carries the [Iceberg REST catalog](/docs/catalog) under `/v1` and the API under `/api`. The desktop app runs one per window; it is also how anything that is not a shell talks to a project. The API does the same operations as the CLI verbs, so nothing is reachable one way and not the other.

## Starting it

```bash
lakelet serve                        # a free port
lakelet serve --port 8765            # a fixed one
lakelet serve --memory-limit 6GB     # DuckDB's limit for this process only; the app gives each window its share
```

While it runs, `.lakelet/serve.json` names it, mode 0600, removed on exit:

```json
{"port": 8765, "pid": 41022, "token": "…", "started": "2026-09-09T13:02:11+00:00"}
```

Every `/api` route requires `Authorization: Bearer <token>` with the token from that file; a request without it is a 401. `/v1` stays open on loopback, as it does under `catalog serve`. The server binds `127.0.0.1` and refuses any other host. Cross-origin requests are allowed from the Tauri origins (`tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost`) and nothing else, except that setting `LAKELET_DEV_ORIGIN` (for example `http://localhost:5173`) before `serve` adds that one origin, which is how the app's frontend is developed and tested in a browser against a real sidecar. The app sets it only in debug builds, where its window is the Vite dev server; a released app's window is `tauri://localhost` and it passes nothing.

The engine is one DuckDB connection, so requests that touch it are serialised by a lock, held for the life of a streamed result. That is fine for one app window; a second window is meant to run a second sidecar.

## Routes

All under `/api`, all needing the token. Bodies are JSON; responses are JSON except the two that stream Arrow.

| Route | Body | Returns |
|---|---|---|
| `GET /health` | | `lakelet` and `duckdb` versions, `project` name and `root`, the `machine` profile (RAM, free disk, threads, memory limit), `throughput_local_mbps` and `bandwidth_mbps` from the cache, `throughput_probe` (`nocache`, `direct`, `cached` or `none`: how the disk figure was measured), and `aws` (`configured`, `source`: `environment`, `profile` or `none`, `profile`, `region`, `endpoint`; never a key). |
| `GET /tables` | | The list: name, rows, bytes, columns, location, snapshot id, `freshness` (when the current snapshot was committed, ISO 8601), `source` (the prefix an attached table was registered from; null for a table Lakelet wrote), `public` (read without credentials), `kind` (`table`, or `view` for a catalog view, with its `view_sql`; a view's rows and bytes are 0). |
| `GET /tables/discover?prefix=s3://…&anonymous=false` | | Candidate prefixes with kind, files and bytes; `anonymous=true` lists a public bucket without credentials. 400 `not_registrable` when there are no credentials and the bucket is not declared public. |
| `GET /tables/{name}` | | `describe`: the list's fields plus partitioning, freshness, last commit, snapshots, format version, `expirable_snapshots`, `reclaimable_bytes`, `keep_days` for `expire`, and `snapshot_list` (every snapshot newest first: `id`, `timestamp`, `operation`, `added_rows`, `added_files`, `deleted_rows`, `total_rows` with deletes taken off, `current`, `expirable`); for a view, `kind` is `view`, `view_sql` is its query, `snapshots` its version count, `snapshot_list` is empty and `properties` carries `lakelet.dbt-model` when a dbt model built it. 404 `no_such_table`. |
| `GET /tables/{name}/sample?n=5&truncate=80` | | The first rows; of a view, its query's first rows. |
| `POST /preview` | `{path, name?}` | The columns with DuckDB type, Iceberg type and note, and sample rows; for a folder, a list of these, one per file `import` would take. 400 `bad_file`. |
| `POST /import` | `{path, name?, mode}` with `mode` one of `create`, `replace`, `append` | The table info, or a list of them for a folder. 409 `table_exists`, 400 `bad_file`, 409 `catalog_conflict`. |
| `POST /tables/attach` | `{name, source, metadata_in_bucket, anonymous}` | The table info. `anonymous` reads a public bucket without credentials (the metadata stays local; the bucket is remembered in `.lakelet/public-buckets.json`). 409 `table_exists`, 400 `not_registrable` with the reason (drift, path-only partition column, no credentials). |
| `POST /tables/{name}/refresh` | | `{name, added, files, rows}`. 404 `no_such_table`, 409 `refresh_failed` when a registered file is gone. |
| `POST /tables/{name}/expire` | `{keep_days?}` | `lakelet tables expire`: `{name, keep_days, snapshots_before, snapshots_removed, files_removed, bytes_reclaimed}`. The one route that deletes data files. 404 `no_such_table`, 409 `not_expirable` for an attached table. |
| `POST /estimate` | `{sql}` | The estimate as JSON: `verdict`, `words`, `reason`, `line`, the numbers (`bytes_scanned`, `peak_memory`, `wall_local`, `wall_burst`, `cost_burst`, `cap`, `spill_bytes`, `memory_limit`), `pruning`, the tables and the worker. 400 `sql_error`. |
| `POST /query` | `{sql, allow_red, batch_rows}` | An Arrow IPC stream (below). |
| `GET /questions` | | Saved questions with slug, title, path and last run. |
| `POST /questions` | `{title, sql}` | The saved question, with `commit` (the version this save recorded, null when nothing changed) and `git` (why there is no version, when the repository could not be written). 400 `sql_error`. |
| `POST /questions/{slug}/run` | `{allow_red}` | An Arrow IPC stream, and the question's `last_run` is updated when it completes. 404 `no_such_question`. |
| `GET /versions/{name}` | | The versions of one question or model, newest first: `id`, `when`, `author`, `message`, `sql_changed`, `checks_changed`, and `diff`, the unified diff of the file against the version before it. 404 `no_such_model`, or `no_history` with the sentence saying why there is none. |
| `GET /versions/{name}/{id}` | | `{name, id, sql}`: that version's file content. Any unambiguous prefix of the version id works. |
| `POST /versions/{name}/restore` | `{id}` | Writes that version back, re-derives a question's checks from it, and commits: `{name, commit, git}`. The restore is a new version; nothing is rewritten. |
| `GET /history?last=50` | | Recent runs from `.lakelet/history.db`, newest first. |
| `GET /run/plan?select=a,b` | | `lakelet run --plan`: the dbt models in dependency order with `materialized`, `depends_on`, `compiled_sql`, the verdict, `words`, `reason`, `est_wall_local`, `est_bytes`, or `error`; each with its `description`, `path`, `tests` from `schema.yml` (`name`, `kind` such as `not_null` or `singular`, `column`, `unique_id`) and `last_run` (`ts`, `ok`, `seconds`, `verdict`, `error`, from history; null before the first `lakelet run`). 400 `dbt` when dbt is missing or the compile failed. |
| `POST /run` | `{select, burst, run_anyway}` | `lakelet run`: the plan, dbt's per-model `results` (status, seconds, message), `views_recorded`, `views_dropped`, `seconds`, `ok`. 400 `no_burst_yet`, 409 `red_refused` (a model is Red and `run_anyway` is false), 400 `dbt`. |
| `GET /gauge/summary` | | `runs`, `compared`, `within_2x`, `within_2x_share`, `green_over_3min`: what `gauge history` opens with and the app's Gauge tiles show. |
| `POST /gauge/export` | `{}` | `lakelet gauge export`: writes `.lakelet/exports/gauge-<time>.jsonl` in the project and answers `{path, runs}`; nothing is sent. |
| `POST /gauge/reset` | `{}` | `lakelet gauge reset --yes`: `{removed}`. |
| `POST /gauge/probe` | `{mb?}` | `lakelet gauge probe`: measures the disk again; `{mbps, method, size_bytes}`, and health reads the new figure. |
| `GET /settings` | | `settings` (`engine.memory_limit`, `engine.threads`, `gauge.share_calibration`, `catalog.keep_snapshots_days`, `git.auto_commit` with their values), the `path` of `lakelet.toml`, and a `note` that the engine reads them at start. |
| `PUT /settings` | `{key, value}` with `value` a string as `lakelet config set` takes it | The same as `GET`, after the one line in `lakelet.toml` is rewritten in place (comments and other sections kept). 400 `not_settable` for any other key or a value of the wrong shape. |

Errors are `{"error": "<code>", "message": "…"}` with the HTTP status in the table; a malformed body is a 422 from the framework.

## Query results

`POST /query` and `POST /questions/{slug}/run` answer with `Content-Type: application/vnd.apache.arrow.stream` and the gauge's verdict in three headers, so a client can show the verdict before the first row arrives:

```text
X-Lakelet-Verdict: green
X-Lakelet-Words: Runs here
X-Lakelet-Reason: scans 61.4 MB · fits in memory · ~0.3 s
```

The body is an Arrow IPC stream, one record batch per `batch_rows` rows (1,000 by default), written as the engine produces them; the first batch of a long query arrives while the rest is still running. Read it with `pyarrow.ipc.open_stream`, Arrow JS, or anything that speaks the format.

A Red verdict is refused with a 409 `red_refused` carrying the full estimate in the body, the same JSON as `/estimate`; send `allow_red: true` to run it anyway. A catalog conflict that survives the retries is a 409 `catalog_conflict`; SQL that fails to bind is a 400 `sql_error` with DuckDB's first line.

A client that closes the connection mid-query (the app's Esc aborts its `fetch`) stops the statement: the engine is interrupted at once rather than left running for nobody, the connection is free for the next request within a moment, and the run is in history as stopped early, with what was measured and no error. The three `X-Lakelet-*` headers are named in `Access-Control-Expose-Headers`, so a page on an allowed origin can read the verdict before the first row arrives.

```python
import httpx, json, pyarrow as pa
from pathlib import Path

s = json.loads(Path(".lakelet/serve.json").read_text())
h = {"Authorization": f"Bearer {s['token']}"}
with httpx.stream("POST", f"http://127.0.0.1:{s['port']}/api/query", json={"sql": "select * from orders limit 5"}, headers=h) as r:
    print(r.headers["X-Lakelet-Words"], "·", r.headers["X-Lakelet-Reason"])
    table = pa.ipc.open_stream(b"".join(r.iter_bytes())).read_all()
print(table)
```

Every run over the API is recorded in history exactly as a CLI run is.
