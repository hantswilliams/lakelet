# Lakelet — build session log, September 9, 2026

*Repo review and hygiene, no core code · Hants and Claude (Fable 5.1) · Commit `7f0ff4a`; first CI run; `TASKS.md` rewritten*

## 1. What this session did

- Reviewed where the repo stood after the September 8 build. All nine steps are built and pass locally; the §6 definition of done has the quickstart, CI, reference-laptop timings and the demo bucket left.
- Found that the September 8 pushes went out without the hygiene files: `.gitignore` at HEAD still ignored `docs/` and `build-sessions/`, so `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md`, `compose.yaml`, `compose/`, `core-ci.yml` and the rewritten README were never committed, and CI had never run. The public repo showed the September 7 "working set" README with no license.
- Decided: the repo stays public and gets its license now; the trademark search moves up. Copyright holder stays "Lakelet contributors". `docs/lakelet-financial-plan.docx` is gitignored so the financial plan stays out of the public repo. `.DS_Store` and `old/` untracked.
- Found that `old/deck-before-090826/` (the pre-September-8 deck and executive summary) has been in the public history since `6290775`. Removed at HEAD; purging history is Hants' call.
- Hants made the signed commit `7f0ff4a` and pushed. That triggered `core #1` (both `test` jobs failed at `uv run pytest`; every earlier step and the `postgres` job passed) and Pages deploy #3 (green, so the September 8 site edits are live and the "run `npm run build`" item is closed).
- Tried to reproduce the CI failure on an Ubuntu container from the public clone. Two blockers, both environmental: the `dbt-core-experimental-parser` build backend downloads a wheel from GitHub releases at build time (worked around by installing the wheel by hand), and the container's egress policy refuses `extensions.duckdb.org`, so every test that loads an extension fails there for a reason CI does not share. The CI log needs a GitHub sign-in to read; next session starts from it.
- `TASKS.md` rewritten to carry everything: the ordered "Now" list, the steps table with CI status, the §6 checklist item by item, open items, the site's open items, the sessions after core v0 with the findings each inherits, and the dated done log.

## 2. Developer docs on the site: not too early, if they are the right kind

The question was whether to start developer documentation on the site now. Recommendation: yes, as a clearly labelled developer preview, and only for what exists and has a test. The argument for starting now is that the surfaces are stable enough to describe and the act of describing them is a review: writing the install page is the §6 clean-machine quickstart, writing the CLI page walks every verb, and writing the config page reads `config.py` end to end, all before session 6 builds an app on top of the same surfaces. The argument against is a moving target and an implied release; both are handled by the label and by scope.

What to document, from the code and tests: install from source (uv, Python 3.13, `lakelet init` and what it downloads); the CLI verbs, generated from Typer's help rather than typed by hand; `lakelet.toml` from `config.py`; the gauge (the verdict words, the sentence, exit codes 0, 1, 2, 4); the catalog's REST surface as DuckDB and pyiceberg use it, and how Spark or Trino attach; the `/api` routes, the bearer token and the Arrow stream; `tables attach` and `refresh` for a Parquet prefix; questions as dbt models. What not to document as if it existed: burst, the app, `ask`, MCP, correction factors, `catalog attach`. The marketing pages already say "planned" for those.

Where: a `/docs` section in the existing Astro site, separate from the marketing pages. Astro's Starlight integration is the cheap way to get a sidebar, search and versioning; plain Astro pages with a docs layout work too. `llms.txt` should list the docs pages once they exist. The version string on every page is `lakelet 0.1.0.dev0` and the install path is "from source" until session 10 ships installers.

## 3. Developer docs, built

Hants said yes to §2. Built the same afternoon, in `web/`:

