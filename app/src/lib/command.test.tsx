// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Step 2 gate, the CLI-first rule: the line the app shows is the line the CLI takes.

import { describe, expect, it } from 'vitest';
import { defaultName, importCommand, initCommand, previewCommand, shellArg } from './command';

describe('Copy as command', () => {
  it('builds the exact lakelet import line', () => {
    expect(importCommand('/data/orders.csv')).toBe('lakelet import /data/orders.csv');
    expect(importCommand('/data/orders.csv', 'create', 'orders')).toBe('lakelet import /data/orders.csv');
    expect(importCommand('/data/orders.csv', 'create', 'sales')).toBe('lakelet import /data/orders.csv --name sales');
    expect(importCommand('/data/orders.csv', 'replace')).toBe('lakelet import /data/orders.csv --replace');
    expect(importCommand('/data/orders.csv', 'append', 'sales')).toBe('lakelet import /data/orders.csv --name sales --append');
    expect(importCommand('/data/2026 exports')).toBe("lakelet import '/data/2026 exports'");
    expect(previewCommand('/data/orders.csv')).toBe('lakelet import /data/orders.csv --preview');
    expect(initCommand('/Users/h/acme')).toBe('lakelet init /Users/h/acme');
  });

  it('names a table the way the core does', () => {
    expect(defaultName('/data/Orders 2026.csv')).toBe('orders_2026');
    expect(defaultName('/data/2026-q1.parquet')).toBe('t_2026_q1');
    expect(defaultName('/data/folder/')).toBe('folder');
  });

  it('quotes only when the shell needs it', () => {
    expect(shellArg('~/a-b_c.1')).toBe('~/a-b_c.1');
    expect(shellArg("it's here")).toBe("'it'\\''s here'");
  });
});
