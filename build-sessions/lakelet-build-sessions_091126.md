# Lakelet — build session log, September 11, 2026

*Hants and Claude (Fable 5.1) · The order after session 6, the task list restructured, and the two core items decided and built*

## 1. The order, and the list

Hants deprioritised session 7 (the ask box) and set the order after step 5 of the app brief: the two core items found by using the app (the probe, snapshot expiry), then session 10, 9, 8, 5. `TASKS.md` was restructured around that: a "Now", a "Next, in order", a list of what needs another machine or Hants, and a map of the ten sessions with a status column, so it is the one file to open; the session map (`lakelet-build-sessions.md`) points at it as the only place status lives. The session 6 record became one row per step.

## 2. Four decisions, decided

`decisions-for-review_091126.md`, all four accepted the same day: the probe reads with the cache bypassed in Python rather than through DuckDB; where it cannot, the cached figure is capped at 7,000 MB/s and labelled; `lakelet gauge probe` measures again and a figure from before the change is flagged; expiry is `lakelet tables expire` with a `keep_snapshots_days` key (7), deleting files only when asked, never for an attached table.

## 3. The probe, built

`gauge/inputs.py`: the probe no longer involves DuckDB. `_write_uncached` writes 512 MiB of random bytes (a 4 MiB `urandom` block, repeated, so no controller compresses it) and `_read_uncached` reads them back, both through `os.open` with `O_DIRECT` on Linux (an anonymous `mmap` as the page-aligned buffer, `os.writev` and `os.readv` in 4 MiB chunks) or `fcntl(F_NOCACHE)` on macOS, the read returning seconds and the method. The write has to bypass the cache as well: Hants' first run of `lakelet gauge probe` on the Mac reported 16,592 MB/s with `F_NOCACHE` on the read alone, because macOS serves pages that are already in memory (the write had just put them there) even to a no-cache read; Linux's `O_DIRECT` reads from the disk regardless, which is why the container was honest from the start. A figure above 20,000 MB/s is treated as a bypass that did not bypass and falls to the cached path; when neither works the file is read through the cache twice, the second time kept, capped at the ceiling, method `cached`. `probe_throughput` returns a `ProbeResult(mbps, method, size_bytes)`; `probe_method(cache)` reads the method back from `machine.json` and calls a figure with none recorded `cached`, which is what every project from before today has. `Project.run_probe` is the one place that runs it and writes the cache, used by `init` and by the new `lakelet gauge probe [--mb]`. `init` says "up to N MB/s (measured through the cache…)" when it had to; `gauge history` opens with the disk line and, for a cached figure, the instruction to re-probe; `/api/health` gains `throughput_probe`; the app's tile reads "local disk (cached; run lakelet gauge probe)" with the reason in its tooltip.

Measured in the container with `O_DIRECT` on both sides: 5,090 MB/s for 512 MiB in 1.0 s (the container's disk is a virtual one with a host behind it, so the figure is what the guest can get, not a bare NVMe). The Mac's number is Hants' to see after the write-side fix: the first attempt said 16,592.

Tests: `test_step5_gauge.py` (the method is `direct` on Linux and `nocache` on macOS, the figure under 20,000 when the cache was bypassed, the file removed, `machine.json` carrying `probe` and the size, a re-probe rewriting it, an old cache reading as `cached`); `test_step7_cli.py` (`gauge probe`, `gauge history`'s line); `test_step9_api.py` (`throughput_probe` in health).

## 4. Expiry, built

`config`: `catalog.keep_snapshots_days` (7) in the section, the default file, and `SETTABLE`, so `lakelet config set` and the app's settings panel take it. `tables.py`: `_expirable(md, keep_days)` (older than the retention, not the current snapshot, not a branch or tag target), `_referenced_files(md, only, exclude)` (manifest lists, manifests, data and delete files with their sizes, across the chosen snapshots), `_orphans(location, kept, grace)` (data and manifest files under a local table's own `data/` and `metadata/` that no snapshot references and that are older than the grace period, an hour by default; metadata JSON stays), and `expire(name, keep_days, orphan_grace_seconds)`: refuses an attached table (the `lakelet.source-prefix` property) or one outside the warehouse, loads the table through the project's own REST catalog with pyiceberg, `maintenance.expire_snapshots().older_than(newest expirable + 1 ms).commit()`, re-reads the metadata, deletes what the expired snapshots referenced and the kept ones do not plus the orphans, and reports. The catalog accepted pyiceberg's `remove-snapshots` update without a change: the commit path already applies updates with `update_table_metadata`, which is why it was built that way. `describe` gains `expirable_snapshots`, `reclaimable_bytes` and `keep_days`, and the CLI prints "N snapshot(s) older than D days, X reclaimable: lakelet tables expire <name>". `lakelet tables expire <name> | --all [--keep-days N]`; `POST /api/tables/{name}/expire {keep_days?}` with 409 `not_expirable`.

One thing found on the way: `import --replace` drops and recreates the table, and the previous table's files stay in the same folder, unreferenced by any snapshot of the new one. That is what the orphan sweep is for, and its test covers it: after a replace the old files linger, an expire inside the grace period leaves them, an expire with no grace removes exactly them and the table reads back whole.

Tests, `tests/test_expire.py`, five: a create and three in-place rebuilds (the dbt path, delete then insert) expire down to one snapshot with files removed and every remaining file present, the table reading back through DuckDB and pyiceberg, a further rebuild and expiry; the retention keeping minutes-old snapshots; the replace orphans; an attached table refused with its files untouched; the verb, the setting and `describe`'s line through the CLI. Plus the route and the setting in `test_step9_api.py`.

## 5. Docs and the rest

The tables page has a "Snapshots, history and expiry" section; the gauge page says how the throughput is measured and what `cached` means; the config page has the key; the API page has the route, the describe fields and `throughput_probe`; the CLI reference is regenerated. The app: the retention row in settings, the tile's flag.

## 6. Still open

1. On the Mac: `lakelet gauge probe` in `~/lakelet-demo` (the number, and `nocache` as the method); `lakelet tables describe` and `expire` on a table rebuilt a few times.
2. Step 5 of `app-v0-plan.md`, then session 10 per `TASKS.md`.
