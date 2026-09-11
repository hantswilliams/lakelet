# Lakelet — real data: S3, dbt views, the next screens (session 9 widened, revision 1)

> **Decided September 11, 2026: R1 to R10 accepted** (Hants, in the file), **R3 amended** the same day: the demo uses a dataset from AWS's Registry of Open Data rather than a Lakelet-owned bucket; see the answer under R3. Step 0 needs the private bucket and its IAM user; step 1 needs no bucket of ours at all.

*September 11, 2026 · Hants' call the same day: the ship brief (`ship-v0-plan.md`, S1 to S14 accepted) waits until the product has been used against a real bucket, dbt views work, and the app has the screens that show both. This brief is that round. It takes session 9 of `lakelet-build-sessions.md` (dbt and the Simple/Technical screens), widens it with real S3 and three app screens, and leaves git auto-commit and the versions screen to a later round. Follows `app-v0-plan.md` and `core-v0.5-plan.md`, which it does not change.*

## 0. The idea in one paragraph

Everything remote has been tested against a fake (Moto in CI, RustFS on the Mac) and everything dbt has been tested as tables; the app shows local files and one query. Before an installer goes to a partner, three things have to be true on real data: a Parquet prefix in a real AWS bucket attaches in place, gets its bandwidth sentence, and reads from another engine; a dbt project with `view` models runs through the gauge and the views are real objects in the catalog rather than a session's memory; and the app can do what the CLI can, at least for what a partner does in the first hour: attach the bucket, look at a table, see what the gauge has learned, and see the dbt project. The round ends when you have used all of it on your own bucket and your own models, which is the week of daily use the app brief asked for, with something worth using.

---

## 1. Decisions for review (R1 to R10)

**R1. This round comes before ship; the ship brief stands as accepted and its numbers get re-measured once, at the end.**
*Recommend:* yes. The order in `TASKS.md` becomes: this round, then session 10 (ship), then 8, then 5. One consequence for the ship brief: `lakelet run` makes dbt a runtime dependency of the bundle (R5), so the frozen sidecar grows by dbt-core and dbt-duckdb (about 15 MB uncompressed) and S3's size expectation moves with it; nothing else in S1 to S14 changes.
- [x] Agree
- [ ] Change:

**R2. Real S3 is the existing step 8 suite against your bucket, from the Mac, with the bucket named by an environment variable and credentials that never touch the repo.**
*Recommend:* `test_step8_remote.py` already switches to a real store when `LAKELET_TEST_S3_ENDPOINT` is set; it gains `LAKELET_TEST_S3_BUCKET` (today the name `lakelet-test` is fixed and the fixture creates it, which a real account should not do by accident) and is run on the Mac with `AWS_ENDPOINT_URL=https://s3.<region>.amazonaws.com` and the keys of an IAM user whose policy allows `s3:ListBucket`, `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject` on that one bucket and nothing else (the tests write fixtures and `--metadata-in-bucket` metadata under it). The setup is one page in `/docs/remote` (the policy JSON, the variables, what the suite writes and deletes, the cost: the fixtures are megabytes; the ten-thousand-file registration stays gated). The results go in the log: attach time, `refresh`, the bandwidth probe's figure against your link, the second estimate under 150 ms with manifests cached. *Not chosen:* a real-S3 job in CI (secrets in a public repo's Actions, and a bill that runs on every push).
- [x] Agree
- [ ] Change:

**R3. The demo bucket is a second, public-read bucket with a public-domain dataset large enough to be Red from a laptop.**
*Recommend:* the core brief's §6 demo path, now with a bucket: a Lakelet-owned bucket with a bucket policy allowing anonymous `GetObject` and `ListBucket` on one prefix, holding a public-domain Parquet dataset above 15 GB (Red is more than ten minutes, and at your 190 Mbps that is about 14 GB scanned; NYC TLC's yellow-taxi trip records are the obvious candidate, all years at roughly 20 GB, and they are already Parquet with a stable schema per year), prepared with `lakelet tables attach` and nothing else. From a laptop `lakelet estimate 'select count(*) from taxi'` is Red with the bandwidth sentence, `select` with a month's predicate is Green through pruning, and pyiceberg reads the registered table from another process. It costs about fifty cents a month to store; a stranger's full scan costs the bucket's owner egress (about $0.09 per GB), which is why the docs say "estimate first" and why the request-payer setting stays off until it matters. *Not chosen:* pointing the docs at a public dataset in someone else's bucket (the layout is not ours to keep stable).
- [x] Agree - but i would like to do use something that is perhaps already available on a public s3 bucket with read only access? or would we need one with write access as well? im thinking for demonstration purposes, it could be nice to use a free open dataset openly hosted by AWS 
- [x] Change: *(answer, September 11)* Read-only is enough. `tables attach` writes nothing to the bucket by default: D26 keeps the table's metadata under the laptop's own `warehouse/`, and the data files are read in place; only `--metadata-in-bucket` writes, and that is session 8's. So the demo is a dataset from AWS's Registry of Open Data (public read, anonymous, and AWS carries the egress, so a stranger's full scan costs nobody anything), which is better than R3 as written on every count but one: the layout is theirs to change, so `/docs` names the release or prefix it was tested against. What it needs from the core: anonymous access, which is refused today (a machine with no credentials gets "set AWS_ACCESS_KEY_ID…"), so step 1 adds `lakelet tables attach|discover --anonymous` (pyarrow's `anonymous=True`, an unsigned DuckDB secret, the flag kept in the table's properties so `refresh` and every read use it too) and the app's "public bucket, no credentials" checkbox. The candidate must be Parquet with one schema across the prefix, in a layout D25 registers (plain or hive-partitioned by columns that are also in the files), above 15 GB under one prefix, and not requester-pays; step 1 tries `lakelet tables discover` on two or three (Overture Maps' `places` and `buildings` themes, Common Crawl's `cc-index` table, the NYC TLC set if its bucket still lists) and records which one it is and why. R3's own bucket is not created.

**R4. Attach from the app is a typed `s3://` prefix, discovery before registration, and the credentials the CLI already uses.**
*Recommend:* the drop zone's path box accepts an `s3://bucket/prefix/`; the preview panel then shows `GET /api/tables/discover` (files, sizes, the schema read from one footer, a drift or layout error named as the CLI names it) and one button, "Attach as <name>", which is `lakelet tables attach <name> s3://…` and `POST /api/tables/attach`. The bandwidth probe runs where it runs today (first remote use) and the gauge line carries the Red bandwidth sentence unchanged. The tables panel marks an attached table with its source and offers "Refresh" (D27). Credentials: none in the app and none in `lakelet.toml`; the sidecar inherits the shell's environment, which is the CLI's chain (D36), and `/api/health` gains `aws: {configured, region}` so the panel can say "no AWS credentials in this environment; set AWS_ACCESS_KEY_ID… or AWS_PROFILE and restart the core" before the user types a prefix. The settings row for a bucket and a region (PRD F0.8.4) waits for session 8 with the writes. *Not chosen:* a keys form in the settings panel (the PRD wants keys in the OS keychain, which is its own piece of work, and the Tauri shell's environment already carries a developer's profile).
- [x] Agree
- [ ] Change:

**R5. dbt: `lakelet run` in the core, the plugin lifted into the package, dbt as an optional extra; the app gets the Models panel and the Simple/Technical toggle; git auto-commit and versions wait.**
*Recommend:* `tests/dbt_plugin.py` becomes `lakelet.dbt` (the dbt-duckdb plugin and the materialisation macro it already carries); `lakelet run [selectors] [--burst never]` compiles the project with dbt-duckdb, estimates each model's compiled SQL through the gauge, prints the DAG in dependency order with a verdict per model, then runs it in that order through the catalog (PRD F0.7.3; `--burst auto` is session 8 and refuses today with the sentence that burst does not exist yet); `GET /api/run/plan` returns the DAG with verdicts and `POST /api/run` streams progress. dbt-core and dbt-duckdb move from dev to an optional extra `lakelet[dbt]` (the CLI without it says "install lakelet[dbt]"), and the app's bundle includes the extra. The app: screen 7's Models panel (the `models/` files, the DAG coloured by verdict, a model's SQL, its tests from `schema.yml`, its last run from history) and screen 8's Simple mode (questions as cards with their checks and freshness), with the Simple/Technical toggle in the bar and the vocabulary mapping from the build spec. Git auto-commit on save, the "last change" commit line and screen 9 (versions, restore) are the next round: they need a git strategy of their own. *Not chosen:* the app driving dbt itself (the CLI must be able to do everything the app does).
- [x] Agree
- [ ] Change:

