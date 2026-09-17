---
title: Tables
description: Importing files into Iceberg, what each type becomes, and attaching Parquet that is already in a bucket without copying it.
section: Guide
order: 2
---

Every table is an Apache Iceberg table (format version 2) in the project's catalog, under the single namespace `main`. Local tables live in `./warehouse/main/<name>/`; attached tables keep their data where it is and put only metadata there. DuckDB writes and reads them through the catalog, and any Iceberg client can read them through the same catalog or straight from the `metadata.json`.

## Importing files

```bash
lakelet import orders.csv                      # a table named orders
lakelet import "Orders 2026.xlsx" --name orders  # a table named orders
lakelet import exports/                        # one table per file in the folder
lakelet import orders.csv --preview            # the schema it would make; nothing written
lakelet import orders.csv --replace            # the new table first, then the swap
lakelet import orders_march.csv --append --name orders
```

`.csv`, `.tsv`, `.parquet`, `.json`, `.jsonl` and `.xlsx` are read by DuckDB's own readers with type inference, then written as Iceberg through the catalog with `CREATE TABLE AS`. A folder imports each supported file as its own table and refuses the whole folder before writing anything if two files would collide on a name. Without `--replace` or `--append`, importing onto an existing name is an error.

**`--replace` never drops the old table until the new one is complete.** The new table is built under a temporary name (`<name>__lakelet_replace`, which you cannot use for a table of your own) in the same folder, then the old one is dropped and the new one renamed into place — each its own catalog commit, because DuckDB-Iceberg refuses both [inside one transaction](/docs/transactions). A file that does not parse, a cast that fails or a disk that fills leaves the old table exactly as it was. If the process dies in the instant between the drop and the rename, `lakelet tables list` shows the temporary table with the sentence that finishes the swap: `lakelet tables rename <name>__lakelet_replace <name>`. The old table's files become orphans in the shared folder and `tables expire` sweeps them after an hour. `tables rename` works for any table: one catalog commit, the data does not move.

`--preview` prints each column with the type DuckDB inferred, the Iceberg type it will become and a note where the mapping is lossy, then the first rows. Whatever the preview promised is what the table gets.

## What each type becomes

DuckDB's Iceberg writer maps most types directly. Where it cannot, Lakelet casts before writing and says so in the preview.

| DuckDB type | Iceberg type | Note |
|---|---|---|
| `BOOLEAN` | `boolean` | |
| `TINYINT`, `SMALLINT`, `INTEGER` | `int` | Narrow integers widened. |
| `UTINYINT`, `USMALLINT` | `int` | Unsigned widened. |
| `BIGINT`, `UINTEGER` | `long` | Unsigned widened. |
| `UBIGINT` | `decimal(20, 0)` | Unsigned 64-bit does not fit a `long`. |
| `HUGEINT`, `UHUGEINT` | `decimal(38, 0)` | 128-bit integers. A `HUGEINT` that arrives via Parquet is already a `DOUBLE`, DuckDB's Parquet writer stores it that way. |
| `FLOAT`, `DOUBLE` | `float`, `double` | |
| `DECIMAL(p, s)` | `decimal(p, s)` | |
| `VARCHAR` | `string` | |
| `BLOB` | `binary` | |
| `DATE`, `TIME` | `date`, `time` | |
| `TIMESTAMP`, `TIMESTAMP_S`, `TIMESTAMP_MS` | `timestamp` | Microsecond precision. |
| `TIMESTAMP_NS` | `timestamp` | Nanoseconds truncated to microseconds; lossy. |
| `TIMESTAMP WITH TIME ZONE` | `timestamptz` | |
| `UUID` | `uuid` | |
| `LIST`, `ARRAY` | `list` | Element type mapped by the same table. |
| `STRUCT` | `struct` | Field by field. |
| `MAP` | `map` | Key and value mapped. |
| `ENUM`, `JSON`, `BIT`, `UNION`, `INTERVAL`, `TIME WITH TIME ZONE` | `string` | Cast to text; flagged lossy in the preview. |

Nested types are handled element by element, so a `LIST(STRUCT(a UBIGINT))` becomes a `list<struct<a: decimal(20, 0)>>`.

