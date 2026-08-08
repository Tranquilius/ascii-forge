import type { SourceFrame } from './types';

/**
 * Pure timing math for frame-sequence playback. Kept free of any clock or DOM so the
 * advance logic is testable directly and the playback hook stays a thin rAF wrapper.
 */

/** Total duration of a sequence in milliseconds. */
export function totalDurationMs(frames: readonly SourceFrame[]): number {
  let total = 0;
  for (const frame of frames) total += Math.max(0, frame.durationMs);
  return total;
}

/**
 * Advance a playhead by `deltaMs` and report the resulting frame index.
 *
 * Carries leftover time forward rather than snapping, so playback stays in step with the
 * real clock even when the frame durations don't divide evenly into the frame budget.
 * Frames with a zero/absent duration fall back to `fallbackMs` so a malformed source
 * can't spin forever on one frame.
 */
export function advancePlayhead(
  frames: readonly SourceFrame[],
  index: number,
  elapsedInFrameMs: number,
  deltaMs: number,
  loop: boolean,
  fallbackMs = 100,
): { index: number; elapsedInFrameMs: number; ended: boolean } {
  if (frames.length === 0) return { index: 0, elapsedInFrameMs: 0, ended: true };
  if (frames.length === 1) return { index: 0, elapsedInFrameMs: 0, ended: !loop };

  let i = Math.min(Math.max(index, 0), frames.length - 1);
  let acc = elapsedInFrameMs + Math.max(0, deltaMs);

  // Cap the number of frames a single tick may skip. A long stall (backgrounded tab)
  // would otherwise burn a full loop's worth of iterations here to land where a simple
  // wrap gets to anyway.
  let guard = frames.length * 2;
  while (guard-- > 0) {
    const frameMs = frames[i].durationMs > 0 ? frames[i].durationMs : fallbackMs;
    if (acc < frameMs) break;
    acc -= frameMs;
    i++;
    if (i >= frames.length) {
      if (!loop) return { index: frames.length - 1, elapsedInFrameMs: 0, ended: true };
      i = 0;
    }
  }

  return { index: i, elapsedInFrameMs: acc, ended: false };
}
