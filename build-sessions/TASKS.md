# Lakelet — running task list

*The one file to open to know where the build is. Updated every session; dates are when a status changed. The briefs say what each step is and what its gate is (`core-v0.5-plan.md` for the core, `app-v0-plan.md` for the desktop shell); `lakelet-build-sessions.md` is the map of the sessions; the dated logs (`lakelet-build-sessions_<MMDDYY>.md`) say what happened. This file only says where we are and what comes next.*

## Now

**The real-data round** (session 9 widened): the brief is written and waiting on Hants: `real-data-plan.md`, R1 to R10 (the step 8 suite against a real bucket, the demo bucket, attach from the app, the table detail, the Gauge screen with export, `lakelet run` with the DAG by verdict, dbt views as Iceberg views in the catalog, the Models panel and Simple mode, the first flush). Decided 2026-09-11: ship (`ship-v0-plan.md`, S1 to S14 accepted the same day) waits until this round is done. Needs from Hants before step 0: a private bucket and an IAM user scoped to it; before step 1: a public-read bucket for the demo.

## Next, in order

Decided 2026-09-11 (Hants, in conversation). Each item names the document that specifies it.

1. ~~Core: the disk-throughput probe~~ **done 2026-09-11** (`decisions-for-review_091126.md` 1 to 3): the probe reads with the cache bypassed (`O_DIRECT`, `F_NOCACHE`), the method is recorded, `lakelet gauge probe` measures again, health and the app's tile flag a cached figure. To run on the Mac: `lakelet gauge probe` in `~/lakelet-demo`.
2. ~~Core: snapshot expiry~~ **done 2026-09-11** (decision 4): `lakelet tables expire [<name>|--all] [--keep-days N]`, `catalog.keep_snapshots_days` (7, settable), `describe` names what is reclaimable, `POST /api/tables/{name}/expire`; attached tables refused; orphans from `import --replace` swept after an hour's grace. Five tests in `test_expire.py`.
3. **The real-data round** (`real-data-plan.md`, session 9 widened; decided 2026-09-11 to come before ship): real S3 (the step 8 suite against Hants' bucket; the demo bucket), attach from the app, the table detail, the Gauge screen with `gauge export`, `lakelet run` with the DAG by verdict, dbt `view` models as Iceberg views in the catalog, the Models panel and Simple/Technical, the first Arrow flush. Git auto-commit and screen 9 go to the round after. **Brief written 2026-09-11, R1 to R10 waiting to be ticked.**
4. **Session 10, ship** (`lakelet-build-sessions.md`): signed installers with the sidecar and the DuckDB extensions bundled (D33), the "under 200 MB" claim measured, the frozen sidecar's spawn-to-ready measured against the 1.5 s budget (the app brief's last known unknown), brew tap, the per-operator-class correction (M7), the `catalog serve` engines smoke test through the real verb, instrumentation export, partner onboarding. **Brief written and S1 to S14 accepted 2026-09-11 (`ship-v0-plan.md`); the build follows the real-data round.**
5. **Session 9, the rest**: what the real-data round leaves: git auto-commit on save, screen 9 (versions, restore), table-level lineage (D32). Needs a brief of its own after the round.
6. **Session 8, burst end to end**: control plane, job token, cap → budget, catalog lease pushing the metadata tree (D26), `publish`. Partner intake (five questions) runs before it. Session 3 (the Fargate worker spike, throwaway) can run any time in parallel and should run before this.
7. **Session 5, `lakelet mcp`** (after session 8, M6).

**Parked**: **Session 7, the ask box** and `lakelet ask` (M11), deprioritised 2026-09-11; ⌘/Ctrl+K stays reserved for it, and the settings for model providers with it.

