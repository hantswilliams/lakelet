// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Decisions P1: the dialog takes a name under a parent, offers the two places for the
// tables, checks a bucket before the folder is made and refuses to make it when the check
// fails, and shows the `lakelet init` line it runs.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BucketCheck } from '../lib/session';
import { NewProject, isProjectName } from './NewProject';

const creds = { configured: true, source: 'environment' as const, profile: null, region: 'us-east-1', endpoint: null };
const pass = (prefix: string): BucketCheck => ({ prefix, ok: true, read: true, write: true, error: null, sentence: `${prefix} is writable with keys from the environment; one object was written and removed.`, credentials: creds });
const fail = (prefix: string): BucketCheck => ({ prefix, ok: false, read: true, write: false, error: 'ACCESS_DENIED during PutObject operation', sentence: `${prefix}: ACCESS_DENIED during PutObject operation (keys from the environment).`, credentials: creds });

const base = { canCreate: true, defaultParent: '/home/h/Documents', onChooseParent: async () => null, onClose: () => {} };

describe('NewProject', () => {
  it('a project name is one folder name', () => {
    expect(isProjectName(' acme ')).toBe(true);
    for (const bad of ['', ' ', '.', '..', 'a/b', 'a\\b']) expect(isProjectName(bad)).toBe(false);
  });

  it('in this folder: the name under the parent, the init line, Create makes it', async () => {
    const onCreate = vi.fn(async () => {});
    render(<NewProject {...base} check={async (p) => pass(p)} onCreate={onCreate} />);
    const create = screen.getByTestId('create-project') as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(screen.getByTestId('project-parent').textContent).toBe('/home/h/Documents');
    fireEvent.change(screen.getByTestId('project-name'), { target: { value: 'a/b' } });
    expect(screen.getByTestId('name-error')).toBeTruthy();
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('project-name'), { target: { value: ' acme ' } });
    expect(screen.queryByTestId('name-error')).toBeNull();
    expect(screen.getByTestId('project-folder').textContent).toBe('/home/h/Documents/acme');
    expect(screen.getByTestId('command').textContent).toContain('lakelet init /home/h/Documents/acme');
    expect(screen.getByTestId('command').textContent).not.toContain('--warehouse');
    expect(create.disabled).toBe(false);
    expect(create.textContent).toBe('Create');
    fireEvent.click(create);
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('/home/h/Documents', 'acme', undefined));
  });

  it('Choose… changes the parent', async () => {
    render(<NewProject {...base} onChooseParent={async () => '/data/lakes'} check={async (p) => pass(p)} onCreate={async () => {}} />);
    fireEvent.change(screen.getByTestId('project-name'), { target: { value: 'acme' } });
    await act(async () => { fireEvent.click(screen.getByTestId('choose-parent')); });
    expect(screen.getByTestId('project-parent').textContent).toBe('/data/lakes');
    expect(screen.getByTestId('project-folder').textContent).toBe('/data/lakes/acme');
  });

  it('in a bucket: the prefix is checked before the folder is made, and a failed check stops it', async () => {
    const check = vi.fn(async (p: string) => (p.startsWith('s3://denied') ? fail(p) : pass(p)));
    const onCreate = vi.fn(async () => {});
    render(<NewProject {...base} check={check} onCreate={onCreate} aws={{ ...creds, configured: false, source: 'none' }} />);
    fireEvent.change(screen.getByTestId('project-name'), { target: { value: 'acme' } });
    fireEvent.click(screen.getByTestId('where-bucket'));
    const create = screen.getByTestId('create-project') as HTMLButtonElement;
    expect(create.disabled).toBe(true); // no prefix yet
    expect(screen.getByTestId('no-credentials')).toBeTruthy(); // the core has none, said before the check
    fireEvent.change(screen.getByTestId('warehouse'), { target: { value: 's3://acme-lake' } });
    expect(screen.getByTestId('warehouse-error')).toBeTruthy();
    fireEvent.change(screen.getByTestId('warehouse'), { target: { value: ' s3://denied-lake/analytics ' } });
    expect(screen.queryByTestId('warehouse-error')).toBeNull();
    expect(screen.getByTestId('command').textContent).toContain('lakelet init /home/h/Documents/acme --warehouse s3://denied-lake/analytics');
    expect(create.textContent).toBe('Check and create');
    fireEvent.click(create);
    await waitFor(() => expect(screen.getByTestId('check-result').dataset.ok).toBe('false'));
    expect(check).toHaveBeenCalledWith('s3://denied-lake/analytics');
    expect(screen.getByTestId('check-result').textContent).toContain('ACCESS_DENIED');
    expect(onCreate).not.toHaveBeenCalled();
    // a prefix that passes: the check's sentence, then Create makes the folder with the warehouse
    fireEvent.change(screen.getByTestId('warehouse'), { target: { value: 's3://acme-lake/analytics' } });
    expect(screen.queryByTestId('check-result')).toBeNull(); // the result was for the other prefix
    fireEvent.click(screen.getByTestId('check-bucket'));
    await waitFor(() => expect(screen.getByTestId('check-result').dataset.ok).toBe('true'));
    expect(screen.queryByTestId('no-credentials')).toBeNull();
    expect(create.textContent).toBe('Create');
    fireEvent.click(create);
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('/home/h/Documents', 'acme', 's3://acme-lake/analytics'));
    expect(check).toHaveBeenCalledTimes(2); // not checked again on Create
  });

  it('a check that cannot run, and a create that fails, are lines in the dialog; Esc closes it', async () => {
    const onClose = vi.fn();
    render(<NewProject {...base} onClose={onClose} check={async () => { throw new Error('could not run lakelet bucket check'); }} onCreate={async () => { throw new Error('lakelet init failed: no'); }} />);
    fireEvent.change(screen.getByTestId('project-name'), { target: { value: 'acme' } });
    fireEvent.click(screen.getByTestId('where-bucket'));
    fireEvent.change(screen.getByTestId('warehouse'), { target: { value: 's3://acme-lake/analytics' } });
    fireEvent.click(screen.getByTestId('check-bucket'));
    await waitFor(() => expect(screen.getByTestId('new-project-error').textContent).toContain('could not run'));
    fireEvent.click(screen.getByTestId('where-folder'));
    fireEvent.click(screen.getByTestId('create-project'));
    await waitFor(() => expect(screen.getByTestId('new-project-error').textContent).toContain('lakelet init failed'));
    expect((screen.getByTestId('create-project') as HTMLButtonElement).disabled).toBe(false); // try again
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('in a browser the folder cannot be made but the form and the check still work', () => {
    render(<NewProject {...base} canCreate={false} defaultParent={null} check={async (p) => pass(p)} onCreate={async () => {}} />);
    fireEvent.change(screen.getByTestId('project-name'), { target: { value: 'acme' } });
    expect((screen.getByTestId('create-project') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('choose-parent')).toBeNull();
    expect(screen.getByText(/In a browser the folder cannot be made/)).toBeTruthy();
  });
});
