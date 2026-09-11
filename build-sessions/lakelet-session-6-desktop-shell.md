# Session 6 — the desktop shell: the record

*September 10 to 11, 2026 · Hants and Claude (Fable 5.1) · The brief is `app-v0-plan.md`; the day-by-day is in `lakelet-build-sessions_091026.md` and `_091126.md`. This file is what a later session needs to know about session 6 without reading those.*

## What exists

`app/`: a Tauri 2 shell (Rust, the system webview) over the Python core as a sidecar, with a React and TypeScript window. One window per project, one `lakelet serve` per window, the window calling `/api` on loopback with the per-launch bearer token and reading query results as Arrow. Two screens live: the empty project (tables panel, drop zone, preview, import) and the query screen (SQL, the verdict before the rows, the streaming grid, the chart). Projects open from a dialog or the recent ten; a folder that is not a project is `init`ed first. The shell restarts a crashed core once and shows its last lines after a second crash. Settings write `lakelet.toml` through `lakelet config set`. Every action shows the CLI line it is, with copy.

Measured on the 64 GB MacBook Pro: spawn to ready 871 ms cold, 436 ms warm; on a 20 M-row table the verdict at 56 ms, the first rows at 62 ms, 66,667 rows at 143 ms; two windows at 38.3 and 19.1 GiB; the definition of done in the brief's §6 carries the rest.

## Decisions

A1 to A14 of the brief, accepted September 10, with A12 amended the same day (the shell sets `LAKELET_DEV_ORIGIN` in debug builds only, because under `tauri dev` the window's origin is the Vite server). Deviations recorded in the logs rather than the brief: TanStack Table is not used (the grid has a fixed column list; TanStack Virtual alone), the CodeMirror SQL package has no DuckDB dialect (PostgreSQL's is used with the project's tables and columns for completion), the recent list is a plain JSON file rather than the store plugin, and the chart's rule gained two guards (at least two and at most forty bars).

## What the core gained for the app

`serve --memory-limit`; `LAKELET_DEV_ORIGIN`; `freshness` on the table list; a folder preview (`lakelet import <folder> --preview`, `/api/preview` on a folder); the `X-Lakelet-*` headers exposed over CORS; a client that goes away interrupts the statement (`Engine.interrupt`, `query.Interrupted`, the async stream in the API), where before a sort of 20 M rows ran on for nobody holding the engine lock; `lakelet config show|set` and `/api/settings`, rewriting one line of `lakelet.toml` in place. Each has a test in the core suite.

## What using it found, and what followed

The health tiles showed the disk probe measuring the page cache (84,914 MB/s) and the memory limit defaulting to 80% of RAM per window; the first became the probe rewrite of September 11 (`lakelet gauge probe`), the second was A8. `import --replace` leaving the old table's files became part of `lakelet tables expire`. The Esc test found the core running abandoned statements to completion. Arrow JS hands dates over as milliseconds and decimals as four words; the grid converts per column. Playwright's `Control` is not CodeMirror's ⌘ on macOS, typed keystrokes meet the editor's bindings, and a 20 M-row sort takes 0.18 s on the Mac; the tests changed, not the app.

## Gates

`cargo test` 8 (the supervisor, projects and windows against a fake sidecar, the release-build origin check); Vitest 27 (the welcome screen, the preview panel, the gauge line, the chart rule, the command lines, the cell conversions, the window's crash reactions); Playwright 17 against four real sidecars, one carrying a 20 M-row table generated in setup and one with the thresholds lowered so every query is Red; `app-ci.yml` runs all three on macOS and Ubuntu. The core suite at 161 on the Mac. The one line of §6 not the build's: a week of daily use.

## Handed to later sessions

- **Session 10, ship.** The frozen sidecar: `ready_ms` is from a venv; a bundle's number is the open question, and `SidecarConfig.executable` is where the bundled binary goes. Icons are placeholders (the brand SVGs are gitignored). `tauri.conf.json` has `bundle.active` with `externalBin: []`. The release-build origin test should join CI once a release build is built there anyway.
- **Session 7, the ask box** (parked). ⌘/Ctrl+K focuses the SQL box today and is reserved; the query screen's `run(sql, allowRed)` is the seam.
- **Session 9, dbt and the two modes.** The tables panel and `describe`'s reclaimable line are where the DAG and lineage would attach; `Tables.tsx` owns the panel.
- **Session 8, burst.** The gauge line's `refused` state with `onRunAnyway` is where "run there" joins "run anyway".
- **Open in the core.** The first Arrow batch to reach the page carries several thousand rows (the server has that many batches written before the browser reads the first); the response's first flush is the place to look if the first rows are to land as early as the core makes them.
