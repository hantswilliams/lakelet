# Lakelet — running task list

*Updated every session. The brief (`core-v0.5-plan.md`) says what each step is and what its gate is; this file says where we are. Dates are when the status changed. Sections: what is next, the nine steps, the definition of done, open items, the site, the sessions after core v0, and the dated done log.*

## Now, in order

1. [ ] **Read the failed CI run and fix it.** `core #1` on commit `7f0ff4a` (2026-09-09): `test (ubuntu-latest)` and `test (macos-latest)` both failed at `uv run pytest`; `postgres` passed in 29 s. The steps before pytest (sync, extension install, ruff check, ruff format) all passed on both runners. Log: github.com/hantswilliams/lakelet/actions/runs/34356153009. Suspects, unverified: the step 7 startup budget (0.81 s here; hosted runners are slower and the load-average skip does not trigger on an idle runner), the step 5 TPC-H harness time (default suite; strict only under `LAKELET_TPCH=1`), anything that reads `~/.duckdb/extensions` after the cache restore.
2. [ ] **Clean-machine quickstart** on a Mac and an Ubuntu, under ten minutes (brief §6, step 7 gate).
3. [ ] **Reference-laptop (16 GB) timings**: `LAKELET_PERF=1` CSV imports, the ten-thousand-file registration against RustFS, and the TPC-H SF1 time table with `LAKELET_TPCH=1`; the v0 gauge constants were tuned on an 18-thread, 64 GB machine.
4. [ ] **Demo-path bucket** (brief §6): a Lakelet-owned bucket with a public dataset, prepared with `tables attach` and nothing else, Red with the bandwidth sentence from a laptop, pyiceberg reading it from another process.
5. [ ] **Trademark search** for "Lakelet" (USPTO, and the PyPI name) — PRD D4.3 says before publishing; the repo is already public, so this is overdue.

## Steps of the brief (§4)

| Step | Status | Gate, in short | Test file |
|---|---|---|---|
| 0 | done locally 2026-09-08; CI run 2026-09-09 fails at pytest on both runners (see Now 1) | `uv run pytest` passes on macOS and Ubuntu; stale doc pointers gone; a fresh clone plus `CLAUDE.md` finds the current step | `test_step0_skeleton.py` |
| 1 | done locally 2026-09-08 incl. Postgres and RustFS; Postgres CI job green 2026-09-09; Ubuntu/macOS suite see Now 1 | Catalog: DuckDB writes through it to `file://`, pyiceberg reads; 100 concurrent-process commits lose nothing; `s3://` via Moto; Postgres behind an env var | `test_step1_*.py` |
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
- [ ] **Tests green on both CI runners.** Fails as of `core #1` (Now 1). Postgres job green.
- [ ] **Demo path**: the Lakelet-owned bucket (Now 4). Spark read of the same table is the session 10 smoke test; the compose-network version already passes.
- [x] **Budgets**, measured on this Mac 2026-09-08: gauge line 4 to 6 ms warm (150 ms budget); second estimate on bucket metadata 17 ms; `lakelet sql` to gauge line 0.81 s (1 s budget). Query overhead beyond DuckDB has not been measured as its own number (50 ms budget); worth one assertion.
- [x] **Nothing hidden**: `audit network` runs the quickstart with both guards and measures zero; `/api` is 401 without the token; every server binds loopback (2026-09-08).

## Open items that are not steps

