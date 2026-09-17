# Website exploration — September 16, 2026

## Scope and isolation

User approved the website exploration proposed in conversation: a separate worktree,
three visual directions, and a local comparison preview. Branch
`codex/website-exploration` starts at `97ee6aa` in the sibling directory
`/Users/hants/Development/Python/lakelet-website-exploration`.
The original checkout is used by concurrent work. This session changes only this
worktree’s website and planning records. No merge, push, or deployment was performed.

## Built

- `/explore`: comparison page, with persistent navigation between the concepts.
- `/explore/product`: cream/teal product introduction, real app screenshot, workflow.
- `/explore/story`: dark/lime data story. Recorded Overture scan sizes drive a query
  selector, scan visualization, and connection-speed slider. The estimate is explicitly
  transfer time only, not the full gauge or a benchmark of the visitor’s machine.
- `/explore/editorial`: paper/ink/cobalt typography, architecture diagram, native
  expandable explanations, and documentation links.
- Shared availability section reads existing `src/data/status.ts`; developer preview,
  source installation, supported platforms, and planned features remain explicit.
- Dedicated layout/CSS, skip link, labeled native controls, reduced-motion support,
  noindex metadata, and sitemap exclusion for all exploration routes.

The screenshot is the actual React application in its browser test harness, backed
by the Python sidecar with generated shop orders. It is not a native Tauri capture.
`web/public/exploration/README.md` records provenance. No generated CSV/project data
or credentials were added to the repository. Existing dependencies were copied into
this worktree as independent ignored directories; no dependency versions changed.

## Verification

- `npm run build`: 24 pages built successfully.
- Existing core Python environment, `python -B -m pytest tests/test_exploration.py
  -p no:cacheprovider` from `web/`: **14 passed**. Checks cover generated routes,
  base-path links and fragments, assets, availability wording, native controls,
  noindex, and sitemap exclusion.
- Browser: desktop and 390-pixel mobile views of all four exploration routes;
  no horizontal overflow or missing images. Product screenshot loaded correctly.
- Interactive story: full-table transfer at 111 Mbps gives 26.3 minutes / Red;
  keyboard End sets 1,000 Mbps and gives 2.9 minutes / Yellow; the grouped query
  at 1,000 Mbps gives 2 seconds / Green. Architecture details expand correctly.
- Browser console: no errors or warnings on the inspected exploration pages.

The build prints the existing missing `PUBLIC_WAITLIST_URL` warning in this isolated
checkout. The exploration pages link to source-installation docs and contain no
waitlist forms. Core/app test suites were not run because their code was not changed.

## Review and next work

Preview instructions are in `web/README.md`. The comparison preview uses port 4328.
Choose a direction (or a combination) before integrating into existing marketing
routes. The open review item lives in both task lists and the exploration plan.


## Follow-up: complete data-story website

The user chose concept 02 and requested a complete site in its dark background and
light-green style, retaining branch/worktree isolation. The implementation remains
on `codex/website-exploration` in the sibling worktree. Original comparison routes
remain available. The scope and accepted direction are in `website-story-v1-plan.md`.

### What changed

- Rebuilt the homepage, app, how-it-runs, workflow (`/medallion`), agents, and pricing
  routes around the selected visual direction. Restyled all developer documentation.
- Shared dark-theme navigation and footer, native mobile menu, mobile documentation
  disclosures, accessible skip link, source-installation calls to action, and
  responsive typography, diagrams, lists, and pricing cards.
- Extracted the original interactive experiment into `DataStory.astro`; the homepage,
  how-it-runs page, and original concept now share one implementation.
- Reused the actual app image with provenance. It shows the light appearance of the
  app; the page states that the app also supports dark appearance.
- Imported only the committed website documentation and status changes from `3c60296`.
  The fourth verdict and recovery guidance appear in the design. Main advanced to
  `99e91ba` during the session (a README screenshot commit, with no further web changes).
  Core/app source in this worktree was not changed or merged from main.
- Team/Burst prices still come from existing pricing data, explicitly labeled proposed
  and unavailable. Current Local capabilities are stated separately. Removed the old
  unqualified marketing claims and vendor comparisons from the rendered pricing page.
- Kept configured signup support. With no endpoint, the page offers a GitHub follow
  link without collecting an email. Updated `llms.txt` to match actual availability.

### Verification

- `npm run build`: **25 pages**, successful.
- `python -B -m pytest tests -p no:cacheprovider` with the existing core environment:
  **60 passed**. Includes the original 14 exploration gates and 46 full-site checks.
- Rebuilt at `SITE_BASE=/` with `PUBLIC_WAITLIST_URL=https://example.invalid/website-test-signup`:
  **60 passed** for base-path and configured form markup. No email or form was sent.
  Restored the normal `/lakelet/` build and verified **60 passed** after final CSS fixes.
- All 25 HTML routes returned HTTP 200 from the preview at port 4328.
- Browser: desktop 1440px, mobile 390px and 360px; no horizontal overflow on the six
  marketing routes and representative documentation pages. Documentation tables and
  code retain their own scroll areas. The app image loaded at its full natural size.
- Shared experiment: full scan at 111 Mbps -> 26.3 minutes; keyboard End -> 1,000 Mbps
  and 2.9 minutes; grouped query -> 2 seconds. All three verdict colors update.
- Native mobile menu opened the app page; documentation disclosure opened and linked
  to the gauge guide. Gauge explanations and pricing FAQ expand correctly.
- No browser errors/warnings on inspected final pages. `git diff --check` passed.
- Visual review found old documentation styles conflicting with the new layout;
  removed the obsolete scoped rules and fixed heading line spacing, then rebuilt.
