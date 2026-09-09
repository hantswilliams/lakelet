# Lakelet core v0 — build brief

*v0.2 · September 7, 2026 · Supersedes the v0.1 planning draft. Decisions in §1 are made; the rest of the file follows from them.*

This is the brief for the first build sessions. It resolves the conflicts between the existing docs in favour of what serves the product long term while keeping the first beta small enough to ship in weeks with one or two people. Where it changes a decision in another doc, §8 says which line to amend.

---

## 0. The idea in one paragraph

Your laptop is the warehouse until it can't be. One command turns a folder into a lakehouse: Iceberg tables on Parquet, a catalog that speaks the Iceberg REST spec, DuckDB as the engine. Before any query runs, the gauge says whether this machine can handle it and why, in one sentence. When it can't, one click sends only that job to the cloud under a cost cap you saw first. Burst, the team catalog, agents and the desktop app are heads on a local core. The core is the only place logic lives, so it has to be right first. This brief scopes that core.

---

## 1. Decisions

Each one states the call, the reason, and what it costs. Numbers are referenced from the rest of the file.

**D1. One Python package.** `core/` is a uv project whose importable package is `lakelet`. `cli`, `api`, and later `mcp` are subpackages of it. There is no separate `cli/` directory.
*Why:* `pipx install lakelet` has to produce the CLI. A split package buys nothing until the app sidecar needs to exclude something, and that is a build flag, not a repo layout.

**D2. Python core, confirmed. Rust only in the Tauri shell.** The catalog store and the gauge model sit behind small interfaces so a later Rust port replaces a module, not the design.
*Why:* The build spec and PRD already say this. Architecture §8 is the outlier and gets amended.

**D3. No daemon in v0.** The CLI runs the core in-process for the life of the command. The app runs the same core as a sidecar through `lakelet serve`. Both host one loopback HTTP server, uvicorn in a thread, that always carries the Iceberg REST catalog and, under `serve`, the API as well. The CLI takes an ephemeral port; `serve` writes its port and pid to `.lakelet/serve.json` so the app can find it. Several processes may open the same project at once: SQLite locking covers the store, and Iceberg's optimistic commit covers the tables.
*Why:* A persistent daemon means lifecycle, discovery and stale-process bugs on day one for no user benefit. The multi-process story is the same one the team catalog needs later, so it is not wasted.

**D4. "Embedded catalog" means that loopback server.** DuckDB's iceberg extension only speaks to a catalog over HTTP, so in-process still means a port. `lakelet catalog serve --port 8181` is the same app bound to a fixed port for Spark, Trino, pyiceberg and other DuckDBs.
*Why:* Every doc says "embedded" without saying how. This is how.

**D5. Catalog store on SQLAlchemy Core, no ORM.** One schema, SQLite now, Postgres when the team catalog ships. A `meta` table holds the schema version.
*Why:* PRD F0.7.3 promises the team catalog is a config change. That is only true if the SQL is written once against two dialects. One dependency, well known, and it is the dependency the control plane will use anyway.

**D6. Conformance is tested, not claimed.** The catalog implements the Iceberg REST spec's paths and JSON shapes exactly. pyiceberg's `RestCatalog` is the second client in the test suite from step 1.
*Why:* "Any engine can read what Lakelet writes" is the no-lock-in argument. A second independent client is the cheapest proof.

**D7. History lives in `.lakelet/history.db`, separate from the catalog, and records from run one everything the calibration model will ever need** (schema in §3.4). Correction factors are a later reader of that table, not a v0 feature.
*Why:* Calibration data is the compounding asset (build spec §6). The catalog file is the one that becomes Postgres; history never leaves the laptop. Recording is cheap; backfilling is impossible.

**D8. Gauge v0 is the three numbers, the thresholds and the sentence.** Bytes scanned from manifests after pruning, peak memory from a plan heuristic, wall time from measured throughput. Local disk throughput is measured once at `init` and cached; the bandwidth probe runs when the first remote table is attached. No correction factors.
*Why:* Correction needs twenty runs per machine that do not exist yet. Shipping the sentence early is what earns those runs.

**D9. Bare table names work.** Imports land in namespace `main`. The engine attaches the catalog as `lakelet` and runs `USE lakelet.main`, so `select * from orders` works and `lakelet.main.orders` also works. Verified in step 2.
*Why:* Every mockup and doc writes bare names. No doc says how.

