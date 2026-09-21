# Lakelet — decisions for review, September 20, 2026

*From `hants_ideas.md` (repository root), written by Hants after the W/L batch and the website merge: how a project is created from the app, whether Lakelet should provision what a remote project needs, how the app's screens are arranged, whether the app follows the site's colours — and, added in conversation, the app's icon. Six items. None belongs to a brief; the first two shape the team tier and the ship brief, the last four are the app. Each has a recommendation, what was not chosen, and its gate; tick Agree or write the change. Nothing is built until it is decided.*

---

## What exists today, so the questions start from the facts

**Creating a project.** A window with no project shows the welcome screen (**Open a folder…**, the recent ten, and since today an **Advanced** box for an `s3://bucket/prefix`); a window with a project has **Open…** in the bar (the recent projects, **Other folder…**, and since today **New folder, tables in a bucket…**). Both paths run `lakelet init <folder> [--warehouse s3://…]`. The welcome screen is only ever seen on a machine with no recent project, so in practice the menu is the way in. There is no "New project" as such: a folder is chosen and, if it is not a project, becomes one.

**Local and remote.** What can be remote today is the tables' files: an `s3://` warehouse at `init` (W1), or one table moved later with `tables publish` (W2). The catalog is always `.lakelet/catalog.db` in the folder, the engine is always this machine's DuckDB, and the credentials are always the AWS chain in the environment. A hosted catalog (Postgres, the Team tier), burst workers (session 8) and credential vending are in the architecture doc and the PRD and are not built. Nothing in Lakelet creates a bucket, an IAM policy or a database anywhere.

**The screens.** One top bar: the wordmark, the project, the status dot, **Open…**, five screen tabs (Tables, Models, Lineage, Changes, Gauge), the Simple/Technical switch, the theme switch, **Settings**. The Tables screen is one column, top to bottom: five health tiles, the SQL editor with the verdict, the result grid, then the tables panel with the drop zone; a table's detail opens in the panel. `web/src/styles/tokens.css` is shared by the site and the app (the app's `app.css` is "the shell's own layout on top of the shared tokens"): the "lake" blue, the fish orange, the three verdict colours, Manrope and JetBrains Mono. The website branch merged on the 18th did not change the tokens; it layered a dark palette (`--paper #101f24`, lime accent `#d6ee83`) over the marketing pages and the docs under a `.website` class, renamed the gauge **Lakelet Lookahead** on the site and in the README, and left the app as it was. The app's icon is the step-0 placeholder: a flat blue square with an orange disc, in every size Tauri needs; the site's wordmark since the 18th is a wave-and-fish mark in `Wordmark.astro`. The ship brief (`ship-v0-plan.md` §3, "In session 10") already lists "real icons" for the installers.

---

**P1. A "New project" flow in the app, on the welcome screen and in Open…, with two honest choices: tables in the folder, or tables in a bucket you own.**

*Recommend:* one dialog, reached from **New project…** on the welcome screen and in **Open…**, replacing today's Advanced box and the bucket menu item: a folder (the dialog, or a name under a default parent), and a choice — **In this folder** (the default; `warehouse = "./warehouse"`) or **In a bucket** with the `s3://bucket/prefix` field, a credential check before the folder is made (the drop zone's existing "no credentials" line, and a one-object write-and-delete under the prefix so the first import is not the first failure), and the `lakelet init … --warehouse …` line beside the button. The words are "in this folder" and "in a bucket", not "local" and "remote": with a bucket warehouse the catalog and the engine are still here, and saying "fully remote" would promise the team catalog and burst before they exist. When those exist the same dialog gains a third choice.

*Not chosen:* a wizard with more steps (a project is a folder and one setting); creating the bucket from the dialog (P2 decides whether Lakelet ever does that); a "fully remote" choice now (nothing behind it).

