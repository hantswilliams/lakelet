# Lakelet core v0 — build brief

> **Superseded by `core-v0.2-plan.md` on September 8, 2026.** Kept for the R block's reasoning and option matrix; do not build from this file.

*v0.3 · September 7, 2026 · Supersedes `core-v0-plan.md` (v0.2) after review. Decisions in §1 are made; the rest of the file follows from them. §9 lists what changed from v0.2 and the evidence behind each change.*

---

> **Open for review on September 8, 2026.** Six decisions about remote data and the four-minute demo, raised after this brief was written. Nothing below is applied yet. If the recommendation is accepted, D11, §2, step 8 in §4, §7 and §9 change as listed at the end of this block. Read this block first, fill in the *Decision* lines, then read the brief. A one-page version with tick boxes is in `decisions-for-review_090826.md`.

## R. Pending decisions: remote data and the four-minute demo

### The problem

PRD D2 step 3 says: point at the partner's S3 bucket, the Tables panel shows `events` (48 GB), the gauge says Red. Core v0 step 8 registers Iceberg tables by metadata location only, so that step works only if the partner's bucket already holds Iceberg. Step 6 of the same demo has Spark reading the same table through `catalog serve`, and investor question A2 requires a partner's data in the partner's bucket, in Iceberg, read by Spark. Those two requirements rule out anything that is not a real Iceberg table.

### The fact that reshapes it

Measured September 7 on DuckDB 1.5.5 and pyiceberg 0.12.0: pyiceberg's `add_files` built an Iceberg table over two plain Parquet files written by a non-Iceberg writer, with no field IDs, in under a tenth of a second. The metadata sat in a different folder from the data. Nothing was copied. DuckDB read the table and applied a filter with pushdown. So "point at a Parquet prefix, get a real Iceberg table, move no bytes" is technically available. The `s3://` variant was measured on September 8 against an in-process S3 test server (Moto 5.2.3): `add_files` over `s3://` took 0.05 s with metadata in a separate `_lakelet/` prefix, pyiceberg pruned by file, DuckDB read the table and a filter through the same endpoint, and a pyiceberg append produced a snapshot DuckDB saw.

### R1. Premise: what shape is partner data in when Lakelet first meets it?

The PRD recruits partners from DuckDB and dbt communities, MotherDuck users, and Snowflake or BigQuery customers under a terabyte. None of those groups has Iceberg in S3 today. MotherDuck data sits in MotherDuck's storage; warehouse data sits in the warehouse. The realistic onboarding step is "export to Parquet in your bucket", which is one command on every warehouse. A minority already on Athena or Glue have Iceberg.

*Recommendation:* accept that partner data arrives as Parquet in S3, and that register-by-metadata-location is the right primitive but the wrong product verb.
*Decision:*

### R2. How does a remote Parquet prefix become a table?

| | A. Publish from laptop | B. Attach an external catalog (Glue, S3 Tables) | C. Parquet views, no catalog | D. Register in place as Iceberg |
|---|---|---|---|---|
| Technical | Already planned for session 8. Only for data that starts on the laptop. 48 GB up a home link is hours | SigV4 signing, two client libraries, credential quirks, tests need real AWS. DuckDB attaches Glue natively but the gauge needs pyiceberg to read it too | Cheapest to build. Breaks the one-catalog model. Burst needs a second worker path carrying view definitions. No manifests, so bytes come from a listing and there is no pruning | Read path verified above. pyiceberg does the manifest work. One footer read per file for stats. The gauge, the lease, the worker and Spark all see an ordinary Iceberg table |
| User, P1 engineer | Feels backwards; they already have a bucket | Helps only the minority already on Iceberg | Fast and familiar, feels like DuckDB, but the table is not in a catalog and not shareable | Point at the prefix, get a table, nothing moved. The pitch in one gesture |
| User, P3 non-developer | Never sees it | Never sees it | Works, but the app shows a table that is not really one | Works, and the table behaves like every other one |
| Investor claim A2 | Yes, for demo data | Yes | **No.** Parquet with a view on it; Spark cannot read it through the catalog | Yes, and stronger: existing files became Iceberg without being touched |
| No lock-in story | Fine | Fine | Fine | Best of the four; leaving is deleting one metadata prefix |
| Security | Bucket write for data | Glue permissions | Read-only bucket access; least privilege | Write on one metadata prefix, or none if metadata stays local (R3) |
| Demo step 3 and 6 | Works if the founder publishes first | Works if the demo bucket has a Glue catalog | Step 3 works; step 6 with Spark fails | Works end to end |
| Rough cost | Zero extra | Three to six days | Two to three days | Three to five days |

