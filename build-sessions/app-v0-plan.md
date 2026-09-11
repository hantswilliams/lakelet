# Lakelet — desktop shell, build brief (app v0, revision 1)

> **Decided September 10, 2026: A1 to A14 accepted** (Hants, in conversation). §4 is the build order from here; steps 0 to 4 were built the same day; step 5 on September 11, which closes session 6.

*September 10, 2026 · Session 6 of `lakelet-build-sessions.md` · Follows `core-v0.5-plan.md`, which it does not change · The A block at the top is for review: tick a box on each, write a line under "Change" if you disagree. Nothing in §4 is built until the A block is decided.*

## 0. The idea in one paragraph

The core is done and tested; the app is a head on it. One window per project folder, one `lakelet serve` sidecar per window, the webview talking to `/api` over loopback with the per-launch token and reading results as Arrow. Session 6 makes the first two of the ten mockup screens real: the empty project where a non-developer drops a file and a developer sees the terminal command, and the query screen where SQL gets a verdict before it runs and rows stream into a grid. The CLI shipped first and the app never gets ahead of it: every button is a verb the CLI already has, and "Copy as command" on each proves it.

---

## 1. Decisions for review (A1 to A14)

The docs (build spec §3, PRD F0.8, brief D2 and D3) already decided: Tauri 2 shell, React and TypeScript frontend, Python core as a sidecar, HTTP plus Arrow IPC on loopback. A1 re-examines the shell against the constraints Hants set on September 10 (fast, easy to ship on macOS and Linux, Windows if free, no Electron); the rest are the choices the docs left open.

**A1. Tauri 2, confirmed against the alternatives.**
*Recommend:* Tauri 2. The shell is the OS webview (WKWebView, WebKitGTK, WebView2), a few MB, paints in well under a second; one bundler config produces a DMG, an AppImage, a `.deb` and an MSI; sidecars are first class (`externalBin` per target triple, spawned and supervised by the shell). *Not chosen:* Electron (a bundled Chromium, 150 MB and a slow cold start, before the sidecar is counted); Wails (Go plus webview, sidecar hand-rolled, a third language in the repo); Flutter (own renderer, no sharing with the web app the build spec wants); Qt via PySide (the core could run in-process, but the bundle is as large as the sidecar, UI iteration is slower, and it forecloses one frontend for desktop and browser); Dioxus, Slint, egui (too young to carry a demo). *Known cost:* the installer's size is the sidecar's, 150 to 200 MB with pyarrow and the extensions, whichever shell; session 10 measures it.
- [x] Agree
- [ ] Change:

**A2. React 19, TypeScript, Vite; no UI framework, the site's tokens.**
*Recommend:* yes. The build spec's reason holds: one frontend codebase for the desktop app and the later browser app. Styling reuses `web/src/styles/tokens.css` (same colours, type and verdict words as the site and the mockups) rather than a component library, so the app looks like the marketing pages promised. *Not chosen:* Svelte or Solid (fine, but nothing to gain against a codebase of this size and the mockups are already React-shaped in the build spec).
- [x] Agree
- [ ] Change:

**A3. CodeMirror 6 for the SQL editor, not Monaco.**
*Recommend:* CodeMirror 6. Monaco is several megabytes of JavaScript and loads in hundreds of milliseconds, which fights the 1.5 s launch budget (F0.8.2) for an editor that in v0 holds one statement. CodeMirror 6 with the SQL language package is a tenth of the size, has DuckDB dialect support, and does everything screen 2 needs (highlighting, Cmd/Ctrl+Enter, a status line). This amends the build spec's §3 frontend row.
- [x] Agree
- [ ] Change:

**A4. The grid: TanStack Table with TanStack Virtual over Arrow JS batches.**
*Recommend:* yes, as the build spec says, with two rules: rows render from `apache-arrow` record batches as they arrive from `/api/query`, so the first batch is on screen before the query finishes (the core's step 4 promise), and the grid keeps at most 100,000 rows in memory with a footer saying "showing the first N of a stream; `lakelet sql --format parquet` for all of it".
- [x] Agree
- [ ] Change:

**A5. The auto-chart is in session 6.**
*Recommend:* yes, small. Screen 2 is "ask, Green, chart"; the ask box is session 7 but the chart is an afternoon: Vega-Lite, one rule (one categorical plus one numeric column gives a bar chart; a date plus a numeric gives a line; otherwise no chart, no error), from the first 5,000 rows. *If no:* screen 2 ships as grid only and the chart joins in session 7.
- [x] Agree
- [ ] Change:

**A6. How the shell finds and runs the sidecar.**
*Recommend:* in a bundle, the Tauri sidecar `lakelet-<target-triple>` from `externalBin` (session 10 produces it); in development and in tests, the `LAKELET_SIDECAR` environment variable naming an executable (for example `core/.venv/bin/lakelet`), and when neither is present, `lakelet` on `PATH`. The shell runs `lakelet serve --port 0 -C <project>` and learns the port and token from `<project>/.lakelet/serve.json`, which step 9 already writes at mode 0600; it also watches the sidecar's stdout for the `serving` line as a readiness signal so it does not poll the file. *Not chosen:* passing the token over stdin or an environment variable (the file already exists and is the CLI's contract too).
- [x] Agree
- [ ] Change:

**A7. The token reaches the webview through one Tauri command, and the webview calls `/api` directly.**
*Recommend:* yes. The Rust side keeps `{port, token}` per window; the webview asks `get_session()` once and calls `fetch` against `http://127.0.0.1:<port>/api/...` with the bearer header. The core already grants CORS to the Tauri origins (step 9). *Not chosen:* proxying every request through Rust commands (more code, and Arrow streaming through Tauri's IPC would copy every batch).
- [x] Agree
- [ ] Change:

**A8. A per-window memory limit, set by the shell.**
*Recommend:* the core gains `lakelet serve --memory-limit <size>`, overriding `[engine] memory_limit` for that process only, and the shell passes 60% of RAM to the first window and halves it for each further window open at the same time, re-sending nothing to windows already open (DuckDB's limit is fixed at connect). This closes the §7 unknown in the core brief ("two windows mean two sidecars each defaulting to 80% of RAM"). The CLI keeps `lakelet.toml`'s value.
- [x] Agree
- [ ] Change:

**A9. Dropping a file shows the preview first; import is a click.**
*Recommend:* yes. The preview is where the type-coercion promise lives (core D24: the Iceberg type each column becomes, and the notes); an import that skips it silently turns an `INTERVAL` into a string. The panel shows the `/api/preview` result with the table name editable and one button, and a folder drop lists one row per file. *Not chosen:* import on drop with the preview afterwards (faster to demo, but the demo's point is that Lakelet says what it is about to do).
- [x] Agree
- [ ] Change:

**A10. Projects: open a folder, `init` it if needed, remember it.**
*Recommend:* a native folder dialog; if the folder has no `lakelet.toml`, the shell runs `lakelet init <folder>` as a sidecar command first, showing its output; recent projects are a JSON list in the app's data directory (Tauri's app-data path), most recent first, ten entries. One window per project; opening a second project opens a second window and a second sidecar. Closing the window stops the sidecar.
- [x] Agree
- [ ] Change:

**A11. Crash recovery is in session 6.**
*Recommend:* yes (F0.8's acceptance criterion). The shell supervises the sidecar: on exit it restarts it once, shows "core restarted" in the status area, re-reads `serve.json`, and the webview refetches the tables list; state is on disk anyway (the catalog, history, the question files). Two exits inside a minute show the sidecar's last stderr lines and stop restarting.
- [x] Agree
- [ ] Change:

**A12. Testing: Rust unit tests for the supervisor, Vitest for components, Playwright for the screens against a real sidecar, in CI on both runners.**
*Recommend:* yes. The frontend is a web app, so Playwright drives it in a headless browser against the Vite dev server and a real `lakelet serve`; to allow that, the core accepts a dev-only `LAKELET_DEV_ORIGIN` (for example `http://localhost:5173`) added to the CORS list when set, documented as development only. *Amended September 10 from step 0:* the shell does set it, in debug builds only, because under `tauri dev` the window's origin is the Vite dev server rather than `tauri://localhost`; a release build passes nothing, so a bundle's sidecar allows only the Tauri origins. tauri-driver (the WebDriver route) runs on Linux and Windows only, so it is not the basis. *Gate for every step* is a Playwright or Rust test, as the core's steps were pytest.
- [x] Agree
- [ ] Change:

**A13. Session 6 ships a development-runnable app; bundles and signing are session 10.**
*Recommend:* yes. `npm run tauri dev` from `app/` with `LAKELET_SIDECAR` set runs the real thing; `npm run tauri build` produces an unsigned bundle that still expects `lakelet` on `PATH`, so it is for us, not for partners. The sidecar binary (PyInstaller one-dir or python-build-standalone plus a venv, with the four extensions inside), notarisation, the AppImage, and the "fresh machine to first query in three minutes with no terminal" acceptance criterion are session 10, as the session plan already says.
- [x] Agree
- [ ] Change:

**A14. Windows: build it, do not promise it.**
*Recommend:* the Tauri config includes the Windows target and CI does not build it; the PRD's Day 0 says macOS 13+ and Ubuntu 22.04+, Windows CLI only. Nothing in the code should assume a POSIX path, and one Windows build in session 10 tells us how far off it is.
- [x] Agree
- [ ] Change:

---

## 2. Scope

**In session 6:** the `app/` project; the sidecar supervisor; projects (open, init, recent, one window each); the status dot; screen 1 (tables panel with rows, size and freshness from `/api/tables`; drop a file or folder, preview, import; the terminal command shown beside the drop zone; "Copy as command" on every action); screen 2 (SQL input with CodeMirror, the gauge line rendered from the `X-Lakelet-*` headers before rows, streaming grid, Red as a refusal with "run anyway", Esc cancels, the auto-chart if A5); keyboard per F0.8.6 (Cmd/Ctrl+Enter runs, Esc cancels; Cmd/Ctrl+K reserved for the ask box); crash recovery; settings limited to what the core reads (`memory_limit`, threads) plus the calibration-sharing toggle wired to `lakelet.toml` with nothing behind it yet; the CI job.

**Not in session 6:** the ask box and English input (session 7); the Red-to-burst confirm and the burst screens (session 8); gauge history, dbt project, versions, agents screens (sessions 9, 5); settings for model providers and buckets (sessions 7, 8); installers, signing, auto-update (session 10); Windows.

---

## 3. Architecture

### 3.1 Processes

```
  Tauri shell (Rust)                                   per window
  ├─ supervisor: spawn `lakelet serve --port 0 -C <project> --memory-limit <n>`
  │     ├─ readiness: stdout `serving` line, then read .lakelet/serve.json {port, pid, token}
  │     ├─ restart once on exit; "core restarted"; stop after two exits in a minute
  │     └─ kill on window close
  ├─ commands: get_session() → {port, token}; open_project(); recent_projects(); init_project(path)
  └─ webview (React)
        ├─ fetch http://127.0.0.1:<port>/api/... with Authorization: Bearer <token>
        ├─ /api/query → ReadableStream → apache-arrow RecordBatchReader → grid
        └─ drag-drop: Tauri's drag-drop event gives paths → /api/preview → /api/import
```

The core is unchanged except for three small additions (§4 step 0): `serve --memory-limit`, the `serving` stdout line, and `LAKELET_DEV_ORIGIN`.

### 3.2 Launch sequence and the 1.5 s budget

Window paints with the last project's name and an amber dot at t≈0.2 s (Tauri's window with a static first render); the sidecar is spawned at once; the dot turns green when `/api/health` answers, typically 0.8 to 1.2 s later on a warm machine; the tables list arrives with health. Nothing waits for the sidecar except the tables panel's rows and the run button. Measured in step 0's gate and recorded in §7. *Measured September 10 on the 64 GB MacBook Pro, from the app:* spawn to ready 871 ms for the first window (sidecar cold) and 441 ms for a second (warm), inside the budget; the shares read 38.3 GiB and 19.1 GiB.

### 3.3 The query path

`POST /api/query {sql, allow_red}` with `Accept: application/vnd.apache.arrow.stream`. Headers arrive first: the verdict, the words and the reason go into the gauge line above the grid within the first round trip; `409 red_refused` renders the line in red with a "Run anyway" button that repeats the request with `allow_red: true`. Batches are read as they arrive; the grid shows the first batch immediately. Esc aborts the fetch, which closes the response and the core's result, which records the run as closed early (step 4's behaviour). Every run is in history exactly as a CLI run is; nothing is recorded twice.

### 3.4 Files

```
app/
  src-tauri/            Rust: main.rs, supervisor.rs (tested), commands.rs, tauri.conf.json, capabilities/
  src/                  React: App.tsx, screens/EmptyProject.tsx, screens/Query.tsx,
                        components/{StatusDot,TablesPanel,DropZone,Preview,GaugeLine,Grid,Chart}.tsx,
                        lib/{api.ts,arrow.ts,session.ts}
  tests/                Playwright: screen1.spec.ts, screen2.spec.ts; vitest under src/
  package.json, vite.config.ts, playwright.config.ts
```

`app/` joins `.github/workflows/app-ci.yml`: macOS and Ubuntu, Rust stable, Node 22, `cargo test`, `vitest`, Playwright against `uv run lakelet serve` from `core/`.

---

## 4. Build order

Each step ends with a test that stays in the suite.

| Step | Builds | Gate |
|---|---|---|
| 0 | `app/` scaffold: Tauri 2, React, Vite, the tokens; the three core additions (`serve --memory-limit`, the `serving` line, `LAKELET_DEV_ORIGIN`) with their pytest tests; the supervisor in Rust; the status dot; `app-ci.yml` | `cargo test` passes (the supervisor finds `serve.json`, restarts once, stops after two); `npm run tauri dev` with `LAKELET_SIDECAR` opens a window whose dot goes green; Playwright: health renders versions; window paint to green dot measured and recorded (§7); CI green on both runners |
| 1 | Projects: open folder, init if needed, recent list, one window per project, memory limit per window, close stops the sidecar. *Built September 10:* `projects.rs` (recent list, memory share, `init`, the window registry), the welcome screen, "Open…" in the bar, `ready_ms` on the session and the panel | Rust and Playwright: a folder without `lakelet.toml` is initialised and opened; two windows get two sidecars with halved limits (`/api/health` reports the limit); closing kills the sidecar (no orphan process). *Met:* four Rust tests (share, recent list, init, two windows and close), three Vitest, two Playwright against two real sidecars |
| 2 | Screen 1: tables panel, drop zone with the terminal command beside it, preview, import, "Copy as command". *Built September 10:* `screens/Tables.tsx` with `TablesPanel` (rows, size, columns, updated), `DropZone` (Tauri's drag-drop event, "Choose files…", a typed path), `PreviewPanel` (columns with DuckDB and Iceberg types and notes, first rows, the name, replace-or-append on a 409), `Command` (the chip with copy) built from `lib/command.ts`; the `Open…` menu of recent projects; core additions `freshness` on the table list and `/api/preview` of a folder (also `lakelet import <folder> --preview`) | Playwright: drop a generated CSV, the preview shows the columns and notes, import lands, the panel shows the table with rows and size; a folder drop lists three files; the copied command is the exact CLI line. *Met:* four Playwright tests against a real sidecar (a typed path stands in for the drop in a browser), six Vitest (the command lines, the preview panel), three core tests |
| 3 | Screen 2 without the chart: CodeMirror input, Cmd/Ctrl+Enter, the gauge line from headers, streaming grid, Red refusal and "Run anyway", Esc cancels. *Built September 10:* `lib/arrow.ts` (fetch, headers, `RecordBatchReader` over the body, abort), `SqlEditor` (lang-sql, table and column completion, Mod-Enter, Escape), `GaugeLine`, `Grid` (TanStack Virtual, the 100,000-row cap with the footer), `screens/Query.tsx` with `lakelet sql` as its command; loaded lazily. Core: the `X-Lakelet-*` headers exposed over CORS; a client that goes away interrupts the statement (`Engine.interrupt`, `Interrupted`) and the run is recorded as stopped early | Playwright: on a 20 M-row table the first rows are on screen before the query completes (timestamped); a lowered-threshold project shows Red with the sentence and runs on "Run anyway"; Esc during a slow query leaves the app responsive and history shows the closed run. *Met:* four Playwright tests against two more real sidecars (one with a 20 M-row table generated in setup, one with the thresholds lowered), the screen stamping its own clock: verdict at 1.26 s, first 38,000 rows at 1.50 s, 66,667 rows done at 2.15 s in the container; Esc to "stopped" and the run in history in under 3 s; five Vitest; two core tests |
| 4 | The auto-chart (A5); crash recovery (A11); settings panel; keyboard polish. *Built September 10:* `lib/chart.ts` (the one rule, pure) and `Chart.tsx` (Vega-Lite through `vega-embed` with the expression interpreter, so the CSP stays without `unsafe-eval`; loaded with the first chart); the window's reaction to `restarted` and `down` (the last lines, "Restart the core" through a `restart_sidecar` command); `SettingsPanel` over new core verbs `lakelet config show` and `config set` and `/api/settings`, which rewrite one line of `lakelet.toml` in place; ⌘/Ctrl+, for settings, ⌘/Ctrl+K to the SQL box (reserved for the ask box), Esc closes | Playwright: bar chart for a group-by; killing the sidecar's pid shows "core restarted" and the tables refresh; settings write `lakelet.toml` and the CLI reads them. *Met:* Playwright (12 bars for a 12-group query with the axis naming them, no legend, one hue; nothing for two numeric columns; settings written in place with comments kept, `lakelet config show` reading them, a bad value refused); the restart is `cargo test`'s (the supervisor) plus a Vitest of the window refetching from the new port on `restarted` and showing the lines and the button on `down`, since a browser has no sidecar to kill; five Vitest for the rule; three core tests |
| 5 | Definition of done (§6); the log; the docs pages for the app. *Built September 11:* §6 below carries a number or a test against every line; `/docs/app` on the site; `lakelet-session-6-desktop-shell.md` is the session's record; two new gates for "nothing hidden" (a Playwright test that records every request across both screens, a chart and settings and allows only the dev server and the sidecar on loopback; a Rust test that a non-debug build passes no dev origin, run once with `cargo test --release`) and Yellow in the gauge-line tests | Everything in §6 measured and recorded. *Met, except the week of daily use, which is Hants'* |

---

## 5. Toolchain

| | Version, to be pinned in step 0 |
|---|---|
| Rust | stable (1.8x) via rustup |
| Tauri | 2.x current; plugins: shell, dialog, fs, store |
| Node | 22 LTS; npm |
| React, TypeScript, Vite | 19, 5.x, current |
| CodeMirror | 6, `@codemirror/lang-sql` |
| TanStack Table and Virtual, apache-arrow, Vega-Lite | current |
| Playwright, Vitest | current |
| Linux build deps | `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev` on Ubuntu 22.04+ |

---

## 6. Definition of done

*Measured and recorded September 11, 2026 (step 5). The machine is Hants' 64 GB MacBook Pro unless said otherwise; the container is a two-core sandbox and is not the reference.*

- [x] **Screens 1 and 2 live**, with every action carrying "Copy as command". Screen 1: the tables panel, the drop zone, the preview, import (Playwright `step2-import.spec.ts`, four tests; a Finder drop of an 18-column CSV by hand). Screen 2: the SQL box, the gauge line, the streaming grid, Red as a refusal, Esc, the chart (`step3-query.spec.ts`, `step4-chart-settings.spec.ts`). The lines are built by `lib/command.ts` and held to `lakelet --help` by Vitest. *Not checked against the mockups pixel by pixel; the screens carry the mockups' elements and the site's tokens.*
- [x] **Launch.** Spawn to ready 871 ms cold and 436 to 486 ms warm on the Mac, from the shell's own clock on the session (`ready_ms`); page open to green dot 182 ms in a warm browser. The window paints before the sidecar is up (the welcome screen or the project name with an amber dot); nothing waits for the core but the panel's rows and the run button. Under 1.5 s from a venv; the frozen sidecar (session 10) is the open question.
- [x] **Streaming.** On the 20 M-row table on the Mac: the verdict at 56 ms, the first 7,000 rows in the grid at 62 ms, all 66,667 at 143 ms, stamped by the page itself (`data-verdict-ms`, `data-first-rows-ms`, `data-done-ms`). Esc on a 10¹⁰-row cross join: stopped, the statement interrupted in the core, history showing the run, the next query running, 1.8 s in all.
- [x] **Verdicts.** Green, Yellow and Red as the site's words and colours with the sentence (Vitest on `GaugeLine`, all three); Red is a refusal until "Run anyway" (Playwright, the lowered-threshold sidecar; history reads `refused` then `local`).
- [x] **Recovery.** By hand on the Mac: `kill` of the sidecar, "core restarted" and the tables back within five seconds; a second kill inside a minute, "The core stopped." with the last lines (or the window's own line when a killed process left none) and "Restart the core", which brought it back. The supervisor's restart-once-then-stop is `cargo test`'s; the window's reactions are Vitest's with the session module mocked.
- [x] **Tests green** on both CI runners: `cargo test` (8), Vitest (27), Playwright (17) against four real sidecars, in `app-ci.yml` on macOS and Ubuntu; the core suite alongside.
- [x] **Nothing hidden.** Playwright records every request across both screens, a chart and the settings panel: 56 requests, two hosts, the dev server and the sidecar on loopback (`step5-nothing-hidden.spec.ts`). A debug build passes `LAKELET_DEV_ORIGIN` to its sidecar and a release build passes nothing: `SidecarConfig::new` reads `cfg!(debug_assertions)`, and `a_release_build_passes_no_dev_origin` holds it under `cargo test --release`. Nothing is downloaded at run time; Vega runs through its interpreter so the CSP keeps `default-src 'self'`.
- [ ] **The founder uses it daily** on a real dataset for a week. Hants'; `examples/sample-data/` and his own CSVs are there for it.

---

## 7. Known unknowns

- *Answered September 10:* the sidecar's spawn-to-ready in the Tauri window on the 64 GB MacBook Pro is 871 ms cold and 441 ms warm (`ready_ms` on the session); two windows read 38.3 GiB and 19.1 GiB; closing the second left one `lakelet serve` process. The 1.5 s launch budget holds with margin from a venv; the frozen sidecar (session 10) is still the open question below.

- WebKitGTK on Ubuntu 22.04: rendering speed of a virtualised grid and CodeMirror; the Linux CI runner and the reference laptop answer it in step 0 and step 3.
- Arrow JS throughput: parsing 1,000-row batches at the rate the core streams them, and memory at the 100,000-row cap; step 3 measures. *Step 3, container:* 66,667 rows of three columns arrived and rendered in 0.9 s after the verdict; the cap is reached on `select * from big` without the page stalling. The verdict itself took 1.26 s on the 20 M-row table there. *On the 64 GB MacBook Pro, same test:* verdict at 56 ms, first 7,000 rows in the grid at 62 ms, all 66,667 rows at 143 ms, over a 20 M-row scan; the 20 M-row Parquet imported as an Iceberg table in 1.0 s. The container's 1.26 s was the container.
- Sidecar start inside a bundle (session 10): the CLI's 0.81 s is from a venv; a frozen sidecar may differ by a lot either way.
- Tauri 2's content-security policy versus Vega-Lite's inline styles; step 4. *Step 4:* the styles are covered by the existing `style-src 'unsafe-inline'`; the real conflict was Vega's `new Function` for expressions, avoided by rendering with `vega-interpreter` (`ast: true`), so `default-src 'self'` stands. Confirmed in the Tauri window on the Mac: pending.
- Whether a folder drop of many files should import in parallel or in order; in order, one preview, until a partner asks.

---

## 8. What this changes in the other documents

| Document | Change |
|---|---|
| `docs/lakelet-v0-build-spec.md` §3 | Frontend row: CodeMirror 6 for the SQL editor, not Monaco (A3). |
| `core-v0.5-plan.md` §7 | The sidecar memory unknown closes with A8. |
| `docs/lakelet-day0-prd.md` F0.8 | Unchanged; A13 records that FR5 (signed DMG, AppImage) is session 10. |
| `build-sessions/lakelet-build-sessions.md` | Session 6's line gains: the chart (A5), crash recovery (A11), the three core additions. |
| `web/src/content/docs/` | An "app" page in Develop once step 0 exists: how to run it from source. |
