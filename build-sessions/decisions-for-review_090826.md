# Six decisions before step 8 — one page

> **Decided September 8, 2026: all six accepted.** Applied in `core-v0.2-plan.md` as D25, D26 and D27, with the D11, §2, §3, step 8, §6, §7 and §8 changes. This file is the record of the decision.

*September 8, 2026 · The short version of the R block at the top of `core-v0.1-plan.md`. The reasoning, the option matrix and the measurements are there and in `lakelet-build-sessions_090726.md`. Tick a box on each one; write a line under "Change" if you disagree.*

## The one thing to know

Partners' buckets will hold Parquet, not Iceberg. Yesterday we proved that a folder of someone else's Parquet can become a real Iceberg table without copying a byte, and that DuckDB reads it. This morning we proved the same over S3. Every decision below follows from that.

---

### 1. Assume partner data arrives as Parquet in S3

**Recommend:** yes.
**Why:** Snowflake, BigQuery and MotherDuck users can export to Parquet in one command. Almost nobody has Iceberg already.
**How we check it:** five intake questions per partner: format, folder layout, file count, what wrote it, does it change daily.

- [x] Agree
- [ ] Change:

### 2. Turn a Parquet folder into a table by registering it in place as Iceberg

**Recommend:** yes. The command is `lakelet tables attach events s3://bucket/events/`.
**Why:** nothing is copied, the result is real Iceberg, Spark can read it, the deck's "your data, your bucket, open format" claim stays true, and leaving Lakelet means deleting one metadata folder.
**Not chosen:**
- Parquet views over the folder. Cheapest to build, but the table is not Iceberg, Spark cannot read it, and the demo's last step and the investor claim both fail.
- Attaching the partner's existing Glue or S3 Tables catalog. Only helps people who already have Iceberg. Moves to Day 1.

**Fallback if partner data is too messy to register:** convert it in the cloud with a burst worker. Keeps everything above true, costs the partner cents, and is a good first burst.
**Trigger:** two of the first five partners have folders we cannot register.

- [x] Agree
- [ ] Change:

### 3. Keep the Iceberg metadata on the laptop by default, with a flag to put it in the bucket

**Recommend:** laptop first.
**Why:** the partner's bucket stays read-only, which is a strong trust statement on day one. Same code either way, so we build and test both and flip the flag when the burst worker needs it.

- [x] Agree
- [ ] Change:

### 4. A registered table is a snapshot, so add a refresh command

**Recommend:** yes.
**Why:** files the partner adds later do not appear until `lakelet tables refresh`. That is fine for exports, and we say so in onboarding. Scheduled refresh is Day 2.

- [x] Agree
- [ ] Change:

### 5. The demo runs on a Lakelet-owned bucket, set up the same way a partner's would be

**Recommend:** yes.
**Why:** the demo should not depend on any one partner, and it should exercise the exact path partners use.

- [x] Agree
- [ ] Change:

### 6. Build it in core v0 step 8

**Recommend:** yes. Adds three to five days to a step that already exists. If step 8 slips, it moves to session 8 with no redesign.

- [x] Agree
- [ ] Change:

---

## What we test instead of deciding

Decision 2 is the only one with real technical risk, and the risk is messy real-world data, not the mechanism. So step 8 gets these fixtures, each with a one-day limit:

- Registration over `s3://` against the in-process S3 test server. Measured on September 8 and it works; it stays in the suite as a regression test. MinIO is not used anywhere because it is no longer maintained.
- A folder where the third file adds a column.
- Hive-style folders such as `country=US/…` where the column exists only in the path.
- Ten thousand small files.
- Both metadata locations from decision 3.

Two fixtures that take more than a day each, or the partner intake showing half the partners have folders we cannot handle, and the cloud-conversion fallback gets built before partners onboard.

## If you agree to all six

The change list at the end of the R block in `core-v0.1-plan.md` gets applied: D11, the scope tables, the `tables` verbs, the step 8 gate, §7, §9, and two lines in the PRD. `catalog attach` moves to Day 1. Nothing else in the plan moves.
