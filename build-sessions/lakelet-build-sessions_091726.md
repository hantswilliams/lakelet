# Website storage and compute — September 17, 2026

## Scope

User requested “Open storage & compute”, asked whether “One open format” remains
valid with Lambda/EC2 or another remote compute backend, and explicitly confirmed
moving the diagram above the interactive Lookahead demo. Work stays in the separate
`codex/website-exploration` branch/worktree. No compute backend was selected.

## Changes

- Moved the diagram immediately after the homepage hero, before Lookahead.
- Numbered storage/compute 01, Lookahead 02, the idea 03, workspace 04, and files 05.
- Updated the hero scroll cue to the diagram and added a diagram-to-Lookahead link.
- Renamed the planned node “Remote compute”, with generic on-demand execution
  wording and the same Iceberg tables. Removed worker-lifecycle-specific wording.
- Preserved “One open format.” and all planned publishing/execution/catalog notices.
  The statement describes the tables, not the runtime provider. Compatible engine,
  storage and catalog access are still required for a future remote implementation.

## Verification

- Astro production build: **25 pages**, successful. The existing expected warning
  for the unconfigured preview signup endpoint remains.
- **65 pytest checks passed**, including the existing diagram availability/label
  gate updated for the new generic terminology. `git diff --check` passed.
- Browser verified section order, desktop 1440px and phone 390px layout, no horizontal
  document or node overflow, and the diagram-to-Lookahead anchor link.
- Consulted official Apache Iceberg and AWS Lambda/EC2 documentation to confirm the
  format/runtime distinction. No provider capability claim was added to the site.

Changes remain local and uncommitted. No main-checkout, core or desktop-app changes.
Preview: http://127.0.0.1:4328/lakelet/?preview=storage-compute#data-flow


## Follow-up: publish the website branch

The user explicitly requested pushing `codex/website-exploration` to the existing
GitHub repository. This supersedes the initial local-only restriction for branch
publication. The commit packages the selected website, comparison concepts, actual
app screenshot with generated data and provenance, Lookahead prototype, documentation,
65 persistent website checks, and planning/session records.

Pre-publication review confirmed all pending changes are within `web/` or the scoped
`build-sessions/` records. Origin is `https://github.com/hantswilliams/lakelet.git`;
no remote branch of this name existed when checked. The latest unchanged website
build produced 25 pages and all 65 checks passed. The Pages deployment workflow is
restricted to pushes on main. The branch will be pushed normally with upstream
tracking; no merge, rebase, force push, or deployment is part of this request.

Git has the existing author email configured but no name. The signed-off commit uses
“Hants”, matching the recent commits with that same email, through a per-command
setting. No shared or global Git identity configuration is changed.