C is the trap: cheapest, and it quietly voids the differentiation claim the deck rests on. B is a real feature for a real minority and belongs in the plan, but cannot be the partner-program answer. A is fine for the founder's own demo and useless for partners. D is the only option that serves the partner program, the demo and the investor claim with one mechanism.

*Recommendation:* D as the product verb, `lakelet tables attach <name> s3://bucket/prefix/`, with register-by-metadata-location kept as the primitive underneath. B moves to Day 1. C is dropped from the roadmap.
*Decision:*

### R3. Where does the registered table's metadata live?

- **In the partner's bucket under a Lakelet prefix.** The burst worker and Spark on another machine read manifests directly, and the catalog lease works exactly as architecture §5.2 describes. Costs one write-scoped prefix in the IAM policy Lakelet already shows at setup, and some engineers will not love a tool writing into their bucket on day one.
- **In the local warehouse, data in the bucket.** The bucket stays read-only, which matches "remote read-only" in this brief literally and is a strong trust statement. Costs a change to the lease: it must push the whole metadata tree, not just pointers. Manifests for a few hundred files are kilobytes, so this is fine in practice. Spark on another machine would not see the manifests.

Both variants are the same code with a different FileIO target.

*Recommendation:* local in v0, with a one-flag move into the bucket that session 8 turns on when the worker needs it.
*Decision:*

### R4. Is a registered table a snapshot or live?

Registering in place freezes the file list at registration time. New files the partner's pipeline writes tomorrow are invisible; deleted files break queries. Views over a prefix (option C) are always live because DuckDB globs at query time, and that is the one thing C does better. For Day 0 this is acceptable because partner data is mostly a one-time export.

*Recommendation:* ship `lakelet tables refresh <name>`, which lists the prefix again and adds new files, alongside attach. Scheduled refresh is Day 2 ops. State the snapshot semantics in the partner onboarding doc rather than let a partner discover them.
*Decision:*

### R5. Whose bucket is the demo?

The four-minute demo is the founder presenting to investors, so the bucket can be a Lakelet-owned bucket holding a public dataset shaped like a partner's events table. That decouples the demo from partner data. The partner program is the real constraint: A2 needs ten bursts on a partner's data and a Spark screenshot of a partner's table, so R1 decides this, not the demo script.

*Recommendation:* a Lakelet-owned demo bucket, prepared with the same attach verb partners use, so the demo exercises the partner path.
*Decision:*

### R6. When does it land?

- **Core v0 step 8, replacing register-by-metadata-location as the product verb.** Step 8 is already "remote read-only plus bandwidth probe", and this is the remote read-only path partners will actually use. Adds three to five days to a step that exists.
- **Session 8 with burst.** Defensible if core v0 runs late; costs nothing in design because the primitive is there. Risk: the partner onboarding path stays unproven until the session that already carries the most risk.
- **Day 1.** Too late; partners onboard in week 8 of Day 0.

*Recommendation:* core v0 step 8.
*Decision:*

### What D does not do, said plainly

- Files with drifting schemas across the prefix fail registration. Real data lakes add a column halfway through the year. v0 fails with the file and column named; union-by-name is a follow-up.
- Hive-partitioned layouts where the partition column exists only in the path need path parsing that pyiceberg does not do for you.
- Parquet only. CSV or JSON in S3 is an import, not a registration.
- Tens of thousands of small files mean tens of thousands of footer reads. That wants a progress bar at hundreds and a burst worker at tens of thousands. "Convert your prefix in the cloud" would make a reasonable first burst for a partner.

### If the recommendations are accepted, these lines change

