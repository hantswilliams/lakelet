---
title: A real bucket
description: What Lakelet needs from AWS to attach your data, the IAM policy for the test suite's own bucket, the environment variables, and what the suite writes and removes.
section: Develop
order: 3
---

Lakelet reads Parquet in S3 in place (`tables attach`, see [Tables](/docs/tables)) and, by default, writes nothing to the bucket: the Iceberg metadata for an attached table lives under the project's own `warehouse/` on your machine, and the data files are read where they are. A read-only user is enough for that. Writing into a bucket happens only when you ask for it (`--metadata-in-bucket`), and in the test suite.

## Credentials

Lakelet takes AWS credentials from the standard environment and from nowhere else; there is no key in `lakelet.toml` and none in the app. Keys in the environment (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) are used first; without them every client falls back to the AWS default chain, so `AWS_PROFILE` and `~/.aws/credentials` work. `AWS_REGION` names the region (`us-east-1` when unset) and `AWS_ENDPOINT_URL` points at a self-hosted store; on AWS itself leave it unset. `/api/health` reports `aws: {configured, source, region}` so the app can say, before you type a prefix, whether the core it started has credentials at all; it never reports a key.

A read-only user for your own data needs this on the bucket that holds it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::YOUR-BUCKET" },
    { "Effect": "Allow", "Action": ["s3:GetObject"], "Resource": "arn:aws:s3:::YOUR-BUCKET/*" }
  ]
}
```

## Public buckets need nothing

A bucket that allows anonymous access is read with `--anonymous` and no credentials at all; [Tables](/docs/tables) has the two commands. The datasets in [AWS's Registry of Open Data](https://registry.opendata.aws/) are the case this is for: AWS carries the egress, so a full scan costs nobody anything, and a fresh machine with no AWS account can attach one and ask the gauge what a query would cost.

### Try it: Overture Maps, no account needed

[Overture Maps](https://registry.opendata.aws/overture/) publishes its releases as Parquet in a public bucket, one prefix per theme and type, with one schema across the files of a type. Tested September 11, 2026 against release `2026-08-19.0` from a laptop with no AWS credentials in the shell:

```bash
lakelet init ~/lakelet-open && cd ~/lakelet-open
lakelet tables discover --anonymous s3://overturemaps-us-west-2/release/2026-08-19.0/
lakelet tables attach addresses --anonymous s3://overturemaps-us-west-2/release/2026-08-19.0/theme=addresses/type=address/
lakelet tables attach places    --anonymous s3://overturemaps-us-west-2/release/2026-08-19.0/theme=places/type=place/
lakelet estimate 'select country, count(*) from addresses group by 1'
lakelet sql "select count(*) from places where bbox.xmin between -73.2 and -73.0 and bbox.ymin between 40.85 and 40.95"
```

`discover` on the release lists six themes from 5.6 GB to 277 GB. `addresses` registered as 472,797,160 rows in 32 files (21.9 GB) and `places` as 73,631,092 rows in 16 files (10.5 GB), with nothing copied and the metadata under the project's own `warehouse/`. The gauge then reads the manifests it wrote: `count(*)` scans nothing, a `group by country` over the addresses scans 218.9 MB (one column of 21.9 GB) and says about 16 s at that laptop's 111 Mbps, a bounding-box count over the places scans 104.8 MB and ran in 4.1 s against an estimate of 8 s; `select *` over either table is Red at any home link. Pick a release from `discover` rather than copying the one above; Overture retires old releases.

## The test suite against a real bucket

The S3 tests (`tests/test_step1_s3.py`, the catalog with its files in a bucket; `tests/test_step8_remote.py`, attach, refresh, discover, the bandwidth probe) run against an in-process Moto server by default and in CI. To run the same tests against a real bucket, make a bucket that is the suite's own (it writes and deletes in it) and an IAM user with this policy on that bucket only:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::lakelet-suite" },
    { "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::lakelet-suite/*" }
  ]
}
```

Then, from `core/`:

```bash
export LAKELET_TEST_S3_BUCKET=lakelet-suite
export AWS_ACCESS_KEY_ID=…  AWS_SECRET_ACCESS_KEY=…  AWS_REGION=us-east-1
uv run pytest tests/test_step1_s3.py tests/test_step8_remote.py -v
```

What it does in the bucket: everything a run writes goes under `lakelet-tests/<date>-<id>/` (the plain Parquet prefixes the tests attach, the catalog warehouses of the step 1 tests) and under `_lakelet/` (the `--metadata-in-bucket` layout, which is at the bucket root by design), and both are removed when each test module ends, and again at the start of the next run in case an earlier one crashed. The bucket itself is never created or deleted, and a bucket name that does not answer to the credentials stops the run before anything is written. The fixtures are a few megabytes; the ten-thousand-file registration is gated behind `LAKELET_PERF=1` and writes ten thousand small objects, which is a few cents of requests.

`LAKELET_TEST_S3_ENDPOINT` (or `AWS_ENDPOINT_URL`) instead of a bucket name points the suite at a self-hosted store such as the RustFS in `compose.yaml`, where the bucket `lakelet-test` is created if missing, as it always was.

## What the results mean

Against Moto the numbers are the container's; against a real bucket they are your link's. The attach test prints nothing but passes only if registration copied no object; the bandwidth test prints the second estimate's time (under 150 ms with the manifests cached) and the probe's figure is in `.lakelet/cache/machine.json` of the test project. The figures from the reference runs are in `build-sessions/`.
