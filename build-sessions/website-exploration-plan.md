# Website exploration — September 15, 2026

## Review decisions

- [x] User approved an isolated worktree on `codex/website-exploration`, based on a committed snapshot.
- [x] User approved three homepage concepts: product first, interactive data story, technical editorial.
- [x] User approved separate preview routes and a dedicated local preview port.
- [x] Describe available features and planned features separately. Keep the existing homepage while exploring.
- [x] User selected 02 / Data story on September 16, 2026. Full site continues in `website-story-v1-plan.md`. Branch publication was approved September 17; no merge or deployment.

## Scope and gate

Build `/explore`, `/explore/product`, `/explore/story`, and `/explore/editorial` in the existing Astro website. Page layout, typography and color are exploratory proposals, not product decisions. The product view uses the actual app UI with generated sample data. The interactive story explains the transfer-time term using the existing measured Overture scan sizes and labels its arithmetic as illustrative, not a full gauge or live benchmark.

Gate: production build passes; persistent pytest checks verify the four generated routes, base-aware local links, noindex and sitemap exclusion, available/planned wording, and complete assets. Browser checks cover desktop and mobile, the interactive controls, keyboard access, and console errors. Log results in this worktree only.

## Implementation order

1. Shared exploration layout and comparison page.
2. Three complete homepage concepts and app screenshot provenance.
3. Build, browser verification, session log and task lists.

## Gate results — September 16, 2026

- [x] Production Astro build: 24 pages generated.
- [x] Persistent pytest gate: 14 passed.
- [x] Desktop and 390-pixel mobile layouts inspected across all four routes.
- [x] Query choices, keyboard slider, and architecture disclosures verified.
- [x] No browser errors on inspected exploration pages.
- [x] Task lists and dated session log updated.
