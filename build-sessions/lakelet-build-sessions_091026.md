# Lakelet — build session log, September 10, 2026

*Planning session for the desktop shell · Hants and Claude (Fable 5.1) · Produced `app-v0-plan.md` (app v0, revision 1); no code*

## 1. What this session did

- Hants set the constraints for the shell: fast, easy to ship on macOS and Linux (Windows if free), and not Electron. Re-examined the docs' standing decision (Tauri 2, React, Python sidecar, HTTP plus Arrow on loopback) against Electron, Wails, Flutter, Qt via PySide, and the Rust-native GUIs; Tauri 2 holds, for the reasons in A1. The honest cost is recorded: the installer's size and the launch time are the sidecar's, not the shell's.
- Wrote `app-v0-plan.md` in the shape of `core-v0.5-plan.md`: the A block (A1 to A14) with recommendations and tick boxes; scope for session 6 (screens 1 and 2 of the mockups); the architecture (one sidecar per window, `serve.json` for port and token, the webview calling `/api` directly, the query path from headers to batches); a build order of six steps each ending in a test; the toolchain; the definition of done; five known unknowns; the doc changes it implies. Three small core additions are named for step 0: `serve --memory-limit`, a `serving` readiness line on stdout, and a dev-only `LAKELET_DEV_ORIGIN` for testing the frontend in a browser.
- Recommendations that amend the docs: CodeMirror 6 instead of Monaco for the SQL editor (launch budget); the auto-chart in session 6 rather than 7; crash recovery in session 6 (it is F0.8's acceptance criterion).

## 2. Step 0, built

Hants accepted A1 to A14. Assumptions stated before starting: the `serving` stdout line the core already prints is the readiness signal (so only two of the three planned core additions were needed: `serve --memory-limit`, which threads through `Project.open` to the engine for that process only, and `LAKELET_DEV_ORIGIN`, appended to the CORS list when set); the shell spawns the sidecar with `std::process` in development and the bundled sidecar joins in session 10; placeholder icons, since the brand SVGs are gitignored; the project for the window comes from `LAKELET_PROJECT` until step 1's dialog.

What exists now, under `app/`: `src-tauri/` with `supervisor.rs` (spawn with `-C <project> serve --port 0 --memory-limit <n>`, readiness from the `serving` line with a 20 s timeout, `serve.json` read the way the CLI writes it, a stderr tail on a thread, restart once and give up after two exits inside a minute, kill on drop), `lib.rs` (the `get_session` command, a monitor thread emitting `sidecar` events, stop on window destroy), `tests/fake_sidecar.py` (a stand-in that takes the real arguments and records them), three Rust tests; `src/` with `session.ts` (Tauri's `invoke` inside the app, `?port=&token=` in a browser), `api.ts`, `StatusDot`, and an `App` that renders health and the tables panel in the empty-project state; `tests/` with a global setup that inits a temp project and starts a real `lakelet serve` with the dev origin, and two Playwright tests. `app-ci.yml` runs `cargo test`, the frontend build and Playwright on macOS and Ubuntu with the sidecar from `core/`. The tokens are a copy of the site's with a header saying so.

Measured in the container: `cargo build` of the shell from cold 2m 52s; the Playwright page-open-to-green-dot 433 ms in a headless browser against a warm sidecar (not the Tauri window; that measurement is Hants' on the Mac). Core suite after the additions: 144 passed, 9 skipped.

Two near misses in the transfer to the Mac, both caught, both recorded so they stop happening: the container clone was one commit behind the Mac when the first bundle was made and would have reverted the materialisation in `project.py`; and the desktop bridge served a previously transferred archive again when a new one was written to the same path, which is also what clobbered the decisions file's ticks the day before. Rules from now on: fetch and reset to `origin/main` immediately before every bundle, check the file that matters after extracting, and give every transfer a unique name.

Hants ran it on the Mac. First window: "core stopped" with no reason, because Tauri rejects a failed command with a string and the catch read `.message`; fixed, with the sidecar executable and project now named in the error and a Playwright test for the message. Second window: "Load failed", WebKit's word for a blocked `fetch`, because under `tauri dev` the window's origin is the Vite dev server, which the core's CORS list does not include; the shell now passes `LAKELET_DEV_ORIGIN` to the sidecar in debug builds only, asserted by the fake-sidecar test, and A12 carries the amendment. Third window: green dot, `lakelet-demo`, the four tiles, the empty panel. Step 0's gate is met on both the container and the Mac.

Two facts from the tiles: the memory limit read 51.1 GiB (DuckDB's 80% default; the shell does not pass a limit until step 1), and local disk read 84,914 MB/s, which is the page cache: `init`'s probe reads back the 512 MB file it just wrote. On a machine with more RAM than the probe the gauge's I/O term is therefore near zero. Recorded in `TASKS.md` as a core item.

## 3. Still open

1. Step 1 of `app-v0-plan.md`; the Tauri-window launch measurement on the Mac.
2. Everything in `TASKS.md`'s Now list that needs another machine.
