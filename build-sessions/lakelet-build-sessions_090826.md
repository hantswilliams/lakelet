# Lakelet — build session log, September 8, 2026

*Planning session, before any code · Hants and Claude (Fable 5.1) · Produced `decisions-for-review_090826.md`; amended `core-v0.1-plan.md` · Still nothing in `core/`*

## 1. What this session did

- Discussed whether the six remote-data decisions (R1 to R6) should stay open with two paths built in parallel. Conclusion: only R3 (metadata location) is cheap enough to build both ways, because it is one flag over the same code. R2 gets a shared foundation, one implementation, fixtures with kill criteria, and a named fallback with a trigger. R1, R5 and R6 are decided, not tested.
- Wrote the one-page tick-box version of the decisions, `decisions-for-review_090826.md`, and linked it from the R block in the plan.
- Hants accepted all six decisions in `decisions-for-review_090826.md`. `core-v0.2-plan.md` (plan revision 4) was written with them applied: D25 in-place registration, D26 metadata local by default, D27 snapshot plus `refresh`, the D11 scope change, `catalog attach` to Day 1, the step 8 fixtures and trigger, a demo-path line in the definition of done. The pending block is gone; `core-v0.1-plan.md` is marked superseded.
- Replaced MinIO everywhere. Hants flagged that MinIO is no longer maintained by the community. The plan had it as the `s3://` test backend behind an env var and, via PRD D3, as the shape of the `file://` fallback shim.

## 2. Measurement

Moto 5.2.3, `ThreadedMotoServer` started inside the Python process on a loopback port, no Docker, no credentials beyond placeholders. DuckDB 1.5.5 with an S3 secret pointing at it (`URL_STYLE 'path'`, `USE_SSL false`); pyiceberg 0.12.0 `SqlCatalog` with `s3.endpoint` set and the warehouse at `s3://lakelet-test/_lakelet`.

| # | Check | Result |
|---|---|---|
| 1 | DuckDB `COPY … TO 's3://…'` writes two plain Parquet files, `read_parquet` over the prefix reads them back | 1,500 rows |
| 2 | pyiceberg `add_files` registers the prefix in place with metadata under a separate `_lakelet/` prefix | 0.05 s, nothing copied |
| 3 | pyiceberg `plan_files` with `i >= 1000` prunes to one file | `part-1.parquet` only |
| 4 | DuckDB `iceberg_scan` of the registered table over `s3://` | 1,500 rows, 2 countries |
| 5 | DuckDB `iceberg_scan` with a pushed-down filter | 500 rows |
| 6 | pyiceberg `append` over `s3://`, DuckDB reads the new snapshot | 1,501 rows |

The access log showed pyiceberg writing metadata and manifests by multipart upload and DuckDB reading them by range request, so the mock covers the request shapes both clients use.

Reproduce:

```bash
uv run --with "moto[server]" --with boto3 --with duckdb --with "pyiceberg[sql-sqlite,pyarrow]" python - <<'EOF'
import os, time, logging, duckdb, boto3, pyarrow as pa
logging.getLogger("werkzeug").setLevel(logging.ERROR)
from moto.server import ThreadedMotoServer
from pyiceberg.catalog.sql import SqlCatalog
srv = ThreadedMotoServer(ip_address="127.0.0.1", port=5555, verbose=False); srv.start(); time.sleep(0.5)
ep = "http://127.0.0.1:5555"
boto3.client("s3", endpoint_url=ep, aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1").create_bucket(Bucket="lakelet-test")
con = duckdb.connect(); con.execute("INSTALL httpfs; LOAD httpfs; INSTALL iceberg; LOAD iceberg")
con.execute("CREATE SECRET (TYPE s3, KEY_ID 'test', SECRET 'test', REGION 'us-east-1', ENDPOINT '127.0.0.1:5555', URL_STYLE 'path', USE_SSL false)")
con.execute("COPY (select range as i, 'US' as country from range(1000)) TO 's3://lakelet-test/raw/events/part-0.parquet'")
con.execute("COPY (select range as i, 'DE' as country from range(1000, 1500)) TO 's3://lakelet-test/raw/events/part-1.parquet'")
cat = SqlCatalog("t", uri="sqlite:///cat.db", warehouse="s3://lakelet-test/_lakelet",
                 **{"s3.endpoint": ep, "s3.access-key-id": "test", "s3.secret-access-key": "test", "s3.region": "us-east-1"})
cat.create_namespace("main")
t = cat.create_table("main.events", schema=pa.schema([("i", pa.int64()), ("country", pa.string())]))
t.add_files([f"s3://lakelet-test/raw/events/part-{k}.parquet" for k in (0, 1)])
print(con.execute(f"select count(*) from iceberg_scan('{t.metadata_location}') where i >= 1000").fetchone())
srv.stop()
EOF
```

