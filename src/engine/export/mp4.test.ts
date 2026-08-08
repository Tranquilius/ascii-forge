import { describe, expect, it } from 'vitest';
import { planMp4Loop } from './mp4';
import { planShimmerLoop } from './gif';

describe('planMp4Loop', () => {
  it('allows 60fps, unlike the GIF path', () => {
    expect(planMp4Loop(1, 500, 60).effectiveFps).toBe(60);
    // the GIF planner caps at 50 because the format stores delay in 10ms units
    expect(planShimmerLoop(1, 500, 60).effectiveFps).toBe(50);
  });

  it('derives frame count from the snapped duration at the full rate', () => {
    const plan = planMp4Loop(2, 500, 60);
    expect(plan.effectiveDurationSec).toBeCloseTo(2, 5);
    expect(plan.frameCount).toBe(120);
  });

  it('snaps duration to a whole number of holds so the loop is seamless', () => {
    const plan = planMp4Loop(2.2, 500, 60);
    expect(plan.loopSteps).toBe(4);
    expect(plan.effectiveDurationSec).toBeCloseTo(2, 5);
  });

  it('scales frame count with duration', () => {
    expect(planMp4Loop(4, 500, 30).frameCount).toBe(planMp4Loop(1, 500, 30).frameCount * 4);
  });

  it('clamps absurd frame rates rather than trying to encode them', () => {
    expect(planMp4Loop(1, 500, 5000).effectiveFps).toBeLessThanOrEqual(120);
    expect(planMp4Loop(1, 500, 0).effectiveFps).toBeGreaterThanOrEqual(1);
  });

  it('always produces at least two frames', () => {
    expect(planMp4Loop(0.01, 500, 60).frameCount).toBeGreaterThanOrEqual(2);
  });
});
