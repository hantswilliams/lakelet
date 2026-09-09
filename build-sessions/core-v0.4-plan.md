# Lakelet core v0 — build brief

> **Superseded by `core-v0.5-plan.md` on September 8, 2026.** Do not build from this file.

*Plan revision 6 · September 8, 2026 · This file is `core-v0.4-plan.md`. It supersedes `core-v0.3-plan.md` (revision 5). Revision 4 applied the six remote-data decisions (D25 to D27). Revision 5 aligned the core with what the deck and the site promise, through twelve decisions, M1 to M12, which were reviewed and accepted on September 8; revision 6 records them as final. Nothing in this file is pending. Decisions in §1 are made; the rest of the file follows from them. §9 lists what changed and the evidence; §10 lists what changes on the site and in the deck.*

---

This is the brief for the first build sessions. It resolves the conflicts between the existing docs in favour of what serves the product long term while keeping the first beta small enough to ship in weeks with one or two people. Where it changes a decision in another doc, §8 says which line to amend.

---

## 0. The idea in one paragraph

Your laptop is the warehouse until it can't be. One command turns a folder into a lakehouse: Iceberg tables on Parquet, a catalog that speaks the Iceberg REST spec, DuckDB as the engine. Before any query runs, the gauge says whether this machine can handle it and why, in one sentence. When it can't, one click sends only that job to the cloud under a cost cap you saw first. Burst, the team catalog, agents and the desktop app are heads on a local core. The core is the only place logic lives, so it has to be right first. This brief scopes that core.

---

## 1. Decisions

Each one states the call, the reason, and what it costs. Decisions marked *(amended)* changed from the original brief. D19 to D24 were added in revision 3 after the review. D25 to D27 are the September 8 decisions on remote data. D28 to D33 come from the September 8 comparison with the deck and the site; the twelve decisions behind them, M1 to M12, were accepted the same day and are listed in §9. Numbers are referenced from the rest of the file.

**D1. One Python package.** `core/` is a uv project whose importable package is `lakelet`. `cli`, `api`, and later `mcp` are subpackages of it. There is no separate `cli/` directory.
*Why:* `pipx install lakelet` has to produce the CLI. A split package buys nothing until the app sidecar needs to exclude something, and that is a build flag, not a repo layout.

**D2. Python core, confirmed. Rust only in the Tauri shell.** The catalog store and the gauge model sit behind small interfaces so a later Rust port replaces a module, not the design.
*Why:* The build spec and PRD already say this. Architecture §8 is the outlier and gets amended.

**D3. No daemon in v0** *(amended)*. The CLI runs the core in-process for the life of the command. The app runs the same core as a sidecar through `lakelet serve`. Both host one loopback HTTP server, uvicorn in a thread, that always carries the Iceberg REST catalog and, under `serve`, the API as well. The CLI takes an ephemeral port; `serve` writes `{port, pid, token, started}` to `.lakelet/serve.json` with mode 0600 so the app can find it. The app treats the file as a hint, not a fact: it checks the pid is alive and that `GET /api/health` answers with the token before using it, and deletes a stale file. Health returns the Lakelet and DuckDB versions, the machine profile and the cached bandwidth, which is the status line on app screen 1 (M3). Several processes may open the same project at once: SQLite locking covers the store, and Iceberg's optimistic commit covers the tables.
*Why:* A persistent daemon means lifecycle, discovery and stale-process bugs on day one for no user benefit. `serve.json` is still a discovery file, so it gets the two checks that make discovery files safe. The multi-process story is the same one the team catalog needs later, so it is not wasted.

**D4. "Embedded catalog" means that loopback server.** DuckDB's iceberg extension only speaks to a catalog over HTTP, so in-process still means a port. `lakelet catalog serve --port 8181` is the same app bound to a fixed port for Spark, Trino, pyiceberg and other DuckDBs.
*Why:* Every doc says "embedded" without saying how. This is how. Verified on DuckDB 1.5.5: `ATTACH '' AS lakelet (TYPE ICEBERG, ENDPOINT 'http://127.0.0.1:<port>', AUTHORIZATION_TYPE 'none')` parses and goes straight to `GET /v1/config`.

**D5. Catalog store on SQLAlchemy Core, no ORM** *(amended)*. One schema, SQLite now, Postgres when the team catalog ships. A `meta` table holds the schema version. SQLite runs in WAL mode with a 5 s busy timeout. A table commit is one `BEGIN IMMEDIATE` transaction: read the row, validate the requirements, write the new metadata file, then `UPDATE tables SET metadata_location = :new, previous_metadata_location = :old WHERE … AND metadata_location = :old`. A rowcount of zero is a 409; the orphaned metadata file is harmless, which is the Iceberg convention. The same suite runs against Postgres when `LAKELET_TEST_PG_URL` is set.
*Why:* PRD F0.7.3 promises the team catalog is a config change and that Postgres is validated in a test. That is only true if the SQL is written once against two dialects and the second dialect is actually exercised. The compare-and-swap update is the entire concurrency story, so it is spelled out here rather than discovered in step 1.

**D6. Conformance is tested, not claimed.** The catalog implements the Iceberg REST spec's paths and JSON shapes exactly. pyiceberg's `RestCatalog` is the second client in the test suite from step 1.
*Why:* "Any engine can read what Lakelet writes" is the no-lock-in argument. A second independent client is the cheapest proof.

**D7. History lives in `.lakelet/history.db`, separate from the catalog, and records from run one everything the calibration model will ever need** *(amended)*. Schema in §3.4. It includes the SQL text. The privacy rule is that nothing in `history.db` leaves the machine unless the user opts into sharing, and the share path (Day 1) sends the PRD F0.3.9 fields only. Correction factors are a later reader of that table, not a v0 feature.
*Why:* Calibration data is the compounding asset (build spec §6). The catalog file is the one that becomes Postgres; history never leaves the laptop. Recording is cheap; backfilling is impossible. v0.2 said SQL text was never stored, which would have broken the Recent panel in the mockups, "re-run", and the F0.9 promise that a founder can see exactly what an agent ran. The PRD forbids sharing SQL, not storing it, and the file is gitignored.

**D8. Gauge v0 is the three numbers, the thresholds and the sentence** *(amended)*. Bytes scanned from manifests via pyiceberg after pruning with the predicates DuckDB pushed down (D20). Peak memory from a plan heuristic over `EXPLAIN (FORMAT JSON)`. Wall time from measured throughput. Local disk throughput is measured once at `init` and cached; the bandwidth probe runs when the first remote table is attached. The burst half of the sentence is arithmetic over the same numbers (D29). No correction factors in core v0; a per-machine, per-operator-class ratio applied after twenty recorded runs arrives in session 10 (M7), and trained models on shared data are Day 1.
*Why:* Correction needs twenty runs per machine that do not exist yet. Shipping the sentence early is what earns those runs. Partners produce runs from week 8, so the simple ratio lands in the last Day 0 session rather than after it, which is what PRD F0.3.6 and app screen 5 promise.

**D9. Bare table names work.** Imports land in namespace `main`. The engine attaches the catalog as `lakelet` and runs `USE lakelet.main`, so `select * from orders` works and `lakelet.main.orders` also works. Verified in step 2.
*Why:* Every mockup and doc writes bare names. No doc says how.

**D10. Fingerprint = sha256 of normalised SQL plus the sorted list of (table, snapshot id) it reads.** Normalised means comments stripped, whitespace collapsed, keywords lower-cased, literals kept. Same SQL on new data is a new fingerprint. `sql_hash` is the same hash without the snapshot list, for "same query shape" lookups.
*Why:* The estimator's error is per plan per data, not per text.