- Initial content-cache duplicate-id warnings disappeared when the config-variant build
  refreshed Astro's content store. The expected missing-waitlist warning remains in
  the default local build, where the UI correctly shows the GitHub fallback.

### Handoff

Full site: `http://127.0.0.1:4328/lakelet/`. Original concepts: `/lakelet/explore`.
The preview server remains running. Changes are local and uncommitted. No push, merge,
or deployment. User review is the next task; no main-checkout files were edited here.


## Follow-up: restore the laptop / S3 diagram

User asked to retain the original homepage architecture diagram and approved restoring
it in the selected dark/lime style. Added `DataFlow.astro` on the homepage before the
app screenshot, at `/#data-flow`. It keeps the laptop, S3 bucket, worker, and catalog
relationship, with decorative SVG icons and HTML labels that stack on phones.

Solid/lime reads point from S3 to the laptop. Publishing and worker read/write paths
are visibly labeled planned; the worker has a dashed outline. The caption explains
that attached Parquet is read in place and Iceberg metadata remains local by default,
with optional metadata writes. It does not imply that table publishing or bursting
is shipped. Links lead to the existing remote-storage and catalog documentation.

Verification: Astro builds 25 pages; **61 pytest checks passed**, including a new
persistent check for the diagram's accessible name, description, nodes, and planned
path wording. Browser checked at 1440px desktop, 900px tablet, and 390px phone widths;
no horizontal overflow, arrows rotate with the stacked mobile flow, and no browser
warnings/errors. No dependencies, core/app code, or main-checkout files changed.
Changes remain local and uncommitted on `codex/website-exploration`.


## Follow-up: homepage copy and Lakelet Lookahead

User approved “Your data, near or far. Know what fits.”, the local-files/S3
explanation, the DuckDB / Apache Iceberg / dbt Core supporting line, and the
provisional feature name Lakelet Lookahead for the temporary website.

Updated the homepage hero and metadata, moved the foundations wording beneath the
introductory copy, and introduced Lookahead through the scroll link and shared
interactive demo. The explanation page, app marketing copy, current-status label,
and gauge-guide introduction use the name. Existing CLI/API names and actual app
screen labels are preserved. No trademark registration or availability claim added.

Visual review kept the desktop headline on two lines. Responsive sizing and a
phrase wrapper keep “near or far” and “Know what fits.” intact on narrow phones.
The supporting line stays quieter than the main explanation.

Verification: production build succeeded with 25 pages; all **61 existing pytest
checks passed**; `git diff --check` passed. Browser review covered the homepage at
1440px desktop and 390px/360px phones, with no horizontal overflow; the Lookahead
guide and explanation page also fit at 360px. The homepage scroll link opens the
demo, and selecting all columns gives 26.3 minutes / Needs more machine at 111 Mbps.
The expected local missing-waitlist-endpoint warning remains; no signup was sent.

All changes remain local and uncommitted in the separate website worktree on
`codex/website-exploration`. The preview remains at http://127.0.0.1:4328/lakelet/.


## Follow-up: question → local or S3 → Lookahead

User selected the scenario picker combined with a data-flow diagram. Implemented a
homepage-only prototype in `LookaheadDemo.astro`, preserving the earlier Overture
transfer example on the explanation and original concept routes.

The controls select Sales by region, Orders + customers, or Full order history,
then local files or S3. The diagram updates its storage icon, read volume, link speed,
selected columns and SQL. The gauge shows the verdict, bytes, peak memory, expected
time, a memory-limit bar, disk spill when needed, and a reason. A Red example explains
the refusal and explicit override. A compact result immediately below the controls
keeps the feedback visible on small screens; the full reasoning follows below.

### Provenance

The six numbers are generated by the existing core `estimate_plan` function from
synthetic plans/table statistics and an explicit example laptop: 16 GB RAM, 12 GB query
limit, eight threads, 100 GB free disk, 1,500 MB/s local reads and 100 Mbps S3 reads.
These are illustrative model outputs, not captured EXPLAIN plans, measured query runs,
or estimates for the visitor's actual computer. That distinction is stated on the
page and expanded in the assumptions disclosure. No core/app source was changed,
no cloud execution is implied, and the page makes no dataset requests.

### Verification

- Initial gate: 2 passed, 2 failed as expected before the generated constants and
  new homepage markup existed. Final production build: 25 pages, successful.
- All **65 pytest checks passed** (four new scenario/provenance/control checks).
  The generated source matches the core model; storage location leaves query bytes,
  memory and spill unchanged, while changing I/O time. `git diff --check` passed.
- Browser, all six combinations: summary local ~1 sec / Green, S3 ~1.6 min / Yellow;
  join local ~2 sec / Green, S3 ~4.3 min / Yellow; sort local ~1.3 min / Yellow,
  S3 ~33.1 min / Red. Sort reports 60.1 GB peak and 48.1 GB temporary disk space.
- Verified changing source icons, 2/3/12 highlighted order columns, SQL, reasons,
  memory readouts, refusal note, and the compact mobile result.
- Keyboard Left changes native question/storage radios and refreshes the estimate.
  The assumptions disclosure opens; a polite atomic live region describes updates.
- Visual/layout review at 360, 390, 768, 1024 and 1440px: no document overflow.
  Motion is not required; the diagram/needle updates without animation. Browser
  logs showed no errors or warnings. The expected build warning for an unconfigured
  local signup endpoint remains.

All work remains local/uncommitted on `codex/website-exploration` in the sibling
website worktree. Preview: http://127.0.0.1:4328/lakelet/?preview=lookahead#experiment.
