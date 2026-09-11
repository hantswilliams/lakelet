# Lakelet — coding session plan (30,000 ft)

*Amended September 8, 2026 by `build-sessions/core-v0.5-plan.md` §8. The brief is the authority for the core; this file is the map of the sessions around it.*

*Amended September 11, 2026 (Hants, in conversation): session 7, the ask box, is deprioritised; it stays in the map but is not next. Session 6 is at step 5 of `app-v0-plan.md`. The order after step 5 is decided and kept in `TASKS.md` ("Next, in order"): the two core items, then session 10, 9, 8, 5; `TASKS.md` is the only place status lives.*

## Before session 1 (decisions, not code)
- Name final: Lakelet; trademark search done on word and mark.
- Monorepo: `core/` (the whole Python package `lakelet`: catalog, engine, gauge, history, CLI, local API, later `mcp`), `app/` (Tauri + React), `web/` (the Astro site). No separate `cli/`. `worker/` and `control-plane/` are not created until session 8.
- Licences: Apache 2.0 for `core/` and `app/`; `control-plane/` private.
- `docs/` and `build-sessions/` are checked in so agents in the repo read the same specs. `CLAUDE.md` and `AGENTS.md` at the root say where to start.

## Architecture rule: one core, three heads, one project on disk
- `core/` is the only place logic lives. CLI, app and `lakelet mcp` are thin clients over it.
- The core runs in-process for the CLI and as a sidecar (`lakelet serve`) for the app; localhost HTTP + Arrow, with the Iceberg REST catalog on the same loopback server (brief D3, D4).
- The project folder is the shared state: `lakelet.toml`, SQLite catalog, `./warehouse`, `models/questions/`, `AGENTS.md`, git, gauge history.
- Every app action has "Copy as command"; `lakelet open` launches the app; the app's command palette runs the same verbs. The CLI ships first; the app is never ahead of it.

## Sessions (each ends with something runnable)
1–2, 4. **Core v0**, merged into `core-v0.N-plan.md`, steps 0 to 9: catalog, engine, import, query and history, gauge, questions, CLI, remote read-only, local API. Spikes 1 and 2 are real code, the catalog's integration test and the gauge's benchmark harness (brief D13). Exit: the brief's definition of done.
3. **Spike: one Fargate worker.** Cold start, 10 GB and 100 GB scans, actual cost. Throwaway; runs any time in parallel. Exit: landing-page receipt numbers are real.
6. **Desktop shell.** Tauri + sidecar + localhost API; tables panel; drop-file import; streaming grid. Exit: screens 1–2 live.
7. **Ask box.** Provider config, streaming SQL, one repair, 30-question test set; `lakelet ask` as a CLI verb (brief M11). Exit: ≥24/30; screen 6 live. *Deprioritised September 11, 2026; ⌘/Ctrl+K stays reserved for it.*
8. **Burst end to end.** Control plane, job token, cap → budget, catalog lease (pushing the metadata tree for local-metadata tables, brief D26), results back, `publish`. Exit: ten runs under cap, one over-cap kill; screens 3–4 live.
5. **`lakelet mcp`.** Runs after session 8 so the demo path is not behind it (brief M6). F0.9 tools, permissions, cap, audit log; screen 10. Exit: Claude Code and Cursor complete "drop this CSV, write three checks, save a question."
9. **dbt + Simple/Technical.** DAG by verdict, git auto-commit on save, table-level lineage (brief D32), vocabulary mapping. Exit: screens 7–9 live.
10. **Ship.** Signed installers with the DuckDB extensions bundled (brief D33), brew tap, calibration toggle, the simple per-operator-class correction (brief M7), instrumentation export, partner onboarding. Exit: Day 0 done.

Starting prompt per session: "Read `CLAUDE.md`, then the current step in `build-sessions/core-v0.N-plan.md`, then the PRD section it cites; the exit criteria are the step's gate and the PRD's AC."