**R6. A dbt `view` model is an Iceberg view in Lakelet's catalog, and the engine gives DuckDB a view of the same name on connect.** *Built September 11 with one deviation: the catalog write is `lakelet run`'s, after the run, not the materialisation macro's (a macro cannot reach the catalog; DuckDB's Iceberg catalog refuses `CREATE VIEW`; a Python UDF would need numpy). A bare `dbt run` reads the catalog's views through the plugin but does not record its own. The log of September 11, §17, has the detail.*
*Recommend:* the catalog gains views: the Iceberg REST view routes (`/v1/{prefix}/namespaces/{ns}/views`, create, load, replace, drop) and a view-metadata file per the Iceberg view spec, one SQL representation with dialect `duckdb`, stored under `warehouse/main/<name>/metadata/` as tables are. The engine, after `ATTACH`, lists the catalog's views and runs `CREATE VIEW main.<name> AS <sql>` in its own session, and re-syncs after any view change through the API or the plugin; `/api/tables` lists views with a `kind` so the panel shows them as views. The dbt plugin's `view` materialisation writes the view through the catalog (create or replace) instead of DuckDB's own `CREATE VIEW`, so a view survives the process and a second `lakelet serve` sees it. DuckDB's iceberg extension does not read views from a REST catalog, which is why the engine does it; Spark 3.5 with Iceberg 1.5 reads views through the REST catalog, so the engines smoke gains a view read (dialect permitting: the SQL is DuckDB's, and a view Spark cannot parse is Spark's error to show, recorded as such). *Not chosen:* views as session-only DuckDB objects recreated from the dbt manifest (gone without dbt, invisible to the API, to a second process and to every other engine); materialising views as tables under the name (a lie about cost, and `refresh` semantics no one asked for).
- [x] Agree
- [ ] Change:

**R7. The table detail is one panel from `describe`, with expire, refresh and sample as buttons.**
*Recommend:* clicking a table in the panel opens its detail: columns with Iceberg types, partitioning, location and source (local, attached, view), freshness, the snapshot list (id, when, operation, rows and bytes added), the reclaimable line and the retention, and three buttons: "Sample rows" (`lakelet tables sample`), "Expire snapshots" (`lakelet tables expire <name>`, showing the report), and for an attached table "Refresh" (`lakelet tables refresh`). Each shows its CLI line with copy. `GET /api/tables/{name}` already carries most of it; the snapshot list is the addition.
- [x] Agree
- [ ] Change:

**R8. The gauge screen (screen 5) is built now, from history, with the export button; the learned line says "not yet" until ship.**
*Recommend:* a Gauge screen from `GET /api/history` (plus the health tiles it already has): the machine line; runs recorded, the share within 2× on time, Green runs over three minutes; the run list (when, verdict, where it ran, estimate, actual); the estimate-versus-actual scatter on log axes with the diagonal (Vega-Lite, through the interpreter as the chart is); "Learned on this machine" reading "after 20 runs" until the correction ships in session 10 (S10), then the factors; "Export history" as `lakelet gauge export`, which is the ship brief's S11 built here because the button is on this screen (the F0.3.9 field list and its test come with it); "Reset" as `lakelet gauge reset`; "Probe again" as `lakelet gauge probe`. The sharing toggle stays the settings row it is.
- [x] Agree
- [ ] Change:

**R9. The first Arrow batch reaches the page as soon as the core has it.**
*Recommend:* the open item from session 6: the first flush of `/api/query`'s response. Find where the batches wait (the async generator's first `yield` against uvicorn's write buffering) and make the first batch go out on its own; the Playwright timing test (`data-first-rows-ms`) is the gate, with the first batch's row count asserted small. An afternoon; in this round because every screen above reads through the same path.
- [x] Agree
- [ ] Change:

**R10. Gates as before: pytest for the core, Playwright against real sidecars for the app, Moto in CI and your bucket on the Mac; the dbt tests need the extra installed.**
*Recommend:* yes. The Playwright sidecars gain one with a dbt project (models, a view, `schema.yml`) generated in setup, and one whose catalog holds an attached table over Moto for the attach screen; the real bucket is run by hand with the results in the log; the Spark view read is the compose profile on the Mac.
- [x] Agree
- [ ] Change:

---

## 2. Scope

