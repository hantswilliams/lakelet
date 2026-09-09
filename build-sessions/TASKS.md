# Lakelet — running task list

*Updated every session. The brief (`core-v0.5-plan.md`) says what each step is and what its gate is; this file says where we are. Dates are when the status changed.*

## Now

- [x] **Step 0** — repo skeleton. Done locally 2026-09-08: `uv run pytest` 4 passed on macOS, ruff clean, entry point answers, docs amended, stale pointers gone. Unverified until the first push: the Ubuntu runner and the extension cache in CI.
- [x] **Step 1** — catalog. Done locally 2026-09-08: 14 tests pass on macOS (pyiceberg round trip on SQLite and Moto S3, DuckDB write matrix on `file://`, forced 409, 100 commits from ten processes). Postgres variant passed on Postgres 16 via `compose.yaml`; CI on Ubuntu pending the first push.
- [x] **Step 2** — project, engine, config; the dbt spike. Done locally 2026-09-08: 8 gate tests pass; dbt-duckdb incremental merge through the catalog works.
- [x] **Step 3** — import. Done locally 2026-09-08: 52 tests pass; 200 MB and 2 GB CSV timings far inside budget on this machine (re-run on the reference laptop).
- [x] **Step 4** — query and history. Done locally 2026-09-08: 9 tests pass; first batch after 6 ms of a 2.2 s query.
- [x] **Step 5** — the gauge. Done locally 2026-09-08: 21 tests plus the TPC-H SF1 harness (18/22 within 2× on time here, 22/22 on bytes, pruning full); estimates in 4 to 6 ms.
- [x] **Step 6** — questions as dbt models. Done locally 2026-09-08: 6 tests pass; `dbt parse` and `dbt test` accept the generated project.
- [x] **Step 7** — the CLI. Done locally 2026-09-08: 11 tests pass; startup 0.81 s; `audit network` reports a measured zero.
- [x] **Step 8** — remote read-only. Done locally 2026-09-08: 8 tests pass on Moto; second estimate on bucket metadata 17 ms.
- [x] **Step 9** — the HTTP API and `serve`. Done locally 2026-09-08: 8 tests pass. All nine steps of the brief are built on this machine.
- [ ] **Definition of done (brief §6)** — the clean-machine quickstart on a Mac and an Ubuntu, CI green on both runners, the reference-laptop timings. Next.
- [ ] **Repo hygiene (2026-09-09).** Found that the September 8 pushes went out without the hygiene files: `.gitignore` at HEAD still ignored `docs/` and `build-sessions/`, so `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md`, `compose.yaml`, `compose/`, `core-ci.yml` and the new README were never committed, and CI has never run. Staged 2026-09-09 for one signed commit; `.DS_Store` and `old/` untracked; the financial plan DOCX added to `.gitignore`. Note `old/deck-before-090826/` (deck and executive summary) has been public in history since commit 6290775; decide whether to rewrite history.

## Steps of the brief (§4)

| Step | Status | Gate, in short | Test file |
|---|---|---|---|
| 0 | done locally 2026-09-08; CI pending first push | `uv run pytest` passes on macOS and Ubuntu; stale doc pointers gone; a fresh clone plus `CLAUDE.md` finds the current step | `core/tests/test_step0_skeleton.py` |
| 1 | done locally 2026-09-08 incl. Postgres; Ubuntu pending first push | Catalog: DuckDB writes through it to `file://`, pyiceberg reads; 100 concurrent-process commits lose nothing; `s3://` via Moto; Postgres behind an env var | |
| 2 | done locally 2026-09-08 | `select * from orders` after a manual `CREATE TABLE`; profiler on; extensions installed by `init`; dbt-duckdb spike recorded | |
| 3 | done locally 2026-09-08; timings to re-run on the reference laptop | Import matrix incl. every row of §3.7; 200 MB CSV ≤ 10 s; 2 GB CSV ≤ 90 s | |
| 4 | done locally 2026-09-08 | A history row per run with profiler actuals and SQL text; a forced conflict retries then exits 4 | |
| 5 | done locally 2026-09-08; time accuracy strict only on the reference run | TPC-H SF1: 80% within 2× time, 1.5× bytes; no Green over 3 min; every Yellow and Red line carries a worker size, burst time and cap | |
| 6 | done locally 2026-09-08 | Questions as dbt models; `dbt parse` accepts the project | |
| 7 | done locally 2026-09-08; clean-machine quickstart and Ubuntu pending | Ten-minute quickstart on Mac and Ubuntu; gauge line within 1 s of process start; `audit network` reports zero | |
| 8 | done locally 2026-09-08 | A Parquet prefix attaches without copying; `refresh` adds a file; a large table returns Red with the bandwidth sentence; five fixtures with one-day limits | |
| 9 | done locally 2026-09-08 | API with bearer auth and health; 401 without the token; non-loopback bind refused | |

## Open items that are not steps

- [ ] The pre-September-8 deck and executive summary sit in git history under `old/deck-before-090826/` in a public repo. Untracked at HEAD on 2026-09-09; purging history needs `git filter-repo` and a force push, which is Hants' call.

- [ ] Re-export `deck/lakelet-executive-summary.pdf` from the edited docx (no LibreOffice on this machine).
- [ ] Run the TPC-H harness with `LAKELET_TPCH=1` on the reference laptop (16 GB) and record the time table; the v0 constants were tuned here.
- [ ] Re-run the gated timings on the reference laptop: the CSV imports (`LAKELET_PERF=1`) and the ten-thousand-file registration against RustFS (16 s here).
- [ ] Trademark search for "Lakelet" and the PyPI name, before anything is published (PRD D4.3).
- [ ] The `web/` Astro build has not been run since the September 8 wording edits; run `npm run build` before the next deploy.
- [x] A self-hosted S3-compatible store: RustFS in `compose.yaml`; the `s3://` tests pass against it (2026-09-08).
- [x] Spark and Trino read and write a Lakelet table through the catalog (PRD F0.7 AC): `compose.yaml` engines profile plus `tests/smoke/`, passing (2026-09-08). Session 10 repeats it through the `catalog serve` verb.
- [ ] Plan filename versus internal revision number; cosmetic.

## Done

- 2026-09-07 — Review of the original brief; `core-v0.1-plan.md` (revision 3) with D19 to D24; measurements on DuckDB 1.5.5 and pyiceberg 0.12.
- 2026-09-08 — Remote-data decisions R1 to R6 accepted; `core-v0.2-plan.md`. MinIO replaced by Moto, measured. Site and deck compared; M1 to M12 accepted; `core-v0.3-plan.md`, `core-v0.4-plan.md`. §10 wording applied to `web/src` and the deck. Readiness review; gitignore decision; `CLAUDE.md`, `AGENTS.md`, README; `core-v0.5-plan.md` (revision 7).
