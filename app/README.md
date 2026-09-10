# lakelet-app

The desktop shell: a Tauri 2 window over the `lakelet` sidecar. The brief is
`../build-sessions/app-v0-plan.md`; start from the repo's `CLAUDE.md`.

```bash
# once: Rust stable, Node 22, the core's venv (cd ../core && uv sync), and on Ubuntu
#   sudo apt-get install libwebkit2gtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev
npm install
export LAKELET_SIDECAR=$PWD/../core/.venv/bin/lakelet   # the sidecar in development (A6)
LAKELET_PROJECT=~/acme npm run tauri dev                 # a window on that project
```

Tests: `cargo test` in `src-tauri/` (the supervisor against a fake sidecar), `npm run e2e`
(Playwright against a real `lakelet serve`; needs `LAKELET_SIDECAR` or `../core/.venv`).