| Where | Change |
|---|---|
| D11 | Remote in v0 = in-place Iceberg registration of a Parquet prefix, plus register by metadata location; both read-only; metadata local by default. `catalog attach` moves to Day 1 |
| §2 In, Remote row | "Register an Iceberg table by metadata location" becomes "Attach a Parquet prefix or an Iceberg metadata location in `s3://` as a read-only Iceberg table; `refresh` picks up new files" |
| §2 Out | "Attaching a remote Parquet prefix" row is deleted; `catalog attach` moves from session 8 to Day 1 |
| §3.5 `tables.py` | `attach` gains the prefix form; `refresh` added; `manifests.py` gains the footer-stats path |
| §3.6 | `lakelet tables attach <name> <s3-prefix or metadata-location>`; `lakelet tables refresh <name>`; `POST /api/tables/{name}/refresh` |
| §4 step 8 | Gate adds: a prefix of plain Parquet in the in-process S3 test server attaches without copying, DuckDB and pyiceberg both read it, `refresh` adds a new file, and a large one returns Red with the bandwidth sentence |
| §7 | The demo bullet is replaced by: the lease pushing a full metadata tree for local-metadata tables (session 8) |
| §9 | One row: the demo finding, the `add_files` measurement, and this block |
| `docs/lakelet-day0-prd.md` | F0.1 gains a story: point at a bucket prefix, get an Iceberg table without copying. F0.7.4 `catalog attach` becomes Day 1 |
| `docs/lakelet-architecture.md` | §5.2 catalog lease: pushes the metadata tree, not only pointers, when a table's metadata is local |

---

This is the brief for the first build sessions. It resolves the conflicts between the existing docs in favour of what serves the product long term while keeping the first beta small enough to ship in weeks with one or two people. Where it changes a decision in another doc, §8 says which line to amend.

---

## 0. The idea in one paragraph

Your laptop is the warehouse until it can't be. One command turns a folder into a lakehouse: Iceberg tables on Parquet, a catalog that speaks the Iceberg REST spec, DuckDB as the engine. Before any query runs, the gauge says whether this machine can handle it and why, in one sentence. When it can't, one click sends only that job to the cloud under a cost cap you saw first. Burst, the team catalog, agents and the desktop app are heads on a local core. The core is the only place logic lives, so it has to be right first. This brief scopes that core.

---

## 1. Decisions

Each one states the call, the reason, and what it costs. Decisions marked *(amended)* changed from v0.2; D19 onward are new. Numbers are referenced from the rest of the file.

**D1. One Python package.** `core/` is a uv project whose importable package is `lakelet`. `cli`, `api`, and later `mcp` are subpackages of it. There is no separate `cli/` directory.
*Why:* `pipx install lakelet` has to produce the CLI. A split package buys nothing until the app sidecar needs to exclude something, and that is a build flag, not a repo layout.

**D2. Python core, confirmed. Rust only in the Tauri shell.** The catalog store and the gauge model sit behind small interfaces so a later Rust port replaces a module, not the design.
*Why:* The build spec and PRD already say this. Architecture §8 is the outlier and gets amended.

**D3. No daemon in v0** *(amended)*. The CLI runs the core in-process for the life of the command. The app runs the same core as a sidecar through `lakelet serve`. Both host one loopback HTTP server, uvicorn in a thread, that always carries the Iceberg REST catalog and, under `serve`, the API as well. The CLI takes an ephemeral port; `serve` writes `{port, pid, token, started}` to `.lakelet/serve.json` with mode 0600 so the app can find it. The app treats the file as a hint, not a fact: it checks the pid is alive and that `GET /api/health` answers with the token before using it, and deletes a stale file. Several processes may open the same project at once: SQLite locking covers the store, and Iceberg's optimistic commit covers the tables.
*Why:* A persistent daemon means lifecycle, discovery and stale-process bugs on day one for no user benefit. `serve.json` is still a discovery file, so it gets the two checks that make discovery files safe. The multi-process story is the same one the team catalog needs later, so it is not wasted.

**D4. "Embedded catalog" means that loopback server.** DuckDB's iceberg extension only speaks to a catalog over HTTP, so in-process still means a port. `lakelet catalog serve --port 8181` is the same app bound to a fixed port for Spark, Trino, pyiceberg and other DuckDBs.
*Why:* Every doc says "embedded" without saying how. This is how. Verified on DuckDB 1.5.5: `ATTACH '' AS lakelet (TYPE ICEBERG, ENDPOINT 'http://127.0.0.1:<port>', AUTHORIZATION_TYPE 'none')` parses and goes straight to `GET /v1/config`.

