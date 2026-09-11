# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Object storage settings and file systems (brief D36): the user's own AWS credentials
from the standard environment, never from lakelet.toml. AWS_ENDPOINT_URL points at a
self-hosted store; with no keys in the environment every client falls back to its default
credential chain."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import pyarrow.fs as pafs

LAKELET_PREFIX = "_lakelet"
_REGIONS: dict[str, str] = {}  # bucket -> region, resolved once per process


@dataclass
class S3Settings:
    endpoint: str | None
    access_key: str | None
    secret_key: str | None
    region: str

    @classmethod
    def from_env(cls) -> S3Settings:
        return cls(
            endpoint=os.environ.get("AWS_ENDPOINT_URL") or None,
            access_key=os.environ.get("AWS_ACCESS_KEY_ID") or None,
            secret_key=os.environ.get("AWS_SECRET_ACCESS_KEY") or None,
            region=os.environ.get("AWS_REGION")
            or os.environ.get("AWS_DEFAULT_REGION")
            or "us-east-1",
        )

    def describe(self) -> dict[str, Any]:
        """What ``/api/health`` and the app say about credentials (real-data brief R4):
        whether keys are in the environment, a named profile the default chain will use,
        or nothing, plus the region and any self-hosted endpoint. Never the keys."""
        if self.access_key and self.secret_key:
            source = "environment"
        elif os.environ.get("AWS_PROFILE"):
            source = "profile"
        else:
            source = "none"
        return {
            "configured": source != "none",
            "source": source,
            "profile": os.environ.get("AWS_PROFILE") or None,
            "region": self.region,
            "endpoint": self.endpoint,
        }

    def io_properties(self) -> dict[str, str]:
        """pyiceberg FileIO properties; empty values are left out so the default chain applies."""
        props = {"s3.region": self.region}
        if self.endpoint:
            props["s3.endpoint"] = self.endpoint
        if self.access_key and self.secret_key:
            props["s3.access-key-id"] = self.access_key
            props["s3.secret-access-key"] = self.secret_key
        return props

    def duckdb_secret(self) -> str | None:
        """The CREATE SECRET for the engine, or None when the default chain should be used."""
        if not (self.access_key and self.secret_key):
            return None
        parts = [
            "TYPE s3",
            f"KEY_ID '{self.access_key}'",
            f"SECRET '{self.secret_key}'",
            f"REGION '{self.region}'",
        ]
        if self.endpoint:
            url = urlsplit(self.endpoint)
            parts += [
                f"ENDPOINT '{url.netloc}'",
                "URL_STYLE 'path'",
                f"USE_SSL {'true' if url.scheme == 'https' else 'false'}",
            ]
        return "CREATE OR REPLACE SECRET lakelet_s3 (" + ", ".join(parts) + ")"

    def filesystem(
        self, scheme: str, anonymous: bool = False, bucket: str | None = None
    ) -> pafs.FileSystem:
        """``anonymous`` (real-data brief R3): unsigned requests for a public bucket, in the
        region S3 reports for that bucket rather than the one the environment assumes
        (a wrong region is a 301 the SDK does not follow)."""
        if scheme == "file":
            return pafs.LocalFileSystem()
        if scheme != "s3":
            raise ValueError(f"unsupported scheme {scheme}://")
        kwargs: dict = {"region": self.region}
        if anonymous:
            kwargs["anonymous"] = True
            if bucket:
                kwargs["region"] = self.bucket_region(bucket)
        if self.endpoint:
            url = urlsplit(self.endpoint)
            kwargs["endpoint_override"] = url.netloc
            kwargs["scheme"] = url.scheme or "http"
        if not anonymous and self.access_key and self.secret_key:
            kwargs["access_key"] = self.access_key
            kwargs["secret_key"] = self.secret_key
        return pafs.S3FileSystem(**kwargs)

    def bucket_region(self, bucket: str) -> str:
        """The region a public bucket lives in, asked of S3 itself (an unsigned HEAD, once
        per bucket per process); a self-hosted store has no regions and answers with the
        configured one."""
        if self.endpoint:
            return self.region
        if bucket not in _REGIONS:
            try:
                _REGIONS[bucket] = pafs.resolve_s3_region(bucket)
            except OSError:
                _REGIONS[bucket] = self.region
        return _REGIONS[bucket]

    def anonymous_secret(self, bucket: str, region: str) -> str:
        """A DuckDB secret scoped to one public bucket with no key, so its requests go out
        unsigned; the longest matching scope wins over the project's default secret."""
        name = "lakelet_public_" + "".join(c if c.isalnum() else "_" for c in bucket)
        parts = [
            "TYPE s3",
            "PROVIDER config",
            f"SCOPE 's3://{bucket}'",
            f"REGION '{region}'",
        ]
        if self.endpoint:
            url = urlsplit(self.endpoint)
            parts += [
                f"ENDPOINT '{url.netloc}'",
                "URL_STYLE 'path'",
                f"USE_SSL {'true' if url.scheme == 'https' else 'false'}",
            ]
        return f"CREATE OR REPLACE SECRET {name} (" + ", ".join(parts) + ")"


PUBLIC_BUCKETS_FILE = "public-buckets.json"


def load_public_buckets(lakelet_dir: Path) -> dict[str, str]:
    """``{bucket: region}`` of the buckets this project reads anonymously (real-data brief
    R3), kept in ``.lakelet/public-buckets.json`` by ``tables attach --anonymous`` so the
    engine can create their secrets at every start."""
    path = lakelet_dir / PUBLIC_BUCKETS_FILE
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    return {str(k): str(v) for k, v in data.items()} if isinstance(data, dict) else {}


def save_public_bucket(lakelet_dir: Path, bucket: str, region: str) -> None:
    buckets = load_public_buckets(lakelet_dir)
    buckets[bucket] = region
    path = lakelet_dir / PUBLIC_BUCKETS_FILE
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(buckets, indent=2, sort_keys=True) + "\n")
    tmp.replace(path)


def split_uri(uri: str) -> tuple[str, str]:
    """``s3://bucket/a/b`` -> (``s3``, ``bucket/a/b``); ``file:///x`` -> (``file``, ``/x``)."""
    url = urlsplit(uri)
    if url.scheme == "file":
        return "file", url.path
    if url.scheme == "s3":
        return "s3", f"{url.netloc}{url.path}"
    if not url.scheme:
        return "file", uri
    raise ValueError(f"unsupported location {uri}")


def join_uri(scheme: str, path: str) -> str:
    return f"file://{path}" if scheme == "file" else f"{scheme}://{path}"
