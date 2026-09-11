// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Real-data brief R7: the detail's reclaimable line, the snapshot marks, and the buttons
// that are `tables sample`, `tables expire` and `tables refresh`.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TableDescription } from '../lib/api';
import { TableDetail } from './TableDetail';

const local: TableDescription = {
  name: 'orders',
  rows: 200,
  bytes: 12_000,
  columns: [['id', 'long'], ['customer', 'string'], ['amt', 'decimal(21, 1)']],
  location: 'file:///p/warehouse/main/orders',
  snapshot_id: 2,
  freshness: new Date().toISOString(),
  source: null,
  public: false,
  partitioning: 'unpartitioned',
  expirable_snapshots: 2,
  reclaimable_bytes: 4_000,
  keep_days: 7,
  last_commit: { snapshot_id: 2, operation: 'append', timestamp: new Date().toISOString() },
  snapshots: 3,
  format_version: 2,
  snapshot_list: [
    { id: 3, timestamp: new Date().toISOString(), operation: 'append', added_rows: 200, added_bytes: null, added_files: 1, deleted_rows: null, total_rows: 200, current: true, expirable: false },
    { id: 2, timestamp: new Date(Date.now() - 864e5 * 9).toISOString(), operation: 'delete', added_rows: null, added_bytes: null, added_files: null, deleted_rows: 100, total_rows: 0, current: false, expirable: true },
    { id: 1, timestamp: new Date(Date.now() - 864e5 * 10).toISOString(), operation: 'append', added_rows: 100, added_bytes: null, added_files: 1, deleted_rows: null, total_rows: 100, current: false, expirable: true },
  ],
};

const noop = () => {};

describe('TableDetail', () => {
  it('shows the reclaimable line, marks the snapshots, and expire is the verb', () => {
    const onExpire = vi.fn();
    render(<TableDetail table={local} onSample={noop} onExpire={onExpire} onRefresh={noop} onClose={noop} />);
    expect(screen.getByTestId('reclaimable').textContent).toBe('2 snapshots older than 7 days, 4 KB reclaimable.');
    expect(screen.getByTestId('snapshot-3').textContent).toContain('current');
    expect(screen.getByTestId('snapshot-1').textContent).toContain('expirable');
    expect(screen.getByTestId('snapshot-2').textContent).toContain('delete');
    expect(screen.getAllByTestId('command').map((c) => c.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('lakelet tables describe orders'),
      expect.stringContaining('lakelet tables expire orders'),
    ]));
    fireEvent.click(screen.getByTestId('expire'));
    expect(onExpire).toHaveBeenCalled();
    expect(screen.queryByTestId('refresh')).toBeNull();
  });

  it('an attached table offers refresh instead, and says it is never expired', () => {
    const onRefresh = vi.fn();
    const attached = { ...local, name: 'place', source: 's3://b/release/type=place/', public: true, expirable_snapshots: 0, reclaimable_bytes: 0 };
    render(<TableDetail table={attached} onSample={noop} onExpire={noop} onRefresh={onRefresh} onClose={noop} />);
    expect(screen.getByTestId('detail-where').textContent).toContain('public bucket, read without credentials');
    expect(screen.getByTestId('reclaimable').textContent).toContain('never expired');
    expect(screen.queryByTestId('expire')).toBeNull();
    fireEvent.click(screen.getByTestId('refresh'));
    expect(onRefresh).toHaveBeenCalled();
    expect(screen.getAllByTestId('command').some((c) => c.textContent?.includes('lakelet tables refresh place'))).toBe(true);
  });

  it('renders the sample when it has been read, with its line', () => {
    render(<TableDetail table={local} sample={[{ id: 1, customer: 'c1', amt: null }]} onSample={noop} onExpire={noop} onRefresh={noop} onClose={noop} />);
    expect(screen.getByTestId('sample').textContent).toContain('c1');
    expect(screen.getByTestId('sample').textContent).toContain('∅');
    expect(screen.getByTestId('sample').textContent).toContain('lakelet tables sample orders');
  });

  it('a view has its own shape: the query, its version, the model it came from, no snapshots, no expire', () => {
    const view: TableDescription = {
      ...local,
      name: 'big_orders',
      rows: 0,
      bytes: 0,
      kind: 'view',
      view_sql: 'select * from "main"."orders" where amount > 100',
      partitioning: 'a view',
      snapshots: 2,
      format_version: 1,
      snapshot_list: [],
      expirable_snapshots: 0,
      reclaimable_bytes: 0,
      last_commit: { operation: 'view version 2', timestamp: new Date().toISOString() },
      properties: { 'lakelet.dbt-model': 'model.demo.big_orders' },
    };
    render(<TableDetail table={view} onSample={noop} onExpire={noop} onRefresh={noop} onClose={noop} />);
    const detail = screen.getByTestId('detail');
    expect(detail.dataset.kind).toBe('view');
    expect(screen.getByTestId('view-sql').textContent).toBe('select * from "main"."orders" where amount > 100');
    expect(screen.getByTestId('view-version').textContent).toBe('2 versions · this one just now');
    expect(screen.getByTestId('view-model').textContent).toContain('model.demo.big_orders');
    expect(screen.getByTestId('view-model').textContent).toContain('lakelet run big_orders');
    expect(screen.queryByTestId('snapshots')).toBeNull();
    expect(screen.queryByTestId('expire')).toBeNull();
    expect(screen.queryByTestId('refresh')).toBeNull();
    expect(screen.queryByTestId('reclaimable')).toBeNull();
    expect(screen.getByTestId('no-snapshots').textContent).toContain('nothing to expire');
    expect(detail.textContent).not.toContain('0 rows');
    expect(screen.getAllByTestId('command').map((c) => c.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('lakelet tables describe big_orders'),
      expect.stringContaining('lakelet run big_orders'),
    ]));
    // Simple mode says question and Refresh
    cleanup();
    render(<TableDetail table={view} mode="simple" onSample={noop} onExpire={noop} onRefresh={noop} onClose={noop} />);
    expect(screen.getByTestId('detail').textContent).toContain('a question, answered live');
    expect(screen.getByTestId('view-model').textContent).toContain('the question big_orders');
    // a view put in the catalog directly names no model and offers no run line
    cleanup();
    render(<TableDetail table={{ ...view, properties: {} }} onSample={noop} onExpire={noop} onRefresh={noop} onClose={noop} />);
    expect(screen.getByTestId('view-model').textContent).toContain('not a dbt model');
    expect(screen.getAllByTestId('command').some((c) => c.textContent?.includes('lakelet run'))).toBe(false);
  });
});