**D5. Catalog store on SQLAlchemy Core, no ORM** *(amended)*. One schema, SQLite now, Postgres when the team catalog ships. A `meta` table holds the schema version. SQLite runs in WAL mode with a 5 s busy timeout. A table commit is one `BEGIN IMMEDIATE` transaction: read the row, validate the requirements, write the new metadata file, then `UPDATE tables SET metadata_location = :new, previous_metadata_location = :old WHERE … AND metadata_location = :old`. A rowcount of zero is a 409; the orphaned metadata file is harmless, which is the Iceberg convention. The same suite runs against Postgres when `LAKELET_TEST_PG_URL` is set.
*Why:* PRD F0.7.3 promises the team catalog is a config change and that Postgres is validated in a test. That is only true if the SQL is written once against two dialects and the second dialect is actually exercised. The compare-and-swap update is the entire concurrency story, so it is spelled out here rather than discovered in step 1.

**D6. Conformance is tested, not claimed.** The catalog implements the Iceberg REST spec's paths and JSON shapes exactly. pyiceberg's `RestCatalog` is the second client in the test suite from step 1.
*Why:* "Any engine can read what Lakelet writes" is the no-lock-in argument. A second independent client is the cheapest proof.

**D7. History lives in `.lakelet/history.db`, separate from the catalog, and records from run one everything the calibration model will ever need** *(amended)*. Schema in §3.4. It includes the SQL text. The privacy rule is that nothing in `history.db` leaves the machine unless the user opts into sharing, and the share path (Day 1) sends the PRD F0.3.9 fields only. Correction factors are a later reader of that table, not a v0 feature.
*Why:* Calibration data is the compounding asset (build spec §6). The catalog file is the one that becomes Postgres; history never leaves the laptop. Recording is cheap; backfilling is impossible. v0.2 said SQL text was never stored, which would have broken the Recent panel in the mockups, "re-run", and the F0.9 promise that a founder can see exactly what an agent ran. The PRD forbids sharing SQL, not storing it, and the file is gitignored.

**D8. Gauge v0 is the three numbers, the thresholds and the sentence** *(amended)*. Bytes scanned from manifests via pyiceberg after pruning with the predicates DuckDB pushed down (D20). Peak memory from a plan heuristic over `EXPLAIN (FORMAT JSON)`. Wall time from measured throughput. Local disk throughput is measured once at `init` and cached; the bandwidth probe runs when the first remote table is attached. No correction factors.
*Why:* Correction needs twenty runs per machine that do not exist yet. Shipping the sentence early is what earns those runs.

**D9. Bare table names work.** Imports land in namespace `main`. The engine attaches the catalog as `lakelet` and runs `USE lakelet.main`, so `select * from orders` works and `lakelet.main.orders` also works. Verified in step 2.
*Why:* Every mockup and doc writes bare names. No doc says how.

**D10. Fingerprint = sha256 of normalised SQL plus the sorted list of (table, snapshot id) it reads.** Normalised means comments stripped, whitespace collapsed, keywords lower-cased, literals kept. Same SQL on new data is a new fingerprint. `sql_hash` is the same hash without the snapshot list, for "same query shape" lookups.
*Why:* The estimator's error is per plan per data, not per text.

**D11. Scope** *(amended)*. Remote tables are Iceberg tables registered by metadata location, read-only, plus the bandwidth probe (step 8). Remote Parquet prefixes are not attachable in v0: an Iceberg catalog has no place for one, and a gauge with no manifests would read a Parquet footer per file over S3. `lakelet run` (dbt) and `lakelet publish` (S3 writes) are out; they move to sessions 9 and 8. `lakelet catalog attach` (external catalogs) moves to session 8 with `publish`, S3 Tables first. Red on local data in tests comes from lowered thresholds in the test project's `lakelet.toml`; a real Red on a laptop is the bandwidth verdict in step 8 or a query whose peak memory exceeds free RAM plus disk in spike 2.
*Why:* Red has to be real for the idea to land. dbt against an attached Iceberg catalog and the S3 write path each carry their own risk, and neither is needed to prove the local half. The Parquet-prefix path is a hidden project and it is the wrong one to hide inside step 8.

