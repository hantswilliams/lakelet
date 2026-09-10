// Vitest: unmount after every test so queries never see a previous render.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