**D10. Fingerprint = sha256 of normalised SQL plus the sorted list of (table, snapshot id) it reads.** Same SQL on new data is a new fingerprint.
*Why:* The estimator's error is per plan per data, not per text.

**D11. Scope.** Remote tables read-only plus the bandwidth probe are in (step 8). `lakelet run` (dbt) and `lakelet publish` (S3 writes) are out; they move to sessions 9 and 8. A Red verdict can also come from a large local table, so the Green-to-Red demo works before step 8.
*Why:* Red has to be real for the idea to land. dbt against an attached Iceberg catalog and the S3 write path each carry their own risk, and neither is needed to prove the local half.

**D12. Public style from the first commit; repo private until Day 1.** Apache 2.0 headers, DCO, no secrets, no partner names in tests or fixtures.
*Why:* The product spec (the phase map) wins over the roadmap lines in architecture §8 and the facts file. Building as if public costs nothing and removes a scrub later.

**D13. Spikes 1 and 2 are not throwaway.** Spike 1 is the catalog's integration test. Spike 2 is the gauge's benchmark harness. Only spike 3 (Fargate economics) stays throwaway, and it can run in parallel from day one.
*Why:* The session plan has the first three sessions producing code that is then discarded and rewritten from session 4. The catalog and the estimator are the two hardest modules; write them once.

**D14. `init` writes `.gitignore`**: `warehouse/`, `.lakelet/`, `.DS_Store`. Commit `lakelet.toml`, `questions/`, `AGENTS.md`.

**D15. Dependencies.** Runtime: `duckdb>=1.5.3`, `pyarrow`, `sqlalchemy`, `fastapi`, `uvicorn`, `pydantic`, `typer`, `rich`. Dev: `pytest`, `ruff`, `pyiceberg` (as the conformance client). pyiceberg becomes a runtime dependency only if DuckDB's own `iceberg_metadata()` and `iceberg_snapshots()` cannot feed the gauge; step 1 answers that. DuckDB extensions autoload from DuckDB's repository on first use, which is one documented network fetch; bundling comes with the installers in session 10.

**D16. Simplifications for v0.** Folder import is one table per file (the prefix-merge heuristic in PRD F0.1.2 is a SHOULD and waits). Schema preview is `import --preview`. `s3://` tests run only when `LAKELET_TEST_S3_ENDPOINT` is set (MinIO), so the default suite needs no Docker. The auto-chart is the app's job; the core returns Arrow and column types.

**D17. Every core operation has a CLI verb with the same name and arguments.** The session plan's "Copy as command" rule, made a design constraint. The HTTP API is the same mapping over localhost.

**D18. Docs housekeeping.** `docs/` holds specs; `build-sessions/` holds plans and one file per session as they happen. `docs/lakelet-build-sessions.md` is deleted. Stale pointers in §8 are fixed. Done in step 0.

---

## 2. Scope

### In

| Area | What ships |
|---|---|
| Project | `init`, `open`; `lakelet.toml`; `AGENTS.md`; `.gitignore` |
| Catalog | Iceberg REST catalog on SQLAlchemy Core + SQLite; loopback server in every process; `catalog serve` on a fixed port |
| Engine | DuckDB 1.5.x with `iceberg`, `httpfs`, `excel`; attached as `lakelet`; `memory_limit` and `threads` from config |
| Tables | Import `.csv .tsv .parquet .json .jsonl .xlsx` and folders into Iceberg tables; list, describe, sample; replace or append on re-import; `--preview` shows the inferred schema and stops |
| Query | SQL in, Arrow record batches out; Red refused unless overridden; every run recorded |
| Gauge | Bytes scanned, peak memory, local wall time, verdict, one-sentence reason; thresholds from `lakelet.toml` |
| History | Every execution recorded with the full calibration schema; `gauge history` lists it |
| Remote, read-only | Attach an Iceberg table or Parquet prefix in `s3://` with the user's own AWS credentials; bandwidth probe; Red verdicts with the bandwidth sentence |
| Questions | Save, list, run `.sql` files with a YAML header in `./questions/` |
| CLI | `init import sql estimate catalog question gauge serve` |
| HTTP API | The same operations over localhost with Arrow IPC results; thin; exists so session 6 has something to build against |

### Out, and where it goes