**D12. Public style from the first commit; repo private until Day 1.** Apache 2.0 headers, DCO, no secrets, no partner names in tests or fixtures.
*Why:* The product spec (the phase map) wins over the roadmap lines in architecture §8 and the facts file. Building as if public costs nothing and removes a scrub later.

**D13. Spikes 1 and 2 are not throwaway.** Spike 1 is the catalog's integration test. Spike 2 is the gauge's benchmark harness. Only spike 3 (Fargate economics) stays throwaway, and it can run in parallel from day one.
*Why:* The session plan has the first three sessions producing code that is then discarded and rewritten from session 4. The catalog and the estimator are the two hardest modules; write them once.

**D14. `init` writes `.gitignore`**: `warehouse/`, `.lakelet/`, `.DS_Store`. Commit `lakelet.toml`, `questions/`, `AGENTS.md`.

**D15. Dependencies** *(amended)*. Runtime, with ceilings: `duckdb>=1.5.3,<1.6`, `pyiceberg[pyarrow]>=0.12,<0.13`, `pyarrow`, `sqlalchemy>=2,<3`, `fastapi`, `uvicorn`, `pydantic>=2`, `typer`, `rich`, `psutil`. Dev: `pytest`, `httpx` (API tests), `moto[server]` and `boto3` (the in-process S3 server for the `s3://` matrix), `ruff`. pyiceberg is a runtime dependency because the catalog applies commits with it (D19) and the gauge prunes with it (D20). psutil supplies RAM, cores, free disk, battery state and process RSS. DuckDB extensions (`iceberg`, `httpfs`, `excel`) autoload from DuckDB's repository on first use, which is one documented network fetch; bundling comes with the installers in session 10.
*Why:* PyPI already serves DuckDB 1.5.5 against a floor written for 1.5.3, and the architecture doc's own risk section says to pin because the Iceberg write path is young. Ceilings are bumped deliberately, against the step 1 suite. v0.2 left pyiceberg as a maybe; §9 has the measurement that settles it.

**D16. Simplifications for v0** *(amended)*. Folder import is one table per file (the prefix-merge heuristic in PRD F0.1.2 is a SHOULD and waits). Schema preview is `import --preview`. `--replace` drops and recreates the table, losing that table's snapshot history, because a replace-by-new-snapshot leaves the old data files on disk until snapshot expiry and there is no expiry in v0; `--append` keeps history. `s3://` tests run in the default suite against Moto's threaded server started inside pytest, so the default suite needs no Docker and no credentials; setting `LAKELET_TEST_S3_ENDPOINT` points the same tests at a real S3-compatible endpoint for fidelity, a throwaway AWS bucket nightly or a self-hosted store. MinIO is not used anywhere: it is no longer maintained by the community. Moto is a mock and in-memory, which is right for tests and wrong for the product, so it is never the answer to PRD D3's shim question. The auto-chart is the app's job; the core returns Arrow and column types. `AGENTS.md` lists conventions and refreshes one marked block with the table list on every import, so it does not go stale. A saved question's front matter holds `title` and `created` only; `last_run` lives in `history.db` keyed by slug, so running a question never dirties git.

**D17. Every core operation has a CLI verb with the same name and arguments.** The session plan's "Copy as command" rule, made a design constraint. The HTTP API is the same mapping over localhost. This adds `lakelet tables list | describe | sample | attach` to the CLI, which v0.2 had in the Python API and the HTTP API but not the CLI.

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

---

## 2. Scope

### In

