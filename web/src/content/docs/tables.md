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
lakelet import orders.csv --replace            # drop and recreate
lakelet import orders_march.csv --append --name orders
```

`.csv`, `.tsv`, `.parquet`, `.json`, `.jsonl` and `.xlsx` are read by DuckDB's own readers with type inference, then written as Iceberg through the catalog with `CREATE TABLE AS`. A folder imports each supported file as its own table and refuses the whole folder before writing anything if two files would collide on a name. Without `--replace` or `--append`, importing onto an existing name is an error.

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
```

What it does: one listing call, one Parquet footer read per file for the schema and the column statistics, and one commit through the catalog with pyiceberg's `add_files`. Ten thousand small files registered in 16 seconds on one machine against a self-hosted store.

**Where the metadata goes.** By default the Iceberg metadata for an attached table is written locally under `warehouse/main/<name>/metadata/` with the data files pointing at `s3://`, so the bucket stays read-only from Lakelet's side. `--metadata-in-bucket` writes it under `s3://<bucket>/_lakelet/<name>/` instead, which is what another machine or engine needs to find the table without your laptop. Either way DuckDB reads it.

**Snapshots and refresh.** An attached table is a snapshot of the prefix at attach time. Files added later do not appear until `tables refresh`, which lists the prefix again and adds what is new. A refresh that finds a registered file gone refuses and names it, rather than producing a table that reads wrong.

**What is refused, by name.** Schema drift, where a later file adds, drops or retypes a column, is refused with the file and the columns named. A Hive layout where a partition column exists only in the path (`country=US/part-0.parquet`) and not in the files is refused with the column named. Both are cases for a conversion step that does not exist yet; today the answer is to fix the export.

**Bandwidth.** The first attach in a project times a read of up to 64 MB from the largest file in the bucket and caches the result for an hour in `.lakelet/cache/machine.json`. The gauge uses it: a query over an attached table shows `from s3://…` and `at your N Mbps` in its line, and goes Red when the bytes cannot arrive inside the Yellow window. Manifests and metadata fetched from S3 are immutable and are cached on disk, so the second estimate on an attached table is as fast as a local one.

**Credentials** come from the standard AWS environment only, never from `lakelet.toml`. `AWS_ENDPOINT_URL` points both DuckDB and pyiceberg at a self-hosted store such as RustFS. With no keys in the environment, both fall back to the AWS default credential chain, which needs DuckDB's `aws` extension, one of the four `init` installs.