**In this round:** `LAKELET_TEST_S3_BUCKET`, `/docs/remote`, the step 8 suite against the real bucket; the demo bucket; `aws` in health; attach and discover in the app with refresh in the panel; the table detail; the Gauge screen with `gauge export` and `gauge reset`; `lakelet.dbt`, `lakelet run`, `lakelet[dbt]`, `/api/run`; Iceberg views in the catalog, the engine's view sync, the plugin's `view` materialisation, views in `/api/tables`; the Models panel, Simple mode, the toggle; the first flush; the Spark view read in the smoke; docs for each.

**Not in this round:** git auto-commit and screen 9 (next round); `--burst auto` and writes to S3 (session 8); keys in the keychain and the bucket settings row (session 8); column lineage (Day 3); the ask box (parked); everything in the ship brief, which follows.

---

## 3. Architecture notes

**Views in the catalog.** `store.py` gains a `views` table beside tables (namespace, name, metadata location, current version); `server.py` the REST view routes; `commit.py` nothing (a view replace is one metadata write, no manifests). The engine's sync is one query of the catalog's view list and one `CREATE OR REPLACE VIEW` each, after `ATTACH` and on a `views_changed` signal from the API and the plugin (in-process, the same `Project`). A view's SQL references tables as `main.<table>`, which is what dbt compiles to under the plugin.

**`lakelet run`.** dbt-duckdb is driven through its Python entry (`dbtRunner`) with the plugin configured as today; the compile pass gives the manifest; the estimate pass runs each model's compiled SQL through `gauge.estimate` in dependency order; the run pass is dbt's own with the materialisations. The DAG on the CLI is one line per model: `  stg_orders  Green  2 s`; in the app the same list coloured, with the model panel to the right.

**Screens.** The bar gains `Tables · Gauge · Models` (Technical) or `Tables · Questions` (Simple); the SQL box stays on Tables. Simple mode hides the SQL box's verdict detail behind the sentence, renames as the build spec's table says, and shows questions as cards; nothing in the core knows about modes.

---

## 4. Build order

Each step ends with a test that stays in the suite, or a measurement recorded in §6.

