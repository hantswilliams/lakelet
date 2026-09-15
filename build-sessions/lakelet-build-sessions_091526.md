# Lakelet — build session log, September 15, 2026

*Hants and Claude · Session 9, the rest (`versions-plan.md`): step 3, the Versions section on the
model detail, built in the container and awaiting the Mac. Before it, a reading of the four
articles Hants put in `research/`, recorded as `decisions-for-review_091526.md` (V1 to V4), none
of them built. Steps 4 and 5 are next.*

## 1. The research, and what it does and does not change

Four September articles: DataExpert's laptop-lakehouse piece, VeloDB on Doris 4.1 and Iceberg V3,
Ansari on DuckDB's single-writer model, and Gordon on Renart. None touches the thesis; the first
is the thesis written by someone else three weeks after the site went live. Two change what the
next steps should carry, and both are decisions rather than fixes, so they went into
`decisions-for-review_091526.md` and nothing was built for them:

- **V1, format-version 3.** Our `table` materialisation is `DELETE` then `INSERT` on every
  `lakelet run`, and new tables are V2 (pyiceberg's default in the catalog's
  `new_table_metadata`), so every run stacks a position-delete file that every read anti-joins.
  V3 collapses those into one deletion vector. The default does not change until a spike shows
  DuckDB, pyiceberg 0.12 and the gauge's manifest reader all agree on a V3 table with deletes.
- **V2, `tables compact`.** Nothing reclaims the current snapshot's fragmentation; `expire`
  reclaims history. The week of daily use is exactly the workload that grows the file list.
- **V3, model staleness.** Renart's fingerprint-and-"Build stale" is one field and one selector
  for us once step 4's lineage exists: the gauge's fingerprint already hashes SQL plus upstream
  snapshot ids, and history records what each run ran under.
- **V4, messaging.** One durability sentence (there is no database file to lose), Renart and
  Duckle named as comparables in the spec and deck (not on the site), the DataExpert figures
  kept out of everything until sourced, and `research/` gitignored with a tracked README
  carrying the links and takeaways — the PDFs are Medium articles in a public repository.

`research/README.md` has the table. Hants' call on V1 to V4; V1 first, since V2 depends on it.

## 2. Step 3: the Versions section on the model detail (G6)

**The core's one addition.** G6 says the panel reads `git · main · origin not set` in Technical
mode, and nothing served that. `versions.status(root)` answers `{repository, branch, origin}`
from the repository's `HEAD` and its config through dulwich, never raises, and `GET /api/git`
returns it. One test: the branch and the null origin on a fresh project, the URL once
`remote.origin.url` is set, the shape for a folder that is not a repository, and the route.

**The section (`components/Versions.tsx`).** Mounted at the foot of the model detail in
Technical mode and behind a **History** button on the card in Simple mode, so a card's history
is fetched only when asked for rather than once per card on open. It reads
`GET /versions/{name}` and selects the newest. Technical: the git line; a table of version,
when, who, what and `checks changed` / `checks unchanged` (and `SQL unchanged` on a row that
touched only the checks); the selected version's diff drawn from the unified diff the core
sends (`lib/versions.ts`: a parser into meta, hunk, context, added and removed lines, no
library; and a one-line summary, "1 line changed", "3 lines added"); **Gauge then / Gauge now**;
**Restore this version** with its line `lakelet restore <name> <id>`. Simple: the same versions
as sentences, "4 min ago · Ada Lovelace · Updated · 1 line changed", never an id and never the
word git; Then and Now as waits ("Ready in about 1 s."); the one button.

**What the sentences say, and why.** The brief is honest that the mockup's "Widened the window
from 30 to 90 days" is aspiration: the app knows the commit message and the diff. So Simple says
"Saved", "Updated · <summary>", "Updated the checks", "Restored an earlier version · <summary>"
for the messages Lakelet itself writes, and for anything else — a run's `run: stg changed`, a
commit made by hand in a terminal — the diff's summary alone, which is the one true thing the
app can say about a commit it did not write. That answers §7's second known unknown for the
Simple screen: the run's message is never shown there, so its wording matters only to
Technical mode and to `git log`, where "run: stg changed" reads fine.

