// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// The grid's columns are sized to what they hold (TASKS, 2026-09-16: an equal share of the
// width put a two-column result's number far from its header).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Column, Row } from '../lib/arrow';
import { Grid, columnWidths, template } from './Grid';

afterEach(cleanup);

const columns: Column[] = [{ name: 'customer', type: 'Utf8' }, { name: 'revenue', type: 'Decimal(18, 2)' }];
const rows: Row[] = [['c1', '1234.50'], ['a much longer customer name here', '2.00']];

describe('the grid', () => {
  it('sizes a column to the longest of its header and its cells, between a floor and a cap', () => {
    const [name, revenue] = columnWidths(columns, rows);
    expect(name).toBe(Math.ceil('a much longer customer name here'.length * 7.8) + 24);
    expect(revenue).toBe(96); // "1,234.50" and "revenue" are short: the floor
    expect(columnWidths([{ name: 'x', type: 'Utf8' }], [['y'.repeat(500)]])[0]).toBe(480);
    expect(template([100, 96])).toBe('100px minmax(96px, 1fr)');
  });

  it('applies the widths to the head and every row, with the last column taking the rest', () => {
    render(<Grid columns={columns} rows={rows} />);
    const head = screen.getByTestId('grid').querySelector('.grid-head') as HTMLElement;
    expect(head.style.gridTemplateColumns).toBe(`${columnWidths(columns, rows)[0]}px minmax(96px, 1fr)`);
  });
});
