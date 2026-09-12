# Lakelet — versions, save from the app, lineage (session 9, the rest; revision 1)

*September 12, 2026 · What the real-data round left of session 9 (`lakelet-build-sessions.md`): git commits on save (core brief D30), screen 9 of the mockups (a question's history, restore in one click), and table-level lineage (D32). Plus the one thing screen 9 presumes and the app does not have yet: saving a question from the query screen. Follows `real-data-plan.md`, `app-v0-plan.md` and `core-v0.5-plan.md`, which it does not change. Decisions G1 to G10 are for review; tick Agree or write the change under each. Nothing is built until they are decided.*

## 0. The idea in one paragraph

A saved question is already a dbt model on disk (D30): `models/questions/<slug>.sql` and its `schema.yml` entry with two checks. What is missing is the rest of the sentence the deck makes: *every save is a version, restore is one click, and a non-developer gets a versioned, tested dbt model without being told*. That is git, done for the user: `init` makes the project a repository, every save is a commit with a message a person would write, the app shows one question's history as a list of plain sentences (Simple) or as the log with the diff (Technical), and **Restore this version** is a commit too. Lineage is the other half of "what feeds what": from the dbt manifest and the catalog's views, which tables a model reads and which models read a table, at table level, on the table detail and the model detail and as `lakelet lineage`. The app also gets the button that starts all of it: **Save as question** on the query screen. Nothing here needs a network; `origin not set` is a line, not a problem.

---

## 1. Decisions for review (G1 to G10)

**G1. Git is done with a pure-Python library inside the core, not the `git` binary.**
*Recommend:* dulwich (1.2.x, Apache-2.0 or GPL-2.0 at the user's choice; about 1.3 MB; one dependency, `urllib3`, which the package already carries through pyiceberg's stack) as a runtime dependency of `lakelet`. Two reasons a binary will not do. A fresh Mac has no `git` until the Command Line Tools are installed, and the first call to `git` pops Apple's install dialogue, which is exactly the "being told" that Simple mode promises never happens; a partner's Ubuntu may lack it too. And the frozen sidecar (session 10) must not depend on what is on the machine. The core uses dulwich for everything it does (init, add, commit, log of one path, show a blob, checkout of one path); a user's own `git` on the same repository sees ordinary commits and can do everything else. *Not chosen:* `pygit2` (a compiled libgit2 binding, 5 MB per platform, and a build matrix we do not want); shelling out with a graceful "git not found" (the Simple user is exactly the one without it).
- [x] Agree
- [ ] Change:

**G2. `init` makes the folder a repository when it is not one already, and commits what it wrote; an existing repository is used as it is.**
*Recommend:* `lakelet init` on a folder with no `.git` runs the equivalent of `git init` (branch `main`) and commits the files it created (`lakelet.toml`, `AGENTS.md`, `dbt_project.yml`, `macros/`, `models/.gitkeep`, `.gitignore`) as "lakelet init". On a folder that is already a repository (a dbt project someone brought, a monorepo subfolder), `init` commits nothing and prints one line saying the project is inside an existing repository and saves will commit there. `.gitignore` already excludes `warehouse/`, `.lakelet/` and `.DS_Store` (D14), so no data, history or cache is ever committed. An existing project opened after this session (yours, the demo) gets the repository on its next save, not on open: opening a folder never writes to it.
- [x] Agree
- [ ] Change:

**G3. Every save is a commit of what the save wrote, with a message a person would write, authored by the person git already knows.**
*Recommend:* `question save` (the CLI, `POST /api/questions`, and the app's new button) stages `models/questions/<slug>.sql` and `models/questions/schema.yml` (and `macros/lakelet.sql` the first time, for the `returns_rows` test) and commits them with `save question: <title>` for a new one, `update question: <title>` for a changed one; an unchanged save commits nothing. The author is git's own configuration (`user.name` and `user.email` from `~/.gitconfig` or the repository's config, read by dulwich the way git reads them); when there is none, `<OS user name> <user@hostname>` is used and the version list says "as <name>; set your name with `git config --global user.name`" once, in Technical mode only. Nothing else is committed by a save: a user's other uncommitted changes in the repository are left as they are, never staged. *Not chosen:* `git add -A` (would sweep a developer's work in progress into Lakelet's commit).
- [x] Agree
- [ ] Change:

**G4. `lakelet run` records a version of the models it builds, so the history of a model built from an editor has entries too; a setting turns it off for people who keep their own git.**
*Recommend:* before dbt runs, `lakelet run` commits any modified or new files under `models/` (and `macros/`, `dbt_project.yml`) that dbt's manifest names, with the message `run: <model>, <model> changed` (or nothing when nothing changed). That is what makes screen 9's "Gauge then / Gauge now" possible for a model someone edits in VS Code: each run's version has the SQL it built. `[git] auto_commit = true` in `lakelet.toml` (settable, in the settings panel as "Record a version on every save and run") turns the run-time commit off; saves still commit, because a save with no version is the one thing the product promises not to do. A developer who wants neither uses `dbt run` through the profile, which Lakelet never commits for. *Not chosen:* committing at every file change (a watcher; noisy and surprising); never committing on run (a model edited by hand would have no history in the app, and the screen would only ever show questions).
- [x] Agree
- [ ] Change:

**G5. Versions are one path's history; restore writes the old content and commits it, never rewrites history.**
*Recommend:* `lakelet versions <question-or-model>` lists the commits that touched the model's `.sql` (and, marked, those that touched only its `schema.yml` entry): short id, when, author, message. `lakelet restore <name> <id>` writes that version's file content over the current one, re-derives the `schema.yml` entry when the file is a question (the title line is in the file), and commits `restore question: <title> to <short id>`; `git log` stays linear, nothing is reset. `GET /api/versions/{name}` returns the list with, per version, the diff against the version before (unified, the app draws it) and whether `schema.yml` changed in that commit ("checks changed" / "checks unchanged"); `POST /api/versions/{name}/restore {id}` does the restore and answers the new version. `GET /api/versions/{name}/{id}` returns that version's SQL. A model whose file is not in the repository at all (an existing dbt project with no commits yet, `auto_commit` off) gets an empty list and the sentence saying why.
- [x] Agree
- [ ] Change:

**G6. Screen 9 lives on the model's panel, in both modes; "Gauge then / now" is computed for plain-SQL questions and skipped for Jinja models in this round.**
*Recommend:* the Models screen's detail (step 6) gains a **Versions** section: Technical shows the log (id, when, author, message), the selected version's diff, "checks unchanged/changed", and **Restore this version** with its line `lakelet restore <name> <id>`; Simple shows the same versions as sentences ("Yesterday, 4:12 pm · you · Widened the window from 30 to 90 days" is the mockup's aspiration; what the app can say is the commit message, which is "update question: <title>" for a save from the app, and the diff's one-line summary, "1 line changed", for the rest) and **Restore this version** as the only button. "Gauge then" is the estimate of that version's SQL: a question is plain SQL and estimates directly; a model with `ref()` or `source()` needs a compile of an old file, which dbt does not offer without checking it out, so for those the row says "Gauge then: not measured for a model with refs" and "Gauge now" is the plan's verdict. The full screen of the mockup (a Branch line, "Connect GitHub", "Export project") is Day 1's team catalog; the panel says `git · main · origin not set` in Technical mode and nothing about git in Simple mode. *Not chosen:* a separate screen in the bar (a fourth tab for a list that belongs to one model).
- [x] Agree
- [ ] Change:

**G7. Save from the app: one button under the query, with the title the only thing asked; it appears in the Models screen at once.**
*Recommend:* the query screen gets **Save as question** (Simple: **Save this question**) beside Run, enabled once a statement has run Green or Yellow, or has been estimated; it asks for a title in a one-line box (the slug comes from the title as `question save` derives it; a title that exists offers "Replace it", the way import does), posts `/api/questions`, shows the two checks it wrote ("returns at least one row; `<first column>` is never empty") and the commit id, and the line `lakelet question save '<title>' '<sql>'`. The Models screen already lists `models/questions/*.sql` as models; the new one appears on the next plan with its description as the title. Saving from a Red statement is allowed (a question can be bigger than this machine; that is what burst is for) and says so. The app brief's ask box (session 7) will save through the same button.
- [x] Agree
- [ ] Change:

**G8. Lineage is table level, from the manifest and the catalog, in both directions, and needs no run to answer.**
*Recommend:* `lakelet lineage <name>` (a table, a view or a model) prints what it reads (upstream) and what reads it (downstream), one level each with `--depth N` for more, and how each edge is known: a dbt `ref()` or `source()` from the manifest (the last compile's `manifest.json` under `.lakelet/dbt/target/`, compiled first when absent or older than the models), a catalog view's SQL (the tables it binds to, through the engine, as the gauge already resolves for `_through_views`), or the `lakelet.dbt-model` property on a view. For a table: `built by <model>` and when, from history's model runs, or `imported` / `attached from <prefix>`. `GET /api/lineage/{name}` returns `{name, kind, upstream: [{name, kind, via}], downstream: [...], built_by, last_built}`. The app: the table detail gets "Reads from" and "Feeds" lines, each name a link that opens that detail; the model detail's "Refs" becomes the same two lines. The MCP `lineage` tool (session 5) will call the same function. Column-level lineage and OpenLineage stay Day 3 (spec F3.5). *Not chosen:* parsing SQL ourselves (the manifest and the binder already know).
- [x] Agree
- [ ] Change:

**G9. What is committed is small and never data; a project without git works exactly as before, one sentence poorer.**
*Recommend:* the commits contain model files, `schema.yml`, `macros/`, `dbt_project.yml`, `lakelet.toml` (from `init` only; `config set` does not commit) and `AGENTS.md` (from `init` only; its table block is refreshed on every import and would otherwise be a commit per import). Never `warehouse/`, `.lakelet/`, `history.db`, exports, or anything ignored. If dulwich cannot open or write the repository (a read-only folder, a corrupt `.git`, a repository with a checked-out branch that is not the working tree's), the save still writes the files and the response carries `git: <reason>`; the app shows it under the notice; nothing raises. `lakelet audit network` stays at zero: dulwich makes no network call unless asked to fetch or push, which nothing here does.
- [x] Agree
- [ ] Change:

**G10. Gates as before; the versions and lineage tests run against a real repository and a real dbt project.**
*Recommend:* pytest: `init` creates the repository and its first commit, an existing repository is left alone, a save commits with the title and the author, an unchanged save commits nothing, a second save is a second version, `versions` lists both with the diff, `restore` writes the old SQL and commits a third, `lakelet run` commits an edited model when `auto_commit` is on and not when off, lineage for a table, a view and a model with the `via` on every edge, and the API routes for all of it; `audit network` unchanged. Playwright, against the seventh sidecar (the dbt project) and a new eighth (a project with a question saved twice by the CLI in setup, so history has two versions before the page opens): save a question from the query screen and see it on the Models screen, open its versions, restore the first and see the SQL change and a third version appear, Simple mode's sentences and its one button, the lineage lines on the table detail and the model detail. Vitest for the diff rendering, the version sentences, and the save box. The docs: `/docs/questions` (versions, restore, the commits), `/docs/dbt` (auto-commit on run and the setting), `/docs/app` (the button, the Versions section, the lineage lines), `/docs/cli`, `/docs/api`, and a new short `/docs/lineage` or a section in `/docs/tables`.
- [x] Agree
- [ ] Change:

---

## 2. Scope

In: dulwich in the core with one small module (`lakelet/versions.py`: `Repo` open-or-init, `commit_paths`, `log_path`, `show`, `restore`); `init` and `question save` committing; `lakelet run` committing changed models under the setting; `lakelet versions`, `lakelet restore`, `lakelet lineage`; the three API routes and the lineage route; `[git] auto_commit`; the app's Save as question, the Versions section with the diff and Restore, the lineage lines; the eighth Playwright sidecar; the docs.

Out: push, pull, branches, remotes and "Connect GitHub" (Day 1, the team catalog); a text editor for models in the app (a model is edited in the user's editor; the app shows and restores); column-level lineage and OpenLineage (Day 3); the ask box's extra checks (session 7); Windows paths in dulwich (untested until session 10's Windows attempt).

---

## 3. Architecture notes

- One module owns git: `lakelet/versions.py`. `Questions.save`, `Project.init` and `dbt/runner.run` call `versions.commit(project, paths, message)`, which returns the commit id or a reason string and never raises past its boundary. The author comes from dulwich's `Repo.get_config_stack()`, which reads the same files git does.
- A version is identified by its full commit id; the CLI and the app show seven characters and accept any unambiguous prefix.
- `restore` for a question re-runs the schema entry derivation (the title is the file's first comment line, D30) so `schema.yml` matches the restored file; for a model it writes the file only.
- Lineage reads `manifest.json` from the last compile; `lakelet lineage` compiles when the manifest is missing or older than any file under `models/`, the way `run --plan` does, and says it did. A catalog view not from dbt gets its upstream from the engine's binder: `EXPLAIN` of `select * from <view>` names the tables, which the gauge's `_through_views` already does; that code is shared, not copied.
- The app's diff is rendered from the unified diff the API sends (a small renderer, no library); the SQL of a version is fetched when the row is selected.

---

## 4. Build order

| Step | Builds | Gate |
|---|---|---|
| 0 | dulwich in `pyproject`; `lakelet/versions.py`; `init` makes the repository and its first commit (G2); `question save` commits (G3); the author rule; `git:` in the save response (G9) | pytest: the repository, the first commit, a save's commit and author, an unchanged save, an existing repository untouched, a read-only folder's reason; `audit network` still zero |
| 1 | `lakelet versions`, `lakelet restore`, the three routes with the diff and "checks changed" (G5); `[git] auto_commit` and `lakelet run`'s commit (G4); `config set` and the settings panel row | pytest: two versions, the diff, restore as a third, run's commit on and off; the routes |
| 2 | Save as question on the query screen (G7): the title box, replace, the notice with the checks and the commit, the line | Playwright: save, see it on Models; Vitest for the box |
| 3 | The Versions section on the model detail, both modes, Restore (G6) | Playwright against the eighth sidecar: two versions listed, the diff, restore makes three and changes the SQL, Simple mode's sentences; Vitest for the diff renderer and the sentences |
| 4 | `lakelet lineage`, `GET /api/lineage/{name}` (G8); the lines on the table detail and the model detail | pytest: a table, a view, a model, `via` on every edge, depth; Playwright: the lines and the links |
| 5 | Docs, the log, `TASKS.md`, the CLI reference | recorded |

---

## 5. Toolchain

| | Version |
|---|---|
| dulwich | 1.2.x, a runtime dependency (`pyproject`, `uv.lock`); the licence notice in `NOTICE` names the Apache-2.0 choice |
| Everything else | as `real-data-plan.md` §5 |

---

## 6. Definition of done

- [ ] **Every save is a version.** A question saved from the CLI or the app is a commit with the title and the author; a second save is a second version; `git log` on the Mac shows them as ordinary commits.
- [ ] **Restore is one click.** On the Models screen, in either mode, a question's earlier version is restored with one button and the result is a new version, never a rewrite.
- [ ] **A non-developer gets a versioned, tested dbt model without being told.** From "Save this question" in Simple mode to a model with two checks and a history, with no git word on the screen.
- [ ] **A developer's git is respected.** An existing repository is used, nothing of theirs is swept into a commit, `auto_commit = false` stops the run-time commits, and a project without a repository still works.
- [ ] **Lineage answers at table level** for a table, a view and a model, on the CLI, the API and both details.
- [ ] **Tests green** on both CI runners; `audit network` zero.
- [ ] **You used it**: a question saved, changed and restored on your own project, and lineage on your own models.

---

## 7. Known unknowns

- dulwich's handling of a repository with `core.hooksPath`, signed-commit settings (`commit.gpgsign = true` in a developer's global config: dulwich does not sign, so the commit is unsigned; the version list should say so rather than fail) and `safe.directory`; step 0 tries a global config with `gpgsign` on.
- Whether a model edited outside and run with `auto_commit` on produces a message people want ("run: stg changed") or whether the diff's summary should be the message; step 3's Simple mode is where it shows.
- How the eighth sidecar's setup commits (the CLI in setup, as G10 says) behave on CI runners with no git identity: the fallback author must hold.
- The Windows attempt in session 10: dulwich on Windows paths is untested here.

---

## 8. What this changes in the other documents

| Document | Change |
|---|---|
| `build-sessions/lakelet-build-sessions.md` | Session 9's remaining line: this brief; lineage and versions with their decisions |
| `build-sessions/core-v0.5-plan.md` | D30's last sentence met (commits naming the author); D32 built; D15 gains dulwich |
| `build-sessions/ship-v0-plan.md` | S3's size expectation gains dulwich (about 1.3 MB); the frozen sidecar's hidden imports gain it |
| `docs/lakelet-day0-prd.md` | F0.4.5's "git-friendly" becomes "committed"; F0.9.2's lineage row met at table level |
| `web/src/content/docs/` | `questions.md`, `dbt.md`, `app.md`, `api.md`, `cli.md` updated; lineage documented in `tables.md` |
| `TASKS.md` | The order: this round (short), then ship; the Hants item: use it on your own project |