- [ ] Re-export `deck/lakelet-executive-summary.pdf` from the edited docx (docx 2026-09-08 13:21, PDF still 2026-09-07; no LibreOffice on this machine).
- [ ] Query overhead beyond DuckDB (§6, 50 ms): add one timed assertion, since nothing measures it today.
- [ ] `old/deck-before-090826/` (pitch deck, executive summary) has been in the public repo's history since commit `6290775`. Untracked at HEAD 2026-09-09. Purging history is `git filter-repo` plus a force push; Hants' call.
- [ ] `docs/lakelet-financial-plan.docx` is now gitignored (2026-09-09) so it stays out of the public repo; it also still says Burrow inside. `docs/lakelet-product-spec.md` still mentions Burrow once.
- [ ] CI warnings: `actions/checkout@v4`, `astral-sh/setup-uv@v5` and `actions/cache@v4` target Node 20, which GitHub is retiring; bump when the failure is fixed.
- [ ] Pytest tooling: `pyproject.toml` already sets `-q`, so `uv run pytest -q` becomes `-qq` and hides the summary; either drop the default or remember not to pass it.
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
- [ ] Docs follow-ups: re-run `gen-cli-reference.py` after any CLI change (make it a CI check later); the quickstart transcripts are illustrative until the clean-machine run replaces them with real output; add a page on `audit network` and one on history's schema once session 6 needs them.
- [ ] The medallion page's `[burst.tags.<tag>]` caps and `[schedules.nightly]` in `lakelet.toml` are not in the architecture spec; decide whether to adopt.

## After core v0: the session plan (`lakelet-build-sessions.md`) and what each inherits

- [ ] **Session 3, Fargate worker spike** (throwaway, any time in parallel): cold start, 10 GB and 100 GB scans, real cost; makes the landing page's receipt numbers real. Spike 2 (TPC-H at SF10 and SF100, local and from S3) can run alongside now that step 8 exists; the SF1 bytes number is near-tautological (§7).
- [ ] **Session 6, desktop shell** (Tauri + sidecar): needs an explicit `memory_limit` per sidecar, since two windows mean two sidecars each defaulting to 80% of RAM (§7); the API's engine lock is adequate for one window.
- [ ] **Session 7, ask box** and `lakelet ask` as a CLI verb (M11).
- [ ] **Session 8, burst end to end**: control plane, job token, cap → budget, catalog lease pushing the metadata tree for local-metadata tables (D26, open unknown in §7), `publish`. Partner intake (five questions) runs before it.
- [ ] **Session 5, `lakelet mcp`** (after session 8, M6).
- [ ] **Session 9, dbt + Simple/Technical**: inherits two findings from step 6: dbt's `table` materialisation renames a temp table, which the Iceberg catalog refuses in one transaction, so Lakelet builds question tables itself until session 9 chooses a Lakelet materialisation or a dbt-duckdb setting; and `tests/dbt_plugin.py` (the `configure_connection` and `configure_cursor` hooks) is to be lifted into the package. Also git auto-commit on save and table-level lineage (D30, D32).
- [ ] **Session 10, ship**: signed installers with the extensions bundled (D33; the "under 200 MB" installer claim to be measured), brew tap, the per-operator-class correction (M7), the `catalog serve` engines smoke test through the real verb (how a loopback-only verb is reached from a container is open), instrumentation export, partner onboarding.

Known unknowns still open in the brief's §7: the 150 ms gauge budget on a never-read table (PRD allows 800 ms uncached); how much of DuckDB's filter rendering the predicate parser needs for real workloads; the sidecar memory split; partner prefixes with drift or path-only partitions (fixtures pass; intake decides); the lease carrying a metadata tree.

## Done

- 2026-09-07 — Review of the original brief; `core-v0.1-plan.md` (revision 3) with D19 to D24; measurements on DuckDB 1.5.5 and pyiceberg 0.12.
- 2026-09-08 — Remote-data decisions R1 to R6 accepted; `core-v0.2-plan.md`. MinIO replaced by Moto, measured. Site and deck compared; M1 to M12 accepted; `core-v0.3-plan.md`, `core-v0.4-plan.md`. §10 wording applied to `web/src` and the deck. Readiness review; gitignore decision; `CLAUDE.md`, `AGENTS.md`, README; `core-v0.5-plan.md` (revision 7).
- 2026-09-08 — Steps 0 through 9 built and their gates passing on this Mac; Postgres, RustFS, Spark and Trino verified through `compose.yaml`. See `lakelet-build-sessions_090826.md` §7 to §19.
- 2026-09-09 — Repo state review; the hygiene commit `7f0ff4a` pushed; first `core` CI run (failed at pytest on both runners, Postgres green); Pages deploy #3 green. Project status doc updated.