## 3. What changed in the plan

- **D16.** The `s3://` matrix runs in the default suite against Moto in-process; `LAKELET_TEST_S3_ENDPOINT` points the same tests at a real endpoint for fidelity. MinIO is not used anywhere. Moto is a mock and in-memory, so it is never the product's shim.
- **D15.** `moto[server]` and `boto3` added as dev dependencies.
- **Step 1 gate and §6.** Reworded to match.
- **§8.** PRD D3's "local S3 shim (MinIO-compatible)" becomes, if ever needed, a minimal S3 subset inside the sidecar over local disk.
- **§9 and the R block.** The `s3://` measurement recorded; the one open measurement under R2 is closed.
- **`decisions-for-review_090826.md`.** The `s3://` fixture is marked measured and kept as a regression test.

## 6. Readiness review and the last preparation before step 0

Hants asked whether there was enough information to build the core. Answer: yes for step 0 and step 1, with one decision (gitignore) and six small specification gaps. Decisions and actions the same day:

- `docs/` and `build-sessions/` are now tracked; `.gitignore` keeps `brand/` and `deck/`. First time the brief itself is in git.
- `claude/karpathy.md` holds the coding rules for every session: think before coding, simplest thing, surgical changes, tests as the success criterion. `CLAUDE.md` at the root imports it; `AGENTS.md` carries the same text for other agents. Both say where to start.
- Tests ship with the code, step by step, never after (D34).
- `core-v0.5-plan.md` (revision 7) records all of this as D34 to D36 and amends D12, D18 and step 0. Nothing is pending. It is the brief to build from.
- `README.md` rewritten as a start-here page for developers; the stale `site/` line is gone.

## 5. The site and deck comparison

`core-v0.2-plan.md` was compared line by line with `deck/lakelet-pitch-deck.pptx`, `deck/lakelet-executive-summary.docx` and the six pages in `site/`. Text was extracted from the pptx and docx XML and from the HTML. Findings, in three groups:

- **Cheap choices the site had already made for the core:** the verdict words; the burst half of every Yellow and Red line; `tables discover`; the fields `describe` returns; a lease column; `estimate -f`; Parquet export; the health payload; `lakelet audit network`; saved questions as dbt models; the Iceberg format version.
- **Advertised for the beta, deferred by the plan:** `catalog attach` (Day 1); correction factors (Day 1 against a PRD MUST); the public GitHub link (Day 1); spot by default (a PRD non-goal); bring-your-own-account bursts; GCS and R2; `lakelet ask` as a CLI verb; Snowflake and Athena reading a loopback catalog.
- **Claims with no owner in any document:** lineage in the free tier and the Day 0 MCP tools; "a failed test blocks the commit"; a local cache of bucket data files; the agents page's `history` flag contradicting D7; Tableau and Metabase reading Iceberg REST.
- **Two risks:** dbt is the most advertised feature and the last built, with an open unknown; MCP (session 5) sits ahead of the four sessions the demo needs.

`core-v0.3-plan.md` (revision 5) applied twelve preliminary decisions from this, M1 to M12, provisionally, with tick boxes at the top for review, and added §10 listing the site and deck wording changes. Hants accepted all twelve with no changes. `core-v0.4-plan.md` (revision 6) records them as final, drops the review block, and lists M1 to M12 at the end of §9 so the body's references resolve. Nothing in revision 6 is pending.

## 4. Still open