- `src/content.config.ts`: a `docs` content collection over `src/content/docs/*.md` with `title`, `description`, `section` (Start, Guide, Reference, Develop) and `order`.
- `src/layouts/Docs.astro`: sidebar grouped by section, the article, prev/next, an "edit this page" link to GitHub, and the developer-preview banner. The version in the banner is read from `core/lakelet/__init__.py` at build time, so the docs cannot claim a version the package does not have.
- `src/pages/docs.astro` (the index) and `src/pages/docs/[slug].astro` (one page per file). `astro.config.mjs` gained a small rehype plugin that prefixes root-relative markdown links with the site's base path, since the marketing pages' `url()` helper cannot reach inside markdown.
- Ten pages: overview (what exists, what does not), install and quickstart, the gauge, tables (import matrix, the §3.7 type table, attach/refresh/discover), the catalog (serve, the four clients, the routes), saved questions, the CLI reference, `lakelet.toml` and the folder, the HTTP API, and developing Lakelet. Everything on them was read from the code and the tests, not from `docs/`; the quickstart's transcripts are the shape of the output with numbers from one machine and say so.
- `scripts/gen-cli-reference.py` writes `cli.md` from Typer's help for every verb, so that page is generated. Typer ships its own click fork, so the walk duck-types on `list_commands` rather than `isinstance(click.Group)`.
- `Docs` in the nav; `llms.txt` lists the pages; the nav's GitHub placeholder now points at the repo.

Verified by building in a clean Ubuntu container at both base paths (`/` and `/lakelet`), a link check over every `href` in the docs pages (none broken), and screenshots at 1280 and 390 px; the first mobile render overflowed until the grid column became `minmax(0, 1fr)`. Not run: `astro check` (the package is not installed) and a real quickstart transcript (the container cannot reach `extensions.duckdb.org`).

## 4. The CI failure, found and fixed

Hants pasted the CI log. Every one of the 59 errors and 17 failures on both runners was downstream of `Project.open`: `Engine.__init__` ran `CREATE OR REPLACE SECRET lakelet_s3 (TYPE s3, PROVIDER credential_chain)` unconditionally, and DuckDB 1.5's aws extension resolves the chain when the secret is created, failing with `Secret Validation Failure … Credential Chain: 'config'` on a machine with no AWS credentials at all. The Mac has AWS configuration, so it never showed there; step 8's tests passed on CI because they set explicit keys for Moto. The suite's result string mapped onto the collected test order confirmed it: step 1 (no engine) and step 8 (explicit keys) green, everything else red.

The fix is in the engine, since a laptop with no AWS account is the normal case (brief D36): the chain failure is kept as a message rather than raised, local work proceeds, and `register._list` and `attach_metadata` ask `engine.s3_problem()` before touching `s3://`, refusing with `NotRegistrable` and a sentence naming `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_ENDPOINT_URL`. The API's `discover` route maps that to a 400 like `attach` already did. Regression test `test_open_works_with_no_aws_credentials_anywhere` clears the AWS environment, points `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` at missing files and disables the metadata probe, then opens a project, runs a local query, and expects `discover s3://` to be refused; it skips that last assertion on a machine where the chain still resolves. Recorded in the brief's §7 under step 8. Not run here: the container cannot load DuckDB extensions; Hants runs the suite on the Mac and CI on push.

The Mac run of that fix passed the new test and the first 112 tests, then collapsed from the TPC-H test on with `OSError: [Errno 24] Too many open files`. A second, older bug: `Project.close()` closed the DuckDB connection and stopped the catalog server but never disposed the SQLAlchemy engines of the catalog store and the history, whose pooled SQLite connections each hold the database, its `-wal` and its `-shm`. A hundred opens later the shell's 256-descriptor default on macOS is gone; yesterday's runs came from a shell with a higher limit, which is why 140 passed. `Store.close()` and `History.close()` dispose the pools, `Project.close()` calls them and drops the manifest cache, and `test_open_and_close_release_their_file_descriptors` opens and closes a project twenty times and asserts, with psutil, that at most six descriptors are left over. A product-side consequence worth noting: the sidecar (`lakelet serve`) opens one project for its life and was never affected; the CLI opens one per process, same.

The first version of that fix made things no better, and the new test said so on the Mac before anything else did: `Store.close()` had been inserted in the middle of `__init__`, so it swallowed the schema-version block, and every close disposed the pool and then opened a fresh connection. Found by listing `/proc/self/fd` across five open/close cycles in the container: two descriptors per cycle, `catalog.db` and `catalog.db-wal`, and the pool status showing one connection *after* dispose. Placing `close()` after `__init__` ends it.

