// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Decisions W1: a project whose warehouse is a bucket (`init --warehouse s3://…`, the tenth
// sidecar on Moto) shows where its tables are — "bucket" in the panel, the location on the
// detail — and everything else works as on a local warehouse: a query with its verdict,
// the snapshots, nothing to relocate.

import { test, expect } from '@playwright/test';
import { pageUrl, readStates } from './sidecar';

const sidecar = () => readStates()[9];

test('a bucket warehouse says so in the panel and the detail, and a query runs', async ({ page }) => {
  const s = sidecar();
  await page.goto(pageUrl(s));
  await expect(page.getByRole('status')).toHaveText('core ready');
  await expect(page.getByTestId('table-orders')).toContainText('3');
  await expect(page.getByTestId('where-orders')).toContainText('bucket');
  await expect(page.getByTestId('where-orders')).toContainText('lakelet-test/…');
  await expect(page.getByTestId('where-orders')).toHaveAttribute('title', /^s3:\/\/lakelet-test\/warehouse\/main\/orders/);
  await expect(page.getByTestId('moved')).toHaveCount(0);

  await page.getByTestId('table-orders').click();
  const detail = page.getByTestId('detail');
  await expect(detail).toContainText('orders · 3 rows');
  await expect(detail.getByTestId('detail-where')).toContainText("in a bucket, the project's warehouse: s3://lakelet-test/warehouse/main/orders");
  await expect(detail.getByTestId('snapshots').locator('tbody tr')).toHaveCount(1);
  await expect(detail.getByTestId('reclaimable')).toContainText('Nothing to expire');
  await detail.getByRole('button', { name: 'Close' }).click();

  // the gauge estimates a bucket table by bandwidth, the way it does an attached one, and the query runs
  const editor = page.getByTestId('sql-editor').locator('.cm-content');
  await editor.click();
  await page.keyboard.insertText('select customer, sum(amt) as total from orders group by 1 order by 2 desc');
  await page.keyboard.press('Escape');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('query')).toHaveAttribute('data-done-ms', /\d+/);
  await expect(page.getByTestId('gauge')).toHaveAttribute('data-verdict', /green|yellow/);
  await expect(page.getByTestId('grid')).toContainText('c1');
});