**D11. Scope** *(amended)*. Remote tables in v0 are read-only Iceberg tables in `s3://`, reached two ways: a Parquet prefix registered in place as an Iceberg table (D25), and an existing Iceberg table registered by its metadata location, which is the primitive underneath. Both come with the bandwidth probe (step 8). `lakelet run` (dbt) and `lakelet publish` (S3 writes) are out; they move to sessions 9 and 8. `lakelet catalog attach` (external catalogs: Polaris, Lakekeeper, Glue, S3 Tables) moves to Day 1; it helps only the minority already on Iceberg. Parquet views over a prefix are not on the roadmap. Red on local data in tests comes from lowered thresholds in the test project's `lakelet.toml`; a real Red on a laptop is the bandwidth verdict in step 8 or a query whose peak memory exceeds free RAM plus disk in spike 2.
*Why:* Red has to be real for the idea to land. dbt against an attached Iceberg catalog and the S3 write path each carry their own risk, and neither is needed to prove the local half. Partner data arrives as Parquet in S3 (decision R1, September 8), so the remote path partners actually use has to exist before they onboard, and it has to produce a real Iceberg table because demo step 6 and investor question A2 need Spark to read it through the catalog.

**D12. Public style from the first commit; repo private until Day 1.** Apache 2.0 headers, DCO, no secrets, no partner names in tests or fixtures.
*Why:* The product spec (the phase map) wins over the roadmap lines in architecture §8 and the facts file. Building as if public costs nothing and removes a scrub later.

**D13. Spikes 1 and 2 are not throwaway.** Spike 1 is the catalog's integration test. Spike 2 is the gauge's benchmark harness. Only spike 3 (Fargate economics) stays throwaway, and it can run in parallel from day one.
*Why:* The session plan has the first three sessions producing code that is then discarded and rewritten from session 4. The catalog and the estimator are the two hardest modules; write them once.

**D14. `init` writes `.gitignore`**: `warehouse/`, `.lakelet/`, `.DS_Store`. Commit `lakelet.toml`, `dbt_project.yml`, `models/`, `AGENTS.md` (D30).

**D15. Dependencies** *(amended)*. Runtime, with ceilings: `duckdb>=1.5.3,<1.6`, `pyiceberg[pyarrow]>=0.12,<0.13`, `pyarrow`, `sqlalchemy>=2,<3`, `fastapi`, `uvicorn`, `pydantic>=2`, `typer`, `rich`, `psutil`. Dev: `pytest`, `httpx` (API tests), `moto[server]` and `boto3` (the in-process S3 server for the `s3://` matrix), `dbt-core` and `dbt-duckdb` (the step 2 spike and the step 6 `dbt parse` gate), `ruff`. pyiceberg is a runtime dependency because the catalog applies commits with it (D19) and the gauge prunes with it (D20). psutil supplies RAM, cores, free disk, battery state and process RSS. DuckDB extensions (`iceberg`, `httpfs`, `excel`) are installed by `init`, which announces the download on one line, and bundled by the installers in session 10; the core never fetches an extension at query time (D33).
*Why:* PyPI already serves DuckDB 1.5.5 against a floor written for 1.5.3, and the architecture doc's own risk section says to pin because the Iceberg write path is young. Ceilings are bumped deliberately, against the step 1 suite. v0.2 left pyiceberg as a maybe; §9 has the measurement that settles it.

**D16. Simplifications for v0** *(amended)*. Folder import is one table per file (the prefix-merge heuristic in PRD F0.1.2 is a SHOULD and waits). Schema preview is `import --preview`. `--replace` drops and recreates the table, losing that table's snapshot history, because a replace-by-new-snapshot leaves the old data files on disk until snapshot expiry and there is no expiry in v0; `--append` keeps history. `s3://` tests run in the default suite against Moto's threaded server started inside pytest, so the default suite needs no Docker and no credentials; setting `LAKELET_TEST_S3_ENDPOINT` points the same tests at a real S3-compatible endpoint for fidelity, a throwaway AWS bucket nightly or a self-hosted store. MinIO is not used anywhere: it is no longer maintained by the community. Moto is a mock and in-memory, which is right for tests and wrong for the product, so it is never the answer to PRD D3's shim question. The auto-chart is the app's job; the core returns Arrow and column types. `AGENTS.md` lists conventions and refreshes one marked block with the table list on every import, so it does not go stale. A saved question is a dbt-shaped file (D30); `last_run` lives in `history.db` keyed by slug, so running a question never dirties git.

**D17. Every core operation has a CLI verb with the same name and arguments.** The session plan's "Copy as command" rule, made a design constraint. The HTTP API is the same mapping over localhost. This adds `lakelet tables list | describe | sample | attach | refresh | discover` and `lakelet audit network` to the CLI; the original brief had the first four in the Python API and the HTTP API but not the CLI. `describe` returns columns, types, partitioning, freshness and last commit, which is what the MCP tool table on the agents page promises (M3).

**D18. Docs housekeeping.** `docs/` holds specs; `build-sessions/` holds plans and one file per session as they happen. `docs/lakelet-build-sessions.md` is deleted. Stale pointers in §8 are fixed. Done in step 0.

**D19. The catalog applies commits with pyiceberg's metadata machinery.** In the REST spec the client sends `requirements` and `updates`; the server validates the requirements against current metadata, applies the updates, writes the new `vN.metadata.json` into the warehouse, and returns it. The FastAPI layer is routing and the SQLAlchemy layer is state; the Iceberg semantics come from pyiceberg: request and response models from `pyiceberg.catalog.rest`, `TableRequirement.validate()` for the eight assert classes, `update_table_metadata()` for the twenty-one update classes, `new_table_metadata()` for create, and pyiceberg's FileIO to write metadata to `file://` and `s3://`. Verified present in pyiceberg 0.12.0.
*Why:* This is most of the "few thousand lines" the architecture doc budgets for the catalog, and the part where a bug becomes a data-format bug. v0.2 did not mention it. Writing it twice is how a catalog diverges from the spec; using the reference implementation is how it stays on it. The independent-client proof in D6 still holds because DuckDB is the writer under test.

**D20. Predicates for pruning come from the optimised plan, not from parsing SQL.** `EXPLAIN (FORMAT JSON)` puts `Filters` and `Projections` on each `ICEBERG_SCAN` node after the optimiser has resolved aliases, CTEs, subqueries and join pushdown. The gauge parses the conjuncts it recognises (`col op literal`, `IS [NOT] NULL`, `AND`, `IN`), turns them into pyiceberg expressions, calls `plan_files()` against cached manifest stats, and drops any conjunct it cannot parse. Dropping a conjunct only enlarges the estimate, which is the safe direction. Bytes scanned = Σ surviving file bytes × projected column fraction from manifest column sizes. Every run records `pruning = full | partial | none`.
*Why:* Measured on 1.5.5: with a filter that kept 2 of 5 rows in 1 of 2 files, EXPLAIN's estimated cardinality was 1. It is DuckDB's generic selectivity guess, not file pruning, so bytes cannot come from EXPLAIN. `iceberg_metadata()` returns path, status, content, format and record count only, with no file sizes, column sizes or bounds, so bytes cannot come from DuckDB's metadata functions either. pyiceberg's `plan_files()` returned exactly file size, record count and per-column sizes after pruning. The architecture doc calls bytes after pruning the single most predictive input; this is the one place it can come from.

**D21. Actuals come from DuckDB's profiler.** Every execution runs with JSON profiling on. The profile supplies `latency`, `cumulative_rows_scanned`, `operator_rows_scanned` per scan, `system_peak_buffer_memory` and `system_peak_temp_dir_size` (spill). Actual bytes = rows scanned per table × bytes per row of the projected columns from manifest column sizes, recorded as derived. Peak process RSS is sampled by a thread during execution as a cross-check. Verified present in 1.5.5.
*Why:* Step 4's gate in v0.2 assumed actual bytes and peak memory were available without saying from where. Wall time is trivial; these two are the ones calibration needs.