Tooling note that unblocked all of this: DuckDB's extensions are on PyPI as `duckdb-extension-<name>` wheels (`iceberg` needs `avro` too; the harness needs `tpch`). Copying the `.duckdb_extension` file out of the wheel into `~/.duckdb/extensions/v1.5.5/<platform>/` lets the suite run where `extensions.duckdb.org` is unreachable. With that, the whole suite ran in the container under `ulimit -n 256`: 141 passed and the TPC-H harness passed on a two-core machine, 8 env-gated or load-gated skips. Worth considering for CI as well, since it would remove the one network fetch from the runners.

## 5. Green

Hants' Mac run after the corrected fix: 145 passed, 5 skipped in 70 s, the five skips being the env-gated fixtures, with all three timing budgets running and passing on an unloaded machine. Pushed as `bb017b8`; `core #2` green on Ubuntu (3m 36s), macOS (4m 30s) and Postgres (34s). That closes the step 0 and step 1 gates in full and the "tests green on both runners" line of §6. What remains of the definition of done: the clean-machine quickstart, the reference-laptop timings, and the demo bucket.

## 6. Hardening after green

Hants chose the small items over the next session. Done: the §6 query-overhead budget now has its assertion (12 to 17 ms measured against 50 ms, on a loaded two-core container); the three CI actions moved to their Node 24 majors, with `setup-uv` pinned to `v9.0.0` because Astral stopped publishing major tags at v8; the `-q` addopt is out of `pyproject.toml`. Decided against, and recorded in `TASKS.md`: the PyPI extension wheels in CI. They are not DuckDB Labs' (the package metadata names an individual's repackaging project), and a public repo's CI should not run unofficial binaries; the official `INSTALL` with the cache stays. The container recipe for sandboxes: `uv pip install duckdb-extension-{iceberg,httpfs,excel,aws,avro,tpch}` and copy each `.duckdb_extension` out of the wheel into `~/.duckdb/extensions/v<duckdb>/<platform>/`.

Full suite in the container under `ulimit -n 256` after these: 142 passed, 9 skipped (five env-gated, four budgets under load).

## 7. The dbt materialisation spike

The largest unknown left under core v0, and under the most advertised feature. Probed the catalog first with plain SQL through the engine, five strategies: `CREATE OR REPLACE TABLE` is refused by DuckDB-Iceberg with its own message; drop-then-create inside one transaction is refused ("cannot create table deleted within a transaction"); `DELETE` then `INSERT` inside one transaction works and keeps the table, two snapshots; the dbt swap (create tmp, rename, rename) fails inside one transaction and works when each statement commits on its own, at the cost of a new table identity each run.

Then a materialisation on those facts, `tests/test_step6_materialisation.py`: columns of the existing table compared with `DESCRIBE` of the compiled query; unchanged, delete and insert in one dbt transaction; changed or absent, drop (committed on its own) then create. One trap: `run_query` for the `DESCRIBE` opens dbt's transaction, so the drop must be followed by an explicit `adapter.commit()` or it lands in the same transaction as the create and the catalog refuses it. Three consecutive `dbt run`s pass through the catalog: first build (one snapshot), same-column rebuild (same location, three snapshots), column change (new table). Also tested: a root-project override of `materialization table, adapter="duckdb"` is accepted by dbt 1.12 with no warning, so users' `materialized: table` models need no Lakelet-specific config.

Recorded in the brief's §7 under step 6. The decisions (strategy, override versus `lakelet_table`, ship now versus session 9) are in `decisions-for-review_090926.md` with recommendations; nothing ships until they are ticked. Either strategy leaves old data files behind; snapshot expiry is Day 1.

Hants asked for the transactional edge to be spelled out for developers, since it will come up for anyone pointing an engine at the catalog. Added `web/src/content/docs/transactions.md`: the refused list with the error text verbatim (so a search lands there), the reason in Iceberg's commit model, the patterns that work and what each costs, the storage-growth caveat, and the dbt explanation. Confirmed on Hants' Mac with the official extension: the same `CREATE OR REPLACE` refusal.

## 8. Still open

1. The clean-machine quickstart, the reference-laptop timings, the demo bucket (`TASKS.md`, Now 1 to 3).
0. `decisions-for-review_090926.md`: three tick boxes on the dbt materialisation.
2. The deck history purge decision.
3. Trademark search.
4. Docs follow-ups in `TASKS.md`: a CI check that `cli.md` is current; real quickstart output once the clean-machine run exists.
