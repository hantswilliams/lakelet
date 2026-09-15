# Lakelet — decisions for review, September 15, 2026

*Four items from the reading in `research/` (four articles, all September 2026: DataExpert's
"DuckDB just put a $400K/year skill on your laptop", VeloDB's "Apache Doris 4.1 on Iceberg V3",
Arshad Ansari's "Is DuckDB safe for production?", and Shawn Gordon's "What the heck is Renart?").
None of them changes the thesis; two of them change what the next steps should carry. They
belong to no brief, so they are here. Tick Agree or write the change under each. Nothing is
built until it is decided; the versions round (`versions-plan.md`, step 3 onwards) continues
regardless.*

---

**V1. New tables are created as Iceberg format-version 3, after a spike proves the whole path
reads them; until then nothing changes.**

*Why it comes up:* every `lakelet run` of a `table` model is `DELETE` then `INSERT` in one
transaction (`macros/lakelet.sql`, `/docs/transactions`). On a format-version 2 table each
`DELETE` writes a position-delete file that every later read anti-joins; a model refreshed once
a day for a month is thirty delete files stacked on the same data, and `lakelet tables expire`
removes old snapshots, not the delete files the current snapshot still carries. The Doris post
measures the cost on their engine (2–3× at a 5 % delete ratio, flat under V3) and it is the
same Iceberg mechanism DuckDB reads. Format-version 3 collapses the deletes into one Puffin
deletion vector per data file. Our own facts file already records that DuckDB 1.5.3 writes V3
with deletion vectors and row lineage; what nobody has checked is whether *everything else in
Lakelet* reads what it writes.

