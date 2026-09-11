# Four decisions on the two core items — one page

> **Decided September 11, 2026: all four accepted.** This file is the record of the decision; what shipped is in `TASKS.md` and the session log.

*September 11, 2026 · Items 1 and 2 of "Next, in order" in `TASKS.md`. Tick a box on each; write a line under "Change" if you disagree. Nothing ships until they are ticked.*

## The one thing to know

Both items are things the core does today that are quietly wrong, found by using the app. The gauge's disk number is the page cache, not the disk: `init` writes a 512 MB file and reads it back twice with DuckDB, keeping the second time, and on a machine with more RAM than the file the second read never touches the disk. Your Mac reports 84,914 MB/s; a real NVMe reads at 3,000 to 7,000. The gauge divides bytes scanned by that number, so the local I/O term of every verdict is near zero on any developer machine, and a scan that will take four seconds from disk is estimated at a fraction of one. And every rebuild of a table (an `import --replace`, a `dbt run`) leaves the previous snapshot's files in place, by Iceberg's design: a table rebuilt nightly grows nightly until someone expires snapshots and sweeps the files nobody references, and nothing in Lakelet does either yet. pyiceberg 0.12 has `table.maintenance.expire_snapshots()`; the file sweep is ours to write.

---

### 1. The probe reads with the cache bypassed, in Python, not through DuckDB

**Recommend:** keep DuckDB for writing the 512 MB file, then read it back in Python with the cache bypassed: `F_NOCACHE` on the file descriptor on macOS, `O_DIRECT` with a 4 MiB aligned buffer on Linux. The quantity the gauge needs is sequential bytes per second from the disk (Parquet decoding is the CPU term, costed separately), so a raw read is the right measurement and DuckDB's involvement was incidental. Record the method next to the number in `.lakelet/cache/machine.json` (`"probe": "nocache" | "direct" | "cached"`).
**Why:** it measures the thing the gauge divides by. The alternatives: a file larger than RAM is a 65 GB write on your Mac; evicting the cache needs root on macOS; a ceiling alone is a guess dressed as a measurement.
**Cost:** platform-specific code with a fallback (below); 0.1 to 0.5 s more in `init` on an NVMe, a few seconds on a spinning disk, once.

- [x] Agree
- [ ] Change:

### 2. Where neither flag works, the cached figure is capped and labelled

**Recommend:** on a platform or filesystem where neither `F_NOCACHE` nor `O_DIRECT` can be used (Windows; some network filesystems), fall back to the cached read, cap the recorded figure at 7,000 MB/s (a PCIe 4 NVMe's ceiling), and say so in `init`'s output ("local disk reads at up to 7,000 MB/s (measured through the cache)") and in `/api/health` (`throughput_probe: "cached"`). The gauge then errs on the fast side by a known bound rather than by a factor of thirty.
**Why:** a wrong number with a label beats a refusal to number.
**Cost:** one constant to defend; the docs' gauge page gets a paragraph.

- [x] Agree
- [ ] Change:

### 3. `lakelet gauge probe` re-runs the probe; existing projects are told to

**Recommend:** a new verb, `lakelet gauge probe [--mb N]`, that runs the probe again and rewrites the cached figure, so a project initialised before this change (yours) is fixed with one command rather than a re-init; `lakelet gauge history` and `/api/health` show the probe method, and a figure recorded by the old method is flagged ("measured through the cache; run `lakelet gauge probe`"). The app's health tile shows the same flag.
**Why:** the number is wrong in every project that exists today, and `init` refuses to run twice.
**Cost:** a verb, a flag, a line in the docs.

- [x] Agree
- [ ] Change:

### 4. Expiry is a verb with a retention key; it does not run by itself in v0

**Recommend:** `lakelet tables expire [<name> | --all] [--keep-days N]` expires every snapshot older than N days except the current one (default from a new settable key, `[catalog] keep_snapshots_days = 7`), commits that through the catalog with pyiceberg's `expire_snapshots`, then deletes the data and manifest files under the table's own location that no remaining snapshot references, and reports snapshots removed, files removed, bytes reclaimed. Only tables Lakelet wrote, in the project's own warehouse, are swept; a table registered with `tables attach` is never touched. `lakelet tables describe` names what is reclaimable ("14 snapshots, 3.1 GB reclaimable: `lakelet tables expire orders`"), and the app's tables panel can show the same later. Nothing runs automatically after `import --replace` or `dbt run` in v0.
**Why:** deleting files is the one thing in the core that cannot be undone, so it should happen when asked, with a number in front of it, until there is a week of daily use behind it. The Iceberg word is "expire", so the verb is too. Seven days keeps a week of rollbacks, which matches the founder-uses-it-for-a-week gate.
**Cost:** the Lakelet catalog must accept pyiceberg's `remove-snapshots` metadata update, which it may not yet (part of the work, with a test); a sweep that must never delete a file a live snapshot references (the test writes, rebuilds, expires, and reads every remaining snapshot back). *If no to "manual only":* an `[catalog] expire_after_replace = true` key that runs the same code after a replace, off by default.

- [x] Agree
- [ ] Change:

---

*What ships if all four are ticked:* `gauge/inputs.py` probe rewritten with the two flags and the fallback; `machine.json` gains `probe`; `lakelet gauge probe`; the flag in `health` and `gauge history`; `keep_snapshots_days` in `config.SETTABLE`; `lakelet tables expire` and `Tables.expire` with the sweep; the catalog's `remove-snapshots` support if missing; `describe` naming what is reclaimable; tests for each (`test_step5_gauge.py` for the probe against a file with the cache dropped, `test_step3_import.py` or a new `test_expire.py` for the rebuild-then-expire-then-read-every-snapshot case); the docs' gauge and tables pages; the app's health tile flag.
