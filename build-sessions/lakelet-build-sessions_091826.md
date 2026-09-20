# Lakelet — build session log, September 18, 2026: the lineage screens and S3 writes (decisions W1, W2, L1 to L3)

*Hants and Claude · `decisions-for-review_091726.md`, all five agreed by Hants 2026-09-18; built in the order the file proposed: L3, L1, then W1, W2, L2. Ship (`ship-v0-plan.md`) stays held. Steps 4 and 5 of the versions round were committed on the Mac as `984d834`.*

## 1. L3: a snapshot names the models it made out of date (`tables.py`, `lineage.py`)

`describe`'s `snapshot_list` entries gained `affects`: the models downstream of the table (any depth, through lineage's graph) whose last successful run is older than the snapshot, in dependency order (depth, then name). One graph per describe, read from the manifest as it is — nothing compiles in `describe`; the lineage lines compile when a detail opens — and one history read per downstream model, then a filter per snapshot (`Graph.downstream_runs`). A missing manifest (a project never compiled) now reads as no models rather than an error, which `describe` on a fresh project needed.

The app's table detail shows it on each snapshot row — "made out of date: stg, by_customer", each name a link that opens the model on the Models screen — and, when any snapshot affects anything, a line under the list ("2 models are out of date because of these commits.") with **Run what changed** and its `lakelet run --stale` line; the Tables screen runs it, says what was built in the notice, and re-reads the detail so the list empties. Simple mode: "2 questions need refreshing because of this".

Gates: `test_stale.py` gained a test — before any run nothing affects anything; after a run and an insert the newest snapshot affects the four models in dependency order and the create before it affects none; a table nothing reads affects nothing; after `run --stale` every list is empty; the route carries it. `TableDetail.test.tsx`: the rows, the links, the button, Simple's words, no line without a handler. `models.spec.ts`: after Run all, `lakelet sql` in another process appends a row to orders (the page reloads, since the write came from outside), the orders detail names `stg, by_customer` on the newest snapshot with the line and the button, Run what changed builds them, the lists empty; the Gauge screen's run count moved from two to five (the insert and the two rebuilt models are runs too).

## 2. L1: the Lineage screen (`lineage.py`, `screens/Lineage.tsx`, `lib/graph.ts`)

**The state rules moved into the graph.** `Graph.states()` computes every model's state in dependency order (a depth-first visit over the model nodes, so a model sees the state of what it reads) with the rules step 4 wrote in the runner — never, edited (the compiled SQL's hash against the last run's), upstream (a model it reads not fresh, or a table or view it reads changed after the run), fresh — and `runner._states` now applies `graph.states()` to the planned models instead of its own copy. One difference, for the better: under a selective plan an unselected upstream model used to be judged by its node's freshness only; now its own state is computed too (with the SQL check skipped when the partial manifest has no compiled code for it). `test_stale.py` and `test_lineage.py` pass unchanged.

`Graph.whole()` is the graph as the screen draws it: every node with kind, whether a model builds it, its state and reason, an attached table's source and the freshness; every edge with its via (an edge to a `source()` the catalog lacks is left out). `GET /api/lineage` and `lakelet lineage --all [--json]`; the text form lists nodes with their state, then edges as `src -> stg_orders (sql)`. A bare `lakelet lineage` with neither a name nor `--all` says which to give.

**The screen.** Fourth in the bar (Simple: **Map**). `lib/graph.ts` lays out the graph with no library: a node's layer is one more than the deepest thing it reads (a longest-path over the upstream edges; anything reading nothing is layer 0; a cycle ends where it started), rows within a layer by the mean row of what the node reads, then by name — fifty lines, pinned by `graph.test.tsx` (a chain, a diamond, a lone table, the row rule, a cycle). `screens/Lineage.tsx` draws SVG: 220 px columns, 64 px rows, a rounded rect per node with its name and a caption (a model's state in the mode's words, `attached`, `view`, `table`), cubic edges from a node's right edge to its reader's left, classed by via (a `ref` in the lake colour, `source` and `sql` grey, a view's SQL dashed) with the sentence on hover. A model is classed by state — fresh green-edged, edited and upstream amber-filled, never dashed grey — and the header counts what is out of date. A node is a link: a model to the Models screen with it selected, a table or view to its detail on the Tables screen, through App's `followModel` and `followTable` from step 4; the graph re-reads when the tables list changes. Empty project: one sentence. `Lineage.test.tsx`: the nodes, the edges' classes, the layers' x positions, both clicks, the command, Simple's captions, the empty state. `models.spec.ts`: three nodes and two edges on the seventh sidecar, both fresh after Run all, the model click landing on the Models screen with `by_customer` selected, the table click opening the orders detail; after the insert both models amber and "2 models out of date".

