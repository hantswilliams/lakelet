# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""The Iceberg half of a commit, done with pyiceberg (brief D19): validate the client's
requirements against the current metadata, apply its updates, and write the next numbered
metadata file. Mirrors ``pyiceberg.catalog.MetastoreCatalog.commit_table`` so the files
Lakelet writes are the files pyiceberg would write.
"""

from __future__ import annotations

import uuid

from pyiceberg.catalog import TABLE_METADATA_FILE_NAME_REGEX, MetastoreCatalog
from pyiceberg.io import FileIO, load_file_io
from pyiceberg.partitioning import UNPARTITIONED_PARTITION_SPEC, PartitionSpec
from pyiceberg.schema import Schema
from pyiceberg.serializers import FromInputFile, ToOutputFile
from pyiceberg.table.metadata import TableMetadata, new_table_metadata
from pyiceberg.table.sorting import UNSORTED_SORT_ORDER, SortOrder
from pyiceberg.table.update import TableRequirement, TableUpdate, update_table_metadata


def metadata_location(table_location: str, version: int) -> str:
    """pyiceberg's file naming (brief D36): ``<version>-<uuid>.metadata.json``."""
    return f"{table_location}/metadata/{version:05d}-{uuid.uuid4()}.metadata.json"


def parse_version(location: str) -> int:
    match = TABLE_METADATA_FILE_NAME_REGEX.search(location)
    return int(match.group(1)) if match else -1


class MetadataIO:
    """Reads and writes metadata files through pyiceberg's FileIO, so ``file://`` and
    ``s3://`` warehouses are the same code path."""

    def __init__(self, properties: dict[str, str]) -> None:
        self.io: FileIO = load_file_io(properties)

    def read(self, location: str) -> TableMetadata:
        return FromInputFile.table_metadata(self.io.new_input(location))

    def write(self, table_metadata: TableMetadata, location: str) -> None:
        ToOutputFile.table_metadata(table_metadata, self.io.new_output(location), overwrite=False)


def create_metadata(
    schema: Schema,
    location: str,
    partition_spec: PartitionSpec | None,
    sort_order: SortOrder | None,
    properties: dict[str, str],
) -> TableMetadata:
    return new_table_metadata(
        schema=schema,
        partition_spec=partition_spec or UNPARTITIONED_PARTITION_SPEC,
        sort_order=sort_order or UNSORTED_SORT_ORDER,
        location=location,
        properties=properties,
    )


def apply_commit(
    base: TableMetadata | None,
    base_location: str | None,
    requirements: tuple[TableRequirement, ...],
    updates: tuple[TableUpdate, ...],
) -> TableMetadata:
    """Validate then apply. ``base`` is None for a staged create being committed; the
    requirements raise ``CommitFailedException`` when they do not hold."""
    for requirement in requirements:
        requirement.validate(base)
    return update_table_metadata(
        base_metadata=base if base is not None else MetastoreCatalog._empty_table_metadata(),
        updates=updates,
        enforce_validation=base is None,
        metadata_location=base_location,
    )
