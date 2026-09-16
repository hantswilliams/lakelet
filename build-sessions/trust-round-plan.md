# Lakelet — the trust round (revision 1)

*September 15, 2026 · Six things a stranger's first hour can hit, and two things a visitor reads first. From an outside review of the repository and the live site (an OpenAI model, read by Hants, checked against the source by Claude the same day: every code claim below was confirmed by reading the line it names). Decided by Hants in conversation: this round goes **before** step 4 of `versions-plan.md` (lineage), which stays exactly as written and resumes after it. Follows `versions-plan.md`, `real-data-plan.md`, `app-v0-plan.md` and `core-v0.5-plan.md`, which it does not change except where §8 says. Decisions T1 to T8 are for review; tick Agree or write the change under each. Nothing is built until they are decided.*

## 0. The idea in one paragraph

The product's claim is that the laptop can be trusted with the warehouse. Four places in the core quietly break that claim today, and none of them is a screen: `import --replace` drops the old table before it knows the new file parses; `tables refresh` cannot see a file overwritten under the same path; the gauge gives a scan it cannot attribute zero bytes and calls it Green; and a project folder that is moved has tables whose metadata points at where it used to be. Two more are hygiene the repository being public makes urgent: the schema version both databases write is never read, and the catalog's `/v1` trusts any request that reaches loopback. Each is hours, not days, with a test that makes the guarantee explicit. The last two items are words rather than code, and they matter more than any of it to the person who arrives from a search: the homepage leads with what is planned, and the README is written for coding agents. The round ends with both saying, first, what exists.

---

## 1. Decisions for review (T1 to T8)

