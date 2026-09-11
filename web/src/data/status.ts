// What is built and what is not. THE one place on the site that knows.
//
// Rule (web/TASKS.md): the marketing pages may describe the plan, but they may not
// imply the plan is shipped. Any page that names an unbuilt thing carries <BuildState/>,
// which reads this file. When a session ships, edit here and every page follows.
//
// This must agree with src/content/docs/index.md, which is the authority because it
// describes the code. Where they disagree, index.md is right and this file is the bug.

export const asOf = '2026-09-11';

// Last reconciled against src/content/docs/index.md: 2026-09-11, after the real-data
// round's steps 4 (the Gauge screen) and 5 (`lakelet run`, dbt views) landed.

export type State = 'built' | 'planned';

export type Surface = {
  /** stable key, used by pageState below */
  id: string;
  /** what a visitor calls it */
  label: string;
  state: State;
  /** one clause: what you can do with it today, or what has to happen first */
  detail: string;
  /** for planned things: the build session that does it (see build-sessions/) */
  session?: string;
  /** deep link into the developer docs, for built things */
  href?: string;
};

export const surfaces: Surface[] = [
  // ---- built -------------------------------------------------------------
  { id: 'cli', label: 'The CLI', state: 'built',
    detail: 'init, import, sql, estimate, tables, config — from a clone, with uv',
    href: '/docs/cli' },
  { id: 'gauge', label: 'The gauge', state: 'built',
    detail: 'the verdict and its sentence before anything runs; Red refuses, and every run is recorded',
    href: '/docs/gauge' },
  { id: 'tables', label: 'Files into Iceberg tables', state: 'built',
    detail: 'CSV, TSV, Parquet, JSON, JSONL and Excel, with the type coercions written down',
    href: '/docs/tables' },
  { id: 's3', label: 'Parquet already in S3', state: 'built',
    detail: 'attach, refresh and discover a prefix in place — nothing copied, and public buckets need no credentials',
    href: '/docs/remote' },
  { id: 'catalog', label: 'The Iceberg REST catalog', state: 'built',
    detail: 'SQLite locally, served over HTTP; DuckDB, pyiceberg, Spark and Trino all read it',
    href: '/docs/catalog' },
  { id: 'questions', label: 'Saved questions as dbt models', state: 'built',
    detail: 'each one written with two checks, built through the catalog by dbt',
    href: '/docs/questions' },
  { id: 'dbtrun', label: 'lakelet run — the dbt DAG, by verdict', state: 'built',
    detail: 'every model gets its own verdict before it builds, dbt runs through the catalog, and view models become Iceberg views every engine can see',
    href: '/docs/dbt' },
  { id: 'api', label: 'The local HTTP API', state: 'built',
    detail: 'lakelet serve, loopback only, bearer token, results as an Arrow stream',
    href: '/docs/api' },
  { id: 'app', label: 'The desktop app', state: 'built',
    detail: 'from source, no installer: projects, drop-to-import with a preview, the SQL screen with the verdict before the rows, the streaming grid, the auto-chart, the table detail, the Gauge screen with estimate-versus-actual, settings',
    href: '/docs/app' },
  { id: 'audit', label: 'Proof it stays put', state: 'built',
    detail: 'lakelet audit network measures zero outbound attempts on the quickstart',
    href: '/docs/install' },

  // ---- planned -----------------------------------------------------------
  { id: 'ask', label: 'The ask box (English → SQL)', state: 'planned',
    detail: 'model providers, streaming SQL, one repair pass',
    session: 'session 7 — deprioritised 2026-09-11' },
  { id: 'burst', label: 'Burst to a worker', state: 'planned',
    detail: 'the control plane, the job token, the cap, results back. Every burst number on this site is arithmetic from the plan, not a measurement',
    session: 'session 8' },
  { id: 'mcp', label: 'lakelet mcp (the agent tools)', state: 'planned',
    detail: 'the MCP server, per-tool permissions, the per-agent daily cap and the audit log',
    session: 'session 5, after session 8' },
  { id: 'team', label: 'The Team catalog', state: 'planned',
    detail: 'hosted Postgres, vended credentials, scheduled runs, compaction and alerts',
    session: 'session 8 onward' },
  { id: 'installers', label: 'Installers and a brew tap', state: 'planned',
    detail: 'signed DMG, the extensions bundled, a PyPI release. Until then: clone and uv sync',
    session: 'session 10' },
  { id: 'lineage', label: 'Versions and lineage screens', state: 'planned',
    detail: 'git auto-commit on save, the version list with restore, table-level lineage',
    session: 'session 9, the rest' },
  { id: 'correction', label: 'Per-machine correction', state: 'planned',
    detail: "the gauge's constants were tuned on one machine; the record is kept, the correction is not applied yet",
    session: 'session 10' },
  { id: 'selfhosted', label: 'Self-hosted', state: 'planned',
    detail: 'the catalog and control plane in your own VPC, SSO, audit to your SIEM',
    session: 'after the Team tier' },
];

const by = (id: string): Surface => {
  const s = surfaces.find(x => x.id === id);
  if (!s) throw new Error(`src/data/status.ts: no surface "${id}"`);
  return s;
};

export const pick = (ids: string[]): Surface[] => ids.map(by);

/** Which surfaces each page should own up about, in the order they should read. */
export const pageState: Record<string, { built: string[]; planned: string[]; note: string }> = {
  app: {
    built: ['app', 'gauge', 'dbtrun', 'tables', 's3'],
    planned: ['ask', 'burst', 'mcp', 'lineage', 'installers'],
    note: 'Screens 1, 2 and 5 are real and run today, from source, along with the table detail. The rest of this page is design, not software — it is here so you can see where it goes, and it is labelled so you never have to guess which is which.',
  },
  agents: {
    built: ['cli', 'api', 'catalog', 'gauge'],
    planned: ['mcp', 'burst', 'team'],
    note: 'This page is the specification for the agent surface, written before it is built, so that the tools, the permissions and the cap are designed in the open. None of the MCP tools below can be called today.',
  },
};
