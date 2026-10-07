import { beforeEach, describe, expect, it } from 'vitest';
import { clearLastProject, getLastProject, projectFingerprint, setLastProject } from './sessionRestore';

function exported(overrides: { opacity?: number; isPlaying?: boolean; restartToken?: number; exportedAt?: string; selectedLayerId?: string } = {}) {
  return JSON.stringify({
    version: '1.9.3',
    exportedAt: overrides.exportedAt ?? '2026-10-07T10:00:00.000Z',
    project: {
      name: 'Show',
      selectedLayerId: overrides.selectedLayerId ?? 'a',
      layers: [{
        id: 'a',
        opacity: overrides.opacity ?? 1,
        source: { type: 'video', src: 'clip.mp4', isPlaying: overrides.isPlaying ?? true, restartToken: overrides.restartToken ?? 0 },
      }],
    },
  }, null, 2);
}

describe('projectFingerprint', () => {
  it('ignores play state, restarts, export time and selection', () => {
    expect(projectFingerprint(exported({ isPlaying: false, restartToken: 3, exportedAt: '2027-01-01T00:00:00.000Z', selectedLayerId: 'b' })))
      .toBe(projectFingerprint(exported()));
  });

  it('detects a real edit', () => {
    expect(projectFingerprint(exported({ opacity: 0.5 }))).not.toBe(projectFingerprint(exported()));
  });

  it('passes invalid JSON through unchanged', () => {
    expect(projectFingerprint('not json')).toBe('not json');
  });
});

describe('last project', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
  });

  it('round-trips and clears', () => {
    expect(getLastProject()).toBeNull();
    setLastProject('show.gha', 'C:\\Shows\\show.gha');
    expect(getLastProject()).toEqual({ name: 'show.gha', path: 'C:\\Shows\\show.gha' });
    clearLastProject();
    expect(getLastProject()).toBeNull();
  });

  it('ignores a corrupt entry', () => {
    localStorage.setItem('ghostarcade-last-project', '{oops');
    expect(getLastProject()).toBeNull();
  });
});
