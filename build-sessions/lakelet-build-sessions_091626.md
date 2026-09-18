# Lakelet — build session log, September 16, 2026: versions step 4, lineage

*Hants and Claude · `versions-plan.md` step 4 (G8): `lakelet/lineage.py`, `lakelet lineage`, `GET /api/lineage/{name}`, the app's Reads from / Feeds lines on both details; then V3 (`decisions-for-review_091526.md`, decided today) on top of it: the per-model state, `lakelet run --stale`, Run what changed. Before it: the trust round's Mac run (`3c60296`), the README's screenshot (`99e91ba`), the waitlist confirmed from the live build, V3 ticked.*

## 1. Before the step

The trust round is on `main`: the Mac suite went green once the one `relocate` CLI assertion stopped depending on the terminal width (rich wrapped a long temp path), and Hants committed it with the DCO. The screenshot the README wants is the query screen with revenue by month, the verdict and its sentence above the chart and the grid. The waitlist variable was confirmed by reading the deployed page's script through the browser: it posts to the Formspree endpoint, and the new lede is live. V3 was ticked in the decisions file and folded into step 4's row in `TASKS.md`. One thing to undo on the Mac: `_to_delete/` (the three `.tgz` archives and a probe file) went into `3c60296` as renames rather than being deleted; `git rm -r _to_delete` closes it.

## 2. What lineage is made of (`lakelet/lineage.py`)

