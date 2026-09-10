// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// The core's /api (docs: the local HTTP API), called directly from the webview.

import type { Session } from './session';

export interface Health {
  lakelet: string;
  duckdb: string;
  project: string;
  root: string;
  machine: { ram?: number; threads?: number; memory_limit?: number; memory_limit_text?: string };
  throughput_local_mbps: number | null;
  bandwidth_mbps: number | null;
}

export interface TableInfo {
  name: string;
  rows: number;
  bytes: number;
  columns: [string, string][];
  location: string;
  snapshot_id: number | null;
}

export class Api {
  constructor(private readonly session: Session) {}

  get base(): string {
    return `http://127.0.0.1:${this.session.port}/api`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.session.token}`, ...extra };
  }

  async get<T>(path: string): Promise<T> {
    const r = await fetch(`${this.base}${path}`, { headers: this.headers() });
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
    return (await r.json()) as T;
  }

  health(): Promise<Health> {
    return this.get<Health>('/health');
  }

  tables(): Promise<TableInfo[]> {
    return this.get<TableInfo[]>('/tables');
  }
}

export const humanBytes = (n: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return i < 2 ? `${Math.round(n)} ${units[i]}` : `${n.toFixed(1)} ${units[i]}`;
};
