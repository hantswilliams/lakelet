---
title: The desktop app
description: Running the app from source, what each screen does, the keys, how it talks to the core, and what it will never do behind your back.
section: Develop
order: 2
---

The desktop app is a window over the same core the CLI runs: a Tauri 2 shell (Rust, the system webview) that starts `lakelet serve` for the project you open and shows its answers. Every button is a CLI verb, and every action shows the exact `lakelet …` line it is, with a copy button, so nothing is reachable one way and not the other. There is no installer yet (that is session 10); today it runs from the repo.

## Running it from source

```bash
cd core && uv sync && cd ../app
npm install                                            # Node 22
export LAKELET_SIDECAR=$PWD/../core/.venv/bin/lakelet  # the core the app should start
npm run tauri dev                                      # Rust stable; on Ubuntu also libwebkit2gtk-4.1-dev, librsvg2-dev, libayatana-appindicator3-dev
```

The first `tauri dev` compiles the shell (three minutes or so); after that it is seconds. `LAKELET_PROJECT=~/acme npm run tauri dev` opens that folder; without it the app opens the last project you used, or the welcome screen.

## Projects and windows

The welcome screen offers **Open a folder…** and the ten most recent projects. Any folder can be opened: one without a `lakelet.toml` is set up first (`lakelet init <folder>`), and the window shows what was created. Each project gets its own window and its own `lakelet serve`, so two projects never share an engine. The first window's core is given 60% of the machine's RAM as its DuckDB memory limit and each further window half of the previous share; the health tiles show the limit this window has. Closing a window stops its core. **Open…** in the bar lists the recent projects and **Other folder…** for the dialog.

The dot in the bar is the core's state: amber while it starts, green when `/api/health` answers ("core ready in N ms" is the spawn-to-ready time), amber again after a restart, red when it has stopped. If the core exits, the shell starts it once more and the tables refresh; if it exits twice inside a minute the window shows its last lines and a **Restart the core** button.

## Screen 1: tables and import

The tables panel lists every table with rows, size, columns and when it was last written, from `/api/tables`. Drop a file or a folder anywhere on the window, or **Choose files…**, or type a path: the preview shows each column with its DuckDB type, the Iceberg type it becomes and any note about the coercion, plus the first rows, before anything is written. Import is one click; if the table exists you choose **Replace it** or **Append to it**. A folder imports one table per supported file (`.csv`, `.tsv`, `.parquet`, `.json`, `.jsonl`, `.xlsx`; other files are skipped). The line beside every step is `lakelet import <path> [--name n] [--replace|--append]`.

An `s3://bucket/prefix/` of Parquet typed into the same box is attached rather than imported: the preview shows one file's columns with the Iceberg type each becomes, how many files and bytes would be registered, and one button, **Attach as name**, which is `lakelet tables attach <name> s3://…`; nothing is copied. Tick **Public bucket (no credentials)** for a dataset that allows anonymous reads (the line gains `--anonymous`). The core reads AWS credentials from the environment the app was started in; when it has none the box says so before you type a prefix, with the variables to set. The tables panel's **Where** column names the prefix an attached table came from, `public` or `attached`, and its **Refresh** button is `lakelet tables refresh <name>`, adding the files written to the prefix since. [A real bucket](/docs/remote) has the policies and a public dataset to try.

Clicking a table opens its detail, which is `lakelet tables describe <name>` as a panel: the columns with their Iceberg types, where the data is, partitioning, the format version, every snapshot newest first (when, the operation, rows and files added, rows after, which is current and which the retention would expire), and the line saying what `expire` would reclaim. **Sample rows** is `lakelet tables sample`, **Expire snapshots** is `lakelet tables expire` and shows its report (snapshots and files removed, bytes reclaimed); an attached table has **Refresh** instead, because its files are not Lakelet's to delete. Row counts everywhere take position deletes off, so a table rebuilt by delete-then-insert (the dbt path) shows the rows it has, not the rows its files hold.

A view (a dbt `view` model built with `lakelet run`, or a view put in the catalog directly) is listed beside the tables and has its own detail: its query, its columns, how many versions it has and when this one was recorded, which dbt model it came from with the `lakelet run <model>` line that rewrites it, and **Sample rows**. It has no snapshots and nothing to expire, because nothing is stored for it; the rows are computed from its query each time it is asked.

## Screen 2: SQL, the verdict, the rows

Once the project has a table, the SQL box appears above the panel, with the tables and columns for completion. ⌘/Ctrl+Enter runs (or the Run button). The verdict comes back before any row, from the response headers, as the gauge line: Green "Runs here", Yellow "Runs here, slowly", Red "Needs more machine", with the sentence (what it scans, whether it fits in memory, how long). Red is a refusal until **Run anyway**, which is `lakelet sql '…' --run-anyway`. Rows stream into the grid as the core produces them, one 1,000-row batch at a time from the first; the first rows are on screen before the query completes, and the grid keeps 100,000 rows before it says so and names `lakelet sql --format parquet` for the rest. Esc stops a running query wherever the focus is; the core stops the statement at once and history records the run as stopped early.

A result of exactly two columns, one categorical and one numeric, draws a bar chart above the grid, in the rows' order; a date or timestamp and a numeric draws a line; anything else draws nothing. The chart comes from the first 5,000 rows and has at most 40 bars.

Dates, timestamps, times and decimals show as dates, timestamps, times and numbers; null is ∅.

## The Models screen