## 3. W1: a warehouse in a bucket (`project.py`, `config.py`, `dbt/plugin.py`, `tables.py`)

`lakelet init --warehouse s3://bucket/prefix` (`Project.init(warehouse=)`): only an `s3://` value is taken (anything else is refused before a file is written), `lakelet.toml` carries it with a note that it is fixed at init, and no `warehouse/` folder is made. Nothing else in the core needed to know: the catalog's `warehouse_url` already resolved to the prefix, pyiceberg's `FileIO` and DuckDB's httpfs already carried the credentials, and every write path — `import`, `CREATE TABLE`, `lakelet run`'s table models — put its files under `<prefix>/main/<table>/` from the first commit. Two things did need doing. dbt's connection had no S3 secret, so a model over a bucket table went to the real AWS endpoint and failed: `plugin.configure_connection` now creates the same secret the engine has (explicit keys from the environment, else the credential chain, tried and left alone when it resolves nothing). And `expire` refused a table whose location was not under the local warehouse; it takes an `s3://` location now and deletes the expired snapshots' files in the bucket (the orphan sweep of unreferenced files stays local-only, said so in `/docs/remote`). `config set project.warehouse` is refused, as the settable list already had it; `relocate` has nothing to do for such a project.

The app's tables panel says **bucket** with the bucket's name for such a table, and the detail says "in a bucket, the project's warehouse: s3://…". The welcome screen's project box did not gain a warehouse field: that is the Rust side (`projects.rs` runs `init`), which the container cannot compile, so the CLI is the way to make such a project and `/docs/remote` says so; it is an open item in `TASKS.md`.

Gates: `test_s3_warehouse.py`, on Moto — `init` writes the warehouse and makes no folder, refuses a non-bucket value and the setting; then the product path on one bucket project: import (data and metadata in the bucket, nothing under the project), the gauge calling it remote, a write through SQL as a second snapshot, `lakelet run` with a table model in the bucket and a view model in the catalog, pyiceberg reading every table from another process, every model fresh after its run, a rebuild in place then `expire` deleting the old snapshot's files in the bucket, nothing to relocate, the list saying where the tables are, a save as a version. `bucket.spec.ts` on a tenth sidecar (Moto started before `init`, `--warehouse s3://lakelet-test/warehouse`, an orders CSV imported with the keys in the environment): the panel's **bucket**, the detail's location, one snapshot, nothing to expire, a query with its verdict and rows.

## 4. W2: `lakelet tables publish` (`relocate.py`, `tables.py`, the route, the box)

The rewriter `relocate` wrote for a moved folder — every `metadata.json`, manifest list and manifest written again with translated paths, position-delete files rewritten with the data files' new paths — was one function away from a publish. `relocate.py` gained `_rewrite(project, name, old_location, translate)` (extracted; `relocate` calls it) and `publish(project, name, prefix, dry_run, cap_seconds)`: the table's files (data, manifests, every metadata file) copied to `<prefix>/main/<name>/` with the same relative names, a file already there at the same size skipped so an interrupted publish resumes, then `_rewrite` with the translation `source_root → target_root`, then the catalog moved to the new metadata in one commit — the last step, so a crash before it leaves the local table untouched. Refused (`NotPublishable`): a prefix that is not `s3://`, an attached table (`SOURCE_PROPERTY`), a table already in a bucket, and, with `cap_seconds`, a copy the bandwidth figure says would take longer, the way Red refuses. The report: files, bytes, copied, skipped, metadata and delete files rewritten, `seconds` (the bandwidth estimate, null without a figure), `dry_run`.