*Recommend:* a spike first, as a pytest that stays in the suite: create a table through the
catalog with `format-version = 3` (the catalog's `new_table_metadata` takes it as a property;
today the default is pyiceberg's, which is 2), `INSERT`, then `DELETE` and `INSERT` again from
DuckDB, and read the table back three ways — DuckDB through the catalog, pyiceberg from another
process (as the Overture check did), and the gauge's manifest reader (`gauge/manifests.py`),
which must count the deletion vector's bytes in what it says a scan reads. If all three agree
on row counts and the file list shows one `.puffin` rather than a delete parquet per commit,
`import` and `CREATE TABLE` through the catalog default to 3, `describe` already prints the
version, and `/docs/tables` gains a paragraph. Existing tables stay at 2 (migration is
`ALTER TABLE … SET PROPERTIES` and is a later decision). If any reader fails, the spike's
result goes into the log and the default stays 2, with the reason.

*Not chosen:* switching the default without the spike (pyiceberg 0.12's V3 support is partial
and the gauge has never seen a Puffin file); rewriting the materialisation to drop-and-create
(loses the table's identity and history, which `describe`, the gauge's caches and the lease
depend on; `/docs/transactions` says why).

*Gates:* the spike test; if adopted, `test_step3_import.py` asserting the version of a new
table, and `test_step6_materialisation.py`'s three consecutive runs asserting one deletion
vector rather than three delete files.

- [ ] Agree
- [ ] Change:

---

**V2. `lakelet tables compact <name>` folds delete files and small files back into data files,
as one new snapshot; not scheduled, not automatic in this round.**

*Why it comes up:* both the DataExpert post and the Doris post name small-file and delete-file
accumulation as the leading operational failure of Iceberg deployments, and both say a laptop
never hits it because the data is too small. Ours will: `lakelet run` appends and deletes every
day by design, `import --append` adds files, and the week of daily use (the app brief's
definition of done) is exactly the workload that grows the file list. `expire` reclaims
history; nothing reclaims the current snapshot's fragmentation. This is the operational gap
the product would be judged on by the people the DataExpert post describes.

*Recommend:* `lakelet tables compact <name>` (and `POST /api/tables/{name}/compact`, and a
row on the table detail beside Expire that says what it would gain: "n data files, m delete
files → about k files"): read the table through DuckDB, write it back as new data files sized
to the engine's row-group target, and commit one `replace` snapshot that references the new
files and none of the old delete files, through the catalog's commit path so the history is a
single "compacted" entry. Refused for attached tables, the way `expire` is. `describe` gains
`data_files`, `delete_files` and whether a compaction is worth it (more than one delete file,
or data files below a size floor). Reported in `history` as a run of its own kind so the gauge
can learn its cost. Not scheduled: a person runs it, or the app suggests it on the detail
when the count is high. Automatic compaction after a run is a later decision with V1's
result in hand, because under V3 the delete side of the problem largely goes away and only
the small-file side remains.

*Not chosen:* pyiceberg's rewrite procedures (0.12 has no `rewrite_data_files`); Spark's
(`rewrite_data_files` through the engines profile is exactly the "second engine, second team"
tax the Doris post describes, and the product's premise is that the laptop does not need one);
automatic compaction on every run (doubles the write cost of a refresh for a table that may
have one delete file).

*Gates:* pytest: after three `DELETE`+`INSERT` runs, `describe` counts three delete files,
`compact` leaves one data file and none, row counts are unchanged, and the history has the
entry; an attached table is refused; the route; Playwright: the row on the detail. `/docs/tables`
and the CLI reference.

- [ ] Agree
- [ ] Change:

---

**V3. Step 4 of the versions round carries a per-model state — fresh, edited, upstream changed,
never built — computed from what lineage already knows, and `lakelet run --stale`.**

*Why it comes up:* Renart's one idea worth taking is that every asset has a content
fingerprint (its SQL, its config, and every upstream fingerprint), so the UI can say what a
change invalidated and "Build stale" rebuilds only that cone. Lakelet has every ingredient
and shows none of it: `query.fingerprint` hashes SQL plus the upstream tables' snapshot ids,
history records each model run with the fingerprint it ran under, and step 4's lineage
computes the upstream set. The Models screen today says "last run 2 d ago", which is a
timestamp, not an answer to "is this out of date?".

*Recommend:* inside step 4, once `lineage` exists: `PlannedModel` gains `state` with four
values — `fresh` (the last successful run's fingerprint equals the current one), `edited`
(the model's own SQL differs from the version last run), `upstream` (a table it reads has a
newer snapshot than the run saw, or an upstream model is not fresh), `never` (no run in
history) — and `state_reason` naming the table or model that changed. The DAG table gets a
State column and the Simple cards get a sentence ("Out of date: orders changed 2 h ago").
`lakelet run --stale` (and **Refresh what changed** beside Run all) selects the models whose
state is not `fresh`, in dependency order, which is `lakelet run` with a selector the plan
computes. Nothing is fingerprinted that is not already: the fingerprint is the gauge's, so
the state costs one comparison per model at plan time.

*Not chosen:* Renart's canonicalised-SQL fingerprint (reformatting would not count as an
edit; ours counts it, and a version is recorded for it anyway, which is the honest reading of
a diff); a watcher that recomputes state on file change (the plan already runs when the screen
opens); making this its own step (it is one field and one selector once lineage lands).

*Gates:* pytest: the four states, each provoked (a run, an edit, an import onto an upstream
table, a fresh project), `--stale` selecting only the right models; Vitest for the sentences;
Playwright: edit the seeded question through Save, see it `edited`, refresh what changed, see
it `fresh`.

- [ ] Agree
- [ ] Change:

---

**V4. Messaging: one durability sentence, two comparables named, and the research folder
kept out of the public repository.**

*Recommend:*

- *The durability sentence.* Ansari's post recommends, as the only safe shape for DuckDB in
  production, exactly what Lakelet is: writers produce immutable Parquet, readers open it
  read-only, and the `.duckdb` file is a cache, never the durable copy. Lakelet's engine is
  `duckdb.connect()` with no file at all; Iceberg on Parquet is the durable layer and the
  catalog is SQLite with commit conflicts handled. `/docs/catalog` and the site's engineers
  section gain one sentence: *there is no database file to lose; the warehouse is the Parquet
  and the catalog, and both survive a crash mid-query.* `facts-and-messaging.md` records it as
  a verified fact with the test that shows it (`test_step1_concurrency.py`).
- *Comparables.* Renart (Go, Apache 2.0, public alpha, v0.4.4, 35 stars on September 7) and
  Duckle (a visual ETL studio on DuckDB) are the nearest local-first desktop tools and both
  appeared in the same fortnight as our site. Neither is a warehouse: Renart runs against a
  warehouse you already pay for and is an IDE over it; Lakelet *is* the warehouse, with the
  gauge saying when the laptop stops being enough and the same Iceberg tables readable by
  the next engine. `docs/lakelet-product-spec.md`'s comparables table and the deck's
  competition slide gain both, with that one-line difference; the site does not name them.
- *The market numbers.* The DataExpert post's figures (DuckDB's daily downloads, MotherDuck's
  paying teams, the salary bands, "96 % of Iceberg users write with Spark", the AWS
  acquisition of DuckDB Labs in August) are a Medium article's claims with no sources. None
  goes into the deck or the site until a primary source is found; `facts-and-messaging.md`
  lists them under "heard, not verified" so they are not lost.
- *The folder.* `research/` holds four PDFs of Medium articles, some behind the paywall, in a
  public Apache-2.0 repository. It is untracked today and stays that way: `research/` goes
  into `.gitignore`, and `research/README.md` (tracked, the one file that is) carries the
  links, the dates, and the takeaways above so the reading is in the history without the
  copies.

*Not chosen:* a "Lakelet vs Renart" page on the site (they are at 35 stars; naming them
publicly is free marketing for a competitor and a comparison nobody has asked for yet).

*Gates:* the gitignore line and the README in this session's commit; the docs sentences with
step 5 of the versions round; the deck and spec edits are Hants'.

- [ ] Agree
- [ ] Change:
