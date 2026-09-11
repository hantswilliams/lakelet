---
title: CLI reference
description: Every lakelet verb with its arguments and options, generated from the CLI's own help text.
section: Reference
order: 1
---

Generated from `lakelet --help` and every subcommand's help at version `0.1.0.dev0`
by `web/scripts/gen-cli-reference.py`. Do not edit by hand; re-run the script after a
CLI change.

Every verb runs against the project in the current folder; `-C <path>` points at another
one. The gauge line goes to stderr and rows to stdout, so `lakelet sql … > out.csv` keeps
the two apart. Exit codes: `0` ran; `1` an error, named on stderr; `2` a Red verdict that
was refused (add `--run-anyway`); `4` a catalog conflict after retries.

## `lakelet`

```text
Usage: lakelet [OPTIONS] COMMAND [ARGS]...

  Your laptop is the warehouse until it can't be.

Options:
  --version             Print the version and exit.
  -C, --project <path>  The project folder; the current folder by default.
  --help                Show this message and exit.

Commands:
  init      Turn a folder into a lakehouse: catalog, warehouse, lakelet.toml,...
  import    Import a file or a folder of files into Iceberg tables.
  sql       Run SQL: the gauge line first (stderr), then the rows (stdout).
  estimate  The gauge only: verdict, bytes, memory, time, the burst half.
  serve     Run the core as the app's sidecar: catalog and API on one loopback...
  tables    List, describe and sample tables.
  catalog   The Iceberg REST catalog.
  question  Saved questions: dbt models with checks.
  gauge     The gauge's record.
  audit     Prove what leaves the machine.
  config    The settings in lakelet.toml.
```

### `lakelet init`

```text
Usage: lakelet init [OPTIONS] [directory]

  Turn a folder into a lakehouse: catalog, warehouse, lakelet.toml, AGENTS.md, dbt
  project.

Arguments:
  directory  The folder to turn into a lakehouse.  [default: .]

Options:
  --name <str>      Project name; the folder's name by default.
  --probe-mb <int>  Size of the disk-throughput probe; 0 skips it.  [default: 512]
  --help            Show this message and exit.
```

### `lakelet import`

```text
Usage: lakelet import [OPTIONS] {path}

  Import a file or a folder of files into Iceberg tables.

Arguments:
  path  A .csv .tsv .parquet .json .jsonl .xlsx file, or a folder.  [required]

Options:
  --name <str>  Table name; from the file name by default.
  --replace     Drop and recreate an existing table.
  --append      Append to an existing table.
  --preview     Show the inferred schema and stop.
  --help        Show this message and exit.
```

### `lakelet sql`

```text
Usage: lakelet sql [OPTIONS] [query]

  Run SQL: the gauge line first (stderr), then the rows (stdout).

Arguments:
  query  The SQL; or use -f.

Options:
  -f, --file <path>    Read the SQL from a file.
  --format <str>       table, csv, json or parquet; table on a terminal, csv when piped.
  -o, --output <path>  Write the result to a file.
  --run-anyway         Run a Red verdict here regardless.
  --limit <int>        Rows shown as a table.  [default: 1000]
  --help               Show this message and exit.
```

### `lakelet estimate`

```text
Usage: lakelet estimate [OPTIONS] [query]

  The gauge only: verdict, bytes, memory, time, the burst half. Nothing runs.

Arguments:
  query  The SQL; or use -f.

Options:
  -f, --file <path>  Read the SQL from a file.
  --json             The numbers as JSON instead of the line.
  --help             Show this message and exit.
```

### `lakelet serve`

```text
Usage: lakelet serve [OPTIONS]

  Run the core as the app's sidecar: catalog and API on one loopback port, named in
  .lakelet/serve.json with a per-launch token.

Options:
  --port <int>          A fixed port; 0 picks a free one.  [default: 0]
  --host <str>          Loopback only in v0.  [default: 127.0.0.1]
  --memory-limit <str>  DuckDB memory limit for this process, e.g. 8GB; the app sets one
                        per window.
  --help                Show this message and exit.
```

### `lakelet tables`

```text
Usage: lakelet tables [OPTIONS] COMMAND [ARGS]...

  List, describe and sample tables.

Options:
  --help  Show this message and exit.

Commands:
  list      Tables in the catalog with rows, size, when they were last written, and...
  describe  Columns, types, partitioning, freshness and the last commit of a table.
  expire    Drop snapshots older than the retention and delete the files only they...
  sample    The first rows of a table.
  attach    Register remote data as a read-only Iceberg table without copying it.
  refresh   Add the files new under a registered prefix since it was attached.
  discover  Candidate prefixes under a bucket, with their size and kind.
```

#### `lakelet tables list`

```text
Usage: lakelet tables list [OPTIONS]

  Tables in the catalog with rows, size, when they were last written, and location.

Options:
  --help  Show this message and exit.
```

#### `lakelet tables describe`

```text
Usage: lakelet tables describe [OPTIONS] {name}

  Columns, types, partitioning, freshness and the last commit of a table.

Arguments:
  name  [required]

Options:
  --help  Show this message and exit.
```

#### `lakelet tables expire`

```text
Usage: lakelet tables expire [OPTIONS] [name]

  Drop snapshots older than the retention and delete the files only they referenced,
  plus any file under the table that no snapshot references and that is over an hour old
  (what a previous --replace left). The current snapshot always stays; a table
  registered with `tables attach` is never touched. The one verb that deletes data
  files.

Arguments:
  name  A table; or --all.

Options:
  --all              Every table Lakelet wrote.
  --keep-days <int>  Days of snapshots to keep; lakelet.toml's by default.
  --help             Show this message and exit.
```

#### `lakelet tables sample`

```text
Usage: lakelet tables sample [OPTIONS] {name}

  The first rows of a table.

Arguments:
  name  [required]

Options:
  -n <int>  Rows to show.  [default: 5]
  --help    Show this message and exit.
```

#### `lakelet tables attach`

```text
Usage: lakelet tables attach [OPTIONS] {name} {source}

  Register remote data as a read-only Iceberg table without copying it.

Arguments:
  name    [required]
  source  s3://bucket/prefix/ of Parquet, or a …metadata.json  [required]

Options:
  --metadata-in-bucket  Keep the Iceberg metadata under s3://bucket/_lakelet/.
  --anonymous           A public bucket: read it without credentials (metadata stays
                        local).
  --help                Show this message and exit.
```

#### `lakelet tables refresh`

```text
Usage: lakelet tables refresh [OPTIONS] {name}

  Add the files new under a registered prefix since it was attached.

Arguments:
  name  [required]

Options:
  --help  Show this message and exit.
```

#### `lakelet tables discover`

```text
Usage: lakelet tables discover [OPTIONS] {prefix}

  Candidate prefixes under a bucket, with their size and kind.

Arguments:
  prefix  s3://bucket/ or s3://bucket/prefix/  [required]

Options:
  --anonymous  A public bucket: list it without credentials.
  --help       Show this message and exit.
```

### `lakelet catalog`

```text
Usage: lakelet catalog [OPTIONS] COMMAND [ARGS]...

  The Iceberg REST catalog.

Options:
  --help  Show this message and exit.

Commands:
  serve  Expose the project's Iceberg REST catalog on a fixed loopback port.
```

#### `lakelet catalog serve`

```text
Usage: lakelet catalog serve [OPTIONS]

  Expose the project's Iceberg REST catalog on a fixed loopback port.

Options:
  --port <int>  A fixed port for Spark, Trino, pyiceberg and other DuckDBs.  [default:
                8181]
  --host <str>  Loopback only in v0.  [default: 127.0.0.1]
  --help        Show this message and exit.
```

### `lakelet question`

```text
Usage: lakelet question [OPTIONS] COMMAND [ARGS]...

  Saved questions: dbt models with checks.

Options:
  --help  Show this message and exit.

Commands:
  save  Save a question as a dbt model with two default checks.
  list  Saved questions with their last run.
  run   Run a saved question: the gauge first.
```

#### `lakelet question save`

```text
Usage: lakelet question save [OPTIONS] {title}

  Save a question as a dbt model with two default checks.

Arguments:
  title  [required]

Options:
  -f, --file <path>  Read the SQL from a file.
  --sql <str>        The SQL inline.
  --help             Show this message and exit.
```

#### `lakelet question list`

```text
Usage: lakelet question list [OPTIONS]

  Saved questions with their last run.

Options:
  --help  Show this message and exit.
```

#### `lakelet question run`

```text
Usage: lakelet question run [OPTIONS] {slug}

  Run a saved question: the gauge first.

Arguments:
  slug  [required]

Options:
  --format <str>       table, csv, json or parquet.
  -o, --output <path>
  --run-anyway
  --limit <int>        [default: 1000]
  --help               Show this message and exit.
```

### `lakelet gauge`

```text
Usage: lakelet gauge [OPTIONS] COMMAND [ARGS]...

  The gauge's record.

Options:
  --help  Show this message and exit.

Commands:
  probe    Measure local disk throughput again and record it for the gauge (a...
  history  Recent runs: verdict, estimate, actual.
```

#### `lakelet gauge probe`

```text
Usage: lakelet gauge probe [OPTIONS]

  Measure local disk throughput again and record it for the gauge (a project set up
  before September 11, 2026 measured the page cache, not the disk).

Options:
  --mb <int>  Size of the probe file.  [default: 512]
  --help      Show this message and exit.
```

#### `lakelet gauge history`

```text
Usage: lakelet gauge history [OPTIONS]

  Recent runs: verdict, estimate, actual.

Options:
  --last <int>  Runs to show.  [default: 20]
  --help        Show this message and exit.
```

### `lakelet audit`

```text
Usage: lakelet audit [OPTIONS] COMMAND [ARGS]...

  Prove what leaves the machine.

Options:
  --help  Show this message and exit.

Commands:
  network  Run the quickstart with outbound connections blocked and report every...
```

#### `lakelet audit network`

```text
Usage: lakelet audit network [OPTIONS]

  Run the quickstart with outbound connections blocked and report every attempt.

Options:
  --help  Show this message and exit.
```

### `lakelet config`

```text
Usage: lakelet config [OPTIONS] COMMAND [ARGS]...

  The settings in lakelet.toml.

Options:
  --help  Show this message and exit.

Commands:
  show  The settings a hand or the app may change, with their current values.
  set   Set one setting in lakelet.toml, leaving the rest of the file as it was.
```

#### `lakelet config show`

```text
Usage: lakelet config show [OPTIONS]

  The settings a hand or the app may change, with their current values.

Options:
  --help  Show this message and exit.
```

#### `lakelet config set`

```text
Usage: lakelet config set [OPTIONS] {key} {value}

  Set one setting in lakelet.toml, leaving the rest of the file as it was. The engine
  reads its settings at start, so a running `lakelet serve` keeps the old ones.

Arguments:
  key    engine.memory_limit, engine.threads or gauge.share_calibration.  [required]
  value  auto or a size; auto or a count; true or false.  [required]

Options:
  --help  Show this message and exit.
```