The local files stay as orphans: `describe` counts them (`local_copy_files`, and the CLI's `local copy: N file(s) still under the warehouse: lakelet tables expire <name>`), and `expire` sweeps them after its grace, since nothing in the bucket references them — `Tables._local_copy` lists the table's old folder for both. The verb: `lakelet tables publish <name> <prefix> [--dry-run] [--yes]`; the cap is `gauge.yellow_max_seconds` unless `--yes`. The route: `POST /api/tables/{name}/publish` `{prefix, dry_run, yes}`, 404 / 409 `not_publishable`. The app: a local table's detail has **Publish to a bucket…** (Simple: **Move to a bucket…**) opening a box with the prefix, **Weigh it** (the dry run: "4 files, 12 KB to copy to s3://…/main/orders, about 2 s at the measured bandwidth."), **Publish**, and on a refusal over the cap **Publish anyway** (`--yes`); the line beside it is the CLI's, `--dry-run` until it has been weighed. The Tables screen says what moved in the notice, re-reads the list (the panel says **bucket**) and the detail (the location, the local-copy line, no box any more).

Gates: `test_s3_warehouse.py` gained two tests. On a local-warehouse project with a table of three snapshots (an import, an append, a delete — so a position-delete file) publish moves it: every file in the bucket, the catalog pointing there, three snapshots, 1,490 rows, time travel to the first snapshot from DuckDB, pyiceberg planning only `s3://` files, the list saying where, the local copy counted on `describe` (and printed by the CLI) then swept by `expire` with the table still reading 1,490 rows from the bucket; a second publish refused. Then: an interrupted copy (half the files put in the bucket first) resumes with those skipped; the three refusals; the cap with a bandwidth figure so low the copy would take days, and `--yes` past it; the verb's dry run, refusal and success lines; the route's 404 and 409. `TableDetail.test.tsx`: the box, the disabled button until the prefix is a bucket, the dry-run line, the weighed sentence, the refusal with **Publish anyway** and its `--yes` call, no box for a bucket or attached table, the local-copy line, Simple's words. `attach.spec.ts` (the fifth sidecar has Moto and the keys): an orders CSV imported from another process, the detail's box, weigh, publish, the notice, the panel's **bucket**, the detail's location and local-copy line, one snapshot.

## 5. L2: the Changes feed (`changes.py`, `history.py`, the route, the screen, the strip)

`lakelet changes [name] [--since 2d] [--last 50] [--json]` and `GET /api/changes`: one list, newest first, from the three sources the core already keeps. `changes.py` reads every table's snapshots straight from the metadata (the operation and rows from the summary, and `affects` — the models the commit made out of date — from one lineage graph's `downstream_runs` per table, as L3 does on `describe`), history's last run per model and per question (`History.last_runs()`, a read over `model_runs` and `question_runs` joined to `runs`; nothing new is written), and git's commits under `models/` (dulwich's walker on that path, `tree_changes` against the first parent to name the models and questions each touched, `models/questions/<slug>.sql` a question, any other `.sql` a model). Each entry carries `when`, `kind` (`snapshot`, `run`, `version`), `name` and `target` (`table`, `model`, `question`, or `project` for a version about several files or none — `lakelet init`'s own commit is one), and the source's fields; `--since` takes `2d`, `12h`, `30m`, `1w` or an ISO date; a name is exact and a version counts for every file it touched. The CLI prints a line per entry in Technical words (`orders: 1,200 rows added; made out of date: stg, by_c`, `by_c built in 1.2 s, Green`, `save question: Total · by Ada Lovelace (3f2a1c9)`); the app builds the mode's own.

Two things worth knowing. History keeps one run per model and per question — the latest — so a model built three times is one run entry beside its three snapshots; keeping every run is a schema migration and a decision, not a reading, so it is an open item, not a change. And a commit's time is whole seconds while a snapshot's and a run's are milliseconds, so two entries inside the same second can print in the wrong order; the test spaces its steps by a second and nothing else needs to care.