| Deferred | Lands in |
|---|---|
| Burst client, control plane, worker, catalog lease | Session 8 |
| `publish` | Session 8 |
| `lakelet mcp` | Session 5 |
| Ask box and any LLM call | Session 7 |
| `lakelet run` and the dbt DAG | Session 9 |
| Correction factors, calibration sharing | Day 1, on the history data core v0 produces |
| Desktop app | Session 6 |
| Windows | Day 1 |

---

## 3. Architecture of the core

### 3.1 Process model

```
  CLI command (in-process, exits when done)         Desktop app
  ┌──────────────────────────────┐                 ┌─────────────┐  HTTP + Arrow IPC
  │ lakelet.cli                  │                 │ Tauri shell │ ───────────────────┐
  │  └ Project                   │                 └─────────────┘                    ▼
  │     ├ engine: DuckDB         │                                  ┌──────────────────────────────┐
  │     │   (iceberg ext ──REST──┐                                  │ lakelet serve (sidecar)      │
  │     └ loopback HTTP thread ◀─┘                                  │  └ Project                   │
  │        └ /v1/…  (catalog)    │                                  │     ├ engine: DuckDB         │
  └──────────────────────────────┘                                  │     └ loopback HTTP thread   │
                                                                    │        ├ /v1/…  (catalog)    │
                                                                    │        └ /api/… (operations) │
                                                                    └──────────────────────────────┘
        Both read and write the same project folder. Nothing else is shared.
```

One `Project` per process. The app opens one sidecar per project window. Other engines reach the catalog only when the user runs `catalog serve`.

### 3.2 The project on disk

```
acme/
  lakelet.toml
  AGENTS.md
  .gitignore              # warehouse/ .lakelet/ .DS_Store
  .lakelet/
    catalog.db            # Iceberg REST catalog state. Becomes Postgres in team mode
    history.db            # runs, calibration inputs, later the agent audit log. Never leaves the machine
    cache/                # manifest stats per snapshot, throughput and bandwidth probes, machine profile
    serve.json            # {port, pid} while `lakelet serve` is running
  warehouse/
    main/orders/
      metadata/           # vN.metadata.json, manifest lists, manifests
      data/               # *.parquet
  questions/
    revenue-by-month.sql  # YAML front matter: title, created, last_run
```

### 3.3 Configuration

Parsed with pydantic. Unknown keys are kept, not rejected, so a file written by a later version still opens here. Sections the core does not read yet are still validated so a file written today is valid in session 8.

```toml
[project]
name = "acme"
warehouse = "./warehouse"        # or s3://bucket/prefix, later

[catalog]
mode = "local"                    # local | team | external
# url = "https://..."

[engine]
memory_limit = "auto"             # DuckDB default, 80% of RAM
threads = "auto"

[gauge]
green_max_seconds = 60
yellow_max_seconds = 600
green_max_memory_fraction = 0.6
share_calibration = false         # CLI default off (PRD F0.3.9); the app flips it on first run

[burst]                           # parsed, unused in core v0
default = "prompt"
max_cost_per_run_usd = 5.00

[agents]                          # parsed, unused in core v0
allow = []
```

### 3.4 History schema (v0, `.lakelet/history.db`)

Every column the calibration model will need, recorded now. `runs` gets one row per `estimate` that was followed by an execution, and one row per refused Red.

| Column group | Columns |
|---|---|
| Identity | `id`, `ts`, `lakelet_version`, `duckdb_version`, `fingerprint`, `sql_hash` |
| What it read | `tables` (JSON: name, snapshot_id, locality, bytes_after_pruning), `operator_counts` (JSON: class → count) |
| Machine | `machine_hash`, `machine` (JSON: ram, memory_limit, cores, free_disk, on_battery), `throughput_local_mbps`, `bandwidth_mbps` |
| Estimate | `est_bytes`, `est_peak_mem`, `est_wall_local`, `est_wall_burst`, `est_cost_burst`, `verdict`, `reason` |
| Outcome | `ran`, `where` (local / burst / refused), `actual_bytes`, `actual_peak_mem`, `actual_wall`, `actual_cost`, `error` |

`corrections(machine_hash, operator_class, factor, n, updated)` exists and stays empty in v0. `meta(schema_version)`.

Never stored: SQL text, table names outside the local file, values. PRD F0.3.9 governs what the optional share sends; that is Day 1.

### 3.5 Modules

