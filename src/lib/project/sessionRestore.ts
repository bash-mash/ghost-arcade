/**
 * sessionRestore — reopen the last project on startup.
 *
 * Remembers the .gha the user last opened or saved (set from
 * recentFiles.add) so App can load it again on the next launch, and
 * fingerprints exported projects so the crash autosave only kicks in
 * when there are real unsaved edits.
 */

export interface LastProject {
  name: string;
  path: string;
}

const LAST_PROJECT_KEY = 'ghostarcade-last-project';

export function getLastProject(): LastProject | null {
  try {
    const raw = localStorage.getItem(LAST_PROJECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.path === 'string' && parsed.path) {
      return { name: typeof parsed.name === 'string' ? parsed.name : parsed.path, path: parsed.path };
    }
  } catch {
    // Corrupt entry — treat as no last project.
  }
  return null;
}

export function setLastProject(name: string, path: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, JSON.stringify({ name, path }));
  } catch {
    // Ignore quota errors — reopening the last project is a convenience.
  }
}

export function clearLastProject(): void {
  try {
    localStorage.removeItem(LAST_PROJECT_KEY);
  } catch { /* ignore */ }
}

// Keys that change while the show runs but aren't edits worth recovering:
// play state, restart presses, the export timestamp, and layer selection.
const VOLATILE_KEYS = new Set(['isPlaying', 'restartToken', 'exportedAt', 'selectedLayerId']);

/** Stable comparison string for an exported project (exportProjectJSON),
 *  ignoring runtime-only fields. Returns the input unchanged if it isn't
 *  valid JSON. */
export function projectFingerprint(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), (key, value) =>
      VOLATILE_KEYS.has(key) ? undefined : value,
    );
  } catch {
    return json;
  }
}
