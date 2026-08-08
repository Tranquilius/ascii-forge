import type { MixMode } from './types';

/** Parse a `#rrggbb` or `#rgb` string to [r, g, b] in 0..255. Falls back to white on parse failure. */
export function parseHexColor(hex: string): [number, number, number] {
  const m = hex.trim().replace(/^#/, '');
  if (m.length === 3) {
    const r = parseInt(m[0] + m[0], 16);
    const g = parseInt(m[1] + m[1], 16);
    const b = parseInt(m[2] + m[2], 16);
    if (![r, g, b].some(Number.isNaN)) return [r, g, b];
  } else if (m.length === 6) {
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    if (![r, g, b].some(Number.isNaN)) return [r, g, b];
  }
  return [255, 255, 255];
}

/** Levels per channel for `multi` mode — 4 levels ** 3 channels = 64 distinct colors. */
export const MULTI_LEVELS = 4;

/**
 * Snap a 0..255 channel value to one of `levels` evenly spaced steps.
 * levels=4 gives 0, 85, 170, 255.
 */
export function quantizeChannel(value: number, levels: number): number {
  if (levels <= 1) return 0;
  const step = 255 / (levels - 1);
  return Math.round(Math.round(value / step) * step);
}

/**
 * Resolve the color for one cell given the mix mode.
 * - mono: a single foreground color for every cell (monoColor).
 * - multi: the toned source color posterized to a 64-color palette — a flatter, more
 *   stylized look where broad regions share one flat color, the way limited-palette
 *   terminal output reads.
 * - original: the exact per-cell toned source color, full 24-bit.
 */
export function resolveCellColor(
  mixMode: MixMode,
  monoColor: [number, number, number],
  sourceColor: [number, number, number],
): [number, number, number] {
  if (mixMode === 'mono') return monoColor;
  if (mixMode === 'multi') {
    return [
      quantizeChannel(sourceColor[0], MULTI_LEVELS),
      quantizeChannel(sourceColor[1], MULTI_LEVELS),
      quantizeChannel(sourceColor[2], MULTI_LEVELS),
    ];
  }
  return sourceColor;
}
