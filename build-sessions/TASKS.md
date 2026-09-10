# Lakelet — running task list

*Updated every session. The brief (`core-v0.5-plan.md`) says what each step is and what its gate is; this file says where we are. Dates are when the status changed. Sections: what is next, the nine steps, the definition of done, open items, the site, the sessions after core v0, and the dated done log.*

## Now, in order

1. [x] **CI green** (2026-09-09, `core #2` on `bb017b8`: Ubuntu 3m 36s, macOS 4m 30s, Postgres 34s, all green; the Mac run before the push was 145 passed, 5 env-gated skips). Two product bugs came out of getting there: the credential chain and the descriptor leak, both below.
2. [ ] **Clean-machine quickstart** on a Mac and an Ubuntu, under ten minutes (brief §6, step 7 gate).
3. [ ] **Reference-laptop (16 GB) timings**: `LAKELET_PERF=1` CSV imports, the ten-thousand-file registration against RustFS, and the TPC-H SF1 time table with `LAKELET_TPCH=1`; the v0 gauge constants were tuned on an 18-thread, 64 GB machine.
4. [ ] **Demo-path bucket** (brief §6): a Lakelet-owned bucket with a public dataset, prepared with `tables attach` and nothing else, Red with the bandwidth sentence from a laptop, pyiceberg reading it from another process.
5. [ ] **Trademark search** for "Lakelet" (USPTO, and the PyPI name) — PRD D4.3 says before publishing; the repo is already public, so this is overdue.

## Decisions waiting on Hants

