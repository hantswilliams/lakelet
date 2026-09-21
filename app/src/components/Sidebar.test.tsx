// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Decisions U2: the five entries in the mode's words, the one that is on, the keys, the
// explorer under them, and the collapse to icons that is remembered.

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCREENS, Sidebar, loadCollapsed, screenForKey, screenLabel } from './Sidebar';

// Node 22 and newer expose a `localStorage` global of their own that shadows jsdom's and
// has no `clear()` (it failed on the Mac); this storage depends on neither.
function emptyStorage() {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, v); },
    removeItem: (k: string) => { items.delete(k); },
  });
}

beforeEach(emptyStorage);
afterEach(() => vi.unstubAllGlobals());

// the key's modifier as the sidebar spells it on this machine (the key hint is CSS text from `data-key`)
const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

describe('Sidebar', () => {
  it('lists the five screens in order, in Technical and Simple words, with the one that is on pressed', () => {
    const onScreen = vi.fn();
    const { rerender } = render(<Sidebar screen="lineage" mode="technical" onScreen={onScreen}><p>the explorer</p></Sidebar>);
    const nav = screen.getByTestId('screens');
    expect([...nav.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Tables', 'Models', 'Lineage', 'Changes', 'Gauge']);
    expect([...nav.querySelectorAll('button')].map((b) => b.dataset.key)).toEqual(['⌘1', '⌘2', '⌘3', '⌘4', '⌘5'].map((k) => k.replace('⌘', modKey)));
    expect(screen.getByTestId('screen-lineage').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('screen-tables').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('the explorer')).toBeTruthy();
    fireEvent.click(screen.getByTestId('screen-gauge'));
    expect(onScreen).toHaveBeenCalledWith('gauge');

    rerender(<Sidebar screen="changes" mode="simple" onScreen={onScreen} />);
    expect(SCREENS.map((s) => screenLabel(s, 'simple'))).toEqual(['Tables', 'Questions', 'Map', 'Recent', 'Gauge']);
    expect(screen.getByTestId('screen-models').textContent).toContain('Questions');
    expect(screen.getByTestId('screen-changes').getAttribute('aria-pressed')).toBe('true');
  });

  it('⌘/Ctrl+1…5 name the screens; other keys and Alt do not', () => {
    const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => screenForKey({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...mods });
    expect(key('1', { metaKey: true })).toBe('tables');
    expect(key('2', { ctrlKey: true })).toBe('models');
    expect(key('5', { metaKey: true })).toBe('gauge');
    expect(key('6', { metaKey: true })).toBeUndefined();
    expect(key('1')).toBeUndefined();
    expect(key('1', { metaKey: true, altKey: true })).toBeUndefined();
    expect(key('k', { metaKey: true })).toBeUndefined();
  });

  it('collapses to icons on a click, hides the explorer, and remembers it', () => {
    const { unmount } = render(<Sidebar screen="tables" mode="technical" onScreen={() => {}}><p>the explorer</p></Sidebar>);
    expect(screen.getByTestId('sidebar').dataset.collapsed).toBeUndefined();
    fireEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.getByTestId('sidebar').dataset.collapsed).toBe('true');
    expect(screen.queryByText('the explorer')).toBeNull();
    expect(screen.getByTestId('screen-tables').getAttribute('title')).toMatch(/^Tables \((⌘|Ctrl\+)1\)$/); // the name survives as the tooltip
    expect(loadCollapsed()).toBe(true);
    unmount();
    render(<Sidebar screen="tables" mode="technical" onScreen={() => {}}><p>the explorer</p></Sidebar>);
    expect(screen.getByTestId('sidebar').dataset.collapsed).toBe('true');
    fireEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.getByText('the explorer')).toBeTruthy();
    expect(loadCollapsed()).toBe(false);
  });
});
