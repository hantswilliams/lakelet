# lakelet-app

The desktop shell: a Tauri 2 window over the `lakelet` sidecar. The brief is
`../build-sessions/app-v0-plan.md`; start from the repo's `CLAUDE.md`.

```bash
# once: Rust stable, Node 22, the core's venv (cd ../core && uv sync), and on Ubuntu
#   sudo apt-get install libwebkit2gtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev
npm install
export LAKELET_SIDECAR=$PWD/../core/.venv/bin/lakelet   # the sidecar in development (A6)
npm run tauri dev                                        # the last project, or the welcome screen
LAKELET_PROJECT=~/acme npm run tauri dev                 # a window on that folder (init runs if needed)
```

Each window is one project with its own `lakelet serve`, given 60% of RAM for the first
window and half that for each further one (A8). "Open…" in the bar opens another folder in a
new window; the recent ten are in `recent.json` under the app's data directory (A10).

Tests: `cargo test` in `src-tauri/` (the supervisor, projects and windows against a fake
sidecar), `npm test` (Vitest, the screens), `npm run e2e` (Playwright against real
`lakelet serve`s; needs `LAKELET_SIDECAR` or `../core/.venv`).
