# Lakelet — decisions for review, September 17, 2026

*Two questions from Hants after the versions round closed, with ship (`ship-v0-plan.md`) held back for now: is writing to S3 handled, and how should the app show the lineage of file and Iceberg changes. Neither belongs to a brief. Each item below has a recommendation, what was not chosen, and its gate; tick Agree or write the change. Nothing is built until it is decided. The two groups are independent: W is the core with a small app surface, L is the app with a small core surface.*

---

## What exists today, so the questions start from the facts

**Writing to S3.** The catalog and the engine can already write an Iceberg table whose data and metadata live in a bucket: `[project] warehouse = "s3://bucket/prefix"` in `lakelet.toml` resolves to an `s3://` warehouse, and `test_step1_s3.py` proves a pyiceberg round trip and a DuckDB write through the catalog against it (Moto in the suite, RustFS and a real bucket by hand). An attached table can keep its Iceberg metadata in the bucket (`tables attach --metadata-in-bucket`). The gauge treats any table whose data files are not `file://` as remote and estimates with the bandwidth figure. What does *not* exist: the product path on an `s3://` warehouse is untested and undocumented — `init` never offers it (the toml comment says "later"), `import`, `lakelet run`, `expire` (its orphan sweep skips a remote warehouse by design), `describe`, versions and the app have never been run against one; there is no verb to move a table that was built locally into a bucket (`lakelet publish` is in the PRD's CLI list and assigned to session 8, burst); and nothing in the app says where a table's bytes are beyond the attached table's prefix.

**Lineage in the app.** Since step 4, every table, view and model detail has **Reads from** and **Feeds** with each name a link; every model has a state with what changed (the SQL diff since the run, the table's commits since); the Review lists what is out of date. What does not exist: any picture of the whole graph; any single place that lists what happened to the project over time across tables, models and versions; and the link from a table's snapshot to the models that snapshot made out of date.

---

**W1. An `s3://` warehouse is a first-class, tested, documented way to run a project: chosen at `init`, every verb works against it.**

*Recommend:* `lakelet init --warehouse s3://bucket/prefix` (the app's welcome screen gets the same box under "Advanced", off by default); the warehouse is fixed at `init` and `config set` refuses to change it once a table exists, because tables carry absolute locations and moving a warehouse is `relocate`'s problem, not a setting's. Credentials are the existing chain (environment, profile; `/docs/remote`). Then the whole product path is run against it in the suite: `import` (create, replace, append), `sql` writes, `lakelet run` with a `table` and a `view` model, `describe` with row counts, `expire` (snapshots expire and their files are deleted in the bucket; the orphan sweep stays local-only and the page says so), `versions` (nothing changes: git holds files, not data), `relocate` (nothing to relocate: a bucket table has no `file://` location — the detector must say so rather than mark it), and the app's tables panel and detail saying `bucket: s3://…` under Where. Costs: the S3 tests already run on Moto in the default suite and against RustFS or a real bucket by hand, so the matrix is one fixture parameter. `lakelet.toml`'s comment loses its "later"; `/docs/catalog` and `/docs/remote` gain the section; `status.ts` gains the surface.

*Not chosen:* a per-table warehouse (a table's location is already per table in Iceberg; the project-level default is what `init` and `import` need, and mixing is W2's job); moving the *catalog* to the bucket (the catalog is SQLite in `.lakelet/`; a shared catalog is Day 1's `catalog attach` and the Team tier); a local cache of bucket tables' data for the gauge (the manifest cache already covers what the gauge reads).

*Gates:* pytest, parametrised over `file://` and Moto's `s3://`: `test_s3_warehouse.py` running the eight quickstart commands plus `run`, `expire` and `describe` against the bucket warehouse, pyiceberg reading every table from another process, `relocate` saying there is nothing to do; the same file against a real bucket by hand (`/docs/remote`'s variables); a Playwright sidecar with an `s3://` warehouse on Moto, showing Where. `/docs/catalog`, `/docs/remote`, `/docs/install`.

- [x] Agree
- [ ] Change:

---

**W2. `lakelet tables publish <name> s3://bucket/prefix` moves a table built locally into a bucket, every snapshot kept; the catalog follows; the local files become orphans for `expire`.**

*Why it comes up:* this is the PRD's `lakelet publish <table> --to s3://…`, assigned to session 8 because burst needs the table in a bucket for a worker to read. It does not need burst, and it is the answer to "I built this on my laptop, now the team's Spark should read it". And it is small: `relocate` (trust round T5) already rewrites every manifest, manifest list, position-delete file and metadata file of a table from one root to another and commits the new location through the catalog. Publish is that rewriter with a copy of the data files first and an `s3://` root as the target.

*Recommend:* `publish` copies the table's data files (and delete files) under `<prefix>/main/<name>/data/` with the same relative names, writes the rewritten metadata tree under `.../metadata/`, commits the new metadata location to the catalog in one commit, and reports files, bytes and the new location. A crash mid-copy leaves the catalog pointing at the local table (the commit is last), and running `publish` again resumes: files already in the bucket with the same size are not copied twice. The old local files are orphans `expire` sweeps after its grace; `describe` says `bucket: s3://…` and, until they are swept, `local copy: n files, still here until expire`. An attached table is refused (its files are not Lakelet's to move); a table whose warehouse is already a bucket is refused with the sentence. `POST /api/tables/{name}/publish` and a **Publish to a bucket…** button on the table detail with a prefix box, the credential line the drop zone already has, and the `lakelet tables publish` line beside it. `--dry-run` prints what would move and what it weighs, so the gauge's bandwidth figure can say how long: `publish` gets its own sentence ("2.1 GB at 190 Mbps: about 90 s") before it starts, and refuses over a cap only with `--yes`, the way Red refuses.

*Not chosen:* publishing a copy as a second table (two tables with one history is the confusion the versions round spent a step avoiding); publishing only the current snapshot (loses time travel, which the moved-folder test proved people rely on); a background job (v0 is one process; a publish of tens of GB is a terminal that stays open, and the sentence says how long).

*Gates:* pytest against Moto: publish a table with three snapshots including a delete, every snapshot resolves for DuckDB and pyiceberg from the bucket, time travel to the first, the catalog's location is `s3://`, the local files are orphans and `expire` sweeps them, a second publish is a no-op, an interrupted copy resumes without recopying, an attached table and a bucket table are refused; the route; Playwright: the button on the fifth sidecar (Moto) and the Where line after. `/docs/tables`, `/docs/remote`; `session 8`'s `publish` line in the map marked done.

- [x] Agree
- [ ] Change:

---

**L1. A Lineage screen: the whole project as a graph, drawn by the app, every node a link.**

*Recommend:* a fourth screen in the bar, **Lineage** (Simple: **Map**), showing every table, view and model as a node in layers left to right — imported and attached tables at the left, models and views after in dependency order — with the edges `lineage` already computes and their `via` on hover. A node is coloured by what the app already knows: a model by its state (fresh quiet, edited and upstream amber, never grey), a table by kind (local, attached with the bucket mark). Clicking a node opens its detail (the Tables or Models screen, as the lines do today); the selected model on the Models screen is highlighted here, and the Review's models are the amber ones. The layout is computed in the app with no library — a longest-path layering and a barycentre ordering pass, fifty lines, because a project's graph is tens of nodes, not thousands — and drawn as SVG in the theme's colours, so it prints and scales. The core gains `GET /api/lineage` (no name: the whole graph, nodes with kind and state and edges with via, from the same `Graph`) and `lakelet lineage --all --json`; the CLI's text form stays per name.

*Not chosen:* a graph library (bundle size, `unsafe-eval` in some, and the layouts they give are for graphs this one will never be); a force-directed layout (unstable between opens; a DAG wants layers); column-level lineage and OpenLineage export (product spec F3.5, Day 3).

*Gates:* pytest: `/api/lineage` returns every node once with its state and every edge with its via, and the CLI's `--all --json` is the same body; Vitest: the layering (a chain is three layers, a diamond two nodes in one layer, an imported table is layer 0) and the colours; Playwright on the seventh sidecar: three nodes, two edges, a click on `stg` lands on its detail, after a run `by_customer` is coloured fresh. `/docs/app`.

- [x] Agree
- [ ] Change:

---

**L2. A Changes screen: everything that happened to the project, newest first, across tables, models and versions, each entry a link.**

*Recommend:* one list, from three sources the core already keeps — the catalog's snapshots (every table's, with operation and rows), history's model and question runs (with the verdict and the time taken), and git's commits for the models (saves, restores, run-time commits with the author) — merged by time into `lakelet changes [--since 2d] [--last 50] [name]` and `GET /api/changes`. Each entry is one sentence in the mode's words ("orders: 1,200 rows added · by Hants · 2 h ago", "Total by customer saved, a new version", "by_c built in 1.2 s, Green") with a link to the detail and, for a table's snapshot, which models it made out of date (L3's computation). The screen is the same list with a name filter; the Tables and Models details get a short **Recent** strip of their own entries above the facts. Nothing new is recorded: the feed reads what is there.

*Not chosen:* an activity table in history (a second copy of three sources that would drift from them); watching the folder for edits (the plan already runs when the screen opens); notifications.

*Gates:* pytest: an import, a run, a save and a restore appear in order with the right shapes, `--since` and a name filter, the route; Vitest for the sentences in both modes; Playwright on the eighth sidecar: the seeded question's two saves, a run, the strip on its detail. `/docs/app`, the CLI reference.

- [x] Agree
- [ ] Change:

---

**L3. A table's snapshot list says what each snapshot did downstream: the models it made out of date, and one button to build them.**

*Why it comes up:* "the lineage of Iceberg changes" is this sentence: this append to `orders` is why `stg`, `by_c` and `top` are out of date. Step 4 computes it in the other direction (a model looks upstream); L3 turns it around per snapshot, which is the question a person asks when they see a table changed.

*Recommend:* `describe` (and `GET /tables/{name}`) gains, per snapshot newer than a downstream model's last run, `affects` — the models whose last successful run predates the snapshot, from the same graph and history the state uses — and the table detail's snapshot rows show it ("made `stg`, `by_c`, `top` out of date" with the names as links) with **Run what changed** on the detail when any are affected. Simple mode: "3 questions need refreshing because of this". The computation is one graph and one comparison per downstream model, cached per describe.

*Not chosen:* recording the consequence at commit time (the models that read a table change; the answer must be computed when asked); a separate route.

*Gates:* pytest: after a run and an insert, `describe(src).snapshot_list[0].affects == ["stg_orders", "total", "by_c", "top"]` in dependency order and the older snapshot's is empty; after `run --stale` every `affects` is empty; Playwright on the seventh sidecar: run all, import onto orders, open its detail, see the two names, click Run what changed, see them go. `/docs/tables`.

- [x] Agree
- [ ] Change:

---

*Order, if all six are agreed: L3 (a day: the computation exists), L1 (two days), W1 (two days, mostly tests), W2 (two days), L2 last (it reads what the others make). W and L can interleave. Ship waits behind whatever of these is chosen.*