| Area | What ships |
|---|---|
| Project | `init`, `open`; `lakelet.toml`; `AGENTS.md`; `.gitignore` |
| Catalog | Iceberg REST catalog on SQLAlchemy Core + SQLite, commits applied with pyiceberg (D19); loopback server in every process; `catalog serve` on a fixed port |
| Engine | DuckDB 1.5.x with `iceberg`, `httpfs`, `excel`; attached as `lakelet`; `memory_limit` and `threads` from config; profiler on for every execution |
| Tables | Import `.csv .tsv .parquet .json .jsonl .xlsx` and folders into Iceberg tables with explicit type coercion; list, describe, sample; replace or append on re-import; `--preview` shows the inferred and coerced schema and stops |
| Query | SQL in, Arrow record batches out; Red refused unless overridden; conflict retry; every run recorded |
| Gauge | Bytes scanned after manifest pruning, peak memory, local wall time, verdict, one-sentence reason; thresholds from `lakelet.toml` |
| History | Every execution recorded with the full calibration schema including SQL text and profiler actuals; `gauge history` lists it |
| Remote, read-only | Register an Iceberg table by metadata location in `s3://` with the user's own AWS credentials; bandwidth probe; Red verdicts with the bandwidth sentence |
| Questions | Save, list, run `.sql` files with a YAML header in `./questions/` |
| CLI | `init import tables sql estimate catalog question gauge serve` |
| HTTP API | The same operations over localhost with Arrow IPC results and bearer auth; thin; exists so session 6 has something to build against |

### Out, and where it goes

| Deferred | Lands in |
|---|---|
| Burst client, control plane, worker, catalog lease | Session 8 |
| `publish`; `catalog attach` to Polaris, Lakekeeper, S3 Tables | Session 8 |
| Attaching a remote Parquet prefix as a table | Day 1, or `import` from `s3://` if a partner needs it sooner |
| `lakelet mcp` | Session 5 |
| Ask box and any LLM call | Session 7 |
| `lakelet run` and the dbt DAG | Session 9 |
| Spark and Trino smoke test through `catalog serve` (documented, manual) | Session 10 |
| Correction factors, calibration sharing, token on `/v1` | Day 1, on the history data core v0 produces |
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
  questions/
    revenue-by-month.sql  # YAML front matter: title, created
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
    tables.py           preview, import_file, import_dir, list, describe, sample, attach (register by metadata location)
    types.py            DuckDB → Iceberg coercion table (§3.7)
    gauge/
      predicates.py     EXPLAIN Filters → pyiceberg expressions; unparsed conjuncts dropped and counted (D20)
      manifests.py      per-(table, snapshot) file stats via pyiceberg, cached in .lakelet/cache/
      inputs.py         EXPLAIN (FORMAT JSON); machine profile; throughput; bandwidth probe
      model.py          bytes scanned, peak memory, wall time (architecture §4.2)
      verdict.py        thresholds → Green / Yellow / Red; the reason sentence
    history.py          record, recent, question last_run; the schema above
    query.py            gauge → refuse or execute → stream Arrow batches → conflict retry → record actuals
    questions.py        save, list, run
    api/                /api/… over the same server: the operations below, Arrow IPC for results, bearer auth (D22)
    cli/                typer; thin; gauge line to stderr, results to stdout
```

Import direction: `cli` and `api` import everything else; nothing imports them. `catalog` knows nothing about DuckDB. `gauge` knows nothing about the CLI or the history store's SQL. `commit.py` and `manifests.py` are the only modules that import pyiceberg.

### 3.6 Interfaces

Python. The CLI verbs and the HTTP routes are this, one to one (D17).

```python
from lakelet import Project

p = Project.init("acme")                          # or Project.open(".")
p.tables.preview("orders.csv")                    # Schema: name, duckdb_type, iceberg_type, note, sample rows
t = p.tables.import_file("orders.csv")            # TableInfo(name, rows, bytes, schema, location, snapshot_id)
p.tables.list(); p.tables.describe("orders"); p.tables.sample("orders", n=5)
p.tables.attach("events", "s3://bucket/wh/main/events/metadata/v12.metadata.json")
e = p.estimate("select ... from orders")          # Estimate(verdict, bytes_scanned, peak_memory, wall_local,
                                                  #          reason, plan, fingerprint, pruning)
r = p.query("select ... from orders")             # Result: iterates pyarrow.RecordBatch;
                                                  #         .estimate; .actual once complete