**Models** in the bar is the project's dbt DAG through the gauge, screen 7 of the mockups: `lakelet run --plan` as a panel. The list has every model in dependency order with its kind (`view` or `table`), the verdict coloured, the estimate and what it scans, and its last run; the line beside the summary is `lakelet run`. Clicking a model shows its compiled SQL, the models it `ref()`s, its tests from `schema.yml` (`not_null(id)`, `unique(id)`, a singular test by its name), the verdict's sentence, its description and file, and its last `lakelet run` from history (when, how long, or that it failed). **Run all** is `lakelet run`; **Run this** is `lakelet run <model>`. A Red model makes the run refuse the whole DAG, as the CLI does, until **Run anyway** (`--run-anyway`). After a run the notice says how many models built in how long and which views landed in the catalog; the tables panel and the Gauge screen's run list have the result at once. A `view` model is an Iceberg view in the catalog only when built this way; the reason is on [the dbt page](/docs/dbt).

The plan compiles the project with dbt each time the screen opens, so it takes a few seconds; a project without dbt installed says so with the `pip install 'lakelet[dbt]'` line, and a project without models says a model is a SQL file under `models/`.

## Simple and Technical

The **Simple | Technical** switch at the right of the bar is screen 8: the same project in two vocabularies, remembered per window. Technical is everything above: model, test, view, the verdict by colour, the command line beside every button. Simple renames the Models screen **Questions** and shows the DAG as cards: a `view` model is a question *answered live*, a `table` model is *saved as a table*; each card has when it was last refreshed, the wait as a sentence ("Ready in about 2 s", "Takes a while: about 4 min", "Too big for this machine right now") instead of a colour, its checks in words (`not_null` on `id` is "id is never empty", `unique` is "id is never repeated", `accepted_values` is "one of the allowed values"), and one **Refresh** button; the top has **Refresh all**. The command lines stay, because Simple hides vocabulary, not what the app does. The view detail follows the switch too. The mapping between the two is one small table in the app, pinned by a test, so both screens say the same words.

## The Gauge screen

**Gauge** in the bar (beside **Tables** and **Models**) is the gauge's record, screen 5 of the mockups: this machine's line (RAM, threads, the memory limit, the disk figure, the bandwidth when a bucket has been read), three tiles (runs recorded; the share of completed local runs within 2× of their estimate on time; Green runs that took over three minutes), an estimate-versus-actual scatter on log axes with the diagonal of a perfect estimate and the verdict colouring each point, the run list (when, verdict, where it ran, estimate, actual, bytes scanned; a failed run says so, without its text), and what the gauge has learned on this machine, which is nothing until the correction factors ship. Four buttons are four verbs: `lakelet gauge history` at the top, **Export history** (`lakelet gauge export`: a file in the project, nothing sent; see [the gauge](/docs/gauge)), **Probe the disk again** (`lakelet gauge probe`), and **Reset** (`lakelet gauge reset`, which asks first).

## Settings

⌘/Ctrl+, opens the settings panel: the CLI's memory limit and thread count, how many days of snapshots `lakelet tables expire` keeps, and the calibration-sharing toggle (nothing is sent yet; the switch is there so the file is ready). Each row shows its `lakelet config set …` line. They are written into the project's `lakelet.toml` in place, comments kept; the core reads them when it starts.

## Keys

| Key | Does |
|---|---|
| ⌘/Ctrl+Enter | run the SQL |
| Esc | stop a running query; close settings or a menu |
| ⌘/Ctrl+, | settings |
| ⌘/Ctrl+K | to the SQL box (reserved for the ask box) |

## How the window talks to the core

The shell spawns `lakelet serve --port 0 -C <project> --memory-limit <share>`, waits for its `serving` line, reads the port and the per-launch token from `.lakelet/serve.json`, and hands them to the window. The window calls `http://127.0.0.1:<port>/api` itself with the bearer token, and reads query results as an Arrow IPC stream; the core allows cross-origin requests from the Tauri origins only. Under `tauri dev` the window's origin is the Vite server, so a debug build of the shell also passes `LAKELET_DEV_ORIGIN=http://localhost:5173` to its sidecar; a release build passes nothing, and a Rust test run with `cargo test --release` holds it to that. See [the local HTTP API](/docs/api) for the routes.

## Nothing hidden

The app makes no network request the core does not: a Playwright test records every request across the screens (a preview and import, a query with a chart, the settings panel, a Gauge export, a Models plan) and asserts the only hosts are the page's own server and the sidecar on loopback. The core's own `lakelet audit network` covers the other side. Nothing is downloaded at run time; the chart library evaluates its expressions with an interpreter so the window's content-security policy stays without `unsafe-eval`.

## Tests

```bash
cd app/src-tauri && cargo test    # the supervisor, projects and windows, against a fake sidecar
cd .. && npm test                  # Vitest: the screens' pieces, the command lines, the chart rule, the window's reactions
npm run e2e                        # Playwright against seven real `lakelet serve`s: a 20 M-row table, a stand-in bucket, a zero-day retention, a dbt project among them
```

The Playwright suite starts its own sidecars on temp projects (and, for the attach screen, a Moto server standing in for a bucket, with public-read ACLs so the anonymous path is real; for the Models screen, a dbt project with a view model, a table model over it and two tests); nothing of yours is touched. On a laptop it runs the spec files on several workers at once and each file owns the sidecar it writes to.

## When it does not start

"The core did not start" names the sidecar it tried and the project. In development the usual cause is `LAKELET_SIDECAR` unset in the shell that ran `npm run tauri dev`; the core's own error, if it printed one, is in the panel. "Load failed" in a query is WebKit's wording for a blocked request, which under `tauri dev` means the sidecar was started without the dev origin (an old shell build).