1. Re-export `deck/lakelet-executive-summary.pdf` from the edited docx; the §10 edits to `web/src` and the deck are applied (September 8), originals in `old/deck-before-090826/`.
2. Whether to align the plan's filename with its internal version; revision 4 sidesteps it by calling itself "plan revision 4" and naming its own file.
3. If a self-hosted S3-compatible store is ever wanted for local fidelity runs, pick one that is maintained at the time; the env var is deliberately generic so nothing in the plan depends on the choice.
4. Step 0, from `core-v0.5-plan.md`.

## 7. Step 0, built

Assumptions stated before starting: package version `0.1.0.dev0`; the step 0 CLI is only `--version`; dbt as a dev dependency waits for step 2; the §8 doc edits are dated amendments, not rewrites; Hants commits.

What exists now:

- `core/` is a uv project: `pyproject.toml` with the D15 runtime ranges and the dev group, `uv.lock`, `.python-version` pinned to 3.13 (uv had picked 3.14 first), `lakelet/__init__.py` with the version, `lakelet/cli/__init__.py` with `--version`, `tests/test_step0_skeleton.py`.
- `.github/workflows/core-ci.yml`: macOS and Ubuntu, `uv sync --locked`, the three DuckDB extensions cached per DuckDB version and platform, ruff check and format, pytest. Validated as YAML; not yet run, because nothing has been pushed.
- `LICENSE` (Apache 2.0, fetched from apache.org), `NOTICE`, `CONTRIBUTING.md` with the DCO.
- `build-sessions/TASKS.md`, the running task list; `CLAUDE.md` and `AGENTS.md` tell every session to keep it current.
- The §8 amendments: architecture, PRD, build spec, facts and product spec each carry a dated "amended by the brief" line and the specific changes; `docs/lakelet-build-sessions.md` deleted; `build-sessions/lakelet-build-sessions.md` rewritten with the merged sessions, the new order and the new starting prompt. Root `.gitignore` gained the Python entries.

Test output, `cd core && uv run pytest`: 4 passed in 0.13 s, on Python 3.13.13, DuckDB 1.5.5, pyiceberg 0.12.0. `uv run ruff check .` and `ruff format --check .` clean. `uv run lakelet --version` prints `lakelet 0.1.0.dev0`.

Gate status: passes on this Mac; the Ubuntu half of the gate and the CI extension cache are verified on the first push. `grep` for the stale pointers the brief names returns nothing.

## 8. Step 1, built

Assumptions stated before starting: the REST surface is whatever DuckDB 1.5.5 and pyiceberg 0.12 actually request, discovered by the tests; the first test written is DuckDB `CREATE TABLE` and `INSERT` through the embedded server to a `file://` warehouse; a failure there stops the work rather than starting the S3 shim.

What exists now, under `core/lakelet/catalog/`:

- `store.py`: SQLAlchemy Core schema (namespaces, tables with `leased_until`, meta), WAL and busy timeout on SQLite, compare-and-swap `update_table`.
- `commit.py`: pyiceberg does the Iceberg half; mirrors `MetastoreCatalog.commit_table`: validate requirements, `update_table_metadata`, write `<version>-<uuid>.metadata.json` through `load_file_io`.
- `server.py`: the routes; pyiceberg's request and response models where they fit; an own `CreateTableBody`; single-level namespaces as a 400; a staged create committed through the single-table endpoint with `assert-create`; the transactions endpoint; local `data/` and `metadata/` directories made at stage time.
- `embedded.py`: uvicorn in a thread on a loopback port.
- Tests: `test_step1_catalog.py` (pyiceberg round trip, stale commit, namespace 400), `test_step1_duckdb.py` (create, insert, select, write matrix, long-lived attach, forced 409), `test_step1_concurrency.py` (ten processes, one embedded catalog each, 100 appends), `test_step1_s3.py` (Moto in the default suite, real endpoint by env var), `test_step1_postgres.py` (skipped without `LAKELET_TEST_PG_URL`), and `catalog_helpers.py`.

Findings, each also recorded in the brief (D5, D9, D23, §7):

