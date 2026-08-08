import { describe, expect, it } from 'vitest';
import { applyLevels, resolveRamp } from './ramps';

describe('resolveRamp', () => {
  it('resolves each built-in preset to a non-empty glyph array', () => {
    for (const preset of ['standard', 'blocks', 'detailed', 'detailedPlus', 'minimal'] as const) {
      const ramp = resolveRamp(preset, '');
      expect(ramp.length).toBeGreaterThan(1);
    }
  });

  it('detailed stays the classic fixed 69-glyph sequence', () => {
    const ramp = resolveRamp('detailed', '');
    expect(ramp).toHaveLength(69);
    expect(ramp[0]).toBe(' ');
    expect(ramp[ramp.length - 1]).toBe('$');
    // a font must never influence it — Detailed+ is the measured one
    expect(resolveRamp('detailed', '', 'monospace')).toEqual(ramp);
  });

  it('detailedPlus falls back to the detailed sequence when no font can be measured', () => {
    // under Node there is no canvas, so the measured path is unavailable
    expect(resolveRamp('detailedPlus', '')).toEqual(resolveRamp('detailed', ''));
  });

  it('uses the custom string when preset is custom', () => {
    expect(resolveRamp('custom', ' .oO@')).toEqual([' ', '.', 'o', 'O', '@']);
  });

  it('falls back to standard when custom is empty', () => {
    expect(resolveRamp('custom', '')).toEqual(resolveRamp('standard', ''));
  });

  it('preserves multi-byte / block glyphs as single array entries', () => {
    const ramp = resolveRamp('blocks', '');
    // every entry must be exactly one codepoint, not a torn surrogate half
    for (const glyph of ramp) {
      expect(Array.from(glyph).length).toBe(1);
    }
  });
});

describe('applyLevels', () => {
  const ramp = Array.from('0123456789'); // 10 glyphs, dark -> light

  it('reduces to exactly the requested number of steps', () => {
    expect(applyLevels(ramp, 4)).toHaveLength(4);
    expect(applyLevels(ramp, 2)).toHaveLength(2);
  });

  it('always keeps the darkest and lightest glyph', () => {
    for (const n of [2, 3, 5, 9]) {
      const out = applyLevels(ramp, n);
      expect(out[0]).toBe(ramp[0]);
      expect(out[out.length - 1]).toBe(ramp[ramp.length - 1]);
    }
  });

  it('samples evenly across the ramp', () => {
    expect(applyLevels(ramp, 3)).toEqual(['0', '5', '9']);
    expect(applyLevels(ramp, 5)).toEqual(['0', '2', '5', '7', '9']);
  });

  it('stays monotonic — never reorders the ramp', () => {
    const out = applyLevels(ramp, 6);
    for (let i = 1; i < out.length; i++) {
      expect(ramp.indexOf(out[i])).toBeGreaterThan(ramp.indexOf(out[i - 1]));
    }
  });

  it('passes the ramp through untouched for 0, 1, or an oversized request', () => {
    expect(applyLevels(ramp, 0)).toBe(ramp);
    expect(applyLevels(ramp, 1)).toBe(ramp);
    expect(applyLevels(ramp, 10)).toBe(ramp);
    expect(applyLevels(ramp, 999)).toBe(ramp);
  });

  it('ignores non-finite input rather than producing a broken ramp', () => {
    expect(applyLevels(ramp, Number.NaN)).toBe(ramp);
  });

  it('never emits duplicate-adjacent glyphs when levels fit the ramp', () => {
    const out = applyLevels(ramp, 5);
    expect(new Set(out).size).toBe(out.length);
  });
});
