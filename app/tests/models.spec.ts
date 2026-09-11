// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Real-data brief R5, step 6: the Models screen against the seventh sidecar, whose dbt
// project has `stg` (a view over orders, two tests in schema.yml) and `by_customer` (a
// table over stg). The plan lists both with verdicts; the detail shows the compiled SQL,
// the refs and the tests; Run all builds through `lakelet run`, the view lands in the
// catalog with its own detail shape, and the Gauge screen has the two runs; Simple mode
// says question and check and the switch is remembered.

import { test, expect } from '@playwright/test';
import { pageUrl, readStates } from './sidecar';

const sidecar = () => readStates()[6];

test('the plan, a model, Run all, the view detail, the runs, and Simple mode', async ({ page }) => {
  test.setTimeout(240_000); // dbt compiles on every plan
  const s = sidecar();
  await page.goto(pageUrl(s));
  await expect(page.getByRole('status')).toHaveText('core ready');
  await expect(page.getByTestId('table-orders')).toContainText('4');
  await expect(page.getByTestId('screen-models')).toHaveText('Models');
  await page.getByTestId('screen-models').click();

  // the plan: both models, in dependency order, with verdicts (dbt compiles first, so give it time)
  const screen = page.getByTestId('models-screen');
  await expect(screen.getByTestId('dag')).toBeVisible({ timeout: 90_000 });
  await expect(screen).toContainText('2 models · all Green');
  const rows = screen.getByTestId('dag').locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('stg');
  await expect(rows.nth(0)).toContainText('view');
  await expect(rows.nth(0)).toContainText('Green');
  await expect(rows.nth(0)).toContainText('never');
  await expect(rows.nth(1)).toContainText('by_customer');
  await expect(rows.nth(1)).toContainText('table');
  await expect(screen.getByTestId('command').first()).toContainText('lakelet run');

  // the first model is open: its compiled SQL, refs, tests, and its line
  const detail = screen.getByTestId('model-detail');
  await expect(detail).toContainText('models/stg.sql');
  await expect(detail).toContainText('Orders with a positive amount.');
  await expect(detail.getByTestId('compiled-sql')).toContainText('amt > 0');
  await expect(detail.getByTestId('compiled-sql')).toContainText('"lakelet"."main"."orders"');
  await expect(detail.getByTestId('refs')).toContainText('reads tables directly');
  await expect(detail.getByTestId('tests')).toContainText('not_null(id)');
  await expect(detail.getByTestId('tests')).toContainText('unique(id)');
  await expect(detail).toContainText('run: never');
  await expect(detail.getByTestId('command')).toContainText('lakelet run stg');
  await rows.nth(1).click();
  await expect(detail.getByTestId('refs')).toHaveText('stg');
  await expect(detail.getByTestId('compiled-sql')).toContainText('sum(amt)');
  await expect(detail.getByTestId('tests')).toContainText('none in schema.yml');

  // Run all is lakelet run: both build, the view is recorded, the plan re-reads with last runs
  await screen.getByTestId('run-all').click();
  await expect(screen.getByTestId('run-report')).toBeVisible({ timeout: 90_000 });
  await expect(screen.getByTestId('run-report')).toContainText('2 models built in');
  await expect(screen.getByTestId('run-report')).toContainText('Views in the catalog: stg.');
  await expect(screen.getByTestId('dag')).toBeVisible({ timeout: 90_000 });
  await expect(rows.nth(0)).toContainText('just now');
  await rows.nth(0).click();
  await expect(detail.getByTestId('last-run')).toContainText('just now, took');

  // the tables panel has the view and the table now; the view's detail has its own shape
  await page.getByTestId('screen-tables').click();
  await expect(page.getByTestId('table-by_customer')).toContainText('2');
  await expect(page.getByTestId('table-stg')).toBeVisible();
  await page.getByTestId('table-stg').click();
  const view = page.getByTestId('detail');
  await expect(view).toBeVisible();
  expect(await view.getAttribute('data-kind')).toBe('view');
  await expect(view).toContainText('stg · view · 3 columns');
  await expect(view.getByTestId('view-sql')).toContainText('amt > 0');
  await expect(view.getByTestId('view-sql')).toContainText('"main"."orders"');
  await expect(view.getByTestId('view-version')).toContainText('1 version · this one just now');
  await expect(view.getByTestId('view-model')).toContainText('lakelet run stg');
  await expect(view).not.toContainText('0 rows');
  await expect(view.getByTestId('no-snapshots')).toContainText('nothing to expire');
  await expect(view.getByTestId('expire')).toHaveCount(0);
  await view.getByTestId('sample-rows').click();
  await expect(view.getByTestId('sample')).toContainText('c1');
  await expect(view.getByTestId('sample')).not.toContainText('-1');

  // the Gauge screen has the two runs, with the estimate and the actual
  await page.getByTestId('screen-gauge').click();
  await expect(page.getByTestId('tile-runs')).toHaveText('2');
  await expect(page.getByTestId('runs').locator('tbody tr')).toHaveCount(2);
  await expect(page.getByTestId('runs')).toContainText('Green');

  // Simple mode: questions, checks, the wait as a sentence, Refresh all; remembered across a reload
  await page.getByTestId('mode-simple').click();
  await expect(page.getByTestId('screen-models')).toHaveText('Questions');
  await page.getByTestId('screen-models').click();
  await expect(screen.getByTestId('cards')).toBeVisible({ timeout: 90_000 });
  await expect(screen).toContainText('2 questions · all quick');
  const card = screen.getByTestId('card-stg');
  await expect(card).toContainText('answered live · last refreshed just now');
  await expect(card).toContainText('Ready in about');
  await expect(card).toContainText('2 checks: id is never empty; id is never repeated');
  await expect(screen.getByTestId('card-by_customer')).toContainText('saved as a table');
  await expect(screen.getByTestId('card-by_customer')).toContainText('no checks');
  await expect(screen.getByTestId('run-all')).toHaveText('Refresh all');
  await expect(screen).not.toContainText('Green');
  await expect(screen.getByTestId('compiled-sql')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('core ready');
  await expect(page.getByTestId('screen-models')).toHaveText('Questions');
  await page.getByTestId('mode-technical').click();
  await expect(page.getByTestId('screen-models')).toHaveText('Models');
});
