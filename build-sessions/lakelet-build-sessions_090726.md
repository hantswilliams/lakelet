# Lakelet — build session log, September 7, 2026

*Planning session, before any code · Hants and Claude (Fable 5.1) · Produced `build-sessions/core-v0.1-plan.md` · Nothing in `core/` exists yet*

This is the record of the session that reviewed the core v0 build brief and produced its successor. It is written so that someone who was not in the room can see what was checked, what was found, what changed, and what is still open. Measurements are reproducible from §3.

---

## 1. What this session was for

Review `build-sessions/core-v0-plan.md` (v0.2) with fresh eyes before the first build session, calling out bad and good decisions early. Then produce a revised brief that resolves the findings. Then think through the one product-level gap the review surfaced: how the partner's S3 bucket shows up as tables in the four-minute demo.

## 2. What was read

`build-sessions/core-v0-plan.md`, `build-sessions/lakelet-build-sessions.md`, `docs/lakelet-architecture.md`, `docs/lakelet-day0-prd.md`, `docs/lakelet-v0-build-spec.md`, `docs/lakelet-product-spec.md`, `docs/facts-and-messaging.md`, `docs/lakelet-agent-first-strategy.md`, `.gitignore`.

## 3. Measurements taken

All on this machine against PyPI on September 7, 2026, in the session scratchpad, with `uv run --with …`. Nothing was installed into the project.

| # | Question | Result |
|---|---|---|
| 1 | Which DuckDB does PyPI serve, and what do the Iceberg metadata functions expose? | DuckDB 1.5.5. `iceberg_metadata()` returns manifest path, manifest sequence number, manifest content, status, content, file path, file format, record count. No file size, column sizes or bounds. `iceberg_snapshots()` returns sequence number, snapshot id, timestamp, manifest list, operation |
| 2 | Can pyiceberg prune and report what the gauge needs? | pyiceberg 0.12.0. `plan_files()` with `id >= 4` on a two-file table returned one file with file size, record count and per-column sizes |
| 3 | Does DuckDB read a `file://` metadata location? | Yes, `iceberg_metadata('file:///…metadata.json')` reads directly |
| 4 | Does EXPLAIN's estimated cardinality reflect manifest pruning? | No. A filter keeping 2 of 5 rows in 1 of 2 files reported estimated cardinality 1. It is a generic selectivity guess |
| 5 | Does pyiceberg expose what a REST catalog server needs? | Yes: `pyiceberg.catalog.rest` has `CommitTableRequest`, `CommitTableResponse`, `CreateTableRequest`, `TableResponse`, `RegisterTableRequest`, `ConfigResponse`; `pyiceberg.table.update` has eight `Assert*` requirement classes with `validate()`, twenty-one `*Update` classes, `update_table_metadata()`, `new_table_metadata()` |
| 6 | What does DuckDB's profiler expose per query? | Top level: `latency`, `rows_returned`, `cumulative_rows_scanned`, `system_peak_buffer_memory`, `system_peak_temp_dir_size`. Per operator: `operator_rows_scanned`, `operator_cardinality`, `operator_timing` |
| 7 | Does the no-auth Iceberg REST attach parse? | `ATTACH '' AS lakelet (TYPE ICEBERG, ENDPOINT 'http://127.0.0.1:<port>', AUTHORIZATION_TYPE 'none')` parses and calls `GET /v1/config`; a non-empty attach path is passed as `?warehouse=` |
| 8 | Is `read_xlsx` available? | Yes, once the `excel` extension is installed and loaded |
| 9 | Does `json_serialize_sql` exist as a fallback for predicate extraction? | Yes |
| 10 | Does psutil detect battery and RAM on this Mac? | Yes |
| 11 | Can DuckDB read an Iceberg table registered in place over plain Parquet with no field IDs? | Yes. pyiceberg `add_files` over two such files took 0.09 s, set `schema.name-mapping.default`, kept metadata in a separate folder from the data, copied nothing. DuckDB read all five rows and a pushed-down filter returned the right count |

Reproduce 1 to 4:

```bash
uv run --with duckdb --with "pyiceberg[sql-sqlite,pyarrow]" python - <<'EOF'
import os, duckdb, pyarrow as pa, datetime as dt, json
from pyiceberg.catalog.sql import SqlCatalog
from pyiceberg.expressions import GreaterThanOrEqual
wh = os.path.abspath("wh"); os.makedirs(wh, exist_ok=True)
cat = SqlCatalog("t", uri=f"sqlite:///{wh}/cat.db", warehouse=f"file://{wh}")
cat.create_namespace("main")
t = cat.create_table("main.orders", schema=pa.schema([("id", pa.int64()), ("amt", pa.float64()), ("d", pa.date32())]))
t.append(pa.table({"id": [1,2,3], "amt": [1.,2.,3.], "d": [dt.date(2026,1,1)]*3}))
t.append(pa.table({"id": [4,5], "amt": [4.,5.], "d": [dt.date(2026,4,1)]*2}))
print([(x.file.file_size_in_bytes, x.file.record_count, dict(x.file.column_sizes))
       for x in t.scan(row_filter=GreaterThanOrEqual("id", 4)).plan_files()])
con = duckdb.connect(); con.execute("INSTALL iceberg; LOAD iceberg")
loc = t.metadata_location
print([c[0] for c in con.execute(f"describe select * from iceberg_metadata('{loc}')").fetchall()])
plan = json.loads(con.execute(f"explain (format json) select * from iceberg_scan('{loc[7:]}') where id >= 4").fetchone()[1])
print(plan[0]["extra_info"].get("Estimated Cardinality"), con.execute(f"select count(*) from iceberg_scan('{loc[7:]}') where id >= 4").fetchone())
EOF
```

Reproduce 6:

```bash
uv run --with duckdb python - <<'EOF'
import duckdb, json
con = duckdb.connect()
con.execute("""SET custom_profiling_settings = '{"SYSTEM_PEAK_BUFFER_MEMORY":"true","SYSTEM_PEAK_TEMP_DIR_SIZE":"true","OPERATOR_ROWS_SCANNED":"true","CUMULATIVE_ROWS_SCANNED":"true","OPERATOR_CARDINALITY":"true","LATENCY":"true"}'""")
con.execute("SET enable_profiling='json'; SET profiling_output='prof.json'")
con.execute("create table t as select range i from range(2000000)")
con.execute("select count(*) from t where i > 1000").fetchall()
con.execute("SET enable_profiling='no_output'")
p = json.load(open("prof.json")); print(sorted(k for k in p if k != "children"))
EOF
```

Reproduce 11:

```bash
uv run --with duckdb --with "pyiceberg[sql-sqlite,pyarrow]" python - <<'EOF'
import os, duckdb, pyarrow as pa, pyarrow.parquet as pq
from pyiceberg.catalog.sql import SqlCatalog
wh = os.path.abspath("wh2"); os.makedirs(f"{wh}/raw/events", exist_ok=True)
pq.write_table(pa.table({"id": [1,2,3], "country": ["US","US","DE"]}), f"{wh}/raw/events/part-0.parquet")
pq.write_table(pa.table({"id": [4,5], "country": ["FR","US"]}), f"{wh}/raw/events/part-1.parquet")
cat = SqlCatalog("t", uri=f"sqlite:///{wh}/cat.db", warehouse=f"file://{wh}/meta")
cat.create_namespace("main")
t = cat.create_table("main.events", schema=pq.read_schema(f"{wh}/raw/events/part-0.parquet"))
t.add_files([f"file://{wh}/raw/events/part-{i}.parquet" for i in (0, 1)])
con = duckdb.connect(); con.execute("INSTALL iceberg; LOAD iceberg")
print(con.execute(f"select * from iceberg_scan('{t.metadata_location[7:]}') where id >= 4").fetchall())
EOF
```

## 4. Review findings on core-v0-plan.md (v0.2)

**Fix before step 1**

- The catalog server has to validate requirements, apply metadata updates, and write metadata files. v0.2 never mentioned it. pyiceberg ships all of it (measurement 5).
- pyiceberg is a runtime dependency, not a maybe. DuckDB's metadata functions cannot feed the pruning estimate (measurement 1), and the catalog needs pyiceberg regardless.
- Bytes scanned cannot come from EXPLAIN (measurement 4). Predicate translation for manifest pruning had no home in the plan.
- `duckdb>=1.5.3` had no ceiling while PyPI already serves 1.5.5, against an architecture doc that says to pin because the write path is young.
- The loopback server had no auth. Any local process, and any page via a fixed port, could reach the operations API.
- The REST endpoint list lacked the transactions commit endpoint DuckDB uses for writes, the register endpoint step 8 needs, and HEAD variants.

**Decisions to reverse or narrow**

- "Never stored: SQL text" would have broken the Recent panel, re-run, and the F0.9 agent audit story. The PRD forbids sharing SQL, not storing it.
- Remote Parquet prefixes in step 8 were a hidden project: no place in an Iceberg catalog, and no manifests for the gauge.
- `last_run` in a committed `.sql` file dirties git on every run.
- Exit code 4 belongs in v0 because concurrent commits exist from D3 onward.

**Gaps for steps 3 to 5**