**D22. Loopback security from the first server.** Bind 127.0.0.1 only; a non-loopback `--host` is refused in v0. `/api/*` requires `Authorization: Bearer <token>` with the token from `serve.json`; a request without it gets 401. No CORS headers except the Tauri origin on `/api`. Bodies are parsed as strict JSON. `/v1/*`, the catalog, carries no token in local mode: DuckDB, pyiceberg, Spark and Trino must attach with zero config, the same user already has write access to `catalog.db`, and JSON POSTs without CORS are not reachable from a browser page. Token support on `/v1` arrives with credential vending in the team catalog. `PRIVACY.md` states all of this.
*Why:* Cheap now, painful to retrofit into the app, the MCP server and the CLI. `catalog serve --port 8181` is a fixed, guessable port, so the reasoning for leaving `/v1` open is written down rather than assumed.

**D23. Catalog conflicts are retried by Lakelet, then surfaced as exit 4.** Step 1 establishes whether DuckDB's iceberg extension retries a 409 itself. Either way, `tables.import_*` and `query` re-run a statement up to three times with jittered backoff on a conflict error, then raise `CatalogConflict`, which the CLI maps to exit code 4.
*Why:* Concurrent commits exist from D3 onward, so PRD F0.6.4's exit code 4 belongs in v0. v0.2 dropped it.

**D24. Import coerces DuckDB types to Iceberg types explicitly.** The mapping is §3.7. Import builds the relation from DuckDB's reader, inspects its types, applies the casts, then creates the table. `--preview` shows the inferred DuckDB type, the Iceberg type it becomes, and a note where the cast is lossy.
*Why:* The CSV sniffer, JSON and xlsx readers produce unsigned integers, HUGEINT, INTERVAL, ENUM and nanosecond timestamps, none of which exist in Iceberg. Without a table this fails in step 3 one type at a time.

**D25. A remote Parquet prefix becomes a table by registering it in place as Iceberg.** `lakelet tables attach <name> s3://bucket/prefix/` lists the prefix, reads one Parquet footer per file for stats, and calls pyiceberg's `add_files` to build an Iceberg table whose data files are the partner's own Parquet, untouched. Name mapping covers files written without field IDs. Register-by-metadata-location remains the primitive for tables that are already Iceberg. What it does not do: files with drifting schemas across the prefix fail registration with the file and column named (union-by-name is a follow-up); hive layouts where the partition column exists only in the path need path parsing; Parquet only, since CSV or JSON in S3 is an import; tens of thousands of small files mean as many footer reads, so hundreds get a progress bar and tens of thousands belong on a worker. Fallback if partner data is too messy to register: convert the prefix in the cloud with a burst worker (session 8), which keeps the Iceberg claim, costs cents, and is a reasonable first burst. Trigger: two of the first five partners have prefixes that cannot be registered, or two of the step 8 fixtures take more than their one-day limit.
*Why:* Measured September 7 over `file://` and September 8 over `s3://`: `add_files` in under a tenth of a second, DuckDB reads the result with filter pushdown, pyiceberg prunes it by file, and a pyiceberg append is visible to DuckDB. Nothing is copied, the table is real Iceberg, Spark can read it, and leaving is deleting one metadata prefix. Parquet views were the cheaper option and the trap: not Iceberg, so demo step 6 and investor claim A2 both fail. Attaching the partner's own Glue or S3 Tables catalog helps only people who already have Iceberg. Decisions R1, R2 and R6 of September 8.

**D26. Registered tables keep their metadata in the local warehouse by default; a flag places it in the bucket.** Default: metadata under `warehouse/main/<name>/metadata/` on the laptop, data files pointing at `s3://`, so the partner's bucket stays read-only. `--metadata-in-bucket` writes it under `s3://bucket/_lakelet/<name>/` instead, which the burst worker and a Spark on another machine need; session 8 turns it on. Same code, different FileIO target; both are tested in step 8.
*Why:* Read-only on the partner's bucket is the trust statement that matters on day one. The cost lands on the catalog lease (architecture §5.2), which must push the whole metadata tree rather than pointers for local-metadata tables; manifests for a few hundred files are kilobytes. Decision R3 of September 8.

**D27. A registered table is a snapshot; `refresh` picks up new files.** `lakelet tables refresh <name>` lists the prefix again and adds files not yet in the table. A file deleted from the prefix makes the table fail loudly, naming the file. Scheduled refresh is Day 2 ops. The partner onboarding doc states the snapshot semantics rather than letting a partner discover them.
*Why:* Registration freezes the file list. Day 0 partner data is mostly a one-time export, so a manual refresh is enough, and it is the attach code run a second time. Decision R4 of September 8. The demo runs on a Lakelet-owned bucket prepared with the same `attach` partners use, so it exercises the partner path (decision R5).

**D28. The verdict words are the site's words.** The gauge line prints "Runs here", "Runs here, slowly" and "Needs more machine" after the coloured dot. Green, Yellow and Red remain the enum in history, in `--format json`, in the thresholds and in the code.
*Why:* Every page, mockup and deck slide uses the site's words; PRD C3 only requires a word with the dot. M1.

**D29. The burst half of the sentence is arithmetic in gauge v0.** Worker size is the smallest rung of the ladder on the pricing page (S 4 vCPU 16 GB, M 8 and 32, L 16 and 64, XL 16 and 120) whose memory is at least 1.5× the peak-memory estimate. Burst wall time is a 45 s cold-start allowance plus bytes scanned divided by an assumed 200 MB/s worker read rate plus CPU time scaled by the worker's cores. Burst cost is the rung's hourly list price × 1.15 × wall time. The cap is estimated cost × 2, rounded up per PRD F0.5.3. All four are labelled estimates in the API and recorded in `est_wall_burst` and `est_cost_burst`. Spike 3 replaces the assumed rate and cold start with measured ones; session 8 replaces the arithmetic with the control plane's answer.
*Why:* Every Yellow and Red line on the site carries the burst half. It is a pure function of numbers the gauge already has, and the demo sentence needs it before burst exists. M2.

**D30. A saved question is a dbt model from step 6.** `question save` writes `models/questions/<slug>.sql`, plain SQL with no Jinja, which is a valid dbt model, and adds an entry to `models/questions/schema.yml` with the title as description and two default checks: the question returns at least one row, and its first column is never null. `init` writes a minimal `dbt_project.yml` when none exists. `question run` executes the SQL through the gauge without invoking dbt. Git commits naming the author, Simple-mode vocabulary and the ask box's extra checks are session 9 and 7.
*Why:* The deck and app screens 7 to 9 say every project is a dbt project from the first save. PRD F0.4.5 said a YAML-headed `.sql` in `questions/`; two formats means a migration in session 9. Writing the dbt shape from day one costs nothing. §8 amends F0.4.5. M4.

**D31. Iceberg format version: the catalog accepts 2 and 3; tables Lakelet creates are V2 unless a writer asks for V3.** Step 1 records what DuckDB requests on `CREATE TABLE` and what `MERGE INTO` writes, position deletes on V2 or deletion vectors on V3. The site's "Iceberg V3" chip becomes "Apache Iceberg" until import produces a V3 table.
*Why:* No document had chosen, and D24's nanosecond truncation is V2 behaviour. M5.

