# Lakelet — build session log, September 10, 2026

*Planning session for the desktop shell · Hants and Claude (Fable 5.1) · Produced `app-v0-plan.md` (app v0, revision 1); no code*

## 1. What this session did

- Hants set the constraints for the shell: fast, easy to ship on macOS and Linux (Windows if free), and not Electron. Re-examined the docs' standing decision (Tauri 2, React, Python sidecar, HTTP plus Arrow on loopback) against Electron, Wails, Flutter, Qt via PySide, and the Rust-native GUIs; Tauri 2 holds, for the reasons in A1. The honest cost is recorded: the installer's size and the launch time are the sidecar's, not the shell's.
- Wrote `app-v0-plan.md` in the shape of `core-v0.5-plan.md`: the A block (A1 to A14) with recommendations and tick boxes; scope for session 6 (screens 1 and 2 of the mockups); the architecture (one sidecar per window, `serve.json` for port and token, the webview calling `/api` directly, the query path from headers to batches); a build order of six steps each ending in a test; the toolchain; the definition of done; five known unknowns; the doc changes it implies. Three small core additions are named for step 0: `serve --memory-limit`, a `serving` readiness line on stdout, and a dev-only `LAKELET_DEV_ORIGIN` for testing the frontend in a browser.
- Recommendations that amend the docs: CodeMirror 6 instead of Monaco for the SQL editor (launch budget); the auto-chart in session 6 rather than 7; crash recovery in session 6 (it is F0.8's acceptance criterion).

## 2. Still open

1. The A block in `app-v0-plan.md`.
2. Everything in `TASKS.md`'s Now list that needs another machine.
