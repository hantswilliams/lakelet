// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Decision D1: which of the three themes is in force, what is remembered, and what is
// written where CSS can see it. The palette itself is CSS and is not tested here; what is
// tested is that System leaves the document alone so the media query decides, and that a
// chosen theme is an attribute that outranks it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { applyTheme, loadTheme, resolvedTheme, saveTheme, THEMES, themeLabel } from './theme';
import { chartColours, planChart, vegaLiteSpec } from './chart';

/** A storage of this test's own. Node 22 and newer expose a `localStorage` global of their
 *  own, which shadows jsdom's and does not carry the whole Storage surface, so a test that
 *  used whatever the runtime provides passed here and failed on a Mac. This depends on
 *  neither. */
function emptyStorage() {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, v); },
    removeItem: (k: string) => { items.delete(k); },
  });
}

beforeEach(() => {
  emptyStorage();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A window whose machine is set dark or light, as `resolvedTheme` asks it. */
function machine(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: dark && query.includes('dark'), media: query }));
}

describe('the three choices', () => {
  it('is System when nothing is remembered, so a fresh window follows the machine', () => {
    expect(loadTheme()).toBe('system');
    expect(THEMES).toEqual(['system', 'light', 'dark']);
    expect(themeLabel.system).toBe('System');
  });

  it('remembers a choice and reads it back, and ignores a value it does not know', () => {
    saveTheme('dark');
    expect(loadTheme()).toBe('dark');
    localStorage.setItem('lakelet.theme', 'sepia');
    expect(loadTheme()).toBe('system');
  });

  it('System leaves the document alone; Light and Dark are an attribute that outranks it', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('resolves System against the machine, and a choice against itself', () => {
    machine(true);
    expect(resolvedTheme('system')).toBe('dark');
    expect(resolvedTheme('light')).toBe('light');
    machine(false);
    expect(resolvedTheme('system')).toBe('light');
    expect(resolvedTheme('dark')).toBe('dark');
  });

  it('survives a window with no storage rather than failing to open', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    expect(loadTheme()).toBe('system');
    expect(() => saveTheme('dark')).not.toThrow();
  });
});

describe('the chart draws in the theme the window is in', () => {
  it('reads its colours from the document rather than writing them down', () => {
    document.documentElement.style.setProperty('--lake', '#6FA8D0');
    document.documentElement.style.setProperty('--muted', '#9AA8B6');
    document.documentElement.style.setProperty('--line', '#2A343E');
    document.documentElement.style.setProperty('--bg', '#11161B');
    try {
      expect(chartColours()).toEqual({
        lake: '#6FA8D0', muted: '#9AA8B6', line: '#2A343E', grid: '#11161B',
      });
      const plan = planChart(
        [{ name: 'c', type: 'Utf8' }, { name: 'n', type: 'Int64' }],
        [['a', 1], ['b', 2]],
      )!;
      const spec = JSON.stringify(vegaLiteSpec(plan));
      expect(spec).toContain('#6FA8D0'); // the dark lake, on the mark
      expect(spec).toContain('#9AA8B6'); // the dark muted, on the axis labels
      expect(spec).not.toContain('#2E6E9E'); // never the light palette's lake
    } finally {
      for (const t of ['--lake', '--muted', '--line', '--bg']) document.documentElement.style.removeProperty(t);
    }
  });

  it('falls back to the light palette when there is no document to ask', () => {
    expect(chartColours(null)).toEqual({
      lake: '#2E6E9E', muted: '#5C6B7A', line: '#D5DBE2', grid: '#EEF1F4',
    });
  });
});

/** The switch itself, as the bar renders it. */
function Switch() {
  const [theme, setTheme] = [loadTheme(), (t: 'system' | 'light' | 'dark') => { saveTheme(t); applyTheme(t); }];
  return (
    <nav data-testid="theme">
      {THEMES.map((t) => (
        <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)} data-testid={`theme-${t}`}>
          {themeLabel[t]}
        </button>
      ))}
    </nav>
  );
}

describe('the switch', () => {
  it('offers the three, and a click remembers and applies', () => {
    render(<Switch />);
    expect(screen.getByTestId('theme').textContent).toBe('SystemLightDark');
    expect(screen.getByTestId('theme-system').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('theme-dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('lakelet.theme')).toBe('dark');
  });
});