**Gauge then.** A version's SQL is fetched when its row is selected and estimated through
`POST /estimate` when it contains no `{{`; a question always qualifies, and so does a
hand-written model that reads tables directly. A file with `ref()` or `source()` says "not
measured for a model with refs", as G6 asks, because estimating it would need dbt to compile a
file that is not checked out. Technical prints the gauge line the CLI prints, "Runs here · reads
2.0 MB", for both then and now — the first Playwright run failed on my expecting the plan's
verdict word there, which is the app's word, not the gauge's. Simple prints the wait sentence
the card already uses, so then and now read as the same kind of thing.

**Restore.** Posts the id, shows "Restored 1111111 as version 3333333." (Simple: "Restored the
version from 1 h ago."), re-reads the list with the new version selected, and re-plans the
Models screen through `load`, so the compiled SQL on the detail is the restored one. A restore
of the version the file already holds is the core's `unchanged` and says so rather than
committing. A `git:` reason from the core is shown after the notice, as the save box does.

**Gates.** `lib/versions.test.tsx`, 5 tests: the parser's kinds and stripped markers, the
summary's four shapes, the sentence in both modes with no id in Simple, the author's name
without the address, the git line's three states. `components/Versions.test.tsx`, 4 tests
against a stubbed core: the list newest first with the diff and the estimate of the selected
version's own SQL, selection moving the diff and the line; restore posting the id, the third
version selected, the plan re-read; Simple's sentences, waits and single button; a model with
refs not measured and a file with no history saying why. `tests/versions.spec.ts` against the
eighth sidecar: the seeded question's two versions, the diff between them, then and now
measured, the first version restored as a third, the plan compiling the old SQL again, then
Simple mode's History with three sentences and one button. `models.spec.ts` needed one
`.first()` where it asserted the detail's single `Copy as command`: the detail has two lines
now. `/docs/api` has the `/git` route; the rest of the docs are step 5's.

Container: Vitest **70** (was 61), Playwright **26** against eight sidecars, `tsc` clean, core
**206 passed, 10 skipped** (205 in one run with the TPC-H test failing for want of the `tpch`
extension, which the sandbox cannot download; copied in from its wheel, that test passed on its own). The container's two blockers of September 9 and 12 held and had the
same workarounds: the `dbt-core-experimental-parser` wheel fetched by hand with the proxy's CA
bundle and installed after `uv sync --no-install-package`, and the DuckDB extensions copied out
of the PyPI wheels.

## 3. A bug the Mac found: history's timestamps came back naive

`models.spec.ts` failed on the Mac and only there: after Run all, the DAG row said "just now"
(from the run report) but the detail's last run said "1 h ago" (from the plan, which reads
history). SQLite keeps no offset, so a `DateTime(timezone=True)` column written as UTC comes
back naive, `isoformat()` carries no `+00:00`, and a browser parses an offset-less ISO string as
local time — an hour out in London, exactly zero out in the UTC container, which is why the
container could never have caught it. Everything the app dates from history was affected: the
model's last run, a question's, and the Gauge screen's runs. `history.py` now has one `_utc`
that puts UTC back on every read path (`recent`, `all_runs`, `model_last_run`,
`question_last_run`); a test records a run and asserts all four come back aware with the
offset. Core in the container: **207 passed, 10 skipped**.

## 4. Still open

1. **Everything built today verified on the Mac**: `cd core && uv run pytest -q`, then in `app/`
   `npm test`, `npx tsc --noEmit`, `npm run e2e`. Step 3 is a screen; look at it in `npm run
   tauri dev` on a real project too — the diff's colours in both themes, and the Simple card
   with History open.
2. **V1 to V4** in `decisions-for-review_091526.md`.
3. G3's sentence for a fallback author ("as <name>; set your name with `git config --global
   user.name`", once, Technical only) is not shown: the version list carries the author string
   and not whether it was the fallback. A boolean on `Version` from `author()` would close it;
   a small core change, left for step 5 or Hants' call.
4. Step 4 (lineage) and step 5 (docs, the log, `TASKS.md`, the CLI reference; the README's
   "Start here" still points at `core-v0.N-plan.md` as the way to find the current brief, and
   at the real-data plan for the app, where `TASKS.md`'s "Now" is the truth).
5. Everything in `TASKS.md` that needs another machine, unchanged.
