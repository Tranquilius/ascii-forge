import { describe, expect, it } from 'vitest';
import { buildAlternatives, countSwappable, selectRampGlyphs, type MeasuredGlyph } from './glyphDensity';

describe('buildAlternatives', () => {
  it('always includes the glyph itself', () => {
    const alts = buildAlternatives(Float32Array.from([0, 0.5, 1]), 0.01);
    alts.forEach((group, i) => expect(group).toContain(i));
  });

  it('groups glyphs whose coverage is within tolerance', () => {
    // 0.10 and 0.12 are within 0.04; 0.90 is not near either
    const alts = buildAlternatives(Float32Array.from([0.1, 0.12, 0.9]), 0.04);
    expect(alts[0].sort()).toEqual([0, 1]);
    expect(alts[1].sort()).toEqual([0, 1]);
    expect(alts[2]).toEqual([2]);
  });

  it('leaves a coarse ramp with no interchangeable glyphs', () => {
    // a 4-glyph ramp is spaced far wider than the tolerance — nothing may be swapped,
    // which is what keeps the image intact instead of visibly banding
    const alts = buildAlternatives(Float32Array.from([0, 0.33, 0.66, 1]), 0.04);
    expect(countSwappable(alts)).toBe(0);
  });

  it('finds many partners in a dense ramp', () => {
    const coverage = Float32Array.from({ length: 60 }, (_, i) => i / 59);
    const alts = buildAlternatives(coverage, 0.04);
    expect(countSwappable(alts)).toBe(60);
  });

  it('is symmetric — if a can become b, b can become a', () => {
    const coverage = Float32Array.from([0.1, 0.13, 0.5, 0.52, 0.9]);
    const alts = buildAlternatives(coverage, 0.04);
    alts.forEach((group, i) => {
      for (const j of group) expect(alts[j]).toContain(i);
    });
  });

  it('groups everything at a huge tolerance and nothing at zero', () => {
    const coverage = Float32Array.from([0, 0.5, 1]);
    expect(buildAlternatives(coverage, 10).every((g) => g.length === 3)).toBe(true);
    expect(countSwappable(buildAlternatives(coverage, 0))).toBe(0);
  });
});

describe('selectRampGlyphs', () => {
  const g = (ch: string, coverage: number): MeasuredGlyph => ({ ch, coverage });

  it('orders output by coverage regardless of input order', () => {
    const out = selectRampGlyphs([g('c', 0.9), g('a', 0.1), g('b', 0.5)], 0.01, 4);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('caps how many glyphs are kept per tonal level', () => {
    // six glyphs all at essentially the same coverage
    const crowded = ['a', 'b', 'c', 'd', 'e', 'f'].map((ch, i) => g(ch, 0.5 + i * 0.0001));
    expect(selectRampGlyphs(crowded, 1 / 128, 4)).toHaveLength(4);
  });

  it('keeps more than one per level so the animation has partners', () => {
    const crowded = ['a', 'b', 'c'].map((ch, i) => g(ch, 0.5 + i * 0.0001));
    expect(selectRampGlyphs(crowded, 1 / 128, 4).length).toBeGreaterThan(1);
  });

  it('keeps distinct tonal levels rather than collapsing them', () => {
    const spread = [g('a', 0.0), g('b', 0.25), g('c', 0.5), g('d', 0.75), g('e', 1.0)];
    expect(selectRampGlyphs(spread, 1 / 128, 4)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('thins a clustered distribution but preserves the overall range', () => {
    // Real measurements clump: many glyphs land on a handful of common coverages. An
    // evenly spread set is deliberately NOT the case to test — with even spacing every
    // glyph legitimately fits under the per-level cap and nothing should be dropped.
    const many: MeasuredGlyph[] = [g('lightest', 0)];
    for (let cluster = 1; cluster <= 8; cluster++) {
      for (let i = 0; i < 20; i++) {
        many.push(g(`c${cluster}-${i}`, cluster / 9 + i * 1e-5));
      }
    }
    many.push(g('darkest', 1));

    const out = selectRampGlyphs(many, 1 / 128, 4);
    expect(out.length).toBeLessThan(many.length);
    // 8 clusters capped at 4, plus the two extremes
    expect(out.length).toBe(8 * 4 + 2);
    expect(out[0]).toBe('lightest');
    expect(out[out.length - 1]).toBe('darkest');
  });

  it('leaves an evenly spread set alone when it fits under the cap', () => {
    const many: MeasuredGlyph[] = [];
    for (let i = 0; i < 400; i++) many.push(g(String(i), i / 399));
    // spacing 1/399 puts ~4 glyphs in each 1/128 bucket, which the cap of 4 admits
    expect(selectRampGlyphs(many, 1 / 128, 4)).toHaveLength(400);
    // a tighter cap does thin it
    expect(selectRampGlyphs(many, 1 / 128, 2).length).toBeLessThan(400);
  });

  it('never reorders relative coverage — the ramp stays monotonic', () => {
    const many: MeasuredGlyph[] = [];
    for (let i = 0; i < 200; i++) many.push(g(`x${i}`, Math.random()));
    const byCh = new Map(many.map((m) => [m.ch, m.coverage]));
    const out = selectRampGlyphs(many, 1 / 64, 3);
    for (let i = 1; i < out.length; i++) {
      expect(byCh.get(out[i])!).toBeGreaterThanOrEqual(byCh.get(out[i - 1])!);
    }
  });

  it('handles empty and single-glyph input', () => {
    expect(selectRampGlyphs([])).toEqual([]);
    expect(selectRampGlyphs([g('#', 0.4)])).toEqual(['#']);
  });

  it('does not mutate its input', () => {
    const input = [g('c', 0.9), g('a', 0.1)];
    const copy = input.map((m) => ({ ...m }));
    selectRampGlyphs(input);
    expect(input).toEqual(copy);
  });
});
