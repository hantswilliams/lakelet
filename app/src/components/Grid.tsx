// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// The result grid (app brief A4): rows as they arrive, virtualised so a hundred thousand
// of them cost what a screenful does. Columns come from the first batch's schema.

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Column, Row } from '../lib/arrow';

const ROW = 30;

const cell = (v: unknown, type: string): string => {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string' && type.startsWith('Decimal') && /^-?\d+(\.\d+)?$/.test(v)) return decimalText(v);
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 6 });
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const numeric = (type: string) => /^(Int|Uint|Float|Decimal)/.test(type);
const decimalText = (v: string) => { const [i, f] = v.split('.'); const sign = i.startsWith('-') ? '-' : ''; const whole = Number(sign ? i.slice(1) : i).toLocaleString(); return f === undefined ? `${sign}${whole}` : `${sign}${whole}.${f}`; };

export function Grid({ columns, rows }: { columns: Column[]; rows: Row[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW,
    overscan: 12,
  });
  if (columns.length === 0) return null;
  const items = virtual.getVirtualItems();
  return (
    <div className="grid" ref={scroller} data-testid="grid" data-rows={rows.length}>
      <div className="grid-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}>
        {columns.map((c) => (
          <div key={c.name} className={numeric(c.type) ? 'num' : ''} title={c.type}>{c.name}</div>
        ))}
      </div>
      <div className="grid-body" style={{ height: virtual.getTotalSize() }}>
        {items.map((item) => {
          const row = rows[item.index];
          return (
            <div
              key={item.key}
              className="grid-row"
              data-index={item.index}
              style={{ transform: `translateY(${item.start}px)`, gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}
            >
              {row.map((v, i) => (
                <div key={i} className={numeric(columns[i].type) ? 'num' : ''}>{cell(v, columns[i].type)}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