```
core/
  pyproject.toml
  lakelet/
    project.py          Project.init / Project.open; paths; owns the server thread and the engine
    config.py           lakelet.toml model (pydantic), defaults, forward-compatible parsing
    catalog/
      server.py         FastAPI app: /v1/config, namespaces, tables, load, commit-with-requirements, rename, drop
      store.py          SQLAlchemy Core schema and operations; optimistic concurrency on commit
      embedded.py       run the app in a thread on a loopback port; return the URL
    engine.py           DuckDB connection: extensions, ATTACH … AS lakelet, USE lakelet.main, limits
    tables.py           preview, import_file, import_dir, list, describe, sample, attach_remote
    gauge/
      inputs.py         EXPLAIN (FORMAT JSON); manifest stats; machine profile; throughput; bandwidth probe
      model.py          bytes scanned, peak memory, wall time (architecture §4.2)
      verdict.py        thresholds → Green / Yellow / Red; the reason sentence
    history.py          record, recent; the schema above
    query.py            gauge → refuse or execute → stream Arrow batches → record actual
    questions.py        save, list, run
    api/                /api/… over the same server: the operations below, Arrow IPC for results
    cli/                typer; thin; gauge line to stderr, results to stdout
```

Import direction: `cli` and `api` import everything else; nothing imports them. `catalog` knows nothing about DuckDB. `gauge` knows nothing about the CLI or the history store's SQL.

### 3.6 Interfaces

Python. The CLI verbs and the HTTP routes are this, one to one (D17).

```python
from lakelet import Project

p = Project.init("acme")                          # or Project.open(".")
p.tables.preview("orders.csv")                    # Schema, inferred types, sample rows
t = p.tables.import_file("orders.csv")            # TableInfo(name, rows, bytes, schema, location)
e = p.estimate("select ... from orders")          # Estimate(verdict, bytes_scanned, peak_memory,
                                                  #          wall_local, reason, plan, fingerprint)
r = p.query("select ... from orders")             # Result: iterates pyarrow.RecordBatch;
                                                  #         .estimate; .actual once complete
r = p.query(sql, allow_red=True)                  # override a Red verdict
p.questions.save("Revenue by month", sql)
p.history.recent(50)
p.catalog.url                                     # http://127.0.0.1:<port> while open
```

CLI. Exit codes per PRD F0.6.4: 0 ok, 2 Red refused, 1 anything else.

```
lakelet init [dir]
lakelet import <file|dir> [--name n] [--replace | --append] [--preview]
lakelet sql "<q>" | -f q.sql [--format table|csv|json] [--run-anyway]
lakelet estimate "<q>"
lakelet catalog serve [--port 8181]
lakelet question save "<title>" -f q.sql | list | run <slug>
lakelet gauge history [--last N]
lakelet serve [--port]
```

Gauge line: stderr, one line, colour and word together (PRD C3).

```
● Green · scans 2.1 GB · ~4 s
● Yellow · spills ~3 GB · ~2 min
● Red · scans 48 GB from s3://acme-data/events, ~34 min at your 190 Mbps
```

HTTP, loopback only, under `serve`.

```
GET  /api/tables            GET  /api/tables/{name}     POST /api/import     POST /api/preview
POST /api/estimate          POST /api/query   (Arrow IPC stream)
GET  /api/questions         POST /api/questions         POST /api/questions/{slug}/run
GET  /api/history
/v1/…                       the Iceberg REST catalog, same server
```

---

## 4. Build order

Each step ends with a test that stays in the suite.

| Step | Builds | Gate |
|---|---|---|
| 0 | Repo skeleton: `core/` uv project, ruff, pytest, LICENSE, CI. Docs housekeeping from D18 | `uv run pytest` passes; stale pointers gone |
| 1 | Catalog: store, server, embedded thread. Integration test: DuckDB 1.5.x `CREATE TABLE`, `INSERT`, `MERGE INTO` through it to a `file://` warehouse; pyiceberg reads the result; 100 concurrent commits lose nothing. MinIO variant behind the env var | **Load-bearing.** If `file://` fails, the local S3 shim (PRD D3) is decided here and only here |
| 2 | Project + engine + config: `init`, `open`, attach, `USE`, bare names | `select * from orders` runs after a manual `CREATE TABLE` |
| 3 | Import: five file types, folders, replace/append, preview | PRD F0.1 AC: 200 MB CSV ≤ 10 s; 2 GB CSV ≤ 90 s with no swap |
| 4 | Query + history: Arrow streaming, first 1,000 rows before completion, every run recorded with the §3.4 schema | A history row per run with actual bytes and time |
| 5 | Gauge v0 on local tables; the TPC-H harness from the `tpch` extension at SF1 | 80% within 2× on time and 1.5× on bytes; no Green over 3 min |
| 6 | Questions | Save, list, run with the gauge first |
| 7 | CLI over all of the above | Ten-minute quickstart on a clean Mac |
| 8 | Remote read-only + bandwidth probe | A large remote table returns Red with the bandwidth sentence |
| 9 | HTTP API + `serve` | Session 6 can start |

