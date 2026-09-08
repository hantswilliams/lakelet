# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Object storage settings and file systems (brief D36): the user's own AWS credentials
from the standard environment, never from lakelet.toml. AWS_ENDPOINT_URL points at a
self-hosted store; with no keys in the environment every client falls back to its default
credential chain."""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlsplit

import pyarrow.fs as pafs

LAKELET_PREFIX = "_lakelet"


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

    def filesystem(self, scheme: str) -> pafs.FileSystem:
        if scheme == "file":
            return pafs.LocalFileSystem()
        if scheme != "s3":
            raise ValueError(f"unsupported scheme {scheme}://")
        kwargs: dict = {"region": self.region}
        if self.endpoint:
            url = urlsplit(self.endpoint)
            kwargs["endpoint_override"] = url.netloc
            kwargs["scheme"] = url.scheme or "http"
        if self.access_key and self.secret_key:
            kwargs["access_key"] = self.access_key
            kwargs["secret_key"] = self.secret_key
        return pafs.S3FileSystem(**kwargs)


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