*Gates:* `cargo test` (the shell's command with the credential check against Moto), Vitest for the dialog, Playwright on the tenth sidecar; `/docs/app`.

- [x] Agree
- [ ] Change:

---

**P2. Lakelet hosts the catalog and never the data: the Team tier is a hosted Iceberg REST catalog with credential vending, the bucket stays the customer's, and the app makes bringing a bucket painless. Lakelet does not provision resources in a customer's cloud account.**

*Why it comes up:* Hants' question is the Supabase one — did they own the database or host it for you — and the answer is that Supabase hosted it and the dashboard was the product; nobody was asked to bring a Postgres. The tempting equivalent is Lakelet hosting the bucket. The architecture doc (§3.3, "bring your own bucket") and every pitch line since ("your bucket, open format, open catalog, no lock-in") say the opposite, and that contrast with MotherDuck is the product's reason to exist. So the question is what Lakelet *does* host, and how much of the customer's cloud it touches.

*Recommend:* three things, in order. First, **the hosted catalog is the product to build**: the same Iceberg REST catalog the core runs on SQLite, on Postgres, multi-tenant, with STS-vended prefix-scoped credentials so laptops and workers never hold long-lived keys; it is the layer the architecture doc says Lakelet owns, it is what a team needs before burst, and the app's screens already read from the same API, so a web portal (the Supabase-dashboard equivalent) is the app's screens served from the catalog rather than a second product. Second, **bringing a bucket is a guided step, not a form**: "Connect a bucket" in P1's dialog and in Settings checks the credentials, tests a read and a write under the prefix, and shows the minimal IAM policy for that prefix to paste into the customer's console (`/docs/remote` has it today in prose) — the work a user does once, made obvious. Third, **provisioning inside the customer's account is not done**: creating a bucket or a policy needs credentials with IAM rights, which is exactly the broad key the product promises never to want, and it is a different story per cloud; a customer who cannot make a bucket is better served by the docs than by holding their root keys. A Lakelet-hosted bucket ("we'll keep it for you") can be an explicit later option for people with no cloud account, priced as storage, but as a choice against the default, never the default — and not before the catalog exists, because without the catalog it is just MotherDuck with extra steps.

*Not chosen:* Lakelet-hosted storage as the default (the thesis); provisioning in the customer's account with their keys (the trust story); a hosted DuckDB (burst is per job and ephemeral by design, §5 of the architecture doc); requiring the hosted catalog for a solo user (the free local tier stays whole).

*Gates:* this is a direction, so the gate is a brief, not code: the Team-tier brief (`team-v0-plan.md`) with the catalog's tenancy, auth, vending and the portal decided item by item, written after the ship brief runs. P1's "Connect a bucket" step is the one piece that can land now, in P1's gates.

- [ ] Agree
- [ ] Change:

---

**U1. The Tables screen becomes a query workspace: editor on top, results underneath, split and resizable; the health tiles move out of the way.**

*Why it comes up:* the screenshot of the 20th shows the problem — five tiles, an editor, and the result grid below the fold, so the thing the gauge exists for (write, see the verdict, see the rows) needs a scroll. BigQuery's arrangement (editor above results, both on screen) is the reference Hants named.

*Recommend:* one screen, two panes stacked with a draggable split (editor plus verdict line above, results plus the auto-chart below), the split remembered per window, `⌘/Ctrl+Enter` unchanged. The tables panel and its detail move to the sidebar (U2) and open the detail in the results pane's place, so "click a table, see its detail, run a query against it" is one screen with no scroll. The five health tiles go to a one-line status strip at the bottom of the window (version, memory limit, the disk figure, ready-in) and to the Gauge screen where they belong; the welcome screen keeps nothing of them. Not separate screens: splitting SQL from tables would put the verdict and the data a room apart.

*Not chosen:* separate SQL and Tables screens (the reason above); tabs for several queries (no request yet; one editor, one history); a floating results drawer (hides the editor).

*Gates:* Vitest for the split and the persistence; every Playwright spec that clicks the editor, the grid or the tables panel updated (`step3-query`, `step4-chart-settings`, `detail`, `attach`, `bucket`, `trust-*`, `save-question`) and passing; `/docs/app`'s screen descriptions rewritten; a fresh screenshot for the README.

- [x] Agree
- [ ] Change:

---

**U2. A sidebar for navigation: Tables (with the table list as an explorer), Models, Lineage, Changes, Gauge; the top bar keeps the project, the status, Open…, the mode and theme switches, and Settings.**

*Recommend:* a left sidebar, collapsible to icons, with the five screens as entries and, under **Tables**, the tables and views themselves (name, rows, Where, the freshness dot) so the explorer is one click away from any screen — this is the BigQuery explorer, and it is where the tables panel's list belongs once U1 takes the panel out of the Tables screen. The drop zone and **Import…** sit at the top of the explorer. The bar loses the five tabs. Simple mode renames the entries as it renames the screens today (Questions, Map, Recent). Keyboard: `⌘/Ctrl+1…5` for the screens.

*Not chosen:* a right sidebar (details already open on the right); a sidebar on the welcome screen (nothing to list); a tree of namespaces (there is one, `main`).

*Gates:* Vitest for the sidebar and the explorer; every Playwright spec's `screen-*` clicks moved to the sidebar (one helper, so the specs change in one place); `/docs/app`; the README screenshot with U1.

- [x] Agree
- [ ] Change:

---

**U3. One palette for the site and the app, from one token file, with the site's green family as the brand and the verdict colours untouched; the gauge keeps its name in the product and "Lookahead" is the site's word for it.**

*Why it comes up:* the site is dark with a lime accent since the 18th and the app is still blue; the README now says Lookahead while `lakelet gauge`, `/api/gauge/*` and the Gauge screen say gauge.

*Recommend:* `tokens.css` becomes the one source, with a light and a dark set (the app already switches; the site would gain a light mode or pin dark, Hants' choice), the brand accent moving from lake blue to the site's green family — the deep green of the product concept (`#164f44`) on light surfaces, the lime (`#d6ee83`) on dark ones, because lime on white fails contrast for text and would fight the Green verdict — and the verdict colours (`--local`, `--slow`, `--burst`) kept as they are on both, since they carry meaning and the site already uses the same three. The app's wordmark takes the site's mark (U4's source). On the name: the CLI, the API and the app keep **gauge** — it is in every command, route, doc and test, and a rename is a breaking change for no user — and the site keeps **Lakelet Lookahead** as the product's name for the feature, with `/docs/gauge` saying in its first line that Lookahead is the gauge (it does). `status.ts`'s label reads "Lakelet Lookahead (the gauge)" so the README block says both.

*Not chosen:* two palettes (they drift; they did within a week); renaming `lakelet gauge` (breaking, and "gauge" is the honest word for the thing); lime as the light-mode accent (contrast).

*Gates:* the token file with both sets and a test that the app and the site import it and define no colour outside it; the Playwright theme spec passing; screenshots of the four verdict states on light and dark for Hants to look at before it lands; `/docs/gauge` and `status.ts`.

- [x] Agree
- [ ] Change:

---

**U4. A real app icon now, from the site's mark, in every size macOS and Linux need — pulled forward from session 10.**

*Why it comes up:* the Dock and the window show the step-0 placeholder (a blue square, an orange disc), which reads as old and as the wrong colour now that the site is green.

*Recommend:* one master SVG in `brand/` (gitignored today; the icon's sources move into `app/src-tauri/icons/src/` so the build can regenerate them) drawn from `Wordmark.astro`'s wave-and-fish mark: the mark in the site's lime on the site's deep green, on macOS's rounded-square canvas with its standard margins, so it sits beside other Dock icons rather than filling the slot edge to edge; a plain-square variant for Linux, where the desktop does not round. `npm run tauri icon <svg-as-png>` regenerates `icon.icns`, `icon.ico` and every PNG Tauri's bundler wants, so the set is one command from the master rather than hand-exported; the favicon on the site is the same mark. Checked by eye at 16, 32, 128 and 512 (the wave must survive 16 px, or the small sizes use the fish alone).

*Not chosen:* a commissioned icon before ship (a day of drawing against a week of waiting; the mark exists); an animated or layered macOS icon (Tauri does not make one); keeping the placeholder until session 10 (it is in every screenshot from here on).

*Gates:* the regenerated set in `app/src-tauri/icons/` with the master beside it; `tauri build` on the Mac showing the icon in the Dock, the window and Finder; the README screenshot after U1/U2 includes it; `/docs/app` says nothing (an icon needs no doc).

- [x] Agree
- [ ] Change:

---

*Order, if all six are agreed: U4 (an afternoon), U3 (a day, with the screenshots for Hants before it lands), then U2 and U1 together (three to four days: the layout is a day, the specs and docs the rest), then P1 (two days, with the credential check). P2 is a brief to write, not code, and comes after the ship brief has run. Ship (`ship-v0-plan.md`) stays held until Hants says; U1 to U4 should land before it, because the installers' screenshots and the three-minute measurement are taken against whatever the app looks like.*
