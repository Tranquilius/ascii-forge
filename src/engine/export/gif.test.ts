import { describe, expect, it } from 'vitest';
import { GIF_MAX_FPS, gifDelayMs, planShimmerLoop } from './gif';

describe('gifDelayMs', () => {
  it('maps the format ceiling to a 20ms delay', () => {
    expect(gifDelayMs(GIF_MAX_FPS)).toBe(20);
  });

  it('never returns a delay below 20ms — renderers clamp those up to 100ms', () => {
    for (const fps of [50, 60, 100, 240]) {
      expect(gifDelayMs(fps)).toBeGreaterThanOrEqual(20);
    }
  });

  it('snaps to the 10ms grid the format stores', () => {
    for (const fps of [1, 8, 12, 24, 30, 50]) {
      expect(gifDelayMs(fps) % 10).toBe(0);
    }
  });

  it('gives the expected delays at common rates', () => {
    expect(gifDelayMs(25)).toBe(40);
    expect(gifDelayMs(10)).toBe(100);
  });

  it('handles nonsense input without producing a broken delay', () => {
    expect(gifDelayMs(0)).toBeGreaterThanOrEqual(20);
    expect(gifDelayMs(-5)).toBeGreaterThanOrEqual(20);
  });
});

describe('planShimmerLoop', () => {
  it('snaps duration to a whole number of glyph holds so the loop is seamless', () => {
    // 2.2s at a 500ms hold cannot loop cleanly; it must snap to 2.0s (4 holds)
    const plan = planShimmerLoop(2.2, 500, 50);
    expect(plan.loopSteps).toBe(4);
    expect(plan.effectiveDurationSec).toBeCloseTo(2, 5);
  });

  it('derives frame count from the snapped duration and capped fps', () => {
    const plan = planShimmerLoop(2, 500, 50);
    expect(plan.effectiveFps).toBe(50);
    expect(plan.frameCount).toBe(100);
  });

  it('caps fps at the GIF ceiling rather than silently producing a slow file', () => {
    const plan = planShimmerLoop(1, 500, 60);
    expect(plan.effectiveFps).toBe(GIF_MAX_FPS);
  });

  it('always yields at least one hold and two frames', () => {
    const plan = planShimmerLoop(0.01, 500, 50);
    expect(plan.loopSteps).toBeGreaterThanOrEqual(1);
    expect(plan.frameCount).toBeGreaterThanOrEqual(2);
  });

  it('scales frame count with duration', () => {
    const short = planShimmerLoop(1, 500, 25);
    const long = planShimmerLoop(4, 500, 25);
    expect(long.frameCount).toBe(short.frameCount * 4);
  });
});