**D32. Lineage in Day 0 means table level.** Which models and tables feed which, from the dbt manifest and Iceberg snapshot history. Built in session 9, exposed as `lakelet lineage <table>`, `GET /api/lineage/{name}` and the MCP `lineage` tool, which returns "no dbt project" until session 9 exists. Column-level lineage stays Day 3 (product spec F3.5).
*Why:* Lineage is in the free tier's feature list, the Day 0 MCP tool list and deck slide 7, and in no build plan. The manifest's DAG makes the table-level version small. M9.

**D33. `init` installs the DuckDB extensions and says so; nothing fetches at query time.** `lakelet init` runs `INSTALL iceberg; INSTALL httpfs; INSTALL excel`, prints one line naming the download and the directory, and every later command loads from the cache. `lakelet audit network` runs the local quickstart against a throwaway project with outbound connections blocked and reports every attempted connection; it is the §6 "nothing hidden" test as a user verb. The installers in session 10 bundle the three extensions so `init` has nothing to fetch.
*Why:* Deck slide 8 and the topologies page promise zero network calls until a bucket or key is added, and the topologies page promises the audit command. A first-query download breaks the promise silently. M10.

---

## 2. Scope

### In

| Area | What ships |
|---|---|
| Project | `init`, `open`; `lakelet.toml`; `AGENTS.md`; `.gitignore` |
| Catalog | Iceberg REST catalog on SQLAlchemy Core + SQLite, commits applied with pyiceberg (D19); loopback server in every process; `catalog serve` on a fixed port |
| Engine | DuckDB 1.5.x with `iceberg`, `httpfs`, `excel`; attached as `lakelet`; `memory_limit` and `threads` from config; profiler on for every execution |
| Tables | Import `.csv .tsv .parquet .json .jsonl .xlsx` and folders into Iceberg tables with explicit type coercion; list, describe (columns, types, partitioning, freshness, last commit), sample; replace or append on re-import; `--preview` shows the inferred and coerced schema and stops |
| Query | SQL in, Arrow record batches out; table, CSV, JSON or Parquet from the CLI; Red refused unless overridden; conflict retry; every run recorded |
| Gauge | Bytes scanned after manifest pruning, peak memory, local wall time, verdict, one-sentence reason in the site's words (D28); worker size, burst time and cap by arithmetic (D29); thresholds from `lakelet.toml` |
| History | Every execution recorded with the full calibration schema including SQL text and profiler actuals; `gauge history` lists it |
| Remote, read-only | Attach a Parquet prefix, or an existing Iceberg metadata location, in `s3://` as a read-only Iceberg table with the user's own AWS credentials (D25); `discover` lists a bucket's candidate prefixes with sizes; metadata local by default, in the bucket by flag (D26); `refresh` picks up new files (D27); bandwidth probe; Red verdicts with the bandwidth sentence |
| Questions | Save as dbt models in `models/questions/` with a `schema.yml` entry and two default checks (D30); list; run through the gauge |
| CLI | `init import tables sql estimate catalog question gauge audit serve` |
| HTTP API | The same operations over localhost with Arrow IPC results and bearer auth; thin; exists so session 6 has something to build against |

### Out, and where it goes

| Deferred | Lands in |
|---|---|
| Burst client, control plane, worker, catalog lease | Session 8 |
| `publish` | Session 8 |
| Cloud conversion of a prefix that cannot be registered (the D25 fallback) | Session 8, built only if the D25 trigger fires |
| `catalog attach` to Polaris, Lakekeeper, Glue, S3 Tables | Day 1 |
| Scheduled `refresh` of registered tables | Day 2 |
| `lakelet mcp` | Session 5, scheduled after session 8 so the demo path is not behind it (M6) |
| Ask box, `lakelet ask` (M11), and any LLM call | Session 7 |
| `lakelet run`, the dbt DAG, git commits on save, table-level lineage (D32) | Session 9 |
| Spark and Trino smoke test through `catalog serve` (documented, manual) | Session 10 |
| Simple correction factors: a per-machine, per-operator-class ratio after twenty runs (M7) | Session 10 |
| Calibration sharing, trained correction models, token on `/v1` | Day 1, on the history data core v0 produces |
| Desktop app | Session 6 |
| Windows | Day 1 |

---

## 3. Architecture of the core

### 3.1 Process model

```
  CLI command (in-process, exits when done)         Desktop app
  ┌──────────────────────────────┐                 ┌─────────────┐  HTTP + Arrow IPC, bearer token
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
        Every server binds 127.0.0.1 only.
```

One `Project` per process. The app opens one sidecar per project window. Other engines reach the catalog only when the user runs `catalog serve`.

### 3.2 The project on disk

```
acme/
  lakelet.toml
  AGENTS.md               # conventions; one marked block regenerated with the table list on import
  .gitignore              # warehouse/ .lakelet/ .DS_Store
  .lakelet/
    catalog.db            # Iceberg REST catalog state. Becomes Postgres in team mode
    history.db            # runs incl. SQL text, calibration inputs, question last_run, later the agent audit log. Never leaves the machine
    cache/                # manifest stats per (table, snapshot); throughput and bandwidth probes; machine profile. Written atomically (temp + rename) because processes share it
    serve.json            # {port, pid, token, started}, mode 0600, while `lakelet serve` is running
  warehouse/
    main/orders/
      metadata/           # vN.metadata.json, manifest lists, manifests
      data/               # *.parquet
    main/events/
      metadata/           # a registered remote table (D25): metadata here by default (D26); data files point at s3://
  dbt_project.yml         # minimal, written by init when absent (D30)
  models/
    questions/
      revenue-by-month.sql  # a plain-SQL dbt model, written by `question save` (D30)
      schema.yml            # title as description; two default checks per question
```

### 3.3 Configuration

Parsed with pydantic. The core validates only the sections it reads (`project`, `catalog`, `engine`, `gauge`). Every other section and every unknown key is carried through as raw data and written back unchanged, so a file written by a later version still opens here and a file written today is still valid in session 8. Validating sections the core does not read would reject newer files, which is the opposite of the intent.

```toml
[project]
name = "acme"
warehouse = "./warehouse"        # or s3://bucket/prefix, later

[catalog]
mode = "local"                    # local | team | external
# url = "https://..."

[engine]
memory_limit = "auto"             # DuckDB default, 80% of RAM; the app passes an explicit value per sidecar (§7)
threads = "auto"

[gauge]
green_max_seconds = 60
yellow_max_seconds = 600
green_max_memory_fraction = 0.6
share_calibration = false         # CLI default off (PRD F0.3.9); the app flips it on first run

[burst]                           # carried through, not read, in core v0
default = "prompt"
max_cost_per_run_usd = 5.00

[agents]                          # carried through, not read, in core v0
allow = []
```

### 3.4 History schema (v0, `.lakelet/history.db`)

Every column the calibration model will need, recorded now. `runs` gets one row per execution, one row per refused Red, and one row per execution whose estimate failed (null estimate columns, real actuals; PRD F0.3 says an estimator failure never blocks a run).

| Column group | Columns |
|---|---|
| Identity | `id`, `ts`, `lakelet_version`, `duckdb_version`, `fingerprint`, `sql_hash`, `sql_text` |
| What it read | `tables` (JSON: name, snapshot_id, locality, bytes_after_pruning, files_after_pruning), `operator_counts` (JSON: class → count), `pruning` (full / partial / none) |
| Machine | `machine_hash` (sha256 of platform, model, physical RAM, cores), `machine` (JSON: ram, memory_limit, cores, free_disk, on_battery), `throughput_local_mbps`, `bandwidth_mbps` |
| Estimate | `est_bytes`, `est_peak_mem`, `est_wall_local`, `est_wall_burst`, `est_cost_burst`, `verdict`, `reason` |
| Outcome | `ran`, `ran_where` (local / refused; burst later), `actual_rows_scanned`, `actual_bytes` (derived, D21), `actual_peak_mem`, `actual_spill`, `actual_wall`, `actual_cost`, `retries`, `error` |

