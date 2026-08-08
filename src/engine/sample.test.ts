import { describe, expect, it } from 'vitest';
import { computeRows, effectiveCols } from './sample';

describe('computeRows', () => {
  it('reproduces a square image as a square grid once cell aspect is corrected', () => {
    // A monospace cell ~0.5 wide as it is tall: a square image needs roughly half as
    // many rows as columns to *look* square once rendered, so cols===rows here would
    // actually read as too tall. Assert the correction is applied, not skipped.
    const rows = computeRows(120, 1000, 1000, 0.5, 1);
    expect(rows).toBe(60);
  });

  it('reproduces a 2:1 landscape image proportionally', () => {
    const rows = computeRows(120, 2000, 1000, 0.5, 1);
    expect(rows).toBe(30);
  });

  it('reproduces a 1:2 portrait image proportionally', () => {
    const rows = computeRows(120, 1000, 2000, 0.5, 1);
    expect(rows).toBe(120);
  });

  it('scales rows linearly with heightScale', () => {
    const base = computeRows(120, 1000, 1000, 0.5, 1);
    const doubled = computeRows(120, 1000, 1000, 0.5, 2);
    expect(doubled).toBe(base * 2);
  });

  it('never returns fewer than 1 row', () => {
    expect(computeRows(1, 1000, 1, 0.5, 1)).toBeGreaterThanOrEqual(1);
    expect(computeRows(120, 0, 0, 0.5, 1)).toBeGreaterThanOrEqual(1);
  });
});

describe('effectiveCols', () => {
  it('is a no-op at charSize 1', () => {
    expect(effectiveCols(220, 1)).toBe(220);
  });

  it('divides the grid so one character covers an NxN block', () => {
    expect(effectiveCols(220, 2)).toBe(110);
    expect(effectiveCols(219, 3)).toBe(73);
    expect(effectiveCols(220, 4)).toBe(55);
  });

  it('is monotonically coarser as charSize rises', () => {
    let prev = Infinity;
    for (let n = 1; n <= 12; n++) {
      const cols = effectiveCols(220, n);
      expect(cols).toBeLessThanOrEqual(prev);
      prev = cols;
    }
  });

  it('never collapses below a single column', () => {
    expect(effectiveCols(4, 12)).toBeGreaterThanOrEqual(1);
    expect(effectiveCols(1, 12)).toBe(1);
  });

  it('treats 0 and negative coarseness as full detail', () => {
    expect(effectiveCols(220, 0)).toBe(220);
    expect(effectiveCols(220, -3)).toBe(220);
  });
});
