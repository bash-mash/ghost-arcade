/**
 * screenWindows — open/close output Screens on their physical displays.
 *
 * Shared by the Screens panel (per-screen "Open on display") and the
 * toolbar Fullscreen button, which opens every enabled Screen on its
 * projector in one click when Screens are set up.
 */

import { get, writable } from 'svelte/store';
import { isDesktopApp, invoke } from '$lib/bridge';
import { screens, screenActions } from '../stores/screens';
import { settings, type OutputSlice } from '../stores/settings';
import { project } from '../stores/layers';
import { computeMasterCanvasSize, planScreenDisplayAssignments, type DisplayInfo } from './screenLayout';

export { computeMasterCanvasSize, planScreenDisplayAssignments, type DisplayInfo };

/** Ids of Screens currently open on a display (from the main process). */
export const openScreenWindowIds = writable<string[]>([]);

export async function getDisplays(): Promise<DisplayInfo[]> {
  if (!isDesktopApp) return [];
  try {
    return ((await invoke('get_displays')) as DisplayInfo[]) || [];
  } catch {
    return [];
  }
}

export async function refreshOpenScreenWindows(): Promise<void> {
  if (!isDesktopApp) return;
  try {
    const ids = (await invoke('output_list_slice_windows')) as string[];
    openScreenWindowIds.set(Array.isArray(ids) ? ids : []);
  } catch {
    openScreenWindowIds.set([]);
  }
}

// Track slice windows opened via window.open (zero-copy path) so we
// can close them locally without the editor losing the reference.
const zeroCopySliceWindows = new Map<string, Window>();

export async function openScreenOnDisplay(s: OutputSlice): Promise<void> {
  if (!isDesktopApp || s.displayId == null) return;
  // Zero-copy path: open the slice window via window.open so it lives
  // in the SAME renderer process as the editor. SliceOutputApp can
  // then read the editor's already-warped presentCanvas via
  // window.opener.document and crop its region from that — no local
  // re-render, no fragile hidden-canvas → texture upload. Master warp
  // applies on the slice display automatically because the source is
  // the editor's WGSL-warped canvas.
  const zeroCopy = !!get(settings).experimental?.outputZeroCopy;
  if (zeroCopy) {
    try {
      await invoke('configure_next_output_window', {
        displayId: s.displayId,
        fullscreen: true,
      });
      const url = new URL(window.location.href);
      url.search = `?mode=slice-display&sliceId=${encodeURIComponent(s.id)}&webgpu-disable=1`;
      const newWin = window.open(url.toString(), `ga-slice-${s.id}`, 'popup=true');
      if (!newWin) {
        alert('Slice display window failed to open. Check popup-blocker behaviour.');
        return;
      }
      zeroCopySliceWindows.set(s.id, newWin);
      // Attach this slice window as an additional output target. The
      // editor's pump fan-outs each VideoFrame to all attached ports —
      // Fullscreen and slices can coexist. The slice window receives the
      // same warped frame and crops its own region from it.
      const { attachOutputWindow } = await import('$lib/sync/outputSharedTexturePresenter');
      attachOutputWindow(newWin, `slice:${s.id}`);
      console.log(`[ScreenWindows] slice ${s.id} opened on display ${s.displayId} [zero-copy]`);
      await refreshOpenScreenWindows();
      return;
    } catch (err) {
      console.error('[ScreenWindows] zero-copy open failed, falling back to IPC path:', err);
      // fall through to legacy IPC
    }
  }
  await invoke('output_open_slice_window', { sliceId: s.id, displayId: s.displayId }).catch(() => {});
  await refreshOpenScreenWindows();
}