`question_runs(slug, ts, run_id)` supplies `last_run` for questions. `corrections(machine_hash, operator_class, factor, n, updated)` exists and stays empty in v0. `meta(schema_version)`.

Never shared: `sql_text`, table names, column names, values. PRD F0.3.9 governs what the optional share sends; that is Day 1, and the share code is the only reader that filters.

### 3.5 Modules

```
core/
  pyproject.toml
  lakelet/
    project.py          Project.init / Project.open; paths; owns the server thread and the engine
    config.py           lakelet.toml model (pydantic); validates read sections, carries the rest through
    catalog/
      server.py         FastAPI routes: /v1/config, namespaces, tables (create, load, commit, drop, rename, register),
                        transactions/commit; HEAD variants
      store.py          SQLAlchemy Core schema and operations; WAL, busy timeout, compare-and-swap commit (D5)
      commit.py         requirements → validate, updates → apply, metadata → write, via pyiceberg (D19)
      embedded.py       run the app in a thread on a loopback port; return the URL
    engine.py           DuckDB connection: extensions, ATTACH … AS lakelet, USE lakelet.main, limits, profiler capture (D21)
    tables.py           preview, import_file, import_dir, list, describe, sample, attach, refresh
    register.py         list a prefix, read footers, add_files, metadata local or in bucket (D25, D26); refresh (D27)
    types.py            DuckDB → Iceberg coercion table (§3.7)
    gauge/
      predicates.py     EXPLAIN Filters → pyiceberg expressions; unparsed conjuncts dropped and counted (D20)
      manifests.py      per-(table, snapshot) file stats via pyiceberg, cached in .lakelet/cache/; shared with register.py
      inputs.py         EXPLAIN (FORMAT JSON); machine profile; throughput; bandwidth probe
      model.py          bytes scanned, peak memory, wall time (architecture §4.2); worker size, burst time and cap by arithmetic (D29)
      verdict.py        thresholds → Green / Yellow / Red; the reason sentence
    history.py          record, recent, question last_run; the schema above
    query.py            gauge → refuse or execute → stream Arrow batches → conflict retry → record actuals
    questions.py        save as a dbt model plus schema.yml entry (D30), list, run
    audit.py            the local quickstart with outbound connections blocked; reports attempts (D33)
    api/                /api/… over the same server: the operations below, Arrow IPC for results, bearer auth (D22)
    cli/                typer; thin; gauge line to stderr, results to stdout
```

Import direction: `cli` and `api` import everything else; nothing imports them. `catalog` knows nothing about DuckDB. `gauge` knows nothing about the CLI or the history store's SQL. `catalog/commit.py`, `gauge/manifests.py` and `register.py` are the only modules that import pyiceberg.

### 3.6 Interfaces

Python. The CLI verbs and the HTTP routes are this, one to one (D17).

```python
from lakelet import Project

p = Project.init("acme")                          # or Project.open(".")
p.tables.preview("orders.csv")                    # Schema: name, duckdb_type, iceberg_type, note, sample rows
t = p.tables.import_file("orders.csv")            # TableInfo(name, rows, bytes, schema, location, snapshot_id)
p.tables.list(); p.tables.sample("orders", n=5)
p.tables.describe("orders")                       # columns, types, partitioning, freshness, last commit
p.tables.discover("s3://bucket/")                 # candidate prefixes with sizes, one listing call
p.tables.attach("events", "s3://bucket/events/")                 # Parquet prefix, registered in place (D25); metadata local (D26)
p.tables.attach("events", "s3://bucket/events/", metadata_in_bucket=True)
p.tables.attach("orders_v2", "s3://bucket/wh/main/orders/metadata/v12.metadata.json")   # already Iceberg
p.tables.refresh("events")                                        # adds files new since attach (D27)
e = p.estimate("select ... from orders")          # Estimate(verdict, bytes_scanned, peak_memory, wall_local,
                                                  #          reason, plan, fingerprint, pruning,
                                                  #          worker, wall_burst, cost_burst, cap: estimates, D29)
r = p.query("select ... from orders")             # Result: iterates pyarrow.RecordBatch;
                                                  #         .estimate; .actual once complete
r = p.query(sql, allow_red=True)                  # override a Red verdict
p.questions.save("Revenue by month", sql)         # models/questions/revenue-by-month.sql + schema.yml (D30)
p.audit_network()                                 # the quickstart with the network blocked; list of attempts
p.history.recent(50)
p.catalog.url                                     # http://127.0.0.1:<port> while open
```

CLI. Exit codes: 0 ok, 1 anything else, 2 Red refused, 4 catalog conflict after retries (PRD F0.6.4; 3 arrives with burst).

```
lakelet init [dir]
lakelet import <file|dir> [--name n] [--replace | --append] [--preview]
lakelet tables list | describe <name> | sample <name> [-n 5]
lakelet tables attach <name> <s3-prefix or metadata-location> [--metadata-in-bucket] | refresh <name> | discover <s3-bucket>
lakelet sql "<q>" | -f q.sql [--format table|csv|json|parquet] [--run-anyway]
lakelet estimate "<q>" | -f q.sql
lakelet catalog serve [--port 8181]
lakelet question save "<title>" -f q.sql | list | run <slug>
lakelet gauge history [--last N]
lakelet audit network
lakelet serve [--port]
```

Gauge line: stderr, one line, colour and word together (PRD C3). The words are the site's (D28); the burst half is D29's arithmetic until session 8.

```
● Runs here · scans 2.1 GB · fits in memory · ~4 s
● Runs here, slowly · scans 6.4 GB · peak 14 GB of 12.8 GB limit · spills · ~3 min · burst ~40 s · cap $0.08
● Needs more machine · scans 48 GB from s3://acme-data/events · ~34 min at your 190 Mbps · burst ~1.5 min · cap $0.41
```

HTTP, loopback only, under `serve`. Every `/api` route requires `Authorization: Bearer <token>`.

```
GET  /api/health            {lakelet, duckdb, machine, bandwidth_mbps}
GET  /api/tables            GET  /api/tables/{name}     GET  /api/tables/{name}/sample     GET  /api/tables/discover?prefix=
POST /api/import            POST /api/preview           POST /api/tables/attach     POST /api/tables/{name}/refresh
POST /api/estimate          POST /api/query   (Arrow IPC stream)
GET  /api/questions         POST /api/questions         POST /api/questions/{slug}/run
GET  /api/history
/v1/…                       the Iceberg REST catalog, same server, no token in local mode
```

### 3.7 Import type coercion (D24)

| DuckDB type | Iceberg type | Note in `--preview` |
|---|---|---|
| `BOOLEAN` | `boolean` | |
| `TINYINT` `SMALLINT` `INTEGER` `UTINYINT` `USMALLINT` | `int` | unsigned widened |
| `BIGINT` `UINTEGER` | `long` | |
| `UBIGINT` | `decimal(20,0)` | |
| `HUGEINT` `UHUGEINT` | `decimal(38,0)` | |
| `FLOAT` | `float` | |
| `DOUBLE` | `double` | |
| `DECIMAL(p,s)`, p ≤ 38 | `decimal(p,s)` | |
| `VARCHAR` | `string` | |
| `ENUM` `JSON` `BIT` `UNION` `INTERVAL` `TIME WITH TIME ZONE` | `string` | lossy, flagged |
| `BLOB` | `binary` | |
| `DATE` | `date` | |
| `TIME` | `time` | |
| `TIMESTAMP` `TIMESTAMP_S` `TIMESTAMP_MS` | `timestamp` | microseconds |
| `TIMESTAMP_NS` | `timestamp` | truncated to microseconds in v0; V3 `timestamp_ns` later |
| `TIMESTAMP WITH TIME ZONE` | `timestamptz` | |
| `UUID` | `uuid` | |
| `LIST` `STRUCT` `MAP` | `list` `struct` `map` | element types recursively |

