# Three decisions on dbt materialisation — one page

*September 9, 2026 · From the spike in `core/tests/test_step6_materialisation.py`, which passes. Tick a box on each; write a line under "Change" if you disagree. Nothing ships until they are ticked.*

## The one thing to know

dbt cannot build a `table` model through the Iceberg catalog today because its materialisation renames a temp table over the target inside one transaction, and DuckDB-Iceberg refuses that. Measured against the catalog this afternoon, and confirmed in the extension's source at `duckdb/duckdb-iceberg` main on September 9 (`61c948f`, `src/catalog/rest/catalog_entry/schema/iceberg_schema_entry.cpp`, `HandleCreateConflict`): `CREATE OR REPLACE` is refused ("not supported in DuckDB-Iceberg. Please use separate Drop and Create Statements"); drop-then-create inside one transaction is refused ("Cannot create table deleted within a transaction"). The DuckDB docs' supported-operations list (CREATE/DROP SCHEMA and TABLE, INSERT, UPDATE, DELETE, MERGE INTO, ALTER TABLE, SELECT) is consistent with this; they describe what works and say nothing about transaction limits; a `DELETE` then `INSERT` inside one transaction works and keeps the table, landing as two snapshots; and the dbt-style swap works when every statement commits on its own. A Lakelet materialisation built on those facts builds a model, rebuilds it in place when the columns are unchanged (same table, its history kept), and drops and recreates it in separate transactions when the columns changed. Three `dbt run`s in the test, all through the catalog.

---

### 1. Rebuild in place, fall back to drop-and-create on a column change

**Recommend:** yes.
**Why:** it is the Iceberg-native answer. A rebuilt model is the same table with new snapshots, so `describe` shows real freshness and history, time travel across dbt runs comes for free later, and the catalog's table identity (the `leased_until` column session 8 needs) survives a run. The alternative, the dbt swap with each statement in its own transaction, makes a new table every run and leaves a moment where the target does not exist.
**Cost:** two commits per rebuild (a delete snapshot, then an append), so a reader in another process can see an empty table for an instant; and old data files are not removed by either strategy, so storage grows with every run until snapshot expiry exists. That is a Day 1 item either way and is recorded as such.

- [ ] Agree
- [ ] Change:

### 2. Override dbt's `table` materialisation for the project, rather than a separate `lakelet_table`

**Recommend:** override.
**Why:** a root project may override a built-in materialisation, and dbt 1.12 does it with no warning (tested). Every model a user writes with `materialized: table`, and every saved question (whose `schema.yml` already says `table`), then builds through the catalog with nothing to learn. The medallion page's promise, bronze to gold as ordinary dbt models, holds without a Lakelet-specific config key.
**Not chosen:** `materialized: lakelet_table`. Explicit, but every model would need it, and a project copied from a dbt tutorial would break on its first run.

- [ ] Agree
- [ ] Change:

### 3. Ship it now as a step 6 amendment, not in session 9

**Recommend:** yes.
**Why:** it is one macro file. `init` writes `macros/lakelet.sql` (and refuses to overwrite an existing one, like the other files it writes); the package carries the macro text; the spike test becomes the gate: save a question, `dbt run` builds its table through the catalog, `dbt test` passes both checks, run again and the table keeps its identity. Session 9 keeps its real work: lifting the dbt-duckdb plugin from `tests/dbt_plugin.py` into the package so a user's `profiles.yml` can name it, git auto-commit on save, and table-level lineage.
**If no:** the macro stays in the test file and the questions page of the docs keeps saying dbt does not build the table yet.

- [ ] Agree
- [ ] Change:

---

## What this changes if you agree to all three

`core/lakelet/project.py` gains the macro text and `init` writes it; `test_step6_materialisation.py` becomes the gate and reads the macro from the package instead of its own copy; the brief's §7 step 6 findings and the docs' questions page are updated; `TASKS.md` moves the item from session 9 to done. A follow-up for Day 1 is recorded: snapshot expiry and orphan-file removal, since rebuilds accumulate data files.