One graph per call, small enough to build whole: every table and view in the catalog and every model in the manifest, **one node per name** — a `table` model and the table it built are the same node, a `view` model and its catalog view likewise (the view's `lakelet.dbt-model` property says so), and a model with nothing in the catalog under its name is kind `model`, never built. The edges are upstream, with `via` saying how each is known, and downstream is the reverse:

- `ref` and `source` from the manifest's `depends_on` (a `source()` can name a table the catalog does not have; it is an edge and not a node, and the walk stops there);
- `sql` for a table a model names bare in its compiled SQL — which every saved question does, since a question is the user's SQL with no `ref()` — through `gauge.inputs.base_tables`, DuckDB's own parse of the statement, the same call `query._through_views` uses;
- `view` for the tables a catalog view that did not come from dbt binds to, the same way.

`built_by` is the model that builds the node, or `imported` (a table Lakelet wrote from files or SQL), or `attached from <prefix>`; `last_built` is the model's last successful run from history's `model_runs`, falling back to the table's current snapshot when there is no run (a table built by a bare `dbt run`), or the snapshot's time for an imported table and a view's version time. `--depth N` walks breadth-first, each name once at the level it was first reached, so a diamond is listed once and a cycle in a stale manifest cannot loop.

**The manifest.** `runner.manifest(project)` reads `.lakelet/dbt/target/manifest.json` and compiles first when it is missing or older than any file under `models/`, saying so (`compiled` in the result; the CLI prints one line). It also compiles when the manifest is only partly compiled: a `lakelet run <selector>` compiles what it selected, the other models' `compiled_code` is empty, and a question's bare-SQL edge would be lost — found by the test that runs two models and then asks about a third. dbt not installed leaves the catalog's half of the graph standing (the `DbtMissing` path is not tested; nothing in the suite can uninstall dbt).

## 3. The verb and the route

`lakelet lineage <name> [--depth N] [--json]` prints the head line (`by_c  table, built by by_c, 2026-09-16 11:16:34 UTC`; `top  model, never built`; `src  table, imported, …`), then `reads from` and `feeds`, each edge as `name  kind  via` indented one level per depth, and the compile line when it compiled. `--json` is the route's body. `GET /api/lineage/{name}?depth=N` returns `{name, kind, upstream: [{name, kind, via, depth}], downstream, built_by, last_built, compiled}`; 404 `no_such_node`, 400 `dbt` when the compile fails. Both take the API lock while dbt compiles.

## 4. Gate

`tests/test_lineage.py`, three tests against a real dbt project with a `source()`, a `ref()` chain, a saved question and a hand-put catalog view: a table, a view and a model after a run with `via` on every edge (the imported table feeds four things four different ways: `sql`, `source`, `sql` from the question, `view`); a model never built, depth 3 up and 2 down, the compile on first call and not on the second, the compile again after an edit; the CLI's text and `--json`, the exit code for an unknown name, the route's exact body, `depth=3`, and its 404. Container: core **245 passed, 10 skipped**; `ruff` clean; the CLI reference regenerated. Mac run pending.

## 5. Noticed, not fixed

`lakelet run <selector>` and `run --plan <selector>` echo the first selected model's compiled SQL on stdout before the DAG — dbt's `compile` prints it when it was given a selection. Older than this step; in `TASKS.md` as an open item.

## 6. The app's lines (`components/Lineage.tsx`)

`LineageRows` is two `dt`/`dd` pairs for a detail's facts list — **Reads from** and **Feeds** — read from `GET /api/lineage/{name}` when the detail opens and again when the table's freshness or the model's last run changes. Each name is a link (a `button.link`, so it is keyboard-reachable and carries `data-testid="lineage-<name>"`); Technical adds `(kind, how)` after it, where how is `ref`, `source`, `named in the SQL` or `the view's SQL`; Simple says the names only. An answer the core cannot give (dbt failed to compile) is `not known: <reason>` on the line, not a failure of the detail. The table detail (both shapes, table and view) gets the rows after **Format** / **Model** when it is given a session; older callers without one get no rows and make no request. The model detail's **Refs** row is gone: the same two rows stand where it was, and `depends_on` stays on `PlannedModel` for the Versions section's "not measured for a model with refs" sentence.

**Following a link crosses screens**, which is App's: a model of the project clicked on the Models screen is selected there (built or not); anything else — an imported table, a view put by hand — goes to the Tables screen with `openName`, which opens the detail once and clears; on the Tables screen a table or view opens in place and a model not built yet goes to the Models screen with `select`, which the plan keeps once it loads. Both requests are cleared after use so the same name can be followed twice.

Vitest: `Lineage.test.tsx` (the rows, the vias, Simple's names, the 400 said on the line, the rows inside the table detail after Format, no rows without a session) and `Models.test.tsx` extended (the rows for both models, a model link selects, a table link calls `onOpenTable`); **76**. Playwright: `models.spec.ts` extended — the lines on the model detail before a run (`orders (table, source)` → `by_customer (model, ref)`), a model link selecting, the table link landing on the Tables screen with the orders detail and its own lines, its `stg` link going back to the Models screen with `stg` selected, and after the run the view detail's lines (`by_customer (table, ref)`). The seventh sidecar's `stg` uses `source()`, so all three dbt vias are on screen somewhere. `tsc` clean.

`status.ts` still says lineage is planned: it flips to built with step 5, when `/docs/tables` has the section the README's link would point at.

## 7. V3: the state of a model (`dbt/runner.py`)

Every `PlannedModel` now carries `state`, `state_reason` and `state_since`, computed at the end of `plan()` in dependency order from lineage's graph (built with `compile_if_stale=False`, since the plan just compiled) and history. The four states, in the order they are checked: **never** — no run in history ("never built"), or the last one failed ("the last run failed"); **edited** — the hash of the compiled SQL differs from the one the last successful run recorded (`LastRun` now carries `sql_hash`, which history always had); **upstream** — walking the model's direct upstream edges, a model already judged not fresh ("`by_c` is out of date", carrying its `state_since` down the chain), or a table or view whose current snapshot or version is newer than the run ("`orders` changed", with when); otherwise **fresh**. Nothing is fingerprinted that was not: the SQL hash and the snapshot times were already there, and the state costs one graph and one comparison per model at plan time.

The brief's own fingerprint (`query.fingerprint`, SQL plus the snapshot ids the estimate saw) turned out to be the wrong yardstick and was not used: a model downstream of a table model is estimated *before* that table is rebuilt, so its recorded snapshot ids are always one run behind, and a table model's first build changes what the next estimate resolves to (the stand-in view's base tables, then the table itself), so the fingerprint changes when nothing did. Comparing times against the run's own record time is exact, with one ordering fix it needed: `run()` now records the catalog views *before* the runs, because a view model's version time is set when the view is put, and a model that reads it was being recorded first — which made it "upstream: stg_orders changed" after every clean run.

`lakelet run --stale` plans the whole project, chooses the models that are not fresh, and builds only them (dbt's `--select` with exactly those names; dependency order is the plan's); `RunReport.selected` names them, and when it is empty nothing runs, nothing is recorded and the CLI says "every model is fresh; nothing to run". The DAG line gained the state with its reason after the estimate (`upstream: stg_orders changed`); `POST /api/run` takes `stale`, and both routes' models carry the three fields.

**The app.** A State column on the DAG (after Kind), a State row on the model detail, and a sentence on each Simple card under its kind line, from `stateSentence` in the vocabulary — Technical `upstream · orders changed 2 h ago`, Simple "Out of date: orders changed 2 h ago." / "Out of date, because by_c is." / "Never refreshed." — with the ago from `state_since`. **Run what changed** (Simple: **Refresh what changed**) sits beside Run all with the count of stale models, its `lakelet run --stale` line next to it, disabled when everything is fresh; a stale run's report says "Every model is up to date; nothing ran." when nothing was. The Red refusal remembers whether the run was stale so Run anyway repeats the same run.

Gates: `tests/test_stale.py`, three tests — every state provoked (a fresh project is all `never`; after a run all `fresh`; an edit makes that model `edited` and its reader `upstream: … is out of date`; an insert into an imported table makes the chain `upstream` from `src changed` down, with `state_since` carried; a `source()` table the same), `--stale` selecting exactly the not-fresh models in order and nothing the second time, the CLI's lines, and the routes. Vitest: `vocabulary.test.tsx` (every sentence in both modes, the count, the button words) and `Models.test.tsx` (the column, the detail row, the button and its line, the nothing-ran report, the disabled button, the Simple card sentence); **79**. Playwright: `save-question.spec.ts` extended against the eighth sidecar — the saved question is `never`, Run what changed builds it to `fresh`, an edit through Save with Replace it makes it `edited` (the detail's sentence too), and refreshing what changed makes it `fresh` again; **28/28**. Core **248 passed, 10 skipped**; `ruff`, `tsc` clean; the CLI reference regenerated.

## 8. What changed, shown (Hants, from the first look at the Mac)

"Just telling them something changed is not as helpful if you don't show them what." Right, and the core already had it. `PlannedModel` gained `state_diff` — for `edited`, the unified diff of the compiled SQL the last run built (history's `sql_text`, which `LastRun` now carries and the API leaves out of the JSON) against the SQL now — and `state_changes` — for `upstream` naming a table, that table's snapshots since the run (operation, rows added, rows deleted, when), newest first, read from the metadata without a `describe` (which would list an attached table's prefix); a view is one entry, "new version". Both are on `/run/plan` and `--json`. The app renders the diff under the State row and on the card with the Versions section's renderer ("the compiled SQL against the last run: 1 line changed"), the commits as lines (`orders · append +1,200 rows · 2 h ago`; Simple "orders: 1,200 rows added 2 h ago"), and in "`by_c` is out of date" the name is a link that selects that model — so the chain can be followed to the thing that changed. `test_stale.py` asserts the diff's lines, the commits' exact shape and that the JSON carries no SQL text; Vitest 81 (the sentences, the diff in the detail, the link); `save-question.spec` checks the diff's removed and added lines on the edited question. Not a decision of its own: it is V3's "state_reason naming the table or model that changed", with the evidence attached.

The second ask, the same evening: a place to read *everything* that changed before running it. The **Review** section sits above the DAG (and above the cards) whenever a model is not fresh: every such model in the order the run would build them, its name a link, its state sentence (with the blamed model as a link) and its diff or commits — "Out of date · 2 models · Run what changed builds them in this order". The core's diff now carries the whole SQL as context (difflib with `n` the file's length), and the app folds it to the changed lines with three of context, each dropped run one `…` line, with a **whole SQL** / **changes only** toggle wherever a diff is shown (`collapseDiff` in `lib/versions.ts`, tested on its own). Vitest 83; `save-question.spec` sees the review with the diff while the question is edited and gone once it is fresh.

## 9. Next

Step 5, the close: `/docs/tables` gains lineage and the state (and `status.ts` flips `lineage` to built), `/docs/dbt` the `--stale` verb, `/docs/app` the lines and the button, `/docs/api` the route and the fields, the CLI reference, `lakelet-build-sessions.md`'s map, D32 in the core brief's index. The Mac run of everything above first.

---

## Separate website worktree session

# Website exploration — September 16, 2026

## Scope and isolation

User approved the website exploration proposed in conversation: a separate worktree,
three visual directions, and a local comparison preview. Branch
`codex/website-exploration` starts at `97ee6aa` in the sibling directory
`/Users/hants/Development/Python/lakelet-website-exploration`.
The original checkout is used by concurrent work. This session changes only this
worktree’s website and planning records. No merge, push, or deployment was performed.

## Built

- `/explore`: comparison page, with persistent navigation between the concepts.
- `/explore/product`: cream/teal product introduction, real app screenshot, workflow.
- `/explore/story`: dark/lime data story. Recorded Overture scan sizes drive a query
  selector, scan visualization, and connection-speed slider. The estimate is explicitly
  transfer time only, not the full gauge or a benchmark of the visitor’s machine.
- `/explore/editorial`: paper/ink/cobalt typography, architecture diagram, native
  expandable explanations, and documentation links.
- Shared availability section reads existing `src/data/status.ts`; developer preview,
  source installation, supported platforms, and planned features remain explicit.
- Dedicated layout/CSS, skip link, labeled native controls, reduced-motion support,
  noindex metadata, and sitemap exclusion for all exploration routes.

The screenshot is the actual React application in its browser test harness, backed
by the Python sidecar with generated shop orders. It is not a native Tauri capture.
`web/public/exploration/README.md` records provenance. No generated CSV/project data
or credentials were added to the repository. Existing dependencies were copied into
this worktree as independent ignored directories; no dependency versions changed.

## Verification

- `npm run build`: 24 pages built successfully.
- Existing core Python environment, `python -B -m pytest tests/test_exploration.py
  -p no:cacheprovider` from `web/`: **14 passed**. Checks cover generated routes,
  base-path links and fragments, assets, availability wording, native controls,
  noindex, and sitemap exclusion.
- Browser: desktop and 390-pixel mobile views of all four exploration routes;
  no horizontal overflow or missing images. Product screenshot loaded correctly.
- Interactive story: full-table transfer at 111 Mbps gives 26.3 minutes / Red;
  keyboard End sets 1,000 Mbps and gives 2.9 minutes / Yellow; the grouped query
  at 1,000 Mbps gives 2 seconds / Green. Architecture details expand correctly.
- Browser console: no errors or warnings on the inspected exploration pages.

The build prints the existing missing `PUBLIC_WAITLIST_URL` warning in this isolated
checkout. The exploration pages link to source-installation docs and contain no
waitlist forms. Core/app test suites were not run because their code was not changed.

## Review and next work

Preview instructions are in `web/README.md`. The comparison preview uses port 4328.
Choose a direction (or a combination) before integrating into existing marketing
routes. The open review item lives in both task lists and the exploration plan.


## Follow-up: complete data-story website

The user chose concept 02 and requested a complete site in its dark background and
light-green style, retaining branch/worktree isolation. The implementation remains
on `codex/website-exploration` in the sibling worktree. Original comparison routes
remain available. The scope and accepted direction are in `website-story-v1-plan.md`.

### What changed

- Rebuilt the homepage, app, how-it-runs, workflow (`/medallion`), agents, and pricing
  routes around the selected visual direction. Restyled all developer documentation.
- Shared dark-theme navigation and footer, native mobile menu, mobile documentation
  disclosures, accessible skip link, source-installation calls to action, and
  responsive typography, diagrams, lists, and pricing cards.
- Extracted the original interactive experiment into `DataStory.astro`; the homepage,
  how-it-runs page, and original concept now share one implementation.
- Reused the actual app image with provenance. It shows the light appearance of the
  app; the page states that the app also supports dark appearance.
- Imported only the committed website documentation and status changes from `3c60296`.
  The fourth verdict and recovery guidance appear in the design. Main advanced to
  `99e91ba` during the session (a README screenshot commit, with no further web changes).
  Core/app source in this worktree was not changed or merged from main.
- Team/Burst prices still come from existing pricing data, explicitly labeled proposed
  and unavailable. Current Local capabilities are stated separately. Removed the old
  unqualified marketing claims and vendor comparisons from the rendered pricing page.
- Kept configured signup support. With no endpoint, the page offers a GitHub follow
  link without collecting an email. Updated `llms.txt` to match actual availability.

### Verification

- `npm run build`: **25 pages**, successful.
- `python -B -m pytest tests -p no:cacheprovider` with the existing core environment:
  **60 passed**. Includes the original 14 exploration gates and 46 full-site checks.
- Rebuilt at `SITE_BASE=/` with `PUBLIC_WAITLIST_URL=https://example.invalid/website-test-signup`:
  **60 passed** for base-path and configured form markup. No email or form was sent.
  Restored the normal `/lakelet/` build and verified **60 passed** after final CSS fixes.
- All 25 HTML routes returned HTTP 200 from the preview at port 4328.
- Browser: desktop 1440px, mobile 390px and 360px; no horizontal overflow on the six
  marketing routes and representative documentation pages. Documentation tables and
  code retain their own scroll areas. The app image loaded at its full natural size.
- Shared experiment: full scan at 111 Mbps -> 26.3 minutes; keyboard End -> 1,000 Mbps
  and 2.9 minutes; grouped query -> 2 seconds. All three verdict colors update.
- Native mobile menu opened the app page; documentation disclosure opened and linked
  to the gauge guide. Gauge explanations and pricing FAQ expand correctly.
- No browser errors/warnings on inspected final pages. `git diff --check` passed.
- Visual review found old documentation styles conflicting with the new layout;
  removed the obsolete scoped rules and fixed heading line spacing, then rebuilt.
- Initial content-cache duplicate-id warnings disappeared when the config-variant build
  refreshed Astro's content store. The expected missing-waitlist warning remains in
  the default local build, where the UI correctly shows the GitHub fallback.

### Handoff

Full site: `http://127.0.0.1:4328/lakelet/`. Original concepts: `/lakelet/explore`.
The preview server remains running. Changes are local and uncommitted. No push, merge,
or deployment. User review is the next task; no main-checkout files were edited here.


## Follow-up: restore the laptop / S3 diagram

User asked to retain the original homepage architecture diagram and approved restoring
it in the selected dark/lime style. Added `DataFlow.astro` on the homepage before the
app screenshot, at `/#data-flow`. It keeps the laptop, S3 bucket, worker, and catalog
relationship, with decorative SVG icons and HTML labels that stack on phones.

Solid/lime reads point from S3 to the laptop. Publishing and worker read/write paths
are visibly labeled planned; the worker has a dashed outline. The caption explains
that attached Parquet is read in place and Iceberg metadata remains local by default,
with optional metadata writes. It does not imply that table publishing or bursting
is shipped. Links lead to the existing remote-storage and catalog documentation.

Verification: Astro builds 25 pages; **61 pytest checks passed**, including a new
persistent check for the diagram's accessible name, description, nodes, and planned
path wording. Browser checked at 1440px desktop, 900px tablet, and 390px phone widths;
no horizontal overflow, arrows rotate with the stacked mobile flow, and no browser
warnings/errors. No dependencies, core/app code, or main-checkout files changed.
Changes remain local and uncommitted on `codex/website-exploration`.


## Follow-up: homepage copy and Lakelet Lookahead

User approved “Your data, near or far. Know what fits.”, the local-files/S3
explanation, the DuckDB / Apache Iceberg / dbt Core supporting line, and the
provisional feature name Lakelet Lookahead for the temporary website.

Updated the homepage hero and metadata, moved the foundations wording beneath the
introductory copy, and introduced Lookahead through the scroll link and shared
interactive demo. The explanation page, app marketing copy, current-status label,
and gauge-guide introduction use the name. Existing CLI/API names and actual app
screen labels are preserved. No trademark registration or availability claim added.

Visual review kept the desktop headline on two lines. Responsive sizing and a
phrase wrapper keep “near or far” and “Know what fits.” intact on narrow phones.
The supporting line stays quieter than the main explanation.

Verification: production build succeeded with 25 pages; all **61 existing pytest
checks passed**; `git diff --check` passed. Browser review covered the homepage at
1440px desktop and 390px/360px phones, with no horizontal overflow; the Lookahead
guide and explanation page also fit at 360px. The homepage scroll link opens the
demo, and selecting all columns gives 26.3 minutes / Needs more machine at 111 Mbps.
The expected local missing-waitlist-endpoint warning remains; no signup was sent.

All changes remain local and uncommitted in the separate website worktree on
`codex/website-exploration`. The preview remains at http://127.0.0.1:4328/lakelet/.


## Follow-up: question → local or S3 → Lookahead

User selected the scenario picker combined with a data-flow diagram. Implemented a
homepage-only prototype in `LookaheadDemo.astro`, preserving the earlier Overture
transfer example on the explanation and original concept routes.

The controls select Sales by region, Orders + customers, or Full order history,
then local files or S3. The diagram updates its storage icon, read volume, link speed,
selected columns and SQL. The gauge shows the verdict, bytes, peak memory, expected
time, a memory-limit bar, disk spill when needed, and a reason. A Red example explains
the refusal and explicit override. A compact result immediately below the controls
keeps the feedback visible on small screens; the full reasoning follows below.

### Provenance

The six numbers are generated by the existing core `estimate_plan` function from
synthetic plans/table statistics and an explicit example laptop: 16 GB RAM, 12 GB query
limit, eight threads, 100 GB free disk, 1,500 MB/s local reads and 100 Mbps S3 reads.
These are illustrative model outputs, not captured EXPLAIN plans, measured query runs,
or estimates for the visitor's actual computer. That distinction is stated on the
page and expanded in the assumptions disclosure. No core/app source was changed,
no cloud execution is implied, and the page makes no dataset requests.

### Verification

- Initial gate: 2 passed, 2 failed as expected before the generated constants and
  new homepage markup existed. Final production build: 25 pages, successful.
- All **65 pytest checks passed** (four new scenario/provenance/control checks).
  The generated source matches the core model; storage location leaves query bytes,
  memory and spill unchanged, while changing I/O time. `git diff --check` passed.
- Browser, all six combinations: summary local ~1 sec / Green, S3 ~1.6 min / Yellow;
  join local ~2 sec / Green, S3 ~4.3 min / Yellow; sort local ~1.3 min / Yellow,
  S3 ~33.1 min / Red. Sort reports 60.1 GB peak and 48.1 GB temporary disk space.
- Verified changing source icons, 2/3/12 highlighted order columns, SQL, reasons,
  memory readouts, refusal note, and the compact mobile result.
- Keyboard Left changes native question/storage radios and refreshes the estimate.
  The assumptions disclosure opens; a polite atomic live region describes updates.
- Visual/layout review at 360, 390, 768, 1024 and 1440px: no document overflow.
  Motion is not required; the diagram/needle updates without animation. Browser
  logs showed no errors or warnings. The expected build warning for an unconfigured
  local signup endpoint remains.

All work remains local/uncommitted on `codex/website-exploration` in the sibling
website worktree. Preview: http://127.0.0.1:4328/lakelet/?preview=lookahead#experiment.
