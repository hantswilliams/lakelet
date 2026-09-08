# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Per-table file statistics from Iceberg manifests (brief D20, D21). Step 4 uses them for
the derived actual bytes; step 5 adds pruning with the plan's predicates and the cache."""

from __future__ import annotations

from dataclasses import dataclass, field

from pyiceberg.manifest import ManifestContent
from pyiceberg.table.metadata import TableMetadata

from lakelet.catalog.commit import MetadataIO


@dataclass
class FileStat:
    path: str
    size: int
    records: int
    column_sizes: dict[int, int] = field(default_factory=dict)


def file_stats(metadata_io: MetadataIO, table_metadata: TableMetadata) -> list[FileStat]:
    snapshot = table_metadata.current_snapshot()
    if snapshot is None:
        return []
    stats = []
    for manifest in snapshot.manifests(metadata_io.io):
        if manifest.content != ManifestContent.DATA:
            continue
        for entry in manifest.fetch_manifest_entry(metadata_io.io, discard_deleted=True):
            f = entry.data_file
            stats.append(
                FileStat(
                    f.file_path, f.file_size_in_bytes, f.record_count, dict(f.column_sizes or {})
                )
            )
    return stats


def bytes_per_row(stats: list[FileStat], field_ids: set[int] | None = None) -> float:
    """Average bytes per row, for the projected columns when field ids are given (from the
    manifests' column sizes) or for whole rows (from file sizes)."""
    records = sum(s.records for s in stats)
    if not records:
        return 0.0
    if field_ids is None:
        return sum(s.size for s in stats) / records
    projected = sum(sum(v for k, v in s.column_sizes.items() if k in field_ids) for s in stats)
    if not projected:  # no column sizes in these manifests: fall back to whole rows
        return sum(s.size for s in stats) / records
    return projected / records