**The screen and the strip.** **Changes** in the bar (Simple: **Recent**), fifth: the last hundred entries as rows — when, the source (`snapshot`/`run`/`version`; Simple `data`/`refresh`/`saved`), the sentence, and a link per name (a table's detail on the Tables screen, a model on the Models screen; a version about two models has two). The **Name** box is the CLI's argument (the request carries it; the line beside shows `lakelet changes <name> --last 100`). `lib/changes.ts` holds the sentences: Technical `orders: append +1,200 rows · made out of date: stg`, `by_c built in 1.2 s, Green`, `save question: Total · Ada Lovelace`; Simple `orders: 1,200 rows added · 1 question needs refreshing: stg`, `by_c refreshed in 1.2 s`, `Total saved, a new version · Ada Lovelace`, a restore `Total restored to 3f2a1c9`, a run-time version `by_c changed before a refresh`. Every table, view and model detail gained a **Recent** row (`components/Recent.tsx`, after Reads from / Feeds): its own last five entries and **All changes**, which opens the screen filtered to it (App's `followChanges`, beside `followTable` and `followModel`).

Gates: `test_changes.py` — on a project with a table, a model and a question: the create's snapshot and init's version at first; after a run, two saves, a restore and an insert, the order and shapes (the insert naming `by_c` as made out of date, the restore/update/save versions about `total`, the run entry for `by_c` with its seconds and verdict, the run-time version naming `by_c`); the name filter (three versions for `total`, two snapshots for `src`, a snapshot, a run and a version for `by_c`), `since` and `last`; `parse_since`; the CLI's lines, `--json` equal to the route, `nothing about nowhere`, a bad `--since`; the route's `last`, `since`, `name` and 400; a folder that is no repository and never compiled answers with its snapshots. `changes.test.tsx`: every sentence in both modes and the links. `Changes.test.tsx`: the screen's order, links, filter and command, Simple's words, arriving with a name; the Recent strip's request, line, link and empty state. `versions.spec.ts` (the eighth sidecar): the strip on the seeded question's detail with the restore and update, Run this adding a run entry, All changes arriving filtered with the CLI's line, the whole project's feed with the import's snapshot and `lakelet init` at the bottom and the run at the top, the table link opening the orders detail with its own strip, Simple's words.

## 6. Noticed on the way

`test_step7_cli.py`'s export test forbade the literal `990` in the export, which a hash or a float can contain by chance (it did, once, in the container). The literal is `987654` now — a test-only change. The table detail's affected line (L3) was a `<p>` holding the command's `<div>`, which React warns about; it is a `<div>` now.

## 7. Gates

Core **258** passed, 10 skipped; Vitest **96**; Playwright **31** on ten sidecars; `ruff`, `tsc` clean; the CLI reference and the README's status block regenerated; the site builds; `/docs/tables` (publish, the changes feed), `/docs/remote` (a warehouse in a bucket, publish), `/docs/app` (the publish box, the Changes screen and the Recent strip), `/docs/api` (two routes), `/docs/catalog`, `/docs/index`, `status.ts` updated.

## 8. Where this leaves the batch

All five of `decisions-for-review_091726.md` are built: L3, L1, W1, W2, L2. Open, in `TASKS.md`: the welcome screen's warehouse field (Rust, on the Mac); history keeping one run per model (a decision, if every run should show in the feed). Ship (`ship-v0-plan.md`) is next and stays held until Hants says.

## 9. Later the same day: three polish items from `TASKS.md`

After the website branch was merged (`8e9faca`, PR #1: `web/` and the logs only; `core/` and `app/` untouched) Hants chose the small open items over lifting the ship hold.

**`lakelet run <model>` no longer echoes the compiled SQL.** dbt's `compile --select <name>` prints that node's compiled code on stdout even under `--quiet`, ahead of Lakelet's DAG. `_invoke` now passes `--log-level none` for stdout and `--log-level-file debug` so `.lakelet/dbt/logs/dbt.log` keeps dbt's default (the first attempt turned both off, and `test_run`'s bare-run test, which reads that log, caught it). Failures still arrive as the result's exception. `test_run.test_the_cli_and_the_routes`: `lakelet run by_c --plan` prints the DAG and nothing before it.

**The Copy line reads as the SQL does.** `shellArg` puts an argument with a single quote in double quotes when it holds nothing a double-quoted string would interpret (`$`, a backtick, `\`, `"`, or a `!` other than `!=`, which bash leaves alone), so the query screen's line is `lakelet sql "select … where m = 'jan'"` rather than `'select … where m = '\''jan'\'''`; anything else keeps the safe single-quoted form. `command.test.tsx` has both ways and the edge cases.

**The grid's columns are sized to what they hold.** Every column was an equal share of the width (`repeat(n, minmax(120px, 1fr))`), so a two-column result put its number half a screen from its header. `Grid.columnWidths` takes the longest of the header and the first two hundred rows' cells in characters of the mono face, between 96 px and 480 px, and the last column takes what is left; `Grid.test.tsx` pins the widths and the template.

Gates: core **258** passed, 10 skipped; Vitest **98**; Playwright **31**; `ruff`, `tsc` clean. No docs changed: none described the old behaviour.


---

## Separate website worktree: merge committed remote main

Hants approved bringing GitHub's committed `main` into `codex/website-exploration`.
Fetched and merged `origin/main` at `d0f1324` into the separate sibling worktree,
starting from website commit `f5a3134`. No local main-checkout files were copied or
edited. The website branch's existing publication authorization covers pushing
this integration; merging the website into main and deploying it remain separate.

### Resolution

- Kept the selected dark/lime website and the Lookahead interaction.
- Used main's complete CLI/API reference and current feature status, retaining the
  approved Lakelet Lookahead name. Other product docs merged; the only docs change
  relative to main is the already-approved gauge-guide branding.
- Preserved both branches' September 16 and 17 session logs in their dated files.
- Updated the storage diagram: reading and publishing to S3 are available, including
  a solid publishing arrow and a link to the publishing guide. Remote compute and a
  shared catalog remain planned. Explained where bucket data, metadata, and the
  local catalog live; clarified that a folder backup excludes S3's table files.
- Updated the app/workflow copy, feature list, and `llms.txt` for S3 writes, Lineage,
  and Changes. Regenerated the README status block from the shared status source.
- Added a website regression check for the newly built surfaces and their CLI/API
  documentation; updated the existing diagram availability gate.

### Verification performed here

- Astro production build: **25 pages**, successful. Initial duplicate-content
  warnings disappeared after clearing only the ignored Astro content data cache and
  rebuilding. The isolated preview still has no signup endpoint configured; its
  expected warning and GitHub fallback remain. Production configuration is unchanged.
- Website pytest: **66 passed**. Includes all six generated Lookahead estimates
  checked against the merged core model, local routes/fragments/assets, and the new
  availability assertions. README status generator `--check`: current.
- Browser: desktop 1440px and phone 390px reviewed; no horizontal page/node overflow
  in the homepage diagram, all six Lookahead selections yielded the expected verdicts,
  and the publishing link reached the new guide. No browser console messages.
- The staged whitespace check caught one pre-existing trailing space in the imported
  trust-round plan; removed it. `git diff --cached --check` then passed. Core and
  desktop-app trees exactly match `origin/main`
  (`git diff origin/main -- core app` is empty); these imported suites were not rerun.
- The verified merge is prepared for a DCO-signed commit and a normal push to the
  existing website branch. Preview remains http://127.0.0.1:4328/lakelet/.


### Website PR opened

Hants requested a PR from `codex/website-exploration` to `main`. Confirmed both
GitHub heads still matched the verified integration (`cfe5970`, main `d0f1324`)
and that no open PR existed for the branch. Opened
[PR #1 — Redesign the website around Lakelet Lookahead](https://github.com/hantswilliams/lakelet/pull/1)
as ready for review, with the changes, local validation results, scope, and Pages
rollout described. No product files changed and no tests were rerun for these
PR-record updates. Main is not merged; its existing Pages workflow will deploy
when the PR is merged. Review and merge remain open in both task lists.