| Question the brief asked | Answer |
|---|---|
| Does DuckDB attach a `file://` warehouse and write through it? | Yes. CREATE, CTAS, INSERT, MERGE INTO, RENAME, DROP, CREATE SCHEMA, USE all work. No S3 shim |
| Does DuckDB retry a 409? | No. One commit attempt, then `TransactionException`; the table stays consistent. pyiceberg retries four times |
| Does a long-lived attach see another process's table? | Yes, without re-attaching |
| Does CTAS work? | Yes |
| Does `USE lakelet.main` work? | Yes, with `DEFAULT_SCHEMA 'main'` on the attach, which DuckDB also needs before it will create tables at all |
| Format version and delete files | DuckDB creates V2; MERGE INTO writes Parquet position deletes |
| 100 concurrent-process commits | All landed; two conflicts retried by pyiceberg |

Three things the first hour taught that no document had: pyiceberg's own `CreateTableRequest` model rejects its own client's request (no `location`); DuckDB commits a staged create through the per-table commit endpoint with `assert-create`, not through the transactions endpoint, but commits data through the transactions endpoint; and DuckDB does not create the `data/` directory on a local warehouse.

One deviation from the brief: revision 3's `BEGIN IMMEDIATE` is gone. The compare-and-swap update alone is the concurrency guarantee, and holding a write lock while a metadata file is written to S3 would have blocked other writers for nothing. D5 now says so.

Test output, `cd core && uv run pytest`: 14 passed, 1 skipped in 8.3 s. `ruff check` and `ruff format --check` clean.

Gate status: the `file://` matrix, the second client, the multi-process commits, the 409 path and the `s3://` variant all pass on this Mac. Still pending: Ubuntu (first push) and the Postgres variant (needs a server; `LAKELET_TEST_PG_URL`).

## 9. Postgres, verified; compose for what the default suite does not need

Hants asked whether Docker Compose should cover the pieces not yet checked. Docker 29 and Compose v5 are on this machine, so the answer was to close the gap now, minimally: `compose.yaml` at the root with one service, Postgres 16 on host port 5433 with data on tmpfs, plus a `postgres` job in `core-ci.yml` that runs the dialect test against a service container on every push. The default suite still needs no Docker (brief D16).

Result: `tests/test_step1_postgres.py` passed in 2.5 s against the container with `LAKELET_TEST_PG_URL=postgresql+psycopg://lakelet:lakelet@127.0.0.1:5433/lakelet`. The container was stopped afterwards. CONTRIBUTING, `CLAUDE.md` and `AGENTS.md` carry the one-liner.

Not added, on purpose: a self-hosted S3 store (Moto covers the default suite and the env var is generic for a real endpoint) and Spark or Trino (the `catalog serve` smoke test is session 10, and that is where they join the compose file).

Step 1's gate is now complete on this machine except the Ubuntu runner, which the first push exercises.

## 10. RustFS, Spark and Trino

Hants asked for the self-hosted S3 store and for Spark or Trino, or both. Both, all verified:

- **RustFS** (Apache 2.0) is the `s3` service in `compose.yaml`. Its image runs as a non-root user, so `/data` is a named volume rather than tmpfs. The two `s3://` catalog tests pass against it with `LAKELET_TEST_S3_ENDPOINT=http://127.0.0.1:9000`: pyiceberg's multipart metadata writes and DuckDB's data-file writes both hold.
- **The `engines` profile**: Lakelet's catalog served from the mounted `core/` inside the compose network (`tests/smoke/serve_catalog.py`, test infrastructure that binds 0.0.0.0 in its container; the product still binds loopback, D22), Spark 3.5.3 with the Iceberg 1.9.2 runtime from Maven cached in a volume, and Trino with the Iceberg connector, all against the RustFS warehouse. Config in `compose/spark/` and `compose/trino/`.
- **The smoke test**, `tests/smoke/test_engines.py`, gated by `LAKELET_SMOKE=1`: pyiceberg creates `main.orders` with three rows; Spark counts 3 and inserts a row; pyiceberg sees 4; Trino counts 4 and inserts a row; pyiceberg sees 5; DuckDB on the host, attached to the same catalog with an S3 secret, sees 5. Passed in 11 s once the images and jars were cached.

