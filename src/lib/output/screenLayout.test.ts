import { describe, expect, it } from 'vitest';
import type { OutputSlice } from '../stores/settings';
import { computeMasterCanvasSize, planScreenDisplayAssignments, type DisplayInfo } from './screenLayout';

function screen(id: string, cropX: number, extra: Partial<OutputSlice> = {}): OutputSlice {
  return {
    id, name: id, enabled: true,
    cropX, cropY: 0, cropW: 0.5, cropH: 1,
    targetType: 'sender', displayId: null,
    edgeBlendLeft: 0, edgeBlendRight: 0, edgeBlendTop: 0, edgeBlendBottom: 0,
    ...extra,
  } as OutputSlice;
}

function display(id: number, x: number, extra: Partial<DisplayInfo> = {}): DisplayInfo {
  return { id, label: `D${id}`, width: 1920, height: 1200, x, y: 0, isPrimary: false, scaleFactor: 1, ...extra };
}

const laptop = display(1, 0, { isPrimary: true, width: 1512, height: 982 });

describe('planScreenDisplayAssignments', () => {
  it('pairs screens left→right with external displays left→right', () => {
    const plan = planScreenDisplayAssignments(
      [screen('right', 0.5), screen('left', 0)],
      [laptop, display(3, 3432), display(2, 1512)],
    );
    expect([...plan]).toEqual([['left', 2], ['right', 3]]);
  });

  it('keeps existing assignments and gives the rest the unused displays', () => {
    const plan = planScreenDisplayAssignments(
      [screen('left', 0), screen('right', 0.5, { targetType: 'display', displayId: 2 })],
      [laptop, display(2, 1512), display(3, 3432)],
    );
    expect([...plan]).toEqual([['left', 3]]);
  });

  it('leaves extra screens unassigned when there are more screens than projectors', () => {
    const plan = planScreenDisplayAssignments(
      [screen('a', 0), screen('b', 0.5)],
      [laptop, display(2, 1512)],
    );
    expect([...plan]).toEqual([['a', 2]]);
  });

  it('leaves sender screens alone when keepSenders is set (Spout output on)', () => {
    const plan = planScreenDisplayAssignments(
      [screen('spout', 0), screen('proj', 0.5, { targetType: 'display', displayId: null })],
      [laptop, display(2, 1512), display(3, 3432)],
      { keepSenders: true },
    );
    expect([...plan]).toEqual([['proj', 2]]);
  });

  it('skips disabled screens and falls back to the primary display when it is the only one', () => {
    const plan = planScreenDisplayAssignments(
      [screen('off', 0, { enabled: false }), screen('on', 0.5)],
      [laptop],
    );
    expect([...plan]).toEqual([['on', 1]]);
  });
});

describe('computeMasterCanvasSize', () => {
  it('sums two side-by-side 1920×1200 projectors', () => {
    const size = computeMasterCanvasSize(
      [screen('l', 0, { targetType: 'display', displayId: 2 }), screen('r', 0.5, { targetType: 'display', displayId: 3 })],
      [laptop, display(2, 1512), display(3, 3432)],
    );
    expect(size).toEqual({ width: 3840, height: 1200 });
  });

  it('returns null when no screen has a display', () => {
    expect(computeMasterCanvasSize([screen('l', 0)], [display(2, 0)])).toBeNull();
  });
});