## Looking at tables

```bash
lakelet tables list                # name, rows, size, location for every table
lakelet tables describe orders     # columns and types, partitioning, freshness, the last commit, snapshot count, format version
lakelet tables sample orders -n 10 # the first rows
```

Rows and bytes come from the current snapshot's manifests, so they are exact for what was written; position deletes from a `MERGE INTO` are not subtracted from the row count. `describe`'s freshness is the current snapshot's timestamp and its last commit is that snapshot's summary.

Row counts in `tables list` and `describe` are the data files' record counts less the position deletes on file, which is exact for DuckDB's own deletes (one entry per row) and an upper bound for an equality delete written by another engine.

## Lineage

```bash
lakelet lineage orders               # what reads it, and what it reads
lakelet lineage by_customer --depth 3
lakelet lineage stg --json           # the same as GET /api/lineage/stg
```

`lineage` answers for a table, a view or a dbt model, at table level, in both directions:

```
by_customer  table, built by by_customer, 2026-09-16 11:16:34 UTC
  reads from
    stg      view   ref
  feeds
    top      model  ref
```

Every edge says how it is known: `ref` and `source` come from the dbt manifest of the last compile (compiled first when it is missing or older than the models, and the command says so); `sql` is a table a model names bare in its SQL, which every saved question does; `view` is a table a catalog view that did not come from dbt binds to. A name is a table or a view in the catalog, or a `model` not built yet; a table model and the table it built are one thing. The head line says who built it — a model, `imported`, or `attached from <prefix>` — and when, from history's record of the model's last run or the table's current snapshot. `--depth N` walks further, each name once at the level it was first reached. Nothing here parses SQL: the manifest and DuckDB's own parse of the statement already know. Column-level lineage is a later day.

The app shows the same two lines, **Reads from** and **Feeds**, on every table, view and model detail, each name a link to that detail; see [the app](/docs/app).

## Snapshots, history and expiry

Every write is an Iceberg snapshot, and an Iceberg table never deletes a data file on its own: a table rebuilt in place (a `dbt run`, a `DELETE` then `INSERT`) keeps every previous version's files until snapshots are expired, and `import --replace` drops and recreates the table, leaving the old table's files in the same folder. Nothing in Lakelet removes files unless you ask, because that is the one thing that cannot be undone.

```bash
lakelet tables describe orders                 # "14 snapshot(s) older than 7 days, 3.1 GB reclaimable: lakelet tables expire orders"
lakelet tables expire orders                   # keep lakelet.toml's keep_snapshots_days (7)
lakelet tables expire orders --keep-days 0     # keep only the current snapshot
lakelet tables expire --all
```

`expire` drops every snapshot older than the retention other than the current one and any a branch or tag points at, committing that through the catalog (pyiceberg's `expire_snapshots`), then deletes the data and manifest files those snapshots referenced and no remaining snapshot does, plus any data or manifest file under the table's own folder that no snapshot references and that is over an hour old (the grace period leaves a write in flight alone). Old `metadata.json` files stay; they are small. It reports snapshots expired, files removed and bytes reclaimed. A table registered with `tables attach` is refused: its files are not Lakelet's to delete. The app's settings panel has the retention; `/api/tables/{name}/expire` is the same verb.

`import` and `tables attach` also rewrite the tables block in the project's `AGENTS.md`, between `<!-- lakelet:tables:start -->` and `<!-- lakelet:tables:end -->`, so a coding agent opening the folder sees what is there.

## Attaching Parquet that is already in a bucket

An export from Snowflake, BigQuery or anything else is usually a prefix of Parquet files in S3. `tables attach` turns that prefix into an Iceberg table in place: nothing is copied, the bucket's object list is unchanged afterwards, and DuckDB, pyiceberg, Spark and Trino all read it.

```bash
export AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… AWS_REGION=us-east-1   # or nothing, for the default credential chain
lakelet tables discover s3://acme-exports/                 # prefixes under the bucket: kind (parquet, iceberg, other), files, size
lakelet tables attach events s3://acme-exports/events/     # register the Parquet files as the table events
lakelet tables attach events s3://acme-exports/events/ --metadata-in-bucket
lakelet tables attach legacy s3://acme-lake/legacy/metadata/00012-….metadata.json   # an existing Iceberg table, by its metadata location
lakelet tables refresh events                              # pick up files written since the attach
lakelet tables attach --replace events s3://acme-exports/events/   # register again, after files changed under the same path
```

What it does: one listing call, one Parquet footer read per file for the schema and the column statistics, and one commit through the catalog with pyiceberg's `add_files`. Ten thousand small files registered in 16 seconds on one machine against a self-hosted store.

**Files that change under the same path.** An attached table's statistics describe the files as they were at the attach; a file rewritten under the same key would silently disagree with them. So every registered file is checked against the prefix's listing — its size against the manifest's, its modification time against the last verification — by `refresh` and by `describe` (and the app's table detail), and a changed file is named: `2 registered file(s) changed under the same path since the attach: part-1.parquet (size 1.2 MB → 3.4 MB) …`. `refresh` refuses until `tables attach --replace <name> <prefix>` registers the prefix again, which builds the new registration first and swaps, the way `import --replace` does. pyarrow's listing carries no ETag, so a byte-identical re-upload after the attach reads as changed too; that is the safe side. `describe` says `files: verified against <prefix> at <time>` when nothing changed.

