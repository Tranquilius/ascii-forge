import { describe, expect, it } from 'vitest';
import type { SourceFrame } from './types';
import { advancePlayhead, totalDurationMs } from './timeline';

/** Frames only need durationMs for timing math; the bitmap is never touched. */
function seq(...durations: number[]): SourceFrame[] {
  return durations.map((durationMs) => ({ bitmap: null as unknown as ImageBitmap, durationMs }));
}

describe('totalDurationMs', () => {
  it('sums frame durations', () => {
    expect(totalDurationMs(seq(100, 100, 50))).toBe(250);
  });

  it('is 0 for an empty sequence', () => {
    expect(totalDurationMs([])).toBe(0);
  });
});

describe('advancePlayhead', () => {
  const frames = seq(100, 100, 100);

  it('stays on the current frame when the delta is under its duration', () => {
    const r = advancePlayhead(frames, 0, 0, 40, true);
    expect(r).toEqual({ index: 0, elapsedInFrameMs: 40, ended: false });
  });

  it('advances one frame and carries the remainder forward', () => {
    const r = advancePlayhead(frames, 0, 0, 130, true);
    expect(r.index).toBe(1);
    expect(r.elapsedInFrameMs).toBe(30);
  });

  it('accumulates leftover time across ticks instead of snapping', () => {
    // three 40ms ticks = 120ms, which must cross the 100ms frame boundary
    let state = { index: 0, elapsedInFrameMs: 0, ended: false };
    for (let i = 0; i < 3; i++) {
      state = advancePlayhead(frames, state.index, state.elapsedInFrameMs, 40, true);
    }
    expect(state.index).toBe(1);
    expect(state.elapsedInFrameMs).toBe(20);
  });

  it('wraps to the start when looping', () => {
    const r = advancePlayhead(frames, 2, 0, 150, true);
    expect(r.index).toBe(0);
    expect(r.ended).toBe(false);
  });

  it('stops on the final frame when not looping', () => {
    const r = advancePlayhead(frames, 2, 0, 150, false);
    expect(r).toEqual({ index: 2, elapsedInFrameMs: 0, ended: true });
  });

  it('treats a zero-duration frame as the fallback rather than spinning', () => {
    const r = advancePlayhead(seq(0, 0, 0), 0, 0, 250, true, 100);
    expect(r.index).toBe(2);
  });

  it('handles a single-frame sequence without moving', () => {
    const r = advancePlayhead(seq(100), 0, 0, 5000, true);
    expect(r.index).toBe(0);
  });

  it('handles an empty sequence', () => {
    expect(advancePlayhead([], 0, 0, 100, true).ended).toBe(true);
  });

  it('clamps an out-of-range starting index', () => {
    const r = advancePlayhead(frames, 99, 0, 10, true);
    expect(r.index).toBeLessThan(frames.length);
  });

  it('does not hang when a huge delta arrives after a stall', () => {
    const r = advancePlayhead(frames, 0, 0, 10_000_000, true);
    expect(r.index).toBeGreaterThanOrEqual(0);
    expect(r.index).toBeLessThan(frames.length);
  });
});
