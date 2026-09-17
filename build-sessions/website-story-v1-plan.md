# Data-story website — September 16, 2026

## Review decisions

- [x] User selected concept 02: dark background and light-green accents.
- [x] User requested a complete website in this style, kept in the separate branch and worktree.
- [x] Implementation scope: existing marketing routes and all developer documentation; navigation, responsive layouts, real app image, the interactive data story, and working source-installation paths.
- [x] Preserve original concept routes for comparison. Branch publication approved September 17, 2026; no merge or deployment.
- [x] Reconcile website facts and docs with committed trust-round changes at `3c60296`, without copying other work or modifying core/app code.
- [x] Retain signup support when an endpoint is configured; otherwise offer the repository directly. Planned paid products stay labeled as plans, with no checkout or invented availability.

## Diagram follow-up — approved September 16, 2026

- [x] User requested the original homepage laptop / S3 / worker / catalog diagram in the selected dark/lime style.
- [x] Restore it on the homepage; show S3 reads today and clearly label table publishing, shared orchestration, and cloud workers as planned.
- [x] Use responsive HTML and decorative SVG icons so labels remain readable on phones.
- [x] Gate: production build, 61 persistent checks, desktop/mobile visual review, and session log complete.

## Copy follow-up — approved September 16, 2026

- [x] User selected “Your data, near or far. Know what fits.” with the local-files/S3 explanation and “Built on DuckDB, Apache Iceberg, and dbt Core.”
- [x] User selected Lakelet Lookahead as the provisional name for the query gauge on the temporary site.
- [x] Scope: homepage hero, interactive gauge introduction, related marketing copy and gauge-guide introduction. Existing CLI/API names and app screen labels still describe the running software.
- [x] Gate: production build (25 pages), all 61 existing checks, desktop/mobile visual review, and session/task records complete.

## Interactive Lookahead follow-up — approved September 16, 2026

- [x] User selected question → local or S3 → visible work and verdict, combining the scenario selector and data-flow diagram.
- [x] Prototype on the homepage in this isolated worktree. Retain the prior Overture demonstration on the explanation and original concept routes for comparison.
- [x] Use three illustrative workloads and one explicit example laptop. Derive six estimates from the existing core model; identify synthetic inputs and avoid benchmark or live-query claims. No core behavior changes.
- [x] Gate: 65 checks pass, production build succeeds, all six states and keyboard controls verified, layouts reviewed at 360–1440px, no animation required, and session/task records complete.

## Storage and compute follow-up — approved September 17, 2026

- [x] User requested the storage/catalog/compute diagram before the interactive Lookahead demo.
- [x] Rename the section “Open storage & compute” and the planned execution node “Remote compute”. Keep “One open format.” about the shared Iceberg tables; choose no Lambda/EC2/container backend.
- [x] Align section numbering and the hero scroll cue with the new page order. Retain explicit planned publishing, remote execution, and shared catalog labels.
- [x] Gate: 25-page production build, 65 website checks, desktop/mobile layout and diagram-to-Lookahead link verified; dated session log and task lists complete.

## Branch publication — approved September 17, 2026

- [x] User explicitly requested pushing this website branch to the existing GitHub remote.
- [x] Package the completed website and planning records in a DCO-signed commit; use the configured email and established author name for this commit only.
- [x] Publish `codex/website-exploration` as a separate branch of `hantswilliams/lakelet`; integration and deployment remain separate work.

## Gate

Production build and persistent pytest checks pass for all pages, base-aware links/assets,
page landmarks, navigation, availability, fourth verdict, docs, and signup fallback.
Browser checks cover desktop and mobile, data-story inputs, navigation and disclosures.
Record results in this branch’s session log and task lists. Visual choices are a reviewable
implementation of the selected concept; no product capabilities are being decided here.

## Gate results

- [x] Astro production build: 25 pages.
- [x] Default `/lakelet/` build: 60 pytest checks passed.
- [x] Root-domain `/` build with a non-routable test signup URL: 60 passed; no submission made.
- [x] Default build restored, final 60 checks passed after the documentation style fixes.
- [x] All 25 local HTML routes returned HTTP 200.
- [x] Desktop and 390px/360px layout checks: no horizontal overflow on inspected routes.
- [x] Browser: query choices and keyboard slider, mobile menu, documentation navigation,
  disclosures, actual image loading, and console checks passed.
- [x] Session log and both task lists updated in the separate worktree.
- [ ] User review before integration or deployment.