| Step | Builds | Gate |
|---|---|---|
| 0 | Real S3 (R2): `LAKELET_TEST_S3_BUCKET`, the fixture no longer creating a bucket when real, `/docs/remote` with the policy and the variables; `aws` in health | The step 8 suite green against your bucket from the Mac, the numbers in the log (attach, refresh, the probe's Mbps, the cached second estimate); Moto in CI unchanged |
| 1 | The demo bucket (R3): the dataset copied, the policy, `attach` from a laptop, the docs' "try it on a real bucket" section | `lakelet estimate` Red with the bandwidth sentence from the Mac; a month's predicate Green through pruning; pyiceberg reads the table from another process; recorded in the log |
| 2 | Attach in the app (R4): the path box taking `s3://`, discovery in the preview panel, "Attach as", the source and "Refresh" in the panel, the no-credentials line | Playwright against a sidecar with Moto: discover shows files and schema, attach lands, the panel shows the source, refresh adds a file; the credentials line when the environment has none; the command lines held by Vitest |
| 3 | The table detail (R7); the first flush (R9) | Playwright: the detail shows columns, snapshots and the reclaimable line after a replace, expire runs and the line clears, sample shows five rows; the first-rows timing test with the first batch's row count asserted |
| 4 | The Gauge screen (R8): `/api/history` as the screen needs it, `gauge export` with the F0.3.9 test, `gauge reset`, the scatter, the buttons | Playwright: after three runs the list has three rows and the scatter three points; export writes a file the test greps for no table or column name; reset empties the list. Core tests for export and reset |
| 5 | dbt in the core (R5, R6): `lakelet.dbt`, the `lakelet[dbt]` extra, views in the catalog with the REST routes, the engine's sync, the plugin's `view` materialisation, `lakelet run` with the DAG by verdict, `/api/run/plan` and `/api/run`, `kind` on the table list | pytest: a project with a table model and a view model runs, the view is in the catalog and readable from a second `Project` and through `/api/query`, a replaced view updates, a dropped model's view goes; the DAG prints verdicts in dependency order; `--burst auto` refuses with the sentence; the Spark view read in `tests/smoke/` (Mac) |
| 6 | dbt in the app (R5): the Models panel, the model detail, the DAG list by verdict, "Run all" and "Run this", Simple mode with the cards and the vocabulary, the toggle | Playwright against the dbt sidecar: the panel lists the models with verdicts, the detail shows the SQL and the tests, run completes and history has the runs, Simple mode shows the cards with checks |
| 7 | Docs (`/docs/remote`, `/docs/dbt`, `/docs/app` updated, the CLI reference), the log, `TASKS.md`, the ship brief's S3 expectation re-measured | §6 recorded |

---

## 5. Toolchain

| | Version |
|---|---|
| dbt-core, dbt-duckdb | the versions in `uv.lock` today (dbt 1.12, dbt-duckdb 1.11), becoming the `lakelet[dbt]` extra |
| AWS | your account: one private bucket for the suite, one public-read bucket for the demo, an IAM user scoped to the private bucket; the region you choose (the docs say `us-east-1` as the default) |
| Spark, Trino, RustFS | `compose.yaml`'s `engines` profile, as before, on the Mac |
| Everything else | as `app-v0-plan.md` §5 |

---

## 6. Definition of done

- [x] **Real S3.** *(September 11: 10 passed against the bucket; the second estimate 3 ms after the metadata cache; `/docs/remote`.)* The step 8 suite green against your bucket; attach, refresh and the probe's figure recorded; `/docs/remote` says how to set it up and what it costs.
- [x] **The demo bucket.** *(September 11, amended to Overture on AWS Open Data: `addresses` Red at 21.9 GB with the bandwidth sentence, a bbox count Green in 4 s, pyiceberg reading 126,285 rows anonymously; `/docs/remote`.)* Red with the bandwidth sentence from a laptop; a pruned month Green; pyiceberg reads it from another process; the docs point at it.
- [x] **The app does the first hour.** *(September 11: attach, the detail and expire, the Gauge screen and export, the Models screen and `lakelet run`; Playwright 22 against seven sidecars.)* Attach a bucket, open a table's detail and expire its snapshots, see the gauge's record and export it, see the dbt project and run it; each with its CLI line. Playwright covers each against real sidecars.
- [x] **Views are real.** *(September 11, all but the Spark read, which is the smoke still to run on the Mac.)* A `view` model is in the catalog, survives a restart, is read by a second process and by `/api/query`; Spark reads it or says why not (recorded).
- [x] **`lakelet run` prints the DAG by verdict** and runs it; `--burst auto` refuses honestly.
- [x] **The first rows land early** *(the first batch asserted ≤ 1,000 rows)*: the first batch's row count asserted small in the timing test.
- [ ] **Tests green** on both CI runners *(green locally on the Mac and in the container; CI after step 6's push)* with the dbt extra installed; the core suite, Vitest, Playwright, cargo.
- [ ] **You used it for a week** on your bucket and your models (the app brief's last line).

---

## 7. Known unknowns

- Whether DuckDB's iceberg extension will read REST-catalog views in a version inside our `<1.6` ceiling; if it does, the engine's sync becomes unnecessary and is removed.
- Spark's tolerance of DuckDB-dialect view SQL; the smoke records the first refusal.
- dbt-duckdb's `view` materialisation hooks: whether the plugin can override it cleanly or the macro has to be replaced as the table one was.
- The bandwidth probe against a real region from your link versus the 190 Mbps the site claims; step 0 measures.
- The first flush: whether the wait is uvicorn's, anyio's or the browser's; step 3 finds out.
- The demo dataset's exact size and licence line (TLC's data is public with attribution).

---

## 8. What this changes in the other documents

| Document | Change |
|---|---|
| `build-sessions/lakelet-build-sessions.md` | Session 9's line widened: real S3, views, three screens; git auto-commit and screen 9 to the round after |
| `build-sessions/ship-v0-plan.md` | S3's expectation gains dbt's weight; S11's export is built here; S12's smoke gains the view read |
| `build-sessions/core-v0.5-plan.md` | D30 gains views; D15's dev dependencies: dbt becomes the `lakelet[dbt]` extra; §6's demo path answered |
| `docs/lakelet-day0-prd.md` | F0.7.3 met without `--burst auto`; F0.8.4's bucket row deferred to session 8 (recorded) |
| `web/src/content/docs/` | `remote.md`, `dbt.md` new; `app.md`, `tables.md`, `gauge.md`, `cli.md` updated |
| `TASKS.md` | The order: this round, then ship, then 8, then 5; the Hants items: the buckets and the IAM user |
