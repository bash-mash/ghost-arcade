/**
 * screenLayout — pure helpers for placing output Screens on displays.
 * Kept free of stores/Electron so they can be unit-tested directly.
 */

import type { OutputSlice } from '../stores/settings';

export type DisplayInfo = {
  id: number; label: string; width: number; height: number;
  x: number; y: number; isPrimary: boolean; scaleFactor: number;
};

/** Size of the rig: display widths side by side (minus edge-blend
 *  overlap) × tallest display. Null when no screen has a known display. */
export function computeMasterCanvasSize(
  screenList: OutputSlice[],
  displays: DisplayInfo[],
): { width: number; height: number } | null {
  const active = screenList.filter(s => s.enabled && s.targetType === 'display' && s.displayId != null);
  let totalW = 0, maxH = 0;
  for (const s of active) {
    const d = displays.find(dd => dd.id === s.displayId);
    if (!d) continue;
    const dw = d.width * d.scaleFactor;
    const dh = d.height * d.scaleFactor;
    totalW += dw - dw * (s.edgeBlendLeft + s.edgeBlendRight) / 2;
    maxH = Math.max(maxH, dh);
  }
  return totalW > 0 && maxH > 0 ? { width: totalW, height: maxH } : null;
}

/** Pair enabled Screens that have no display yet with unused displays,
 *  left→right: screens by their slice position, displays by their
 *  desktop position. Existing assignments are kept. Prefers external
 *  (non-primary) displays; falls back to all displays when there are
 *  none. Returns screenId → displayId for the screens it assigned. */
export function planScreenDisplayAssignments(
  screenList: OutputSlice[],
  displays: DisplayInfo[],
): Map<string, number> {
  const enabled = screenList.filter(s => s.enabled);
  const external = displays.filter(d => !d.isPrimary);
  const candidates = (external.length > 0 ? external : displays)
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const taken = new Set(
    enabled
      .filter(s => s.targetType === 'display' && s.displayId != null)
      .map(s => s.displayId as number),
  );
  const free = candidates.filter(d => !taken.has(d.id));
  const unassigned = enabled
    .filter(s => s.targetType !== 'display' || s.displayId == null)
    .sort((a, b) => a.cropX - b.cropX || a.cropY - b.cropY);

  const plan = new Map<string, number>();
  for (const s of unassigned) {
    const d = free.shift();
    if (!d) break;
    plan.set(s.id, d.id);
  }
  return plan;
}