r = p.query(sql, allow_red=True)                  # override a Red verdict
p.questions.save("Revenue by month", sql)
p.history.recent(50)
p.catalog.url                                     # http://127.0.0.1:<port> while open
```

CLI. Exit codes: 0 ok, 1 anything else, 2 Red refused, 4 catalog conflict after retries (PRD F0.6.4; 3 arrives with burst).

```
lakelet init [dir]
lakelet import <file|dir> [--name n] [--replace | --append] [--preview]
lakelet tables list | describe <name> | sample <name> [-n 5] | attach <name> <metadata-location>
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

HTTP, loopback only, under `serve`. Every `/api` route requires `Authorization: Bearer <token>`.

```
GET  /api/health
GET  /api/tables            GET  /api/tables/{name}     GET  /api/tables/{name}/sample
POST /api/import            POST /api/preview           POST /api/tables/attach
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
| 1 | Catalog: store, commit via pyiceberg, server, embedded thread. Integration test: DuckDB 1.5.x `CREATE TABLE`, `CREATE TABLE AS`, `INSERT`, `MERGE INTO`, `DROP`, rename through it to a `file://` warehouse; pyiceberg reads the result; 100 commits from concurrent *processes* lose nothing; the 409 path is exercised and it is recorded whether DuckDB retries on its own; a long-lived attach sees a table committed by another process, or the refresh needed is documented; register endpoint round-trips a pyiceberg-written table. `s3://` variant against the in-process S3 test server in the default suite, and against a real endpoint when `LAKELET_TEST_S3_ENDPOINT` is set; Postgres variant behind `LAKELET_TEST_PG_URL` | **Load-bearing.** If the REST attach path fails on `file://`, the local S3 shim (PRD D3) is decided here and only here. Reading a `file:///…metadata.json` location directly is already verified on 1.5.5, so the remaining risk is the attach path, not the scheme |
| 2 | Project + engine + config: `init`, `open`, attach, `USE`, bare names, profiler on | `select * from orders` runs after a manual `CREATE TABLE`; the profile for it has `system_peak_buffer_memory` and per-scan rows |
| 3 | Import: five file types, folders, replace/append, preview with coercion, `tables` verbs, `AGENTS.md` refresh | PRD F0.1 AC: 200 MB CSV ≤ 10 s; 2 GB CSV ≤ 90 s with no swap; a fixture with every row of §3.7 imports and reads back through pyiceberg with the expected Iceberg types |
| 4 | Query + history: Arrow streaming, first 1,000 rows before completion for streamable plans, conflict retry, every run recorded with the §3.4 schema | A history row per run with profiler actuals, derived bytes and SQL text; a forced conflict retries and then exits 4 |
| 5 | Gauge v0 on local tables: predicates from EXPLAIN, manifest cache, model, verdict; the TPC-H harness from the `tpch` extension at SF1 | 80% within 2× on time and 1.5× on bytes; no Green over 3 min; `pruning = full` on every TPC-H query; a test project with lowered thresholds produces Yellow and Red and exit 2 |
| 6 | Questions | Save, list, run with the gauge first; `last_run` comes from history, the `.sql` file is untouched by a run |
| 7 | CLI over all of the above | Ten-minute quickstart on a clean Mac and a clean Ubuntu; `lakelet sql` prints its gauge line within 1 s of process start with warm extensions, measured; if missed, the fix list is lazy imports, then a Starlette-only server |
| 8 | Remote read-only by metadata location + bandwidth probe | A large remote Iceberg table returns Red with the bandwidth sentence; manifests fetched from S3 are cached so the second estimate is under 150 ms |
| 9 | HTTP API + `serve` with bearer auth and health | Session 6 can start; a request without the token gets 401; a non-loopback bind is refused |

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
| Node, cargo | 25.9 and 1.95, for sessions 6 onward |

---

## 6. Definition of done

- **Quickstart.** On a clean Mac and a clean Ubuntu, under ten minutes: install, `init`, `import orders.csv`, `sql` returns Green and rows, `estimate` on a large table returns Red with its sentence, `catalog serve` and pyiceberg reads the table from another process.
- **Tests green.** Catalog conformance and multi-process concurrency, DuckDB write matrix on `file://` and on `s3://` via the in-process test server (a real S3 endpoint and Postgres when configured), import matrix including every row of §3.7, TPC-H SF1 gauge accuracy, 2 GB CSV on the reference machine, all on both CI runners.
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
- The four-minute demo (PRD D2 step 3) needs the partner's bucket to appear as tables. The options, the evidence and the recommendation are in the review block at the top of this file (R1 to R6). Until those are decided, this brief's step 8 registers Iceberg tables by metadata location only.
- Whether dbt-duckdb can target tables in an attached Iceberg catalog. Not core v0, but it sizes session 9.

