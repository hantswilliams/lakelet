# Lakelet — build session log, September 17, 2026: versions step 5, the close

*Hants and Claude · `versions-plan.md` step 5: the docs, the log, `TASKS.md`, the CLI reference, and the brief's §8 amendments. The versions round is closed and session 9 with it; next is session 10, ship. Yesterday's log (`lakelet-build-sessions_091626.md`) has step 4 and V3.*

## 1. Step 4 on the Mac

Hants ran the suites on the Mac against step 4 as delivered yesterday — lineage, the per-model state, `lakelet run --stale`, what changed and the Review — and they passed; the screenshots of the Models screen along the way (the State column and the lines on the first look, the edited diff and the Review after) matched the container's. One layout fix came out of the first screenshot: the seventh column made the DAG wrap its cells, so the table now scrolls sideways in its half instead. The step's commit is Hants' (`git commit -s`), with this step's files in it or after it.

## 2. The docs

- `/docs/tables` gained **Lineage**: the verb with `--depth` and `--json`, a sample of its output, how each edge is known (`ref`, `source`, `sql`, `view`), what a name can be, the head line (built by whom and when), and that nothing here parses SQL. The app's lines are pointed at from there.
- `/docs/dbt` gained **Is it out of date?**: the four states as a table, `lakelet run --stale`, the app's Run what changed and Review, the JSON fields, and the paragraph on why the state compares times against the run's record rather than the estimate's fingerprint (yesterday's finding). The DAG sample shows the state column; the verb list has `--stale`.
- `/docs/app`: the Models screen paragraph rewritten for the State column, what changed under the state (the folded diff and its whole-SQL toggle, the commits, the blamed model as a link), Reads from / Feeds with the cross-screen links, Run what changed, the Review, and the "nothing ran" notice; the Simple paragraph gained the state sentences and Refresh what changed; the table and view details' lines noted.
- `/docs/api`: `GET /lineage/{name}` in the routes table with its body and errors; `/run/plan`'s row gained `sql_hash` on `last_run` and the five state fields with their meanings; `/run`'s body gained `stale` and its answer `selected`.
- `/docs` index: `lakelet run`'s row now names the state and `--stale`; a new row for `lakelet lineage`; the app's row names the state, the Review, the lines and the Versions section, and nine sidecars.
- `web/src/data/status.ts`: `lineage` moved from planned to built ("Lineage, and whether a model is out of date", linking `/docs/tables#lineage`), the app page's list updated, `asOf` 2026-09-17; `gen-readme-status.py` rewrote the README's block (the lineage line moved from the planned list to the built list) and `--check` is current. The CLI reference regenerated for `lineage` and `run --stale`. `astro build`: 21 pages.

## 3. The other documents (§8)

`core-v0.5-plan.md`: D15 gains dulwich as a runtime dependency; D32 marked built with where. `ship-v0-plan.md` S3's size expectation gains dulwich (about 1.3 MB) and its hidden imports. `docs/lakelet-day0-prd.md`: F0.4.5's "git-friendly" is "committed (every save is a version)"; the MCP tools' lineage sentence marked met at table level. `lakelet-build-sessions.md`: a September 17 amendment closing the round and naming session 10 next; session 9's line says where lineage lives and that V3 came with it. `versions-plan.md` §6: five of seven ticked with the test that shows each; "tests green on both CI runners" waits for the push; "you used it" is Hants'. `CLAUDE.md`'s "today it is" and `TASKS.md`'s head now name `ship-v0-plan.md`.

## 4. TASKS.md

"Now" says the round is closed and ship is next; step 4's row is Mac green, step 5's is built; the gates line is 2026-09-17; "Next, in order" strikes session 9 through with what its §6 still wants; the map's row 9 is done and row 10 next; two Done entries (the 16th and today).

## 5. Left open, on purpose

- The outsider's clone-to-a-saved-question run and Hants' own use of versions and lineage on his project (`versions-plan.md` §6, last two items).
- `decisions-for-review_091526.md` V1, V2, V4.
- The open items in `TASKS.md`: `lakelet run <selector>` echoing compiled SQL; the grid's column widths; the `sql` copy line's quoting; `describe` on an attached table listing the prefix every call; G3's fallback-author sentence.
- The container's delivery lesson from yesterday, for the next session's Claude: a file re-sent to the same staged path can land as the previous upload; stage every delivery under a fresh folder and check the checksum on both sides.

## 6. Next

Session 10, `ship-v0-plan.md`, from step 0 (the freeze), once Hants says go. Its known unknowns and its §6 measurements need the Mac and a clean machine; the brief's S1 to S14 were accepted September 11 and nothing since changes them except S3's size expectation (above).

---

## Separate website worktree session

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
