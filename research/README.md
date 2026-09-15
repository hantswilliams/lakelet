# Research

Articles read for the build, with what each changed. The copies themselves (PDFs saved from
the browser) are gitignored: this is a public repository and they are other people's work.
The decisions they led to are in `build-sessions/decisions-for-review_<MMDDYY>.md`.

## September 15, 2026 (`decisions-for-review_091526.md`, V1 to V4)

| Article | Date | Takeaway for Lakelet |
|---|---|---|
| DataExpert, [DuckDB Just Put a $400K/Year Skill on Your Laptop](https://medium.com/@dataexpert/duckdb-just-put-a-400k-year-skill-on-your-laptop-fc4c86201a44) (Medium) | Sep 3, 2026 | The thesis in someone else's words: DuckDB 1.5.3 Iceberg writes + Iceberg maturity + dbt Core = a laptop lakehouse. Its "honest gap" list is a roadmap audit: concurrent writes (our catalog), lineage (versions round step 4), run observability (history), and small-file / delete-file accumulation with no compaction (V2). Market figures unverified; none used. |
| VeloDB, [Apache Doris 4.1 on Iceberg V3](https://medium.com/towards-data-engineering/apache-doris-4-1-on-iceberg-v3-running-the-full-lakehouse-lifecycle-from-one-sql-engine-0530fc178067) (Towards Data Engineering) | Sep 2, 2026 | Under format-version 2 every `DELETE` is a position-delete file anti-joined on read; V3 deletion vectors keep read cost flat, and row lineage gives a per-row watermark. Our `table` materialisation is `DELETE` then `INSERT` per run on V2 tables (V1, V2). |
| Arshad Ansari, [Is DuckDB safe for production? The honest limitations](https://publication.hikmahtechnologies.com/is-duckdb-safe-for-production-the-honest-limitations-2d1e776eb7e8) (Hikmah Techstack) | Sep 11, 2026 | The recommended shape (immutable Parquet, read-only readers, the `.duckdb` file a cache) is Lakelet's shape; one durability sentence for the docs and the site (V4). |
| Shawn Gordon, [What the Heck is Renart?](https://progrockrec.medium.com/what-the-heck-is-renart-fc428c6f4849) (Medium) | Sep 7, 2026 | The nearest comparable: Git-native, files-as-assets, a desktop window, public alpha. Its content-fingerprint staleness ("Build stale") is one field and one selector for us once lineage lands (V3). It is an IDE over a warehouse; Lakelet is the warehouse (V4). |