---

## 8. What this changes in the other documents

| Document | Change |
|---|---|
| `build-sessions/lakelet-build-sessions.md` | Sessions 1, 2 and 4 merge into this brief; spikes 1 and 2 are real code (D13). Session 4's `run` moves to 9; `publish` and `catalog attach` move to 8 (D11). Monorepo line: drop `cli/`; `core/` holds the whole Python package (D1). "Local daemon" becomes "in-process for the CLI, sidecar for the app" (D3). Assign mockup screen 10 (Agents) to session 5. Fix the starting-prompt paths to `docs/lakelet-day0-prd.md` and `docs/lakelet-architecture.md`. Do not create `worker/` and `control-plane/` until session 8 |
| `docs/lakelet-build-sessions.md` | Delete; identical copy (D18) |
| `docs/lakelet-architecture.md` | §8 first paragraph: Python core, Rust only in the shell (D2). §8 week 3–6: repo public in Day 1, not week 3 (D12). §4.1: predicates for pruning come from the optimised plan's scan-node filters, and bytes cannot come from EXPLAIN cardinalities (D20). §3.2: the catalog applies commits with pyiceberg's metadata code (D19). Header: drop the reference to `lakelet-local-first-lakehouse.md` |
| `docs/lakelet-day0-prd.md` | F0.7.2: "embedded" means a loopback HTTP server in the process (D4). F0.3.6: history is `.lakelet/history.db` with the §3.4 schema; SQL text is stored locally and never shared (D7). F0.4.5: `last_run` lives in history, not in the `.sql` file (D16). F0.1.4: the preview shows the Iceberg type each column becomes (D24). F0.6.1: `run`, `publish` and `catalog attach` are not in the first CLI (D11). F0.6.4: v0 exit codes are 0, 1, 2, 4; 3 arrives with burst (D23). F0.7.4: `catalog attach` is session 8. Add: `init` writes `.gitignore` (D14). C2: `/api` bearer token, `/v1` open on loopback in local mode (D22). D3: the `file://` fallback, if ever needed, is a minimal S3 subset inside the sidecar over local disk, not a bundled MinIO, which is no longer maintained |
| `docs/lakelet-v0-build-spec.md` | §7: remove the reference to `status.md`. §3 desktop shell row: the "10–20 MB installer" claim does not survive a Python sidecar that ships pyarrow; say "under 200 MB" or measure in session 10 |
| `docs/facts-and-messaging.md` | Roadmap wk 3–6: "CLI v0 to design partners; public repo in Day 1" (D12) |
| `docs/lakelet-product-spec.md` | No change; this brief follows it |

These edits are step 0 and are not applied yet.

---

## 9. Changes from v0.2, with the evidence

Measurements were taken on DuckDB 1.5.5 and pyiceberg 0.12.0 from PyPI on September 7, 2026, against a two-file Iceberg table written by pyiceberg's SQLite catalog.

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
| Remote Parquet prefixes hidden in step 8 | — | D11: Iceberg by metadata location only; Parquet prefixes to Day 1 |
| Type coercion missing from import | `read_xlsx` registers once `excel` loads; the sniffer's type set is DuckDB's, not Iceberg's | D24; §3.7 |
| Missing endpoints: transactions commit, register, HEAD | — | §3.5 `server.py`; step 1 gate |
| No `tables` CLI verb despite D17 | — | D17 amended |
| `catalog attach` in neither In nor Out | — | Out, session 8 |
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
| MinIO named as the S3 test backend and the shim candidate | MinIO is no longer maintained. On September 8, Moto 5.2.3's threaded server passed DuckDB Parquet write and read, `add_files`, pruning, `iceberg_scan` with a filter, and a pyiceberg append, all over `s3://` | D15, D16, step 1, §6, §8 |