**Needs another machine, or Hants, not a build step** (from the core's definition of done and the PRD):

- [ ] Clean-machine quickstart on a Mac and an Ubuntu under ten minutes (core brief §6, step 7 gate).
- [ ] Reference-laptop (16 GB) timings: `LAKELET_PERF=1` CSV imports, the ten-thousand-file registration against RustFS, the TPC-H SF1 time table with `LAKELET_TPCH=1`; the v0 gauge constants were tuned on an 18-thread, 64 GB machine.
- [ ] Demo-path bucket (core brief §6): a Lakelet-owned bucket with a public dataset, prepared with `tables attach` and nothing else, Red with the bandwidth sentence from a laptop, pyiceberg reading it from another process.
- [ ] Trademark search for "Lakelet" (USPTO, and the PyPI name); PRD D4.3 says before publishing, and the repo is public. Session 10 publishes to PyPI (`ship-v0-plan.md` S7), so the name is needed then; `lakelet-cli` is the fallback.
- [ ] An Apple Developer Program membership (US$99 a year) for signing and notarising the DMG (`ship-v0-plan.md` S4): the Developer ID certificate and an App Store Connect API key, into the repository's secrets.
- [ ] A clean Mac (never seen Lakelet) and an Ubuntu 22.04 VM for session 10's install measurements (`ship-v0-plan.md` §6).
- [ ] AWS for the real-data round (`real-data-plan.md` R2, R3): a private bucket and an IAM user with list, get, put and delete on that bucket only, for the step 8 suite; a public-read bucket for the demo dataset. Keys stay in the shell's environment, never in the repo or `lakelet.toml`.
- [ ] The founder uses the app daily on a real dataset for a week (app brief §6). `examples/sample-data/make_sample.py` and any CSV are enough to start.

## The map

The sessions of `lakelet-build-sessions.md`, with where each stands. That file is the authority on scope; this table is the only place status lives.

| Session | What | Status | Specified by |
|---|---|---|---|
| 1–2, 4 | Core v0: catalog, engine, import, query and history, gauge, questions, CLI, remote read-only, local API | **done** 2026-09-08; CI green 2026-09-09; step 7's clean-machine quickstart and the demo bucket outstanding (above) | `core-v0.5-plan.md` |
| 3 | Fargate worker spike (throwaway) | not started; any time, needs AWS | `lakelet-build-sessions.md` |
| 6 | Desktop shell: Tauri, sidecar, screens 1 and 2, chart, recovery, settings | **done** 2026-09-11 (steps 0–5); the week of daily use is Hants' | `app-v0-plan.md` |
| 7 | Ask box, `lakelet ask` | **parked** 2026-09-11 | `lakelet-build-sessions.md` |
| 8 | Burst end to end | not started; partner intake first | `lakelet-build-sessions.md` |
| 5 | `lakelet mcp` | not started; after 8 | `lakelet-build-sessions.md` |
| 9 | dbt and the Simple/Technical screens, widened with real S3 and three app screens | **next**; brief written 2026-09-11, R1 to R10 waiting on Hants; git auto-commit and screen 9 to a later brief | `real-data-plan.md` |
| 10 | Ship: installers, brew tap, correction, smoke test, instrumentation, onboarding | S1 to S14 accepted 2026-09-11; build after the real-data round | `ship-v0-plan.md` |

## Session 6, the desktop shell (`app-v0-plan.md` §4)

| Step | Status | What it left behind |
|---|---|---|
| 0 | done 2026-09-10 | `app/` (Tauri 2, React, Vite, the site's tokens); the Rust supervisor with `cargo test`s against a fake sidecar; the status dot and health panel; Playwright against a real sidecar; `app-ci.yml`. Core: `serve --memory-limit`, `LAKELET_DEV_ORIGIN` (the shell sets it in debug builds only, A12 amended). Mac: green dot, tiles. |
| 1 | done 2026-09-10 | `projects.rs`: the recent ten, the memory share (60% of RAM halved per further window), `init` for a folder without `lakelet.toml`, one window per project, close kills the sidecar; the welcome screen; `ready_ms` on the session and the "core ready in" tile. Mac: 38.3 then 19.1 GiB across two windows; spawn to ready 871 ms cold, 441 ms warm. |
| 2 | done 2026-09-10 | Screen 1: the tables panel with an updated column (core `TableInfo.freshness`), the drop zone (Tauri drag-drop, "Choose files…", a typed path), the preview with types and notes (a folder answers a list; `lakelet import <folder> --preview` too), import with replace-or-append on a 409, "Copy as command" from `lib/command.ts`; `Open…` as a menu of recent projects. Mac: an 18-column CSV from Finder; wide tables scroll inside their panel. |
| 3 | done 2026-09-10 | Screen 2: CodeMirror with completion, the verdict from the headers before any row, the streaming Arrow grid (100,000-row cap), Red as a refusal with "Run anyway", Esc. Core: `X-Lakelet-*` exposed over CORS; a client that goes away interrupts DuckDB and the run is recorded as stopped early. Mac: verdict at 56 ms, first rows at 62 ms, 66,667 rows at 143 ms over 20 M rows; the tests pick ⌘ as Mod and insert SQL as text. |
| 4 | done 2026-09-10 | The auto-chart (`lib/chart.ts`, Vega-Lite through `vega-interpreter` so no `unsafe-eval`); the window's `restarted` and `down` reactions with "Restart the core"; the settings panel over new core verbs `lakelet config show|set` and `/api/settings`, rewriting one line of `lakelet.toml` in place; ⌘/Ctrl+, and ⌘/Ctrl+K; dates, times and decimals converted per Arrow type in the grid; `examples/sample-data/`. Mac: the line chart in the Tauri window, two kills, a setting saved. |
| 5 | done 2026-09-11 | §6 measured and recorded line by line in the brief (all but the week of daily use, which is Hants'); `/docs/app` on the site; `lakelet-session-6-desktop-shell.md`; two more gates for "nothing hidden" (every request across both screens goes to the dev server or the sidecar; a release build passes no dev origin, `cargo test --release`); Yellow in the gauge-line tests. |

Gates as of 2026-09-11: Playwright 17 against four real sidecars (one with a 20 M-row table), Vitest 27, `cargo test` 8, core 161 on the Mac; CI green on macOS and Ubuntu for `core`, `app` and Pages.

## Core v0, the steps of `core-v0.5-plan.md` §4

All nine done on the Mac 2026-09-08 and green on both CI runners 2026-09-09 (`core #2`); the Postgres variant green. Test files `core/tests/test_step<N>_*.py`. Outstanding from the gates: step 3's timings on the reference laptop; step 7's clean-machine quickstart (both under "Needs another machine" above).

Definition of done (core brief §6): tests green on both runners ✓; budgets measured 2026-09-08 (gauge line 4 to 6 ms warm; second estimate 17 ms; `lakelet sql` to gauge line 0.81 s; query overhead beyond DuckDB 12 to 17 ms) ✓; nothing hidden (`audit network` zero, `/api` 401 without the token, loopback only) ✓; quickstart on clean machines ✗; demo path ✗.

## Open items that are not steps

Open:

- [ ] The first Arrow batch reaching the app carries several thousand rows (7,000 on the Mac, 38,000 in the container): the server has that many batches written before the browser reads the first; if the first rows are to land as early as the core produces them, the response's first flush is the place to look. Found 2026-09-10.
- [ ] Re-export `deck/lakelet-executive-summary.pdf` from the edited docx (no LibreOffice on the Mac).
- [ ] `old/deck-before-090826/` is in the public repo's history since `6290775`; purging is `git filter-repo` plus a force push; Hants' call.
- [ ] `docs/lakelet-financial-plan.docx` is gitignored but still says Burrow inside; `docs/lakelet-product-spec.md` mentions Burrow once.
- [ ] Plan filename versus internal revision number; cosmetic.
- [ ] `deploy-pages.yml` still has the older action majors; bump when next touched.
- [ ] Known unknowns still open in the core brief's §7: the 150 ms gauge budget on a never-read table (PRD allows 800 ms uncached); how much of DuckDB's filter rendering the predicate parser needs for real workloads; partner prefixes with drift or path-only partitions (fixtures pass; intake decides); the lease carrying a metadata tree. The sidecar memory split closed with A8.

Closed:

- [x] The disk-throughput probe measured the page cache; now bypassed, with `lakelet gauge probe` for existing projects (2026-09-11).
- [x] Snapshot expiry and orphan-file removal: `lakelet tables expire` (2026-09-11).

- [x] Query overhead beyond DuckDB measured as its own test (2026-09-09).
- [x] `duckdb-extension-*` PyPI wheels: a third-party repackaging, kept out of CI; a convenience for sandboxes that cannot reach `extensions.duckdb.org` (2026-09-09).
- [x] CI actions bumped to the Node 24 runtimes (2026-09-09).
- [x] The `-q` addopt removed from `pyproject.toml` (2026-09-09).
- [x] Repo hygiene commit `7f0ff4a`, signed (2026-09-09). Commits before it are unsigned; fine for the author's own work; `git commit -s` from then on.
- [x] RustFS in `compose.yaml`; the `s3://` tests pass against it (2026-09-08).
- [x] Spark and Trino read and write a Lakelet table through the catalog (2026-09-08); session 10 repeats it through `catalog serve`.
- [x] The credential chain: a machine with no AWS credentials opens a project; `s3://` operations say which variables to set (2026-09-09).
- [x] The descriptor leak: `Project.close()` disposes the pools; a test holds 20 open/close cycles to six leaked descriptors (2026-09-09).

## The site (`web/`, live at hantswilliams.github.io/lakelet)

- [ ] `PUBLIC_WAITLIST_URL` is not set; the forms log to the console and show success, so signups are lost. Pick a provider (Formspree, Buttondown, or Cloudflare Pages with `functions/api/waitlist.ts`).
- [ ] Domain: when bought, add under Settings → Pages and set `SITE_URL`.
- [ ] Docs follow-ups: a CI check that `gen-cli-reference.py` is current; the quickstart transcripts are illustrative until the clean-machine run replaces them; a page on `audit network` and one on history's schema.
- [x] `/docs/app` (2026-09-11), and the overview's status table names the app.
- [ ] The medallion page's `[burst.tags.<tag>]` caps and `[schedules.nightly]` are not in the architecture spec; decide whether to adopt.
- [x] Developer docs (2026-09-09): `/docs` with the pages under `web/src/content/docs/`, the CLI reference generated, `llms.txt`, the nav's GitHub link; `/docs/transactions` on what DuckDB-Iceberg refuses inside one transaction.

## Decisions waiting on Hants

- [ ] `real-data-plan.md` R1 to R10 (2026-09-11), the real-data round.

Decided: `ship-v0-plan.md` S1 to S14 (2026-09-11), build held until the real-data round; `decisions-for-review_091126.md`, all four (2026-09-11), shipped the same day; `app-v0-plan.md` A1 to A14 (2026-09-10); `decisions-for-review_090926.md`, all three (2026-09-09); the order of what follows step 5 (2026-09-11, above).

## Done

- 2026-09-07 — Review of the original brief; `core-v0.1-plan.md` (revision 3) with D19 to D24; measurements on DuckDB 1.5.5 and pyiceberg 0.12.
- 2026-09-08 — Remote-data decisions R1 to R6 accepted; `core-v0.2-plan.md`. MinIO replaced by Moto, measured. Site and deck compared; M1 to M12 accepted; `core-v0.3-plan.md`, `core-v0.4-plan.md`. §10 wording applied to `web/src` and the deck. Readiness review; gitignore decision; `CLAUDE.md`, `AGENTS.md`, README; `core-v0.5-plan.md` (revision 7). Steps 0 through 9 built and their gates passing on the Mac; Postgres, RustFS, Spark and Trino verified through `compose.yaml`.
- 2026-09-09 — Repo hygiene commit `7f0ff4a`; CI failed then green after the credential chain and descriptor-leak fixes; developer docs on the site; the dbt materialisation through the catalog; `/docs/transactions`; the desktop shell brief.
- 2026-09-10 — `app-v0-plan.md` A1 to A14 accepted; steps 0 to 4 of the desktop shell built, each verified on the Mac; core additions along the way (`serve --memory-limit`, `LAKELET_DEV_ORIGIN`, `freshness`, folder preview, verdict headers over CORS, interrupt on disconnect, `config show|set`, `/api/settings`); `examples/sample-data/`. See `lakelet-build-sessions_091026.md`.
- 2026-09-11 — Session 7 deprioritised; this file restructured (Now, Next in order, the map); the two core items decided (`decisions-for-review_091126.md`) and built: the probe with the cache bypassed and `lakelet gauge probe`, `lakelet tables expire` with `keep_snapshots_days`; step 5 of the app brief, closing session 6; the session 10 brief written and accepted (`ship-v0-plan.md`), held behind the real-data round, whose brief was written (`real-data-plan.md`). See `lakelet-build-sessions_091126.md` and `lakelet-session-6-desktop-shell.md`.