export async function closeScreenOnDisplay(s: Pick<OutputSlice, 'id'>): Promise<void> {
  if (!isDesktopApp) return;
  // Close the zero-copy window proxy locally first if we opened it
  // via window.open. Electron's did-create-window listener also tracks
  // it in `sliceWindows`, so the editor's `output_close_slice_window`
  // IPC also closes it as a belt-and-suspenders. Either path works.
  const zc = zeroCopySliceWindows.get(s.id);
  if (zc && !zc.closed) {
    try { zc.close(); } catch { /* */ }
  }
  zeroCopySliceWindows.delete(s.id);
  // Detach from the presenter so the pump stops fan-out to a dead port.
  try {
    const { detachOutputWindow } = await import('$lib/sync/outputSharedTexturePresenter');
    detachOutputWindow(`slice:${s.id}`);
  } catch { /* */ }
  await invoke('output_close_slice_window', { sliceId: s.id }).catch(() => {});
  await refreshOpenScreenWindows();
}

// Auto-close any windows whose backing screen got removed/disabled/retargeted.
if (isDesktopApp) {
  // Screen windows can be closed from their own side (Esc), which sends no
  // event here — resync when the editor regains focus.
  window.addEventListener('focus', () => { void refreshOpenScreenWindows(); });
  let closingStale = false;
  const closeStale = () => {
    const open = get(openScreenWindowIds);
    if (closingStale || open.length === 0) return;
    const live = get(screens)
      .filter(s => s.enabled && (s.targetType ?? 'sender') === 'display' && s.displayId != null)
      .map(s => s.id);
    const stale = open.filter(id => !live.includes(id));
    if (stale.length === 0) return;
    closingStale = true;
    Promise.all(stale.map(id => closeScreenOnDisplay({ id })))
      .finally(() => { closingStale = false; });
  };
  screens.subscribe(closeStale);
  openScreenWindowIds.subscribe(closeStale);
}

// ─── Master canvas ──────────────────────────────────────────────────

export function setMasterCanvas(w: number, h: number): void {
  const W = Math.max(128, Math.min(15360, Math.round(w)));
  const H = Math.max(128, Math.min(15360, Math.round(h)));
  settings.update(s => ({ ...s, output: { ...s.output, masterCanvasWidth: W, masterCanvasHeight: H } }));
}

// ─── Open all ───────────────────────────────────────────────────────

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Open every enabled Screen on its display (auto-assigning unassigned
 *  ones), and size the master + project canvas to the rig. Returns how
 *  many screens were opened and how many still have no display. */
export async function openAllScreens(): Promise<{ opened: number; unassigned: number }> {
  if (!isDesktopApp) return { opened: 0, unassigned: 0 };
  const displays = await getDisplays();

  const keepSenders = !!get(settings).output?.spoutEnabled;
  for (const [id, displayId] of planScreenDisplayAssignments(get(screens), displays, { keepSenders })) {
    screenActions.update(id, { targetType: 'display', displayId });
  }

  const ready = get(screens).filter(s => s.enabled && s.targetType === 'display' && s.displayId != null);
  const unassigned = get(screens).filter(s =>
    s.enabled && (s.targetType === 'display' ? s.displayId == null : !keepSenders)
  ).length;

  const size = computeMasterCanvasSize(get(screens), displays);
  if (size) {
    setMasterCanvas(size.width, size.height);
    // The editor canvas follows the project size; match it to the rig so
    // each screen's slice maps 1:1 onto its projector.
    project.setProjectDimensions(Math.round(size.width), Math.round(size.height));
  }

  await refreshOpenScreenWindows();
  let opened = 0;
  for (const s of ready) {
    if (get(openScreenWindowIds).includes(s.id)) { opened++; continue; }
    await openScreenOnDisplay(s);
    opened++;
    // Give the main process time to place each window before the next.
    await wait(150);
  }
  return { opened, unassigned };
}

export async function closeAllScreens(): Promise<void> {
  if (!isDesktopApp) return;
  await refreshOpenScreenWindows();
  for (const id of get(openScreenWindowIds)) {
    await closeScreenOnDisplay({ id });
  }
}
