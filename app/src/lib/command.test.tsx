// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Step 2 gate, the CLI-first rule: the line the app shows is the line the CLI takes.

import { describe, expect, it } from 'vitest';
import { attachCommand, bucketCheckCommand, defaultName, discoverCommand, importCommand, initCommand, isRemote, previewCommand, refreshCommand, remoteName, shellArg, sqlCommand, stripComments } from './command';

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
    // C1: the profile goes before the verb, and only when there is a bucket to reach with it
    expect(initCommand('/Users/h/acme', 's3://acme-lake/analytics', 'acme data')).toBe("lakelet --profile 'acme data' init /Users/h/acme --warehouse s3://acme-lake/analytics");
    expect(initCommand('/Users/h/acme', undefined, 'acme-data')).toBe('lakelet init /Users/h/acme');
    expect(bucketCheckCommand('s3://acme-lake/analytics', 'acme-data')).toBe('lakelet --profile acme-data bucket check s3://acme-lake/analytics');
    expect(bucketCheckCommand('s3://acme-lake/analytics', ' ')).toBe('lakelet bucket check s3://acme-lake/analytics');
  });

  it('builds the lakelet sql line on one line, with --run-anyway when Red was overridden', () => {
    expect(sqlCommand('select *\n  from orders')).toBe("lakelet sql 'select * from orders'");
    expect(sqlCommand('select count(*) from orders', true)).toBe("lakelet sql 'select count(*) from orders' --run-anyway");
    expect(sqlCommand("select 'a' as s")).toBe('lakelet sql "select \'a\' as s"');
  });

  it('drops -- comments before folding the SQL onto one line, but not inside a literal', () => {
    expect(sqlCommand('select 1 -- one\nfrom t')).toBe("lakelet sql 'select 1 from t'");
    expect(sqlCommand("select '--' as dash -- a comment")).toBe('lakelet sql "select \'--\' as dash"');
    expect(stripComments('a\n-- whole line\nb')).toBe('a\n\nb');
  });

  it('names a table the way the core does', () => {
    expect(defaultName('/data/Orders 2026.csv')).toBe('orders_2026');
    expect(defaultName('/data/2026-q1.parquet')).toBe('t_2026_q1');
    expect(defaultName('/data/folder/')).toBe('folder');
  });

  it('quotes only when the shell needs it', () => {
    expect(shellArg('~/a-b_c.1')).toBe('~/a-b_c.1');
    // a single quote alone: double quotes, so the SQL reads as written
    expect(shellArg("it's here")).toBe('"it\'s here"');
    expect(shellArg("where m = 'jan' and n != 2")).toBe('"where m = \'jan\' and n != 2"');
    // a single quote beside something double quotes would interpret: the safe form
    expect(shellArg("it's $HOME")).toBe("'it'\\''s $HOME'");
    expect(shellArg("it's !~ x")).toBe("'it'\\''s !~ x'");
    expect(shellArg('say "hi" it\'s')).toBe("'say \"hi\" it'\\''s'");
    expect(shellArg('a "b"')).toBe("'a \"b\"'");
  });

  it('builds the attach, discover and refresh lines for an s3:// prefix (real-data R4)', () => {
    const prefix = 's3://overturemaps-us-west-2/release/2026-08-19.0/theme=places/type=place/';
    expect(isRemote(prefix)).toBe(true);
    expect(isRemote('/data/orders.csv')).toBe(false);
    expect(remoteName(prefix)).toBe('place');
    expect(remoteName('s3://b/exports/2024-events/')).toBe('t_2024_events');
    expect(discoverCommand(prefix, true)).toBe(`lakelet tables discover --anonymous ${prefix}`);
    expect(attachCommand('place', prefix, true)).toBe(`lakelet tables attach place --anonymous ${prefix}`);
    expect(attachCommand('events', 's3://acme-exports/events/')).toBe('lakelet tables attach events s3://acme-exports/events/');
    expect(refreshCommand('events')).toBe('lakelet tables refresh events');
  });
});

describe('the gauge screen lines (real-data R8)', () => {
  it('are the four verbs', async () => {
    const { gaugeExportCommand, gaugeHistoryCommand, gaugeProbeCommand, gaugeResetCommand } = await import('./command');
    expect(gaugeHistoryCommand()).toBe('lakelet gauge history');
    expect(gaugeHistoryCommand(50)).toBe('lakelet gauge history --last 50');
    expect(gaugeExportCommand()).toBe('lakelet gauge export');
    expect(gaugeResetCommand()).toBe('lakelet gauge reset --yes');
    expect(gaugeProbeCommand()).toBe('lakelet gauge probe');
  });
});

describe('the Models panel lines (real-data R5, step 6)', () => {
  it('are lakelet run with a selection and its two flags', async () => {
    const { runCommand } = await import('./command');
    expect(runCommand()).toBe('lakelet run');
    expect(runCommand(['big_orders'])).toBe('lakelet run big_orders');
    expect(runCommand([], { plan: true })).toBe('lakelet run --plan');
    expect(runCommand(['by_customer'], { runAnyway: true })).toBe('lakelet run by_customer --run-anyway');
    expect(runCommand(['tag:nightly'])).toBe('lakelet run tag:nightly');
  });
});