**T1. A replace that fails leaves the old table exactly as it was.**
*Why:* `tables.py` (`import_file`, mode `replace`) runs `DROP TABLE`, *then* infers the new file's columns from the reader, *then* `CREATE TABLE AS`. A CSV that does not parse, a cast that fails on row 40,000, or a disk that fills leaves the catalog with no table of that name and no automatic way back; the old data files are still on disk but nothing points at them.
*Recommend:* the new table is built first, under a temporary name (`<name>__lakelet_replace`, refused as a user's table name), from columns inferred before anything is dropped; only when that `CREATE TABLE AS` has committed is the old table dropped and the new one renamed into place with `ALTER TABLE … RENAME`, each as its own statement outside a transaction, which is the path `/docs/transactions` already documents as the one DuckDB-Iceberg allows. A failure before the drop leaves the old table untouched and the temporary one removed; a failure between the drop and the rename (a crash in the millisecond between two catalog commits) leaves `<name>__lakelet_replace` in the catalog, and `lakelet tables` lists it with the sentence "a replace was interrupted; `lakelet tables rename` finishes it", so the data is never invisible. `import --preview` is unchanged. The same order applies to `import_dir` with `--replace`, file by file.
*Not chosen:* inferring before the drop and stopping there (closes the parse case, three lines, but a failure inside the `CREATE TABLE AS` still loses the table); a snapshot-level rollback (the drop is a catalog operation, not a snapshot; nothing to roll back to).
*Gates:* pytest: a replace with a file that does not parse leaves the old table queryable with its row count and its history; a replace whose `CREATE` fails part way (a reader monkeypatched to raise after the first batch) leaves the old table and no temporary; a replace that succeeds keeps the name, gets the new schema, and leaves no temporary; the temporary name is refused by `import --name`; the interrupted state is listed with the sentence and `rename` finishes it. The app's replace-or-append path unchanged, asserted by the existing Playwright test.
- [x] Agree
- [ ] Change:

**T2. An attached file that changes under the same path is detected, and refresh refuses until the table is re-attached.**
*Why:* `register.py` (`refresh`) compares the manifest's file paths with the prefix's listing: missing files raise, new files are added, and a file rewritten in place is "unchanged". Its manifest entry, with the row count and column bounds the gauge prunes on and DuckDB plans with, now describes data that is not there. The attach contract (`real-data-plan.md` R4, D27) says files are immutable; nothing checks it.
*Recommend:* the listing already carries each object's size and, on S3, its ETag; the manifest already carries `file_size_in_bytes` per data file. `refresh` compares the two for every known file and, on any mismatch, raises `ChangedFiles` naming the first five: "3 registered file(s) changed under `<prefix>` since the attach; the table's statistics no longer describe them. `lakelet tables attach --replace <name> <prefix>` registers the prefix again." `describe` and the table detail show the same check as a line ("files verified 4 min ago" / "2 files changed since the attach") because a person looks at the detail more often than they run refresh; the check is a listing, which the detail already does for the file count, so it costs nothing new. `attach --replace` is the existing attach with the old registration dropped first, through T1's order. The ETag is recorded in a table property at attach time when the store gives one, so a same-size rewrite is caught on S3 too; on `file://` prefixes size and mtime are what there is, and the sentence says so.
*Not chosen:* re-reading every footer on refresh (correct, and a full pass over the prefix each time; the size and ETag catch every rewrite that is not a deliberate same-size, same-content one); silently re-registering the changed files (rewrites the table's identity under the user).
*Gates:* pytest against Moto and against a `file://` prefix: a file overwritten with different content is refused with its name; a file overwritten with the same bytes is not; a new file is still added; `describe` carries the line; `attach --replace` succeeds and the row count is the new one; the existing missing-file test unchanged. `/docs/remote` gains the paragraph.
- [x] Agree
- [ ] Change:

**T3. The gauge never says Green about a scan it could not attribute; an unattributed scan is a fourth state, "not estimated", and it is visible everywhere a verdict is.**
*Why:* `query.py` assigns each scan node of DuckDB's plan to a catalog table by its projected columns; a scan that matches nothing gets `bytes=0, rows=0, pruning="full"` and the estimate proceeds. That is not a corner case: `select * from read_parquet('s3://…/*.parquet')` in the SQL box is exactly such a scan and comes out Green having read nothing; so does a query over a DuckDB temp table or a table another engine created outside the catalog. The gauge is the product's one distinguishing claim, so an optimistic default is the most expensive kind of wrong.
*Recommend:* an unattributed scan marks the estimate `verdict = "none"`, `words = "Not estimated"`, with the reason naming what was not attributed ("1 scan outside the catalog: `read_parquet`"), and no bytes, wall or cost figures are reported for it. The query still runs — "not estimated" is not a refusal — but the CLI prints a hollow dot, the app's gauge line shows the grey the Models screen already uses for a model with `error` (`verdict none`), `lakelet run` builds a `none` model and says so rather than treating it as Green, history records the verdict as `none`, and `gauge export` excludes such runs from the calibration file so a machine's correction is never fitted to a scan that was not measured. CTEs and views resolved through the catalog are attributed today and keep their verdicts. In the same step: a nightly workflow (`core-nightly.yml`, `schedule:`) runs the suite with `LAKELET_TPCH=1` on the Ubuntu runner, so the accuracy assertion the brief's §6 counts on is exercised somewhere on a schedule rather than only when someone remembers; ordinary CI is unchanged. The one-machine tuning and the SF1 circularity recorded in `core-v0.5-plan.md` §7 stay recorded and stay Hants' reference-laptop item in `TASKS.md`; this decision is about honesty, not accuracy.
*Not chosen:* Yellow for an unattributed scan (Yellow means "runs here, slowly", which is a claim, and the point is to make none); refusing the query (the user wrote it against their own file; the gauge's job is to say what it knows).
*Gates:* pytest: `read_parquet` of a file outside the catalog is `none` with the reason and no figures; a catalog table joined to such a file is `none`; a plain catalog query is unchanged; `lakelet run` with a `none` model builds it and reports it; history and the export behave as above. Vitest: the gauge line's fourth state on the query screen and the DAG. Playwright: the SQL box with `read_parquet` shows "Not estimated" and the rows still arrive. The nightly workflow green once.
- [x] Agree
- [ ] Change:

**T4. Both databases refuse a schema they do not know, and `/docs/recovery` is the written contract for crashes, upgrades and backups.**
*Why:* `catalog/store.py` and `history.py` each write `schema_version = 1` into a `meta` table on creation and neither reads it back. The day either schema changes, an older `lakelet` will open a newer file and misread it, and a newer one will open an older file and miss a column, both silently. And nothing tells a user what a backup of a Lakelet project is, or what an interrupted write leaves behind, though the answers are good ones.
*Recommend:* on open, each store reads `schema_version`; a newer version than the code knows refuses with "this project's catalog was written by a newer Lakelet (schema 2); this is 0.1.0, which reads schema 1 — upgrade Lakelet, or open the project with the version that wrote it"; an older version runs the numbered migrations in order (there are none yet; the mechanism is a list of `(version, function)` pairs and a test that adds a fake one). The app shows the sentence on the welcome screen the way it shows an open error. `/docs/recovery` says, in order: the project folder is the backup unit and a copy of it at rest is a complete backup; what each file in it is and which are derived (`.lakelet/cache`, `dbt/target`) and can be deleted; that a table commit is one atomic catalog write so a crash mid-import leaves the previous snapshot current and orphan files that `tables expire` sweeps after its grace; that `history.db` and `catalog.db` are SQLite in WAL mode and survive a kill; what a full disk does (the commit fails, the sentence names the disk, nothing is half-written); that a snapshot expiry while another process reads the table can pull a file from under a scan that started before it, so `expire` says so and the reader's error names it; and the moved-folder answer from T5. The document is written from tests: each sentence in it has one in `test_recovery.py`, or it is not in the document.
*Not chosen:* a `lakelet backup` verb (a copy of a folder is a copy of a folder; a verb implies there is more to it, and there is not); automatic migrations without a version check (the check is what makes the migration safe to write later).
*Gates:* pytest: a newer version refuses with the sentence and leaves the file untouched; an older version with one registered migration runs it once and records the new version; the current version opens silently; the recovery tests above, one per sentence. `/docs/recovery` in the docs nav and linked from `/docs/tables` and `/docs/install`.
- [x] Agree
- [ ] Change:

**T5. A moved or copied project folder says so on open, and `lakelet relocate` makes its tables resolve again.**
*Why:* `warehouse_url` resolves `./warehouse` to an absolute `file://` URL, and Iceberg metadata records absolute locations everywhere: the table location, every metadata file, every manifest list, every manifest, every data file path. Move `~/acme` to `~/Documents/acme`, or copy it to a second laptop, and every table's metadata points at a folder that is not there; the tables list, and every query fails with a path error. For a product whose whole thesis is that the project folder *is* the warehouse, moving the folder is a first-week action, not an edge case.
*Recommend:* `init` records the root it ran in (`.lakelet/root`); `open` compares it with the real root and, when they differ and the warehouse is `file://`, opens the project with every table marked `needs relocate` and the one sentence "this project was moved from `<old>`; `lakelet relocate` updates its tables (n tables, about m metadata files)". `lakelet relocate` rewrites, table by table: the catalog's `metadata_location`; each current metadata file's `location`, `metadata-log` and `snapshot-log` entries and manifest-list paths; each manifest list's manifest paths; each manifest's data-file paths — writing new files beside the old under the new root and committing the new metadata location through the catalog, so it is a normal commit and the old files are swept by `expire`. Only the current snapshot's lineage and the snapshots `keep_snapshots_days` would keep are rewritten; older ones are expired first, which is the same thing `expire` does and the sentence says so. Attached `s3://` tables need nothing and are skipped. The app: the welcome screen's open path shows the sentence and a **Relocate** button that is the verb. This is the one item in the round with a spike inside it: pyiceberg 0.12 reads and writes manifests (`ManifestWriter`) and metadata, but rewriting a manifest list's entries is not an operation it exposes; step 5 begins with a day-boxed proof that the three file kinds can be rewritten with pyiceberg's own writers and read back by DuckDB and pyiceberg. If they cannot, the fallback is recorded here and built instead: `relocate` re-materialises each table from its data files under the new root (`CREATE TABLE AS SELECT * FROM read_parquet(files)`), which keeps the data and the schema and loses the snapshot history, and says so before it starts.
*Not chosen:* relative locations in metadata (the Iceberg spec's locations are URIs; DuckDB and pyiceberg both resolve them absolutely, and a Lakelet-only convention would make the tables unreadable by every other engine, which is the point of using Iceberg); refusing to open a moved project (the user's data is right there).
*Gates:* pytest: a project moved with `shutil.move` opens with the sentence and the marked tables; `relocate` makes every table query with its row count, its snapshot count within retention, and its history; pyiceberg reads the relocated table from another process; a second `relocate` is a no-op; an `s3://` table is skipped and said; the fallback, if it is what ships, keeps rows and schema and says what it loses. Playwright: the welcome screen's sentence and button against a ninth sidecar started on a moved copy of the sixth's project.
- [x] Agree
- [ ] Change:

**T6. The catalog's `/v1` answers only requests that name loopback, and refuses what a browser can send.**
*Why:* D22 left `/v1` without a token on purpose — DuckDB, pyiceberg, Spark and Trino must attach with zero configuration — reasoning that "JSON POSTs without CORS are not reachable from a browser page". That is true of `application/json` and false of two things D22 did not consider: a page can send a `text/plain` or form-encoded POST without a preflight, and a page on a domain the attacker controls can re-point that domain at `127.0.0.1` after the page has loaded (DNS rebinding), after which the browser's same-origin policy is on the attacker's side. `serve --port 0` makes the port hard to guess and `catalog serve --port 8181` makes it trivial. Nobody has shown an exploit; the review is right that nobody has looked either.
*Recommend:* a middleware on `/v1` (and `/api`, where it is redundant with the token but free) that refuses, with 403 and one sentence, any request whose `Host` header is not `127.0.0.1:<port>`, `localhost:<port>` or `[::1]:<port>`; any request carrying an `Origin` header at all (no engine sends one; every browser does); and any request with a body whose `Content-Type` is not `application/json`. A test sends each of the three shapes and gets the 403; the four engines' attach tests are unchanged, which is the proof that no engine is affected. `PRIVACY.md` at the repository root, which D22 promised and which does not exist, is written in this step: what is stored where (the catalog, history with SQL text, exports), what leaves the machine (nothing, except a `--burst` the user asks for and the one extension download `init` names), the loopback rule and the token, this refusal, and the DNS blind spot of `audit network` as it is recorded in `TASKS.md`. `SECURITY.md` beside it says how to report a vulnerability privately (an email address of Hants' choosing; GitHub's private advisory form) and what to expect. The token on `/v1` stays where D22 put it, with the team catalog: the three refusals above close the browser without costing any engine its zero-config attach.
*Not chosen:* a token on `/v1` now (DuckDB's `ATTACH` and pyiceberg take one, but Spark's and Trino's REST clients need it in their catalog config, and the engines smoke test in the ship brief would change; not worth it until credential vending needs it anyway); binding `catalog serve` to a random port (a fixed port is what a second engine's config needs).
*Gates:* pytest: the three refusals on `/v1` and on `/api`; a request with the right `Host` and no `Origin` is unchanged; DuckDB, pyiceberg, Spark and Trino attach as before (the existing tests and the smoke test); `PRIVACY.md` and `SECURITY.md` in the repository, linked from the README and `/docs/index`. `audit network` unchanged.
- [x] Agree
- [ ] Change:

**T7. The homepage leads with what is built, in one sentence, and the README is written for the person who found it, with the agents' instructions moved to where agents look.**
*Why:* the hero's lede reads "…the ones that don't fit burst to a worker in your own cloud with a hard cost cap. Humans ask in English or SQL. Agents call it over MCP." Burst is session 8, the ask box is parked, MCP is session 5. The built-vs-planned strips from September 11 correct this further down the page, which means the first sentence is the one sentence on the site that is not true yet. The README opens with "Building? Read `CLAUDE.md`" and has no quickstart, no screenshot, no platforms, no limitations and no way to report a bug; it is the repository's front door and it is addressed to Claude.
*Recommend:* the hero's `<h1>` stays; the lede becomes what exists — *An open-source, local-first lakehouse in one binary: Iceberg tables on your laptop, DuckDB as the engine, dbt built in, and a gauge that says whether a query fits before it runs* — and a second, quieter line under the CTA names what is coming with its state from `status.ts`, the way `/app` does: *Next: burst to your own cloud with a cost cap · agents over MCP · questions in English.* Nothing else on the page changes; the sections below already carry their strips. The README is rewritten front to back for one reader, a SQL or dbt person who will run it: what it is (three sentences, the same as the lede); one screenshot of the app's query screen with a verdict (from Hants' Mac; the site's `/app` item 4 needs the same screenshots, so both are taken at once); install today (clone and `uv sync`, macOS and Linux, Python 3.12+, "installers are session 10"); the quickstart, using `examples/sample-data/make_sample.py` so no `orders.csv` is assumed (the same fix goes into `/docs/install`); what is built and what is planned, generated from `web/src/data/status.ts` by a script so the README and the site cannot disagree (a CI check that the README's block is current, the way `gen-cli-reference.py` is checked); limitations, honestly (single machine; V2 tables and no compaction yet, per V2; the gauge's constants tuned on one machine; no Windows); how to report a bug and what to include (the `lakelet` and `duckdb` versions from `lakelet --version`, the command, the gauge line, never the data), and `SECURITY.md` for the other kind; licence. The last section, "Building Lakelet", is three lines pointing at `CONTRIBUTING.md`, `CLAUDE.md` and `AGENTS.md`, which keep everything the README says today. `AGENTS.md` at the root gains the line the README loses, so an agent that reads the README first is sent on in one hop.
*Not chosen:* a separate `docs/README-for-users.md` (two front doors, and the wrong one is the one GitHub renders); removing burst, ask and MCP from the homepage entirely (they are the thesis; they belong on the page, marked, not in the first sentence).
*Gates:* `npm run build` in `web/` with the new lede; the README block generated and its CI check green; the screenshot in `brand/` (gitignored) and `docs/` (tracked, one PNG under 300 KB); the quickstart in the README and `/docs/install` run end to end from the sample-data script on the Mac; a reader outside the project (Hants picks one) follows the README from clone to a saved question without asking anything, and what they asked anyway goes into the README.
- [x] Agree
- [ ] Change:

**T8. The feedback loop works end to end before more people are pointed at the repository, and the repository's history is tidied.**
*Why:* the waitlist discarded every signup for three days in September and the fix in source has not been exercised against a real provider; `PUBLIC_WAITLIST_URL` is still unset, so the form still captures nothing. Three transfer archives sit at the repository root and the pre-September-8 deck is in the public history. None of this is code, and all of it is what an early user or a curious engineer trips over first.
*Recommend:* Hants creates the Formspree form and sets the repository variable (decided September 11; still open), then one real submission from the live site is confirmed received and the date recorded in `web/TASKS.md`; a GitHub issue template for bugs asks for the versions, the command and the gauge line and says not to paste data; `CONTRIBUTING.md` names Hants as the person who answers within a week during the preview. The three `.tgz` archives are removed in a commit of their own. The old deck's purge from history is decided here one way or the other: *recommend leaving it* — `git filter-repo` plus a force push on a public repository with CI and Pages hooked to `main` is a risk with no reader waiting on it, and the deck's contents were already superseded on the site the same week.
*Not chosen:* a hosted feedback widget in the app (network from the app is the one thing the product promises not to do without asking).
*Gates:* a received submission, dated; the issue template in `.github/`; the archives gone; the purge decision recorded in `TASKS.md` as closed.
- [x] Agree - i already created and you added the formspree URL earlier, and tested it, and it appeared to work - can you confirm that that you added the URL 
- [ ] Change:

---

## 2. Scope

In: the six core changes (T1 to T6) with their tests and their docs pages; `PRIVACY.md`, `SECURITY.md`, `/docs/recovery`; the nightly TPC-H workflow; the fourth verdict state in the CLI, the app and the site's gauge vocabulary; the homepage lede and the README (T7); the feedback loop and the archives (T8).

Out: compaction and format-version 3 (`decisions-for-review_091526.md` V1, V2; T2's and T4's measurements feed them); a token on `/v1` (the team catalog); DuckDB's `enable_external_access` and `lock_configuration` for SQL that arrives from an agent (session 5's brief, where the guardrail claim is made; noted in §8); the reference-laptop timings and the week of daily use (Hants, `TASKS.md`); installers and the clean-machine quickstart (session 10); lineage and the close of the versions round (steps 4 and 5, which resume after this).

---

## 3. Architecture notes

- Nothing here adds a dependency. T5's rewrite uses pyiceberg's own readers and writers or, if the spike fails, DuckDB's `read_parquet`.
- The fourth verdict is a value, not a colour: `"none"` joins `"green" | "yellow" | "red"` in `gauge/verdict.py`'s `WORDS` and `line`, `history`'s column, the API's `X-Lakelet-Verdict` header, the app's `verdict` classes (which already style `none`), and the site's `tokens.css` needs no new colour because the grey exists. `gauge/export.py` filters it out.
- T6's middleware is one function on the shared uvicorn app, before routing, so `/v1` and `/api` get the same refusal and one test covers both.
- T1's temporary name is a constant in `tables.py` and the same constant is what `import --name` refuses.
- T7's README block is generated by `web/scripts/gen-readme-status.py` (beside `gen-cli-reference.py`) from `status.ts`, and `core-ci.yml` fails when the block in `README.md` is stale, the same check as the CLI reference.

---

## 4. Build order

| Step | Builds | Gate |
|---|---|---|
| 0 | T1: build-then-swap replace, the temporary name, the interrupted state and `rename` | pytest: the four replace outcomes; the existing app replace path |
| 1 | T2: size and ETag on attach, the check in `refresh` and `describe`, `attach --replace`; `/docs/remote` | pytest against Moto and `file://`: changed, same-bytes, new; the detail's line |
| 2 | T3: the `none` verdict through the core, CLI, API, history, export; the app's gauge line and DAG; `core-nightly.yml` | pytest, Vitest, Playwright as T3; the nightly green once |
| 3 | T4: the schema-version check and the migration list in both stores; `test_recovery.py`; `/docs/recovery` | pytest: refuse newer, migrate older, one test per sentence of the page |
| 4 | T6: the `Host`, `Origin` and `Content-Type` refusals; `PRIVACY.md`; `SECURITY.md` | pytest: the three refusals on both prefixes; the four engines unchanged |
| 5 | T5: the day-boxed spike, then `relocate` (the rewrite or the recorded fallback); the welcome screen's sentence and button; the ninth sidecar | pytest as T5; Playwright on the moved copy |
| 6 | T7 and T8: the lede, the README with the generated block and its check, the screenshot, `/docs/install` on the sample script, the issue template, the archives; the log, `TASKS.md`, the CLI reference (the close) | the README run by an outsider; the waitlist submission received; CI green |

T5 is last among the code steps because it has the spike; if the spike needs Hants' decision on the fallback, steps 0 to 4 are already done.

---

## 5. Toolchain

| | Version |
|---|---|
| Everything | as `versions-plan.md` §5; no additions |
| The nightly workflow | `ubuntu-latest`, the same `setup-uv` pin as `core-ci.yml`, `LAKELET_TPCH=1` |

---

## 6. Definition of done

- [ ] **A replace cannot lose a table.** A failing file, a failing cast and a failing disk each leave the previous table queryable, with a test for each.
- [ ] **Attached data cannot change silently.** A rewritten object is named before any statistic about it is used again.
- [ ] **The gauge never says Green about what it did not measure.** A scan outside the catalog is "not estimated" on the CLI, in the app and in history, and never in the calibration file.
- [ ] **A moved folder is a sentence and a verb, not a broken project.**
- [ ] **A newer schema refuses; an older one migrates.** `/docs/recovery` exists and every sentence in it has a test.
- [ ] **A browser page cannot reach the catalog.** Three refusals, tested; four engines unaffected. `PRIVACY.md` and `SECURITY.md` exist.
- [ ] **The first sentence on the site is true**, and the README takes a stranger from clone to a saved question, proven by one.
- [ ] **A waitlist signup arrives.**
- [ ] **Tests green** on both CI runners and the nightly; `audit network` zero.

---

## 7. Known unknowns

- Whether pyiceberg 0.12 can write a manifest list whose entries point at rewritten manifests (T5's spike). If not, the fallback loses snapshot history on relocate, and the page says so.
- Whether DuckDB's Iceberg `RENAME` preserves the table's UUID through Lakelet's catalog (T1 depends on the identity surviving; step 0's first test asserts it).
- Whether S3's ETag is stable for multipart uploads of the same content (it is not, by design); T2 treats an ETag change with an unchanged size as changed, which can produce a false "changed" on a re-upload of identical bytes; the sentence names the file so the user can decide.
- FastAPI's body handling for a `text/plain` POST that contains JSON (T6): the refusal is on the header, so the behaviour of the parser does not matter, but the test should confirm no route is reached.
- What the outsider in T7's last gate asks. That is the point of the gate.

---

## 8. What this changes in the other documents

| Document | Change |
|---|---|
| `build-sessions/lakelet-build-sessions.md` | A trust round between the versions round's steps 3 and 4, with this brief |
| `build-sessions/versions-plan.md` | Unchanged; steps 4 and 5 resume after this round |
| `build-sessions/core-v0.5-plan.md` | D22 amended by T6 (the three refusals; the token still with the team catalog); D27 amended by T2 (the immutable-file contract is now checked); §7's gauge unknowns gain T3's fourth state |
| `build-sessions/real-data-plan.md` | R4's attach contract gains T2's check |
| `build-sessions/ship-v0-plan.md` | S13's onboarding page points at the new README; the clean-machine quickstart uses the sample-data script |
| `lakelet-build-sessions.md`, session 5 | `lakelet mcp` must set `enable_external_access = false` and `lock_configuration` on the engine SQL from an agent reaches, before any guardrail claim is made (from the review's §6) |
| `docs/facts-and-messaging.md` | The lede's sentence; "nothing leaves your machine" scoped as `PRIVACY.md` scopes it |
| `web/src/content/docs/` | `remote.md` (T2), `gauge.md` (T3's fourth state), a new `recovery.md` (T4, T5), `install.md` (the sample script), `index.md` (the privacy and security links) |
| `TASKS.md` | "Now" becomes this round; the versions round's step 4 moves to "Next"; T8 closes the archive and purge items |
