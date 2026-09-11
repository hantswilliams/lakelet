// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Real-data step 6 gate: the Models screen lists the plan with a verdict per model, the
// detail shows the compiled SQL, refs, tests and last run; Simple mode shows the same as
// cards with checks; a Red model's run is refused until Run anyway. The core is a stubbed
// fetch here; the Playwright spec runs it against the real one.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlannedModel, RunReport } from '../lib/api';
import { Models } from './Models';

const session = { port: 1, token: 't', pid: 0, project: '/p', ready_ms: 1, initialised: null };

const stg: PlannedModel = {
  name: 'stg', unique_id: 'model.demo.stg', materialized: 'view', depends_on: [],
  compiled_sql: 'select * from "lakelet"."main"."orders" where quantity > 0',
  verdict: 'green', words: 'Green — about 1 s', reason: 'reads 2.0 MB', est_wall_local: 1, est_bytes: 2_000_000, error: null,
  description: 'Orders with a quantity.', path: 'models/stg.sql',
  tests: [
    { name: 'not_null_stg_order_id', kind: 'not_null', column: 'order_id', unique_id: 'test.demo.a' },
    { name: 'unique_stg_order_id', kind: 'unique', column: 'order_id', unique_id: 'test.demo.b' },
  ],
  last_run: { ts: new Date(Date.now() - 120_000).toISOString(), ok: true, seconds: 0.4, verdict: 'green', error: null },
};
const agg: PlannedModel = {
  ...stg, name: 'agg', unique_id: 'model.demo.agg', materialized: 'table', depends_on: ['model.demo.stg'],
  compiled_sql: 'select customer, sum(amount) as total from "memory"."main"."stg" group by 1',
  verdict: 'red', words: 'Red — needs more machine', reason: 'peak memory 30 GB', est_wall_local: 900, est_bytes: 40e9,
  description: '', tests: [], last_run: null,
};

