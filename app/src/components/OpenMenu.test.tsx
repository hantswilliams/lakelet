// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// "Open…" in the bar: the recent projects, the folder dialog, and — since the welcome
// screen is never seen once a project exists — the way to make a project whose tables
// live in a bucket (decisions W1): a prefix, then the dialog.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenMenu } from './OpenMenu';

afterEach(cleanup);

const recent = [{ path: '/home/h/acme', name: 'acme', opened: 1 }, { path: '/home/h/demo', name: 'demo', opened: 2 }];

describe('the Open menu', () => {
  it('lists the other recent projects, opens the dialog, and names a bucket for a new folder', () => {
    const onOpen = vi.fn();
    const onPick = vi.fn();
    render(<OpenMenu recent={recent} current="/home/h/demo" onOpen={onOpen} onPick={onPick} />);
    fireEvent.click(screen.getByTestId('open-menu'));
    expect(screen.queryByText('demo')).toBeNull(); // this window's own project is left out
    fireEvent.click(screen.getByText('acme'));
    expect(onOpen).toHaveBeenCalledWith('/home/h/acme');
    fireEvent.click(screen.getByTestId('open-menu'));
    fireEvent.click(screen.getByText('Other folder…'));
    expect(onPick).toHaveBeenCalledWith();
    // the bucket row: nothing until the prefix is an s3://bucket/prefix, then the dialog with it
    fireEvent.click(screen.getByTestId('open-menu'));
    fireEvent.click(screen.getByTestId('open-bucket'));
    const pick = screen.getByTestId('bucket-pick') as HTMLButtonElement;
    expect(pick.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('bucket-prefix'), { target: { value: 's3://acme-lake' } });
    expect(pick.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('bucket-prefix'), { target: { value: ' s3://acme-lake/analytics ' } });
    expect(pick.disabled).toBe(false);
    fireEvent.click(pick);
    expect(onPick).toHaveBeenLastCalledWith('s3://acme-lake/analytics');
    expect(screen.queryByTestId('bucket-row')).toBeNull(); // the menu closed and the row reset
  });
});