**Where the metadata goes.** By default the Iceberg metadata for an attached table is written locally under `warehouse/main/<name>/metadata/` with the data files pointing at `s3://`, so the bucket stays read-only from Lakelet's side. `--metadata-in-bucket` writes it under `s3://<bucket>/_lakelet/<name>/` instead, which is what another machine or engine needs to find the table without your laptop. Either way DuckDB reads it.

**Snapshots and refresh.** An attached table is a snapshot of the prefix at attach time. Files added later do not appear until `tables refresh`, which lists the prefix again and adds what is new. A refresh that finds a registered file gone refuses and names it, rather than producing a table that reads wrong.

**What is refused, by name.** Schema drift, where a later file adds, drops or retypes a column, is refused with the file and the columns named. A Hive layout where a partition column exists only in the path (`country=US/part-0.parquet`) and not in the files is refused with the column named. Both are cases for a conversion step that does not exist yet; today the answer is to fix the export.

**Bandwidth.** The first attach in a project times a read of up to 64 MB from the largest file in the bucket and caches the result for an hour in `.lakelet/cache/machine.json`. The gauge uses it: a query over an attached table shows `from s3://…` and `at your N Mbps` in its line, and goes Red when the bytes cannot arrive inside the Yellow window. Manifests and metadata fetched from S3 are immutable and are cached on disk, so the second estimate on an attached table is as fast as a local one.

**Public buckets.** `--anonymous` on `discover` and `attach` reads a bucket that allows anonymous access (the datasets in AWS's Registry of Open Data, for instance) with no credentials at all: the listing, the Parquet footers and every later read go out unsigned, pyarrow asks S3 which region the bucket is in, the metadata stays local (there is nothing to write with), the table carries `lakelet.anonymous = true` so `refresh` reads the same way, and the bucket is written to `.lakelet/public-buckets.json` so the engine opens it, with a secret scoped to that bucket alone, every time the project starts. A machine with no AWS credentials can attach and query a public dataset; a machine with credentials still reads that bucket unsigned. `--anonymous` with `--metadata-in-bucket` is refused.

```bash
lakelet tables discover --anonymous s3://some-open-data-bucket/release/2025-01/
lakelet tables attach places --anonymous s3://some-open-data-bucket/release/2025-01/places/
```

**Credentials** come from the standard AWS environment only, never from `lakelet.toml`. `AWS_ENDPOINT_URL` points both DuckDB and pyiceberg at a self-hosted store such as RustFS. With no keys in the environment, both fall back to the AWS default credential chain, which needs DuckDB's `aws` extension, one of the four `init` installs. A machine with no AWS credentials anywhere is the normal case and everything local works on it; the first `discover`, `attach` or `refresh` against `s3://` is refused with a sentence naming the variables to set.