function stub(models: PlannedModel[], run: (body: { select: string[]; run_anyway: boolean }) => Response) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url.replace(/^.*\/api/, '')}`);
    if (url.endsWith('/run/plan')) return new Response(JSON.stringify(models), { status: 200 });
    if (url.endsWith('/run')) return run(JSON.parse(String(init?.body)));
    return new Response('{}', { status: 404 });
  }));
  return calls;
}

const okReport = (names: string[]): RunReport => ({
  models: [], results: names.map((n) => ({ name: n, status: 'success', seconds: 0.5, message: null })),
  views_recorded: names.filter((n) => n === 'stg'), views_dropped: [], seconds: 1.2, ok: true,
});

afterEach(() => vi.unstubAllGlobals());

describe('the Models screen', () => {
  it('lists the plan, shows a model, and Run this is lakelet run <model>', async () => {
    const calls = stub([stg, agg], (b) => new Response(JSON.stringify(okReport(b.select.length ? b.select : ['stg', 'agg'])), { status: 200 }));
    const onChanged = vi.fn(async () => {});
    render(<Models session={session} mode="technical" tables={[]} onChanged={onChanged} />);
    await waitFor(() => expect(screen.getByTestId('dag')).toBeTruthy());
    expect(screen.getByTestId('models-screen').textContent).toContain('2 models · 1 Red');
    expect(screen.getByTestId('model-stg').textContent).toContain('Green');
    expect(screen.getByTestId('model-agg').textContent).toContain('Red');
    // the first model is selected: its SQL, refs, tests, last run
    expect(screen.getByTestId('compiled-sql').textContent).toContain('quantity > 0');
    expect(screen.getByTestId('tests').textContent).toContain('not_null(order_id)');
    expect(screen.getByTestId('tests').textContent).toContain('unique(order_id)');
    expect(screen.getByTestId('last-run').textContent).toContain('2 min ago, took');
    expect(screen.getByTestId('sentence').textContent).toBe('Green — about 1 s');
    fireEvent.click(screen.getByTestId('model-agg'));
    expect(screen.getByTestId('refs').textContent).toBe('stg');
    expect(screen.getByTestId('tests').textContent).toContain('none in schema.yml');
    expect(screen.getAllByTestId('command').map((c) => c.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('lakelet run'),
      expect.stringContaining('lakelet run agg'),
    ]));
    // Run this on the Green one posts its selection and re-plans
    fireEvent.click(screen.getByTestId('model-stg'));
    fireEvent.click(screen.getByTestId('run-this'));
    await waitFor(() => expect(screen.getByTestId('run-report')).toBeTruthy());
    expect(calls).toContain('POST /run');
    expect(screen.getByTestId('run-report').textContent).toContain('1 model built in 1.2 s. Views in the catalog: stg.');
    expect(onChanged).toHaveBeenCalled();
    expect(calls.filter((c) => c === 'GET /run/plan').length).toBe(2);
  });

  it('a Red model refuses the run until Run anyway', async () => {
    const posts: { select: string[]; run_anyway: boolean }[] = [];
    stub([stg, agg], (b) => {
      posts.push(b);
      if (!b.run_anyway) return new Response(JSON.stringify({ error: 'red_refused', message: '1 model(s) need more machine: agg. `--run-anyway` runs the DAG here regardless.' }), { status: 409 });
      return new Response(JSON.stringify(okReport(['stg', 'agg'])), { status: 200 });
    });
    render(<Models session={session} mode="technical" tables={[]} onChanged={async () => {}} />);
    await waitFor(() => expect(screen.getByTestId('dag')).toBeTruthy());
    expect(screen.getByTestId('red-note').textContent).toContain('--run-anyway');
    fireEvent.click(screen.getByTestId('run-all'));
    await waitFor(() => expect(screen.getByTestId('refusal')).toBeTruthy());
    expect(screen.getByTestId('refusal').textContent).toContain('need more machine: agg');
    expect(screen.getByTestId('refusal').textContent).toContain('lakelet run --run-anyway');
    fireEvent.click(screen.getByTestId('run-anyway'));
    await waitFor(() => expect(screen.getByTestId('run-report')).toBeTruthy());
    expect(posts).toEqual([{ select: [], burst: 'never', run_anyway: false }, { select: [], burst: 'never', run_anyway: true }]);
    expect(screen.queryByTestId('refusal')).toBeNull();
  });

  it('Simple mode is cards: questions, checks, the wait as a sentence, Refresh', async () => {
    stub([stg, agg], () => new Response(JSON.stringify(okReport(['stg'])), { status: 200 }));
    const fresh = new Date(Date.now() - 3600_000 * 5).toISOString();
    render(<Models session={session} mode="simple" tables={[{ name: 'stg', rows: 0, bytes: 0, columns: [], location: '', snapshot_id: null, freshness: fresh, kind: 'view' }]} onChanged={async () => {}} />);
    await waitFor(() => expect(screen.getByTestId('cards')).toBeTruthy());
    expect(screen.getByTestId('models-screen').textContent).toContain('2 questions · 1 too big for this machine');
    const card = screen.getByTestId('card-stg');
    expect(card.textContent).toContain('answered live · last refreshed 5 h ago');
    expect(card.textContent).toContain('Orders with a quantity.');
    expect(card.textContent).toContain('Ready in about 1 s.');
    expect(card.textContent).toContain('2 checks: order_id is never empty; order_id is never repeated');
    expect(screen.getByTestId('card-agg').textContent).toContain('Too big for this machine right now.');
    expect(screen.getByTestId('card-agg').textContent).toContain('no checks');
    expect(screen.getByTestId('run-all').textContent).toBe('Refresh all');
    expect(screen.getByTestId('refresh-stg').textContent).toBe('Refresh');
    expect(screen.queryByTestId('compiled-sql')).toBeNull();
    expect(screen.getByTestId('models-screen').textContent).not.toContain('Green');
    fireEvent.click(screen.getByTestId('refresh-stg'));
    await waitFor(() => expect(screen.getByTestId('run-report')).toBeTruthy());
    expect(screen.getByTestId('run-report').textContent).toContain('1 question built in 1.2 s. Answered live: stg.');
  });

  it('says when the plan failed, in the plan\'s own words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'dbt', message: 'dbt is not installed: `pip install \'lakelet[dbt]\'`' }), { status: 400 })));
    render(<Models session={session} mode="technical" tables={[]} onChanged={async () => {}} />);
    await waitFor(() => expect(screen.getByTestId('models-error')).toBeTruthy());
    expect(screen.getByTestId('models-error').textContent).toContain('dbt is not installed');
    expect(screen.getByTestId('models-error').textContent).toContain('lakelet run --plan');
    expect(screen.queryByTestId('no-models')).toBeNull();
  });
});