Spike 2 at SF10 and SF100, local and from S3, runs the step 5 harness at scale once step 8 exists. Spike 3 (one Fargate worker, real cost numbers) is independent and can run at any time.

This brief covers sessions 1, 2 and 4 of the session plan, merged.

---

## 5. Toolchain

| | On this machine |
|---|---|
| Python | 3.13.7 (Homebrew); floor for the package is 3.12 |
| uv | 0.11.8 |
| duckdb, pyiceberg | not installed; added in step 0 |
| Node, cargo | 25.9 and 1.95, for sessions 6 onward |

---

## 6. Definition of done

- **Quickstart.** On a clean Mac, under ten minutes: install, `init`, `import orders.csv`, `sql` returns Green and rows, `estimate` on a large table returns Red with its sentence, `catalog serve` and pyiceberg reads the table from another process.
- **Tests green.** Catalog conformance and concurrency, DuckDB write matrix on `file://` (and MinIO when configured), import matrix, TPC-H SF1 gauge accuracy, 2 GB CSV on the reference machine.
- **Budgets.** Gauge line within 150 ms for local tables with cached manifests (PRD C1). Query overhead beyond DuckDB under 50 ms.
- **Nothing hidden.** A test runs the whole local quickstart with the network disabled and passes, extensions pre-installed. The only network calls the core can make are the extension fetch, a remote table the user attached, and the bandwidth probe.

---

## 7. Known unknowns

- Whether DuckDB 1.5.3's iceberg extension will attach a REST catalog whose warehouse is `file://`. Step 1. Nothing in §3.5 beyond the catalog is written before this is known.
- Whether `USE lakelet.main` behaves as expected on an attached Iceberg catalog. Step 2. The fallback is a default search path set per connection.
- Whether DuckDB's metadata functions expose per-file column sizes and bounds, which the pruning estimate needs. Step 1. Decides whether pyiceberg is a runtime dependency.
- Whether the 150 ms gauge budget holds on the first keystroke against a never-read table. PRD F0.3 allows 800 ms uncached; the manifest cache in `.lakelet/cache/` is what makes the second one fast.
- Whether dbt-duckdb can target tables in an attached Iceberg catalog. Not core v0, but it sizes session 9.

---

## 8. What this changes in the other documents

| Document | Change |
|---|---|
| `build-sessions/lakelet-build-sessions.md` | Sessions 1, 2 and 4 merge into this brief; spikes 1 and 2 are real code (D13). Session 4's `run` moves to 9 and `publish` to 8 (D11). Monorepo line: drop `cli/`; `core/` holds the whole Python package (D1). "Local daemon" becomes "in-process for the CLI, sidecar for the app" (D3). Assign mockup screen 10 (Agents) to session 5. Fix the starting-prompt paths to `docs/lakelet-day0-prd.md` and `docs/lakelet-architecture.md`. Do not create `worker/` and `control-plane/` until session 8 |
| `docs/lakelet-build-sessions.md` | Delete; identical copy (D18) |
| `docs/lakelet-architecture.md` | §8 first paragraph: Python core, Rust only in the shell (D2). §8 week 3–6: repo public in Day 1, not week 3 (D12). Header: drop the reference to `lakelet-local-first-lakehouse.md` |
| `docs/lakelet-day0-prd.md` | F0.7.2: "embedded" means a loopback HTTP server in the process (D4). F0.3.6: history is `.lakelet/history.db` with the §3.4 schema (D7). F0.6.1: `run` and `publish` are not in the first CLI (D11). Add: `init` writes `.gitignore` (D14) |
| `docs/lakelet-v0-build-spec.md` | §7: remove the reference to `status.md` |
| `docs/facts-and-messaging.md` | Roadmap wk 3–6: "CLI v0 to design partners; public repo in Day 1" (D12) |
| `docs/lakelet-product-spec.md` | No change; this brief follows it |

These edits are step 0 and are not applied yet.