---

## 4. Build order

Each step ends with a test that stays in the suite.

| Step | Builds | Gate |
|---|---|---|
| 0 | Repo skeleton: `core/` uv project, ruff, pytest, LICENSE, CI on macOS and Ubuntu with the three extensions cached. Docs housekeeping from D18. Decide whether `docs/` and `build-sessions/` stay gitignored: `.gitignore` ignores both today, while the session plan says they are checked in so agents in the repo read the same specs, and D12 assumes the repo is built as if public | `uv run pytest` passes on both runners; stale pointers gone; the gitignore decision is recorded in this file |
| 1 | Catalog: store (with a `leased_until` column on the table row for session 8, M3), commit via pyiceberg, server, embedded thread. Integration test: DuckDB 1.5.x `CREATE TABLE`, `CREATE TABLE AS`, `INSERT`, `MERGE INTO`, `DROP`, rename through it to a `file://` warehouse; pyiceberg reads the result; 100 commits from concurrent *processes* lose nothing; the 409 path is exercised and it is recorded whether DuckDB retries on its own; a long-lived attach sees a table committed by another process, or the refresh needed is documented; register endpoint round-trips a pyiceberg-written table; the format version DuckDB requests on create and what `MERGE INTO` writes are recorded (D31). `s3://` variant against the in-process S3 test server in the default suite, and against a real endpoint when `LAKELET_TEST_S3_ENDPOINT` is set; Postgres variant behind `LAKELET_TEST_PG_URL` | **Load-bearing.** If the REST attach path fails on `file://`, the local S3 shim (PRD D3) is decided here and only here. Reading a `file:///…metadata.json` location directly is already verified on 1.5.5, so the remaining risk is the attach path, not the scheme |
| 2 | Project + engine + config: `init` (installs and announces the extensions, D33; writes `dbt_project.yml`, D30), `open`, attach, `USE`, bare names, profiler on. Half-day spike once attach works: dbt-duckdb against the attached catalog, one incremental merge model (M6) | `select * from orders` runs after a manual `CREATE TABLE`; the profile for it has `system_peak_buffer_memory` and per-scan rows; the dbt spike's result is written into §7 either way |
| 3 | Import: five file types, folders, replace/append, preview with coercion, `tables` verbs with `describe` returning columns, types, partitioning, freshness and last commit (M3), `AGENTS.md` refresh | PRD F0.1 AC: 200 MB CSV ≤ 10 s; 2 GB CSV ≤ 90 s with no swap; a fixture with every row of §3.7 imports and reads back through pyiceberg with the expected Iceberg types |
| 4 | Query + history: Arrow streaming, first 1,000 rows before completion for streamable plans, conflict retry, every run recorded with the §3.4 schema | A history row per run with profiler actuals, derived bytes and SQL text; a forced conflict retries and then exits 4 |
| 5 | Gauge v0 on local tables: predicates from EXPLAIN, manifest cache, model, verdict in the site's words (D28), the burst half by arithmetic (D29); the TPC-H harness from the `tpch` extension at SF1 | 80% within 2× on time and 1.5× on bytes; no Green over 3 min; `pruning = full` on every TPC-H query; a test project with lowered thresholds produces Yellow and Red and exit 2, and every Yellow and Red line carries a worker size, a burst time and a cap |
| 6 | Questions as dbt models (D30) | Save, list, run with the gauge first; `dbt parse` accepts the generated project with a stub profile; `last_run` comes from history and a run touches no file |
| 7 | CLI over all of the above, plus `estimate -f`, `--format parquet` and `audit network` (M3, D33) | Ten-minute quickstart on a clean Mac and a clean Ubuntu; `lakelet audit network` reports zero attempts on the quickstart project; `lakelet sql` prints its gauge line within 1 s of process start with warm extensions, measured; if missed, the fix list is lazy imports, then a Starlette-only server |
| 8 | Remote read-only: `discover` (M3), register a Parquet prefix in place (D25), register by metadata location, metadata local or in bucket (D26), `refresh` (D27), bandwidth probe. Fixtures, each with a one-day limit: registration over `s3://` against the in-process S3 server (measured September 8; kept as a regression test); a prefix where the third file adds a column; a hive layout with the partition column only in the path; ten thousand small files; both metadata locations | A prefix of plain Parquet attaches without copying, DuckDB and pyiceberg both read it, `refresh` adds a new file, a large one returns Red with the bandwidth sentence, and manifests fetched from S3 are cached so the second estimate is under 150 ms. Two fixtures over their one-day limit, or the partner intake showing half the partners have layouts that cannot be registered, and the cloud-conversion fallback is scheduled for session 8 before partners onboard |
| 9 | HTTP API + `serve` with bearer auth and health | Session 6 can start; a request without the token gets 401; a non-loopback bind is refused; health returns versions, machine profile and cached bandwidth (M3) |

Step 8 grew by three to five days on September 8 (D25 to D27). If it slips, the remote work moves to session 8 with no redesign, because the primitive underneath is unchanged. Partner intake runs in parallel with step 8: five questions per partner, format, folder layout, file count, what wrote it, and whether it changes daily.

Spike 2 at SF10 and SF100, local and from S3, runs the step 5 harness at scale once step 8 exists. Spike 3 (one Fargate worker, real cost numbers) is independent and can run at any time.

This brief covers sessions 1, 2 and 4 of the session plan, merged.

---

## 5. Toolchain

| | On this machine |
|---|---|
| Python | 3.13.7 (Homebrew); floor for the package is 3.12 |
| uv | 0.11.8 |
| duckdb | 1.5.5 is what PyPI serves today; the iceberg, httpfs and excel extensions install and load against it |
| pyiceberg | 0.12.0 on PyPI |
| dbt-core, dbt-duckdb | not installed; dev dependencies from step 2 for the spike and the step 6 gate |
| Node, cargo | 25.9 and 1.95, for sessions 6 onward |

---

## 6. Definition of done

- **Quickstart.** On a clean Mac and a clean Ubuntu, under ten minutes: install, `init`, `import orders.csv`, `sql` returns Green and rows, `estimate` on a large table returns Red with its sentence, `catalog serve` and pyiceberg reads the table from another process; `lakelet audit network` reports zero attempts.
- **Tests green.** Catalog conformance and multi-process concurrency, DuckDB write matrix on `file://` and on `s3://` via the in-process test server (a real S3 endpoint and Postgres when configured), import matrix including every row of §3.7, TPC-H SF1 gauge accuracy, 2 GB CSV on the reference machine, all on both CI runners.
- **Demo path.** A Lakelet-owned bucket holding a public dataset shaped like a partner's events table, prepared with `tables attach` and nothing else, returns Red with the bandwidth sentence from a laptop, and pyiceberg reads the registered table from another process. The Spark read of the same table is the session 10 smoke test.
- **Budgets.** Gauge line within 150 ms for local tables with cached manifests (PRD C1). Query overhead beyond DuckDB under 50 ms. `lakelet sql` to gauge line under 1 s from process start.
- **Nothing hidden.** A test runs the whole local quickstart with the network disabled and passes, extensions pre-installed. The only network calls the core can make are the extension fetch, a remote table the user attached, and the bandwidth probe. `/api` without the token is 401; every server binds loopback only.

---

## 7. Known unknowns

