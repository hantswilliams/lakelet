// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Real-data step 6 gate: Simple and Technical mode are one project in two vocabularies;
// the mapping is pinned here so both screens say the same words.

import { describe, expect, it } from 'vitest';
import type { PlannedModel } from './api';
import { humanSeconds, planSummary, testLabel, verdictSentence, words } from './vocabulary';

const model = (over: Partial<PlannedModel>): PlannedModel => ({
  name: 'stg',
  unique_id: 'model.p.stg',
  materialized: 'view',
  depends_on: [],
  compiled_sql: 'select 1',
  verdict: 'green',
  words: 'Green — about 2 s',
  reason: 'reads 1.2 MB',
  est_wall_local: 2,
  est_bytes: 1_200_000,
  error: null,
  description: '',
  path: 'models/stg.sql',
  tests: [],
  last_run: null,
  ...over,
});

describe('the two vocabularies', () => {
  it('map model/test/run to question/check/refresh', () => {
    expect(words('technical')).toMatchObject({ screen: 'Models', model: 'model', tests: 'tests', runAll: 'Run all', runOne: 'Run this', view: 'view', table: 'table' });
    expect(words('simple')).toMatchObject({ screen: 'Questions', model: 'question', tests: 'checks', runAll: 'Refresh all', runOne: 'Refresh', view: 'answered live', table: 'saved as a table' });
  });

  it('name a test as dbt does, or as a sentence', () => {
    const notNull = { name: 'not_null_stg_id', kind: 'not_null', column: 'id', unique_id: 't1' };
    const unique = { name: 'unique_stg_id', kind: 'unique', column: 'id', unique_id: 't2' };
    const accepted = { name: 'accepted_values_stg_c__c0__c1', kind: 'accepted_values', column: 'c', unique_id: 't3' };
    const singular = { name: 'no_negative_totals', kind: 'singular', column: null, unique_id: 't4' };
    expect([notNull, unique, accepted, singular].map((t) => testLabel(t, 'technical'))).toEqual(['not_null(id)', 'unique(id)', 'accepted_values(c)', 'no_negative_totals']);
    expect([notNull, unique, accepted, singular].map((t) => testLabel(t, 'simple'))).toEqual(['id is never empty', 'id is never repeated', 'c is one of the allowed values', 'no negative totals']);
    expect(testLabel({ name: 'positive_amt', kind: 'is_positive', column: 'amt', unique_id: 't5' }, 'simple')).toBe('is positive on amt');
  });

  it('say the verdict as the gauge does, or as the wait', () => {
    expect(verdictSentence(model({}), 'technical')).toBe('Green — about 2 s');
    expect(verdictSentence(model({}), 'simple')).toBe('Ready in about 2 s.');
    expect(verdictSentence(model({ verdict: 'yellow', est_wall_local: 240 }), 'simple')).toBe('Takes a while: about 4.0 min. Fine to start and come back.');
    expect(verdictSentence(model({ verdict: 'red', est_wall_local: 9000 }), 'simple')).toBe('Too big for this machine right now.');
    expect(verdictSentence(model({ error: 'Table with name x does not exist', verdict: null, words: null }), 'technical')).toBe('not estimated: Table with name x does not exist');
    expect(verdictSentence(model({ error: 'nope', verdict: null, words: null }), 'simple')).toContain('could not size');
  });

  it('summarise the plan', () => {
    const models = [model({}), model({ name: 'agg', verdict: 'yellow' }), model({ name: 'big', verdict: 'red' })];
    expect(planSummary(models, 'technical')).toBe('3 models · 1 Red, 1 Yellow');
    expect(planSummary(models, 'simple')).toBe('3 questions · 1 too big for this machine');
    expect(planSummary([model({})], 'technical')).toBe('1 model · all Green');
    expect(planSummary([model({})], 'simple')).toBe('1 question · all quick');
    expect(planSummary([model({ error: 'x', verdict: null })], 'technical')).toBe('1 model · 1 not estimated');
    expect(planSummary([], 'simple')).toBe('0 questions');
  });

  it('say a wait in seconds, minutes or hours', () => {
    expect([0.3, 1.4, 5, 48, 240, 1800, 7200].map(humanSeconds)).toEqual(['under a second', '1.4 s', '5 s', '48 s', '4.0 min', '30 min', '2.0 h']);
  });
});
