// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Versions step 2 (G7): Save as question on the query screen, against the eighth sidecar.
// Its own, not the seventh's: saving writes a model, and the seventh's models test counts
// the models in that project. Run a statement, save it with a title, see the checks and the
// version in the notice, meet the 409 on the same title and take Replace it, then find the
// question on the Models screen with its title as the description — which is the whole of
// G7's sentence, end to end against a real core.

import { test, expect } from '@playwright/test';
import { pageUrl, readStates } from './sidecar';

const sidecar = () => readStates()[7];

test('a question is saved from the query screen and appears on the Models screen', async ({ page }) => {
  test.setTimeout(240_000); // dbt compiles when the Models screen plans
  const s = sidecar();
  await page.goto(pageUrl(s));
  await expect(page.getByRole('status')).toHaveText('core ready');

  // Save is offered only once the gauge has spoken.
  await expect(page.getByTestId('save-question')).toHaveCount(0);
  const sql = 'select customer, sum(amt) as total from orders group by 1';
  const editor = page.getByTestId('sql-editor').locator('.cm-content');
  await editor.click();
  await page.keyboard.insertText(sql); // as text: keystrokes meet the editor's own bindings
  await page.keyboard.press('Escape'); // the completion popup the insert opened
  await page.getByTestId('run').click();
  await expect(page.getByTestId('query')).toHaveAttribute('data-done-ms', /\d+/);
  await expect(page.getByTestId('save-question')).toHaveText('Save as question');

  // the title is the only thing asked, and the box says what it will write
  await page.getByTestId('save-question').click();
  await page.getByTestId('question-title').fill('Total by customer');
  const box = page.getByTestId('save-question-box');
  await expect(box).toContainText('models/questions/total_by_customer.sql');
  await expect(box).toContainText('returns at least one row');
  await expect(box).toContainText('`customer` is never empty');
  await expect(box.getByTestId('command')).toContainText("lakelet question save 'Total by customer'");

  await page.getByTestId('question-save').click();
  const saved = page.getByTestId('saved-question');
  await expect(saved).toContainText('Total by customer');
  await expect(saved).toContainText('total_by_customer.sql');
  await expect(page.getByTestId('saved-version')).toContainText(/Version [0-9a-f]{7}\./);
  await page.getByTestId('saved-close').click();

  // the same title again is the core's 409, and Replace it goes through
  await page.getByTestId('save-question').click();
  await page.getByTestId('question-title').fill('Total by customer');
  await page.getByTestId('question-save').click();
  await expect(page.getByTestId('question-exists')).toContainText('total_by_customer');
  await expect(page.getByTestId('question-save')).toHaveCount(0);
  await page.getByTestId('question-replace').click();
  await expect(page.getByTestId('saved-question')).toContainText('Total by customer');
  await page.getByTestId('saved-close').click();

  // the Models screen lists it on its next plan, with the title as its description
  await page.getByTestId('screen-models').click();
  const screen = page.getByTestId('models-screen');
  await expect(screen.getByTestId('dag')).toBeVisible({ timeout: 90_000 });
  const row = screen.getByTestId('dag').locator('tbody tr', { hasText: 'total_by_customer' });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(screen.getByTestId('model-detail')).toContainText('Total by customer');
  await expect(screen.getByTestId('model-detail')).toContainText('models/questions/total_by_customer.sql');
});