- Whether DuckDB 1.5.x's iceberg extension will attach a REST catalog whose warehouse is `file://` and write through it. Step 1. Reading a `file://` metadata location is verified; the attach and write path is not. Nothing in §3.5 beyond the catalog is written before this is known.
- Whether DuckDB retries a 409 on commit itself or surfaces it. Step 1. D23 covers both outcomes.
- Whether a long-lived attach (the sidecar) sees tables committed by another process without re-attaching. Step 1. The fallback is a re-attach when the catalog's table list changes, which the sidecar can detect from `catalog.db`.
- Whether `CREATE TABLE AS SELECT` works through the Iceberg catalog. Step 1. The fallback for import is `CREATE TABLE` from the coerced schema followed by `INSERT … SELECT`.
- Whether `USE lakelet.main` behaves as expected on an attached Iceberg catalog. Step 2. The fallback is a default search path set per connection.
- Whether the 150 ms gauge budget holds on the first keystroke against a never-read table. PRD F0.3 allows 800 ms uncached; the manifest cache in `.lakelet/cache/` is what makes the second one fast, and pyiceberg's planning against cached file stats is what has to fit inside it.
- How much of DuckDB's `Filters` rendering the predicate parser needs to cover for `pruning = full` on real workloads. Step 5 measures it on TPC-H; partner workloads in Day 0 measure it for real. The safe direction is built in.
- Two app windows mean two sidecars, each defaulting to 80% of RAM. Session 6 passes an explicit `memory_limit` per sidecar; the core only needs to accept it, which it does through `[engine]`.
- How often partner prefixes have drifting schemas or path-only partition columns, which D25 cannot register without more work. The step 8 fixtures and the partner intake answer it; the D25 trigger names the fallback.
- Whether the catalog lease can carry a full metadata tree for local-metadata registered tables (D26). Session 8. The tree for a few hundred files is kilobytes.
- Whether dbt-duckdb can target tables in an attached Iceberg catalog with an incremental merge. The step 2 spike answers it in week one, because the medallion page sells it as the main use case and session 9 is the last build session (M6).
- Which Iceberg format version DuckDB requests on create, and what `MERGE INTO` writes (D31). Step 1.

---

## 8. What this changes in the other documents

| Document | Change |
|---|---|
| `build-sessions/lakelet-build-sessions.md` | Sessions 1, 2 and 4 merge into this brief; spikes 1 and 2 are real code (D13). Session 4's `run` moves to 9; `publish` moves to 8; `catalog attach` moves to Day 1 (D11). Monorepo line: drop `cli/`; `core/` holds the whole Python package (D1). "Local daemon" becomes "in-process for the CLI, sidecar for the app" (D3). Assign mockup screen 10 (Agents) to session 5. Session 5 runs after session 8 (M6). Session 7 adds `lakelet ask` (M11). Session 9 adds git commits on save and table-level lineage (D30, D32). Session 10 adds the simple correction factors (M7). Fix the starting-prompt paths to `docs/lakelet-day0-prd.md` and `docs/lakelet-architecture.md`. Do not create `worker/` and `control-plane/` until session 8 |
| `docs/lakelet-build-sessions.md` | Delete; identical copy (D18) |
| `docs/lakelet-architecture.md` | §8 first paragraph: Python core, Rust only in the shell (D2). §8 week 3–6: repo public in Day 1, not week 3 (D12). §4.1: predicates for pruning come from the optimised plan's scan-node filters, and bytes cannot come from EXPLAIN cardinalities (D20). §4.2: burst wall time and cost by D29's arithmetic until session 8. §4.3: the verdict words are the site's (D28). §3.2: the catalog applies commits with pyiceberg's metadata code (D19). §5.2 catalog lease: pushes the metadata tree, not only pointers, when a table's metadata is local (D26). Header: drop the reference to `lakelet-local-first-lakehouse.md` |
| `docs/lakelet-day0-prd.md` | F0.7.2: "embedded" means a loopback HTTP server in the process (D4). F0.3.6: history is `.lakelet/history.db` with the §3.4 schema; SQL text is stored locally and never shared (D7). F0.4.5: a saved question is a dbt model in `models/questions/` with a `schema.yml` entry; `last_run` lives in history (D30, D16). F0.3.6: the per-operator-class correction after twenty runs ships in session 10; trained models are Day 1 (M7). F0.3 UX: the verdict words are the site's (D28). F0.9.2: `lineage` means table level (D32). F0.6.1: `lakelet ask` in session 7 (M11). C1: the reference bandwidth is 190 Mbps, matching the site. F0.1.4: the preview shows the Iceberg type each column becomes (D24). F0.6.1: `run`, `publish` and `catalog attach` are not in the first CLI (D11). F0.6.4: v0 exit codes are 0, 1, 2, 4; 3 arrives with burst (D23). F0.7.4: `catalog attach` is Day 1 (D11). F0.1: add the story "point at a bucket prefix, get an Iceberg table without copying" (D25). D2 demo step 3: the bucket is Lakelet-owned and prepared with `tables attach` (D27). Add: `init` writes `.gitignore` (D14). C2: `/api` bearer token, `/v1` open on loopback in local mode (D22). D3: the `file://` fallback, if ever needed, is a minimal S3 subset inside the sidecar over local disk, not a bundled MinIO, which is no longer maintained |
| `docs/lakelet-v0-build-spec.md` | §7: remove the reference to `status.md`. §3 desktop shell row: the "10–20 MB installer" claim does not survive a Python sidecar that ships pyarrow; say "under 200 MB" or measure in session 10 |
| `docs/facts-and-messaging.md` | Roadmap wk 3–6: "CLI v0 to design partners; public repo in Day 1" (D12) |
| `docs/lakelet-product-spec.md` | F3.5: column-level lineage stays Day 3; table-level lineage arrives in Day 0 (D32). Otherwise this brief follows it |

These edits are step 0 and are not applied yet.

---

## 9. Changes from the original brief, with the evidence

Measurements were taken on DuckDB 1.5.5 and pyiceberg 0.12.0 from PyPI on September 7 and 8, 2026, against two-file Iceberg tables written by pyiceberg's SQLite catalog, over `file://` and over an in-process S3 test server (Moto 5.2.3).