One server fix came out of it: the Java client omits `identifier` on the per-table commit endpoint, which pyiceberg's `CommitTableRequest` model requires, so `server.py` now carries its own `CommitTableBody` with `identifier` optional, the same pattern as the create body. The step 1 suite still passes after the change.

This is PRD F0.7's acceptance criterion, "Spark 3.5 and Trino read and write a Lakelet-created table", met at step 1 instead of session 10. Session 10 repeats it through the real `catalog serve` verb, and how a loopback-only verb is reached from a container is a question for then; the compose network sidesteps it today.

Containers are down; the named volumes (RustFS data, the catalog's venv, the uv cache, Spark's ivy cache) are kept so the next run is fast. `docker compose --profile engines down -v` removes them.

## 11. Step 2, built

Assumptions stated before starting: `init` lays out §3.2 and installs the extensions (D33), refusing to overwrite an existing `dbt_project.yml`, `.gitignore` or `AGENTS.md`; `open` starts the embedded catalog and attaches DuckDB with `DEFAULT_SCHEMA 'main'`; the disk-throughput probe (D36) waits for step 5; the CLI verbs wait for step 7.

What exists now:

- `lakelet/config.py`: pydantic models for the four sections the core reads, `extra="allow"` on each so unknown keys survive, and every other section carried in `Config.extra`. `render_default` writes §3.3's file with the `burst` and `agents` sections present for the sessions that read them.
- `lakelet/engine.py`: the DuckDB connection; `LOAD` of the three extensions with a clear error naming `lakelet init` if they are missing; `memory_limit` and `threads` from config; the attach with `DEFAULT_SCHEMA 'main'` and `USE lakelet.main`; JSON profiling on with the metrics step 4 needs, written to `.lakelet/last-profile.json`; `install_extensions()` for `init`, which reports what it downloaded and where.
- `lakelet/project.py`: `Project.init` (the layout, `.gitignore` lines appended not overwritten, `AGENTS.md` with the tables markers, a minimal `dbt_project.yml` when absent, the `main` namespace, the extensions) returning an `InitReport` the CLI will print; `Project.open` owning the catalog thread and the engine; `identifier()` implementing D36's naming rule; `warehouse_url` resolving a relative warehouse to `file://`.
- Tests: `test_step2_project.py`, eight tests including the gate (bare names, both spellings, the profiler's `system_peak_buffer_memory` and a scan with `operator_rows_scanned`); `test_step2_dbt_spike.py` with `tests/dbt_plugin.py`.

The spike: dbt-core 1.12.4 and dbt-duckdb 1.11.0 resolved from PyPI. A dbt-duckdb plugin's `configure_connection` hook attaches the catalog on every connection dbt opens; the profile is `:memory:` with `schema: main` and the model sets `database='lakelet'`. An incremental `merge` model with `unique_key='id'` ran twice: two rows, then a merged update and a new row, three rows with the update applied. The medallion page's central claim has evidence, and session 9 starts from a working attach rather than an open question.

Test output: `uv run pytest tests/test_step2_project.py` 8 passed in 1.3 s; the spike 1 passed in 3.3 s.

Deferred, on purpose: the D36 throughput probe (step 5, where the gauge reads it) and the CLI's `init` line naming the extension download (step 7; `InitReport` carries it). Added as a dev dependency: `pyyaml`, to check the generated `dbt_project.yml`.

## 12. Step 3, built

Assumptions stated before starting: every file type goes through DuckDB's own reader into `CREATE TABLE AS` through the catalog; the §3.7 coercion needs a parser for DuckDB's type strings so nested types are handled element by element; `replace` drops and recreates (D16); the 200 MB and 2 GB CSV timings are generated fixtures gated behind `LAKELET_PERF=1`.

What exists now:

- `lakelet/types.py`: a small recursive-descent parser for DuckDB type strings (scalars, `DECIMAL(p,s)`, lists and fixed arrays, `STRUCT` with quoted names, `MAP`, `UNION`, `ENUM`), the §3.7 table, and `coerce()` returning the DuckDB type to cast to, the Iceberg type, and notes where something is lossy.
- `lakelet/tables.py`: `preview`, `import_file` with `create`, `replace` and `append`, `import_dir` (one table per file, collisions refused before any write), `list`, `describe` (columns, partitioning, freshness, last commit, snapshots, format version), `sample` with optional truncation, and the `AGENTS.md` block refresh.
- `lakelet/engine.py`: `run_with_retry` and `CatalogConflict` (D23).
- `lakelet/catalog/commit.py`: `MetadataIO.table_stats`, rows and bytes from the current snapshot's manifests.
- Tests: `test_step3_types.py` (every §3.7 row plus nested cases), `test_step3_import.py` (six file types read back through pyiceberg, preview, the three modes, folders, list, describe, sample, the refresh, the Parquet type fixture), `test_step3_perf.py` (gated).

Findings, also in the brief's §7: DuckDB's Iceberg writer honours every promised type, including `time`, `uuid` and the nested ones; DuckDB's Parquet writer stores `HUGEINT` as `DOUBLE`; DuckDB's snapshot summaries lack the totals Java writers add, so stats come from manifests; the excel extension writes `.xlsx`.

Timings, `LAKELET_PERF=1`, this machine (M-series, 64 GB, `memory_limit` 8 GB for the run):

| Fixture | Size | Rows | Import | Peak buffer memory | Budget |
|---|---|---|---|---|---|
| 200 MB CSV | 173 MB | 4.5 M | 0.1 s | 472 MB | 10 s |
| 2 GB CSV | 1,779 MB | 45 M | 0.6 s | 640 MB | 90 s |

The file was in the page cache and this machine has many cores, so these are not the reference laptop's numbers; the row counts from the manifests confirm the data landed. Re-run on a 16 GB machine before quoting them.

Test output: `uv run pytest` 75 passed, 4 skipped (Postgres, smoke, and the two timings, all env-gated) in 14 s.

## 13. Step 4, built

Assumptions stated before starting: the profiler's per-scan counters and EXPLAIN's scan nodes are enough to attribute actuals to tables; a statement is recorded whether or not it succeeds; the gauge itself is step 5, so `Result.estimate` stays `None` and the estimate columns stay null.

What exists now:

- `lakelet/history.py`: the §3.4 schema on SQLAlchemy Core in `.lakelet/history.db` (`runs`, `question_runs`, `corrections`, `meta`), `Run` as a dataclass, `record`, `recent`, and the question bookkeeping step 6 needs.
- `lakelet/query.py`: `normalise`, `sql_hash` and `fingerprint` (D10); `Result`, which streams `pyarrow.RecordBatch` through `to_arrow_reader`, retries a catalog conflict up to three times (D23), samples process RSS on a thread, reads the profile at exhaustion and records the run; `query()`, which plans, resolves the tables read and their snapshot ids, takes the machine profile, and runs.
- `lakelet/gauge/inputs.py`: `plan_json`, `scan_nodes`, `operator_counts`, `base_tables`, `machine_profile`, `machine_hash`, `parse_memory`.
- `lakelet/gauge/manifests.py`: per-file stats from the current snapshot's manifests and bytes per row for projected columns, the seed of step 5's pruning and cache.
- `Project.query`, `Project.history`.
- Tests: `test_step4_query.py`, nine of them.

Findings, also in the brief's §7: the Iceberg scan's `operator_rows_scanned` is rows times threads, so derived bytes use the scan's output cardinality; `json_serialize_sql` serialises only `SELECT`, so write statements get a keyword scan for their tables; planning failures no longer block execution and are recorded with DuckDB's error; the RSS cross-check has its own column.

Test output: step 4 9 passed in 5.2 s; `uv run pytest` 84 passed, 4 skipped in 19 s.

## 14. Step 5, built

Probed first: DuckDB's filter renderings, the scan counter with more files, pyiceberg's planning time. Then built:

- `lakelet/gauge/predicates.py`: DuckDB's pushed-down filters into pyiceberg expressions; conjuncts split at the top level, `optional:` stripped, comparisons with cast suffixes, IN lists, null checks, bare booleans, `OR`, `NOT`, LIKE operators and function-of-column predicates understood; anything else dropped and counted, so `pruning` is `full`, `partial` or `none`.
- `lakelet/gauge/manifests.py`: one `StaticTable` per (table, snapshot) in memory, whole-table stats and per-column byte shares on disk, pruning through `plan_files`, with a binding failure falling back to the whole table.
- `lakelet/gauge/model.py`: the three numbers, spill, the verdict from the config thresholds, and the burst half over the worker ladder (D29); the constants are v0.
- `lakelet/gauge/verdict.py`: the site's words and the sentence.
- `lakelet/gauge/inputs.py`: the throughput probe (D36) and the machine cache.
- `lakelet/query.py`: `estimate()`, the estimate feeding the run, `RedRefused`, and actual bytes on the estimate's own terms.
- Tests: `test_step5_gauge.py` (21) and `test_step5_tpch.py`, the SF1 harness, in the default suite.

TPC-H SF1 on this machine, second run after tuning:

| Measure | Result | Gate |
|---|---|---|
| Within 2× on time | 18 of 22 | 80% |
| Within 1.5× on bytes | 22 of 22 | 80% |
| Pruning full | 22 of 22 | all |
| Green over 3 minutes | none | none |
| Estimate with warm caches | 4 to 6 ms | 150 ms |

The first run was 7 of 22 on time with Q21 at 42×; halving the CPU constants and capping a node's rows at four times the largest scan fixed it. The time constants are tuned to this 18-thread machine, so the harness asserts time accuracy only under `LAKELET_TPCH=1`, the reference run, and the reference laptop run is on the task list.

Test output: `uv run pytest` 110 passed, 4 skipped in 43 s. Two step 4 expectations changed with the gauge in place: the estimate columns are now filled, and actual bytes are defined on the estimate's terms.

## 15. Step 6, built

Assumptions stated before starting: slugs follow D36 with underscores; the two default checks are a model-level `returns_rows` generic test plus `not_null` on the first column; saved questions materialise as tables because the Iceberg catalog has no views; PyYAML moves to runtime to write `schema.yml`.

What exists now: `lakelet/questions.py` (`save`, `get`, `list`, `run`), `Project.questions`, a `question_slug` hook on `Result` that records `last_run` in history when the result completes, and `+database: lakelet` in the `dbt_project.yml` that `init` writes. Tests: `test_step6_questions.py`, six of them, including `dbt parse` on the generated project and `dbt test` passing both checks against the question's table.

Two findings for session 9, both in the brief's §7: dbt-duckdb runs models on cursors that do not inherit the session's `USE`, which the plugin's `configure_cursor` hook fixes; and dbt's `table` materialisation renames a temp table, which the Iceberg catalog refuses inside one transaction, so question tables are built by Lakelet for now and session 9 owns the materialisation question.

Test output: step 6 6 passed; `uv run pytest` 116 passed, 4 skipped in 54 s.

## 16. Step 7, built

Assumptions stated before starting: the gauge line on stderr and rows on stdout, a table on a terminal and CSV when piped, JSON as one object per line; `--format parquet` needs `--output`; `catalog serve` refuses non-loopback hosts (D22); `audit network` runs the quickstart in a subprocess with the guards in place and refuses to run before the extensions are installed.

What exists now: `lakelet/cli/__init__.py`, one verb per core operation (`init`, `import` with `--preview`, `--replace`, `--append`, `tables list|describe|sample`, `sql`, `estimate` with `--json`, `catalog serve`, `question save|list|run`, `gauge history`, `audit network`), plus `lakelet/cli/__main__.py` so the CLI runs as a subprocess; `lakelet/audit.py`; a `LAKELET_HTTP_PROXY` hook in the engine. Tests: `test_step7_cli.py`, eleven of them.

The audit took three attempts to make honest. Reading DuckDB's HTTP log from a file failed because `http_logging_output` is deprecated in 1.5.5; reading `duckdb_logs` in memory produced no httpfs rows, which would have made the DuckDB half of the audit a zero without observation. The channel that works is a loopback proxy the engine is pointed at with `SET http_proxy`: DuckDB honours it, the proxy forwards loopback targets and refuses the rest, and a self-check against a non-routable address proves it sees traffic before the quickstart runs. The Python socket guard self-checks the same way.

Measured: `lakelet sql` from process start to exit, best of three, 0.81 s against the 1 s budget; the audit's quickstart makes zero outbound attempts at either layer.

Test output: step 7 11 passed in 12.6 s; `uv run pytest` 127 passed, 4 skipped in 67 s.

## 17. Step 8, built

Assumptions stated before starting: S3 settings from the standard AWS environment and never from `lakelet.toml`; the `aws` extension joins the three so the default credential chain works without keys; registration through our own catalog with pyiceberg's `add_files`; immutable objects from S3 cached on disk; drift and path-only hive partitions refused by name.

What exists now: `lakelet/remote.py` (settings, the pyiceberg properties, the DuckDB secret, pyarrow file systems), `lakelet/register.py` (`discover`, `attach_prefix`, `attach_metadata`, `refresh`, the bandwidth probe), `Tables.attach`, `refresh` and `discover`, a `CachingFileIO` in the manifest cache, locality and source on the table stats, the three CLI verbs, and the fourth extension in `init`, CI and the audit. Tests: `test_step8_remote.py`, eight in the default suite on Moto and one gated ten-thousand-file fixture.

Findings, also in the brief's §7: locality must come from the data files, not the metadata location, or a locally-registered remote table would read as local; DuckDB-written and pyiceberg-written manifests differ in what they carry, and the footer route from step 5 covers both; a 60 KB fixture is not Red at 0.5 Mbps, which the first version of the test got wrong.

Test output: `uv run pytest` 135 passed, 5 skipped in 71 s; the second estimate on a bucket-metadata table 17 ms.

The gated ten-thousand-file fixture crashed Moto at file 3,119, so it ran against RustFS from `compose.yaml`: written in 22 s, registered in 16 s. That is the number the brief's one-day limit was guarding, and it is minutes, not days.

## 18. Step 9, built

Assumptions stated before starting: one loopback server per process carries the catalog and the API (D3), so `Project.open` gained a serve mode; every `/api` route needs the per-launch bearer token and `/v1` stays open (D22); CORS for the Tauri origins only; Arrow IPC results with the verdict in headers; 409 for a refused Red and for a catalog conflict, with distinct error codes; requests that touch the engine serialised by a lock.

What exists now: `lakelet/api/__init__.py` (the router, the Arrow stream, the error shapes), the serve mode in `Project` with `serve.json`, and `lakelet serve` on the CLI. Tests: `test_step9_api.py`, eight of them.

Two things that bit: the JSON error helper had `JSONResponse`'s arguments reversed, which turned every intended 409 into a 500; and pyarrow's IPC writer treats a Python sink without a `closed` attribute as closed, so the stream generator died on its first write until the sink grew the small file-like surface pyarrow expects.

Test output: step 9 8 passed. The full suite ran while the machine was under load, a load average of 64 on 18 cores from other work on this Mac (a uvicorn service at full CPU, an OCR experiment, OpenMetadata containers), none of it Lakelet's: 165 s instead of about 63 s, and only the startup-budget timing missed, at 1.48 s against a measured 0.81 s earlier in the day. That test now skips itself when the one-minute load average exceeds the core count, so it fails only when it can measure. The credential chain was checked as a suspect and cleared: DuckDB evaluates it lazily, and creating the secret takes no time.

The final full-suite run, still under that load: 140 passed, 8 skipped in 139 s. The eight skips are the five gated fixtures (Postgres, the engines smoke test, the two CSV timings, the ten-thousand-file registration) and the three budget assertions that skip themselves under load (startup, and the second-estimate budgets of steps 5 and 8). Every functional test passed. One tooling note for the next session: `pyproject.toml` already sets `-q` for pytest, so passing `-q` again makes it `-qq` and hides the summary line; several "silent" runs today were that.

## 19. Where core v0 stands at the end of September 8

All nine steps of the brief are built and their gates pass on this machine. The §6 definition of done still has three items that need something other than this Mac: the ten-minute quickstart on a clean Mac and a clean Ubuntu, CI green on both runners (nothing has been pushed yet), and the timing gates re-run on the reference laptop (the CSV imports, the ten-thousand-file registration, and the TPC-H time table, whose constants were tuned here). Those are on the task list, first.
