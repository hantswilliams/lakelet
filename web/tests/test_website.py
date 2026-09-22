# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Full-site gate against production HTML. Run npm run build first."""

from collections import Counter
import os
from urllib.parse import urlsplit

import pytest

from test_exploration import BASE, DIST, Page, built_file

MARKETING = ["index", "app", "how-it-runs", "medallion", "agents", "pricing"]
DOCS = ["docs"] + [f"docs/{p.stem}" for p in (DIST.parent / "src/content/docs").glob("*.md") if p.stem != "index"]
ROUTES = MARKETING + DOCS
NAV = ["app", "how-it-runs", "medallion", "agents", "pricing", "docs"]


@pytest.mark.parametrize("route", ROUTES)
def test_every_page_has_landmarks_navigation_and_metadata(route):
    file = DIST / f"{route}.html"
    assert file.is_file(), "Build the website first"
    page = Page(file)
    assert len(page.elements("h1")) == 1
    assert len(page.elements("main")) == 1
    assert page.elements("main")[0]["id"] == "main"
    assert page.elements("html")[0]["lang"] == "en"
    assert any(a.get("href") == "#main" for a in page.elements("a"))
    assert any(m.get("name") == "description" and m.get("content") for m in page.elements("meta"))
    assert any(a.get("rel") == "canonical" for a in page.elements("link"))
    assert not any(m.get("name") == "robots" and "noindex" in m.get("content", "") for m in page.elements("meta"))
    for nav in NAV:
        assert any(a.get("href") == f"{BASE}/{nav}" for a in page.elements("a"))
    assert any(a.get("href") == f"{BASE}/docs/install" for a in page.elements("a"))
    assert any(n.get("aria-label") == "Mobile navigation" for n in page.elements("nav"))
    ids = Counter(a["id"] for _, a in page.tags if "id" in a)
    assert all(count == 1 for count in ids.values()), ids


@pytest.mark.parametrize("route", ROUTES)
def test_every_local_link_fragment_and_asset_resolves(route):
    page = Page(DIST / f"{route}.html")
    for tag, attrs in page.tags:
        value = attrs.get("href") if tag in {"a", "link"} else attrs.get("src")
        if not value:
            continue
        parsed = urlsplit(value)
        if parsed.scheme or parsed.netloc:
            continue
        if parsed.path:
            assert parsed.path.startswith(f"{BASE}/"), (route, value)
            target = built_file(parsed.path)
        else:
            target = DIST / f"{route}.html"
        assert target.is_file(), (route, value)
        if parsed.fragment:
            assert parsed.fragment in [a.get("id") for _, a in Page(target).tags], (route, value)


def text(route):
    return " ".join(Page(DIST / f"{route}.html").text)


def test_how_it_runs_retains_the_transfer_story_and_limits():
    for route in ["how-it-runs"]:
        page = Page(DIST / f"{route}.html")
        assert len([i for i in page.elements("input") if i.get("type") == "radio"]) == 2
        assert any(i.get("type") == "range" for i in page.elements("input"))
        assert any(a.get("aria-live") == "polite" for _, a in page.tags)
        assert page.elements("script"), "Client controls must be bundled"
        assert "transfer time only" in text(route)
        assert "not a live query" in text(route)
    for phrase in ["Runs here", "Runs here, slowly", "Needs more machine", "Not estimated"]:
        assert phrase in text("how-it-runs")


def test_unavailable_features_and_proposed_prices_are_explicit():
    assert "Not available yet" in text("index")
    assert "Not available yet" in text("pricing")
    assert "Proposed pricing" in text("pricing")
    assert "MCP / Planned, not available yet" in text("agents")
    assert "Scheduled later" in text("medallion")
    for route in MARKETING:
        assert "brew install lakelet" not in text(route)
        assert "Developer preview" in text(route)


def test_signup_has_a_real_endpoint_or_a_useful_fallback():
    page = Page(DIST / "pricing.html")
    forms = [a for a in page.elements("form") if "data-waitlist" in a]
    if os.environ.get("PUBLIC_WAITLIST_URL"):
        assert len(forms) == 1
        assert forms[0]["action"] == os.environ["PUBLIC_WAITLIST_URL"]
        assert any(i.get("type") == "email" and "required" in i for i in page.elements("input"))
    else:
        assert not forms, "Do not collect an email with nowhere to send it"
        assert "Follow on GitHub" in text("pricing")


def test_screenshot_and_recovery_documentation_are_present():
    for route in ["index", "app"]:
        page = Page(DIST / f"{route}.html")
        capture = next(i for i in page.elements("img") if "screenshots/workspace.png" in i["src"])
        assert "generated" in capture["alt"]
        assert "browser test harness" in text(route)
        assert built_file(capture["src"]).stat().st_size > 10000
    # the /app gallery and the app guide show every screen, from the same captures, under the base path
    gallery = [i["src"] for i in Page(DIST / "app.html").elements("img") if "/screenshots/" in i["src"]]
    assert len(gallery) == 5 and all(src.startswith(f"{BASE}/screenshots/") for src in gallery)
    guide = [i["src"] for i in Page(DIST / "docs" / "app.html").elements("img") if "/screenshots/" in i["src"]]
    assert len(guide) == 10 and all(src.startswith(f"{BASE}/screenshots/") for src in guide)
    for src in set(gallery + guide):
        assert built_file(src).stat().st_size > 10000, src
    assert "project folder" in text("docs/recovery")
    assert "Not estimated" in text("docs/gauge")
    assert any(a.get("href") == f"{BASE}/docs/recovery" for a in Page(DIST / "docs.html").elements("a"))


def test_home_data_flow_is_labeled_and_distinguishes_planned_paths():
    page = Page(DIST / "index.html")
    figure = next(a for a in page.elements("figure") if a.get("aria-describedby") == "data-flow-caption")
    assert figure.get("aria-labelledby") == "data-flow-title"
    ids = {a.get("id") for _, a in page.tags}
    assert {"data-flow", "data-flow-title", "data-flow-caption"} <= ids
    content = text("index")
    for phrase in ["Your laptop", "Your S3 bucket", "Remote compute", "Iceberg REST catalog",
                   "Read existing Parquet in place", "Same prefix, same files",
                   "metadata stays on your laptop by default", "publish a local table",
                   "every snapshot kept", "The catalog stays local",
                   "Remote compute and a shared catalog are planned"]:
        assert phrase in content
    assert any(a.get("aria-label") == "Read S3 data on your laptop and publish local tables to S3 today."
               for _, a in page.tags)


def test_merged_features_are_available_and_documented():
    for route in ["index", "app"]:
        content = text(route)
        for feature in ["A warehouse in a bucket", "Lineage, and whether a model is out of date",
                        "What happened: the changes feed"]:
            assert feature in content
        assert "Table publishing and remote compute are planned" not in content
    assert "lineage interface are planned" not in text("medallion")
    for command in ["lakelet tables publish", "lakelet lineage", "lakelet changes", "--warehouse"]:
        assert command in text("docs/cli")
    for endpoint in ["POST /tables/{name}/publish", "GET /lineage", "GET /changes"]:
        assert endpoint in text("docs/api")
    assert any(a.get("href") == f"{BASE}/docs/tables#publishing-a-table-into-a-bucket"
               for a in Page(DIST / "index.html").elements("a"))
