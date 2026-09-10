# Lakelet

Your laptop is the warehouse until it can't be. An open-source, local-first lakehouse: Iceberg tables on Parquet, a catalog that speaks the Iceberg REST spec, DuckDB as the engine, and a pre-flight gauge that says whether this machine can run a query before it runs.

## Start here

- **Building?** Read `CLAUDE.md` (or `AGENTS.md` if you are not Claude Code), then the current build brief in `build-sessions/` (highest-numbered `core-v0.N-plan.md` for the core, `app-v0-plan.md` for the desktop shell). The brief is the authority; it says which step is next and what its passing test is.
- **Coding rules:** `claude/karpathy.md`. Tests ship with the code, step by step.
- **Running the suite:** `cd core && uv run pytest` once step 0 has created `core/`. Toolchain: uv 0.11, Python 3.13 (floor 3.12).

## Layout

| Folder | What |
|---|---|
| `build-sessions/` | Build plans, one file per revision, and one log per session |
| `docs/` | Product spec (Day 0 to 3), Day 0 PRD, v0 build spec, architecture, agent-first strategy, verified facts, financial plan |
| `core/` | The Python package `lakelet` (from step 0) |
| `app/` | The desktop shell: Tauri 2 over the core as a sidecar, one window per project (`app-v0-plan.md`, steps 0 and 1) |
| `examples/sample-data/` | A script that writes a small made-up dataset to try the app and the CLI on (no data files are committed) |
| `web/` | The Astro site |
| `deck/` | Pitch deck and executive summary (gitignored) |
| `brand/` | Logos, wordmarks, app mockups (gitignored) |
| `old/` | Retired files: the pre-Astro site, deck originals before the September 8 edits |

Note: the architecture, build spec and facts files were written under the working name Burrow and renamed by search-and-replace; the financial plan DOCX still says Burrow inside.
