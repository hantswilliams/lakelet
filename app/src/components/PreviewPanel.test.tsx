// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Step 2 gate, the preview: the columns with their notes, the name that shapes the command,
// and the replace-or-append choice when the table exists.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreviewPanel } from './PreviewPanel';

const preview = {
  name: 'orders',
  source: '/data/orders.csv',
  columns: [
    { name: 'id', duckdb_type: 'BIGINT', iceberg_type: 'long', note: '' },
    { name: 'big', duckdb_type: 'HUGEINT', iceberg_type: 'decimal(38, 0)', note: '128-bit integer becomes decimal(38, 0)' },
  ],
  sample: [[1, 5], [2, null]],
};

describe('PreviewPanel', () => {
  it('shows the columns, the notes and the command for the name given', () => {
    const onImport = vi.fn();
    render(<PreviewPanel path="/data/orders.csv" folder={false} previews={[preview]} name="sales" mode="create" onName={() => {}} onImport={onImport} onCancel={() => {}} />);
    expect(screen.getByText('decimal(38, 0)')).toBeTruthy();
    expect(screen.getByText('128-bit integer becomes decimal(38, 0)')).toBeTruthy();
    expect(screen.getByText('∅')).toBeTruthy();
    expect(screen.getByTestId('command').textContent).toContain('lakelet import /data/orders.csv --name sales');
    fireEvent.click(screen.getByTestId('import'));
    expect(onImport).toHaveBeenCalledWith('create');
  });

  it('offers replace or append when the table exists, and the line follows', () => {
    const onImport = vi.fn();
    const { rerender } = render(<PreviewPanel path="/data/orders.csv" folder={false} previews={[preview]} name="orders" mode="create" exists="orders" onName={() => {}} onImport={onImport} onCancel={() => {}} />);
    expect(screen.queryByTestId('import')).toBeNull();
    fireEvent.click(screen.getByTestId('append'));
    expect(onImport).toHaveBeenCalledWith('append');
    rerender(<PreviewPanel path="/data/orders.csv" folder={false} previews={[preview]} name="orders" mode="append" exists="orders" onName={() => {}} onImport={onImport} onCancel={() => {}} />);
    expect(screen.getByTestId('command').textContent).toContain('lakelet import /data/orders.csv --append');
  });

  it('a folder lists its files and the button counts the tables', () => {
    const b = { ...preview, name: 'customers', source: '/data/in/customers.parquet' };
    render(<PreviewPanel path="/data/in" folder previews={[b, preview]} name="" mode="create" onName={() => {}} onImport={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('import').textContent).toBe('Import 2 tables');
    expect(screen.getByText('customers.parquet')).toBeTruthy();
    expect(screen.getByTestId('command').textContent).toContain('lakelet import /data/in');
  });
});
