// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Step 1 gate, the welcome screen: the recent list opens on a click, the dialog button is
// the app's, and a browser is told what to do instead.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Welcome } from './Welcome';

const recent = [
  { path: '/home/h/acme', name: 'acme', opened: 1 },
  { path: '/home/h/sales-2026', name: 'sales-2026', opened: 2 },
];

describe('Welcome', () => {
  it('opens a recent project on a click and the dialog from the button', () => {
    const onOpen = vi.fn();
    const onPick = vi.fn();
    render(<Welcome recent={recent} canPick onPick={onPick} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('sales-2026'));
    expect(onOpen).toHaveBeenCalledWith('/home/h/sales-2026');
    fireEvent.click(screen.getByTestId('open-folder'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('hint')).toBeNull();
    expect(screen.getByText(/lakelet init/)).toBeTruthy();
  });

  it('in a browser the button is off and the hint names the way in', () => {
    render(<Welcome recent={[]} canPick={false} onPick={() => {}} onOpen={() => {}} />);
    expect((screen.getByTestId('open-folder') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('hint').textContent).toContain('LAKELET_SIDECAR');
    expect(screen.queryByTestId('recent')).toBeNull();
  });

  it('shows what went wrong and holds the buttons while busy', () => {
    render(<Welcome recent={recent} canPick busy="opening acme…" error="lakelet init failed" onPick={() => {}} onOpen={() => {}} />);
    expect(screen.getByTestId('busy').textContent).toBe('opening acme…');
    expect(screen.getByTestId('open-error').textContent).toContain('lakelet init failed');
    expect((screen.getByTestId('open-folder') as HTMLButtonElement).disabled).toBe(true);
  });
});