- No measurement method for actual bytes and peak memory (answered by measurement 6).
- No DuckDB to Iceberg type coercion for import.
- Unknown whether DuckDB retries a 409 itself.
- Unknown whether a long-lived attach sees tables committed by another process.
- No CLI startup budget.

**Smaller inconsistencies**

`catalog attach` in neither In nor Out; Spark and Trino smoke test dropped silently; Ubuntu absent from CI and the definition of done; Postgres dialect never exercised despite D5's justification; config validated sections it did not read; `where` as a column name; replace-by-snapshot doubling disk with no expiry; `serve.json` staleness; the build spec's installer-size claim; `docs/` and `build-sessions/` are gitignored while the session plan says they are checked in.

**Decisions confirmed as right and not to relitigate**

D13 (spikes are real code), D3 and D4 (no daemon; embedded means a loopback server), D5, D6 and D7 together (catalog and calibration data real from the first commit), D9, D11, D16, D17, D12.

## 5. Outcome: core-v0.1-plan.md

Written as `build-sessions/core-v0.1-plan.md`. The filename was requested; inside, the brief calls itself v0.3 to continue the sequence from the v0.2 it supersedes. Same section structure as v0.2 so the two diff cleanly.

- Amended in place: D3 (`serve.json` carries a token, pid check, health check), D5 (WAL, busy timeout, compare-and-swap commit, Postgres behind `LAKELET_TEST_PG_URL`), D7 (SQL text stored, never shared), D8, D11, D15 (ranges, pyiceberg and psutil runtime), D16 (drop-and-recreate on replace, `AGENTS.md` refresh, `last_run` in history), D17 (`tables` verb).
- New: D19 catalog applies commits with pyiceberg; D20 predicates from the optimised plan's scan-node filters, unparsed conjuncts dropped in the safe direction; D21 actuals from the profiler; D22 loopback security, token on `/api`, `/v1` open on loopback in local mode with the reasoning written down; D23 conflict retry then exit 4; D24 explicit type coercion with a table in §3.7.
- Step gates updated for multi-process concurrency, 409 behaviour, long-lived attach visibility, `CREATE TABLE AS` support, coercion fixture, profiler actuals, a startup budget, auth checks, and the gitignore decision in step 0.
- §9 is a changelog tying every finding to its measurement and its resolution.

## 6. The four-minute demo discussion

**The problem.** PRD D2 step 3 points at the partner's bucket and shows `events` as a table. Core v0 step 8 registers Iceberg tables by metadata location only. Partners' buckets will hold Parquet after a warehouse export, not Iceberg. Demo step 6 and investor question A2 both require a real Iceberg table that Spark can read.

**The fact.** Measurement 11: DuckDB reads an Iceberg table registered in place over plain Parquet, nothing copied.

**Decision points, written up as R1 to R6 at the top of `core-v0.1-plan.md` with blank decision lines.**

| | Question | Recommendation |
|---|---|---|
| R1 | What shape is partner data in? | Accept Parquet in S3 as the premise; register-by-metadata-location is the right primitive but the wrong product verb |
| R2 | How does a prefix become a table? | D, register in place as Iceberg with pyiceberg `add_files`. A (publish) is demo-only, B (external catalog) serves a minority and moves to Day 1, C (Parquet views) is cheapest and voids the investor claim |
| R3 | Where does metadata live? | Local in v0, one flag to move it into the bucket when the burst worker needs it |
| R4 | Snapshot or live? | Snapshot, plus a `refresh` verb; scheduled refresh is Day 2 |
| R5 | Whose bucket is the demo? | A Lakelet-owned bucket prepared with the same attach verb partners use |
| R6 | When? | Core v0 step 8 |

Stated limits of D: schema drift across files fails registration; hive partition columns only in the path need parsing; Parquet only; tens of thousands of small files need a progress bar or a worker. The `s3://` FileIO variant of `add_files` was measured the next morning; see `lakelet-build-sessions_090826.md`.

## 7. Actions taken and not taken

Taken:

- Created `build-sessions/core-v0.1-plan.md` (v0.3).
- Added the R1 to R6 review block at the top of it and repointed the §7 demo bullet at the block.
- Created this file.

Not taken, on purpose:

- No edits to anything in `docs/` or to `core-v0-plan.md`; the §8 table in the new brief lists the edits and they are step 0.
- No change to `.gitignore`; both plan files are currently untracked because `build-sessions/` is ignored. Queued as a step 0 decision.
- No code, no `core/` directory, no dependencies added to the project.

## 8. Open for September 8

1. Fill in the six decision lines in the review block, then apply the change list at the end of the block.
2. Decide whether `docs/` and `build-sessions/` leave `.gitignore`.
3. Decide whether to rename `core-v0.1-plan.md` or its internal version so the two match.
4. Then step 0.