- [x] `app-v0-plan.md` — A1 to A14 accepted 2026-09-10 (in conversation); steps 0 and 1 built the same day.
- [x] `decisions-for-review_090926.md` — all three accepted and shipped 2026-09-09: `init` writes `macros/lakelet.sql` (an override of dbt's `table`), `dbt run` builds saved questions through the catalog, `test_step6_materialisation.py` is the gate.

## Steps of the brief (§4)

| Step | Status | Gate, in short | Test file |
|---|---|---|---|
| 0 | **done** 2026-09-09: CI green on macOS and Ubuntu (`core #2`) | `uv run pytest` passes on macOS and Ubuntu; stale doc pointers gone; a fresh clone plus `CLAUDE.md` finds the current step | `test_step0_skeleton.py` |
| 1 | **done** 2026-09-09: suite green on both runners, Postgres job green, RustFS verified locally | Catalog: DuckDB writes through it to `file://`, pyiceberg reads; 100 concurrent-process commits lose nothing; `s3://` via Moto; Postgres behind an env var | `test_step1_*.py` |
| 2 | done locally 2026-09-08 | `select * from orders` after a manual `CREATE TABLE`; profiler on; extensions installed by `init`; dbt-duckdb spike recorded | `test_step2_*.py` |
| 3 | done locally 2026-09-08; timings to re-run on the reference laptop | Import matrix incl. every row of §3.7; 200 MB CSV ≤ 10 s; 2 GB CSV ≤ 90 s | `test_step3_*.py` |
| 4 | done locally 2026-09-08 | A history row per run with profiler actuals and SQL text; a forced conflict retries then exits 4 | `test_step4_query.py` |
| 5 | done locally 2026-09-08; time accuracy strict only on the reference run | TPC-H SF1: 80% within 2× time, 1.5× bytes; no Green over 3 min; every Yellow and Red line carries a worker size, burst time and cap | `test_step5_*.py` |
| 6 | done locally 2026-09-08 | Questions as dbt models; `dbt parse` accepts the project | `test_step6_questions.py` |
| 7 | done locally 2026-09-08; clean-machine quickstart pending | Ten-minute quickstart on Mac and Ubuntu; gauge line within 1 s of process start; `audit network` reports zero | `test_step7_cli.py` |
| 8 | done locally 2026-09-08 | A Parquet prefix attaches without copying; `refresh` adds a file; a large table returns Red with the bandwidth sentence; five fixtures with one-day limits | `test_step8_remote.py` |
| 9 | done locally 2026-09-08 | API with bearer auth and health; 401 without the token; non-loopback bind refused | `test_step9_api.py` |

Last full local run (2026-09-08, under load): 140 passed, 8 skipped (5 env-gated fixtures, 3 budget assertions that skip under load). Spark 3.5 and Trino read and write a Lakelet table through the catalog (PRD F0.7 AC), `tests/smoke/`.

## Definition of done (brief §6)

- [ ] **Quickstart** on a clean Mac and a clean Ubuntu under ten minutes: install, `init`, `import orders.csv`, `sql` Green with rows, `estimate` Red with its sentence, `catalog serve` read by pyiceberg from another process, `audit network` zero. The sequence passes as a test here; the fresh-machine exercise is not done.
- [x] **Tests green on both CI runners** (`core #2`, 2026-09-09) and the Postgres job.
- [ ] **Demo path**: the Lakelet-owned bucket (Now 4). Spark read of the same table is the session 10 smoke test; the compose-network version already passes.
- [x] **Budgets**, measured on this Mac 2026-09-08: gauge line 4 to 6 ms warm (150 ms budget); second estimate on bucket metadata 17 ms; `lakelet sql` to gauge line 0.81 s (1 s budget). Query overhead beyond DuckDB has not been measured as its own number (50 ms budget); worth one assertion.
- [x] **Nothing hidden**: `audit network` runs the quickstart with both guards and measures zero; `/api` is 401 without the token; every server binds loopback (2026-09-08).

## Open items that are not steps

- [ ] Re-export `deck/lakelet-executive-summary.pdf` from the edited docx (docx 2026-09-08 13:21, PDF still 2026-09-07; no LibreOffice on this machine).
- [x] Query overhead beyond DuckDB (§6, 50 ms): `test_query_overhead_beyond_duckdb_is_within_the_budget` (2026-09-09), full `query()` minus DuckDB alone on the same statement, warm, best of three; 12 to 17 ms on a two-core container. Skips under load like the other budgets.
- [ ] `old/deck-before-090826/` (pitch deck, executive summary) has been in the public repo's history since commit `6290775`. Untracked at HEAD 2026-09-09. Purging history is `git filter-repo` plus a force push; Hants' call.
- [ ] `docs/lakelet-financial-plan.docx` is now gitignored (2026-09-09) so it stays out of the public repo; it also still says Burrow inside. `docs/lakelet-product-spec.md` still mentions Burrow once.
- [x] Decided 2026-09-09, not adopted: the `duckdb-extension-*` PyPI wheels are a third-party repackaging (one individual's `duckdb_extensions` project, MIT, not DuckDB Labs), so they stay out of CI for a public repo. CI keeps the official `INSTALL` with the per-version cache. The wheels remain a convenience for sandboxes that cannot reach `extensions.duckdb.org`; see the 2026-09-09 log for the recipe.
- [x] CI actions bumped 2026-09-09 to the Node 24 runtimes: `actions/checkout@v7`, `actions/cache@v5`, `astral-sh/setup-uv@v9.0.0` (setup-uv stopped publishing major tags at v8, so it is pinned exactly). `deploy-pages.yml` still has the older majors; harmless, bump when the site workflow is next touched.
- [x] Pytest tooling: the `-q` addopt is gone from `pyproject.toml` (2026-09-09); `uv run pytest` prints the normal summary and `-q` means one `-q`.
- [ ] The disk-throughput probe (core D36) measures the page cache, not the disk: on a 64 GB Mac it reported 84,914 MB/s, because `init` reads back the 512 MB file it just wrote. The gauge divides bytes by this number, so local I/O time is estimated as roughly zero on any machine with more RAM than the probe. Fix candidates: read with the cache bypassed (`F_NOCACHE` on macOS, `O_DIRECT` on Linux), or a file larger than RAM, or cap the recorded figure at a plausible NVMe ceiling and say so. Found by the app's health tile on 2026-09-10.
- [ ] Snapshot expiry and orphan-file removal (Day 1): every dbt rebuild and every `import --replace` leaves the previous snapshot's data files in place, so a table rebuilt nightly grows nightly. Needs `expire_snapshots` through pyiceberg plus a file sweep, and a `lakelet tables compact` or similar verb.
- [ ] Plan filename versus internal revision number; cosmetic.
- [ ] Sign every commit with `git commit -s` from now on (CONTRIBUTING's DCO). The commits before `7f0ff4a` are unsigned; fine for the author's own work.
- [x] Repo hygiene (2026-09-09, commit `7f0ff4a`, signed): `.gitignore` fixed so `docs/` and `build-sessions/` are tracked; `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md`, `compose.yaml`, `compose/`, `core-ci.yml` and the new README committed for the first time; `.DS_Store` and `old/` untracked; Apache headers on the two `__init__.py` files that lacked them.
- [x] A self-hosted S3-compatible store: RustFS in `compose.yaml`; the `s3://` tests pass against it (2026-09-08).
- [x] Spark and Trino read and write a Lakelet table through the catalog: `compose.yaml` engines profile plus `tests/smoke/`, passing (2026-09-08). Session 10 repeats it through the `catalog serve` verb.
- [x] The `web/` Astro build: Pages deploy #3 built and published the September 8 wording edits on 2026-09-09.

## The site (`web/`, live at hantswilliams.github.io/lakelet)

- [ ] `PUBLIC_WAITLIST_URL` repo variable is not set; the forms log to the console and show success, so signups are lost. Pick a provider (Formspree, Buttondown, or Cloudflare Pages with `functions/api/waitlist.ts`).
- [x] `web/src/data/nav.ts` GitHub link points at the repo (2026-09-09).
- [ ] Domain: when bought, add under Settings → Pages and set `SITE_URL`.
- [x] Developer docs on the site (2026-09-09): `/docs` with ten pages under `web/src/content/docs/`, a docs layout with sidebar and the developer-preview banner, the CLI reference generated by `web/scripts/gen-cli-reference.py`, `llms.txt` updated, the nav's GitHub link fixed. Built clean at both base paths; deploys with the next push to `main`.
- [x] Docs: `/docs/transactions` (2026-09-09), what DuckDB-Iceberg refuses inside one transaction with the exact error text, why, and what it means for dbt; linked from the catalog and questions pages.
- [ ] Docs follow-ups: re-run `gen-cli-reference.py` after any CLI change (make it a CI check later); the quickstart transcripts are illustrative until the clean-machine run replaces them with real output; add a page on `audit network` and one on history's schema once session 6 needs them.
- [ ] The medallion page's `[burst.tags.<tag>]` caps and `[schedules.nightly]` in `lakelet.toml` are not in the architecture spec; decide whether to adopt.

## After core v0: the session plan (`lakelet-build-sessions.md`) and what each inherits

- [ ] **Session 3, Fargate worker spike** (throwaway, any time in parallel): cold start, 10 GB and 100 GB scans, real cost; makes the landing page's receipt numbers real. Spike 2 (TPC-H at SF10 and SF100, local and from S3) can run alongside now that step 8 exists; the SF1 bytes number is near-tautological (§7).
- [ ] **Session 6, desktop shell** (`app-v0-plan.md`): step 0 done 2026-09-10 — `app/` scaffold (Tauri 2, React, Vite, the site's tokens), the Rust supervisor with three `cargo test`s against a fake sidecar (start and read `serve.json`, restart once then stop, early exit surfaces stderr), `get_session`, the status dot and health panel, Playwright gate against a real sidecar (dot green in 433 ms from page open in a browser; a CLI-imported table appears), `app-ci.yml` for both runners. Core additions: `serve --memory-limit`, `LAKELET_DEV_ORIGIN`; the `serving` line already existed. Verified in the real Tauri window on the Mac 2026-09-10 (green dot, project name, health tiles, empty tables panel) after one fix: under `tauri dev` the window's origin is the Vite server, so the shell passes `LAKELET_DEV_ORIGIN` in debug builds (A12 amended). Step 1 done 2026-09-10 — `projects.rs` (recent ten in `recent.json` under the app-data dir, the memory share 60% of RAM halved per further window, `lakelet init` for a folder without `lakelet.toml`, the window registry: one project per window, `close` kills the sidecar), `lib.rs` creates windows itself (`project-N`), commands `get_session` (waits while the sidecar starts), `window_project`, `recent_projects`, `pick_folder` (native dialog from Rust, `tauri-plugin-dialog`), `open_project`; the welcome screen with the recent list; "Open…" in the bar for another window; `ready_ms` on the session and a "core ready in" tile. Gates: 7 `cargo test`, 3 Vitest, 5 Playwright (two real sidecars; the second window's limit is half the first's on the tile). Next: step 2, screen 1 (drop, preview, import, "Copy as command"). To check on the Mac: two windows side by side, the tile reading about 38 GiB then 19 GiB on the 64 GB machine, and the spawn-to-ready number in the Tauri window (2,018 ms in the container's headless run, which is not the reference).
- [ ] **Session 7, ask box** and `lakelet ask` as a CLI verb (M11).
- [ ] **Session 8, burst end to end**: control plane, job token, cap → budget, catalog lease pushing the metadata tree for local-metadata tables (D26, open unknown in §7), `publish`. Partner intake (five questions) runs before it.
- [ ] **Session 5, `lakelet mcp`** (after session 8, M6).
- [ ] **Session 9, dbt + Simple/Technical**: the materialisation shipped 2026-09-09 as a step 6 amendment (`macros/lakelet.sql`); still inherited: `tests/dbt_plugin.py` (the `configure_connection` and `configure_cursor` hooks) is to be lifted into the package. Also git auto-commit on save and table-level lineage (D30, D32).
- [ ] **Session 10, ship**: signed installers with the extensions bundled (D33; the "under 200 MB" installer claim to be measured), brew tap, the per-operator-class correction (M7), the `catalog serve` engines smoke test through the real verb (how a loopback-only verb is reached from a container is open), instrumentation export, partner onboarding.

Known unknowns still open in the brief's §7: the 150 ms gauge budget on a never-read table (PRD allows 800 ms uncached); how much of DuckDB's filter rendering the predicate parser needs for real workloads; the sidecar memory split; partner prefixes with drift or path-only partitions (fixtures pass; intake decides); the lease carrying a metadata tree.

## Done

- 2026-09-07 — Review of the original brief; `core-v0.1-plan.md` (revision 3) with D19 to D24; measurements on DuckDB 1.5.5 and pyiceberg 0.12.
- 2026-09-08 — Remote-data decisions R1 to R6 accepted; `core-v0.2-plan.md`. MinIO replaced by Moto, measured. Site and deck compared; M1 to M12 accepted; `core-v0.3-plan.md`, `core-v0.4-plan.md`. §10 wording applied to `web/src` and the deck. Readiness review; gitignore decision; `CLAUDE.md`, `AGENTS.md`, README; `core-v0.5-plan.md` (revision 7).
- 2026-09-08 — Steps 0 through 9 built and their gates passing on this Mac; Postgres, RustFS, Spark and Trino verified through `compose.yaml`. See `lakelet-build-sessions_090826.md` §7 to §19.
- 2026-09-09 — Repo state review; the hygiene commit `7f0ff4a` pushed; first `core` CI run (failed at pytest on both runners, Postgres green); Pages deploy #3 green. Project status doc updated.