| Finding in review | Measured | Resolution |
|---|---|---|
| The catalog has to apply metadata updates and write metadata files; v0.2 did not mention it | pyiceberg 0.12 exposes the REST request and response models, `TableRequirement.validate()` for eight assert classes, twenty-one `TableUpdate` classes, `update_table_metadata()`, `new_table_metadata()` | D19; `catalog/commit.py` |
| Whether pyiceberg is a runtime dependency was deferred to step 1 | `iceberg_metadata()` returns manifest path, sequence number, content, status, file path, format and record count only | D15, D20: runtime, with a ceiling |
| Bytes scanned from EXPLAIN | A filter keeping 2 of 5 rows in 1 of 2 files reported estimated cardinality 1 | D20: predicates from the optimised plan's scan-node `Filters`, pruning through `plan_files()` |
| `file://` was the first known unknown | `iceberg_metadata('file:///…metadata.json')` reads directly; the REST attach syntax with `AUTHORIZATION_TYPE 'none'` parses and calls `/v1/config` | §7 narrowed to the attach and write path |
| Actual bytes and peak memory had no measurement method | Profiler JSON on 1.5.5 carries `latency`, `cumulative_rows_scanned`, `operator_rows_scanned`, `system_peak_buffer_memory`, `system_peak_temp_dir_size` | D21; psutil for RSS and the machine profile |
| DuckDB floor without a ceiling | PyPI serves 1.5.5 against a §5 that said 1.5.3 | D15: ranges |
| Loopback server had no auth | — | D22 |
| SQL text never stored | — | D7: stored locally, never shared |
| `last_run` in a committed file | — | D16: history keyed by slug |
| Exit code 4 dropped | — | D23 |
| Remote Parquet prefixes hidden in step 8 | — | Revision 3 narrowed D11 to Iceberg by metadata location; revision 4 brings prefixes back as in-place registration (D25) |
| Type coercion missing from import | `read_xlsx` registers once `excel` loads; the sniffer's type set is DuckDB's, not Iceberg's | D24; §3.7 |
| Missing endpoints: transactions commit, register, HEAD | — | §3.5 `server.py`; step 1 gate |
| No `tables` CLI verb despite D17 | — | D17 amended |
| `catalog attach` in neither In nor Out | — | Out, Day 1 (revision 4) |
| Spark and Trino smoke test dropped silently | — | Out, session 10, manual |
| Ubuntu absent from CI and DoD | — | Step 0, §6 |
| Postgres dialect never exercised | — | D5: `LAKELET_TEST_PG_URL` |
| Config validated sections it did not read | — | §3.3 |
| `where` is a reserved word | — | `ran_where` |
| Replace-by-snapshot doubles disk with no expiry | — | D16: drop and recreate |
| `serve.json` staleness | — | D3: pid check and health |
| No CLI startup budget | — | Step 7 gate, §6 |
| Installer-size claim in the build spec | — | §8 |
| `docs/` and `build-sessions/` are gitignored, contradicting the session plan | `.gitignore` lines 3 and 6 | Step 0 decides and records it |
| The demo's bucket had to be Iceberg already, and partners will have Parquet | `add_files` over `file://` (September 7) and `s3://` (September 8) in under a tenth of a second; DuckDB reads the result with pushdown; pyiceberg prunes it; a pyiceberg append is visible to DuckDB | D25 to D27; R1 to R6 accepted in `decisions-for-review_090826.md`; D11, §2, §3, step 8, §6, §7, §8 |
| The site and deck were compared line by line with this brief (September 8) | Twelve gaps between what is advertised for the beta and what any document builds; the comparison is in `lakelet-build-sessions_090826.md` §5 | D28 to D33, M1 to M12 below, §10 |
| MinIO named as the S3 test backend and the shim candidate | MinIO is no longer maintained. On September 8, Moto 5.2.3's threaded server passed DuckDB Parquet write and read, `add_files`, pruning, `iceberg_scan` with a filter, and a pyiceberg append, all over `s3://` | D15, D16, step 1, §6, §8 |

### The twelve decisions from the comparison, M1 to M12, accepted September 8, 2026

Reviewed in revision 5's tick-box block; all twelve accepted with no changes. Body references to an M number point here.

| | Decision | Landed in |
|---|---|---|
| M1 | The verdict words are the site's: "Runs here", "Runs here, slowly", "Needs more machine"; Green, Yellow, Red stay the enum | D28, §3.6, step 5 |
| M2 | The burst half of the sentence is arithmetic in gauge v0: worker size, burst time, cost and cap, labelled estimates | D29, D8, step 5, §3.6 |
| M3 | Core surface the app and agents assume, added now: `tables discover`, `describe` fields, `leased_until`, `estimate -f`, Parquet export, health payload, `audit network` | D3, D17, §3.6, steps 1, 3, 7, 8, 9 |
| M4 | A saved question is a dbt model from step 6; `init` writes a minimal `dbt_project.yml` | D30, D14, D16, §3.2, §3.5, step 6, §8 |
| M5 | The catalog accepts Iceberg V2 and V3; import writes V2; step 1 records what DuckDB requests | D31, step 1, §7, §10 |
| M6 | A half-day dbt-duckdb spike in step 2; session 5 (MCP) runs after session 8 (burst) | step 2, D15, §5, §7, §8 |
| M7 | A per-machine, per-operator-class correction after twenty runs ships in session 10; trained models are Day 1 | D8, §2 Out, §8 |
| M8 | SQL an agent ran is stored locally and never shared; the site's `history` flag means sharing | D7 stands; §10 |
| M9 | Lineage in Day 0 is table level from the dbt manifest and snapshot history, session 9; column level stays Day 3 | D32, §2 Out, §8 |
| M10 | `init` installs the three DuckDB extensions and announces it; `audit network` proves nothing else fetches; installers bundle | D33, D15, step 2, step 7, §6, §10 |
| M11 | `lakelet ask` is a CLI verb, shipped in session 7 | §2 Out, §8 |
| M12 | The site and deck wording changes in §10 are applied as written | §10 |

---

## 10. What this changes on the site and in the deck

The site is what a partner reads before the onboarding call. Each line below is a sentence a partner could check in the beta. Accepted as M12 on September 8; applying them to the files in `site/` and `deck/` is a task on the open list, not a decision.

| Where | Today | Change |
|---|---|---|
| `index`, `lakelet-app`, `lakelet-medallion`, the engineers section | Attach your own Polaris, Lakekeeper or S3 Tables catalog, in the beta | Mark Day 1 (D11, decision R2) |
| `index` nav, hero "Read the source", footer | A public GitHub link | Until Day 1: an org page that says the source opens with the launch, or no link (D12) |
| `pricing`, `index` | Spot capacity "by default"; the nine-run line priced on spot | "On-demand in the beta; spot follows"; reprice on on-demand (PRD F0.5 non-goal) |
| `pricing`; deck slides 8 and 9 | "Runs on your AWS account (bring your own) or ours"; slide 8 says Lakelet's account, slide 9 says the customer's | "Lakelet's account in the beta; bring-your-own-account later"; make the two slides agree |
| `pricing` Local tier | "Publish to your own S3, GCS or R2 bucket" | "S3 in the beta" |
| `index` hero | `$ lakelet ask "…"` | Keep; session 7 ships the verb (M11) |
| `index` | "Point Snowflake or Spark at the same bucket tomorrow" | "Spark or Trino today through `catalog serve`; Snowflake and Athena through the Team catalog" |
| `lakelet-topologies`, `lakelet-medallion` | "Laptops keep a local cache" of bucket data files | Remove, or mark Team; no document plans a data-file cache |
| `lakelet-medallion` | "A failed test blocks the commit to the catalog" | "A failed test stops the run before downstream models" |
| `lakelet-medallion` | "Metabase, Tableau, Spark read gold from here" | "Spark, Trino, and any tool with a DuckDB or Trino connector" |
| `lakelet-medallion` | A `[Schedule]` button in free-tier output | Remove; scheduling is Team |
| every page, deck slide 3 | "DuckDB 1.5.3" | "DuckDB 1.5"; PyPI serves 1.5.5 (D15) |
| `index` footer chip | "Iceberg V3" | "Apache Iceberg" until import writes V3 (D31) |
| deck slide 8, `lakelet-topologies` | "Zero network calls until you add a bucket or key" | "…after `lakelet init` installs the DuckDB extensions, which it says out loud; installers include them" (D33). The `lakelet audit network` sentence stays; it is now real |
| `lakelet-agents`, app screen 10 | `[agents] history = false`, "SQL an agent ran is not kept unless history is on" | The flag means sharing; SQL text stays in `history.db` on the machine and never leaves it (D7, M8) |
| `index`, `lakelet-app`; PRD C1 | Reference machine at 190 Mbps on the site, 200 Mbps in the PRD | 190 stays on the site; PRD C1 changes to 190 in step 0 |
| `pricing` Local tier, `lakelet-agents` tools, deck slide 7 | "lineage" in the free tier and the Day 0 tool list | True at table level from session 9 (D32); say "table-level lineage" |
| app screen 5 | "Correction factors applied after 20 runs" | True from session 10 (M7) |

Applied on September 8, 2026 to `web/src` (the Astro site that replaced `site/`) and to `deck/lakelet-pitch-deck.pptx` and `deck/lakelet-executive-summary.docx`. The executive-summary PDF is an export of the docx and was not regenerated. Originals are in `old/deck-before-090826/`.
