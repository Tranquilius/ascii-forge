import { describe, expect, it } from 'vitest';
import { MULTI_LEVELS, parseHexColor, quantizeChannel, resolveCellColor } from './color';

describe('parseHexColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseHexColor('#aa3bff')).toEqual([0xaa, 0x3b, 0xff]);
  });

  it('parses 3-digit shorthand hex', () => {
    expect(parseHexColor('#0f0')).toEqual([0, 255, 0]);
  });

  it('falls back to white on garbage input', () => {
    expect(parseHexColor('not-a-color')).toEqual([255, 255, 255]);
  });
});

describe('resolveCellColor', () => {
  const mono: [number, number, number] = [10, 20, 30];
  const source: [number, number, number] = [200, 100, 50];

  it('mono ignores the source color', () => {
    expect(resolveCellColor('mono', mono, source)).toEqual(mono);
  });

  it('original passes the source color through untouched', () => {
    expect(resolveCellColor('original', mono, source)).toEqual(source);
  });

  it('multi posterizes the source color, and differs from original', () => {
    const multi = resolveCellColor('multi', mono, source);
    expect(multi).not.toEqual(source);
    // every channel must land on a palette step
    for (const channel of multi) {
      expect(quantizeChannel(channel, MULTI_LEVELS)).toBe(channel);
    }
  });

  it('multi leaves already-on-step colors unchanged', () => {
    expect(resolveCellColor('multi', mono, [0, 255, 170])).toEqual([0, 255, 170]);
  });
});

describe('quantizeChannel', () => {
  it('snaps to evenly spaced steps at 4 levels', () => {
    expect(quantizeChannel(0, 4)).toBe(0);
    expect(quantizeChannel(255, 4)).toBe(255);
    expect(quantizeChannel(10, 4)).toBe(0);
    expect(quantizeChannel(200, 4)).toBe(170);
  });

  it('collapses to a single value at 1 level', () => {
    expect(quantizeChannel(200, 1)).toBe(0);
  });

  it('always stays within 0..255', () => {
    for (const v of [0, 1, 128, 254, 255]) {
      for (const levels of [2, 4, 8]) {
        const q = quantizeChannel(v, levels);
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(255);
      }
    }
  });
});
