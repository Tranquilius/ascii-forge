import type { AsciiFrame, Modulator } from '../types';
import { BLANK_ALPHA } from '../matte';

/**
 * Glyph animation: cells swap to other glyphs of equal ink coverage over time, so the
 * picture appears to change while its tone stays put.
 *
 * Every style is the same mechanism with a different *phase function* — a per-cell offset
 * deciding when in the hold window that cell takes its turn. Random phases give a
 * continuous boil; a constant phase makes the whole grid turn over at once; a phase
 * derived from position sends a front travelling across the image.
 *
 * Only `chars` is rewritten. Per-cell colour is untouched, so the effect reads as the
 * characters moving rather than the image changing.
 */

export type AnimationStyle = 'shimmer' | 'pulse' | 'wave' | 'ripple' | 'crt';

export interface AnimationStyleInfo {
  id: AnimationStyle;
  label: string;
  description: string;
}

export const ANIMATION_STYLES: readonly AnimationStyleInfo[] = [
  { id: 'shimmer', label: 'Shimmer', description: 'Cells turn over at random moments — a continuous boil' },
  { id: 'pulse', label: 'Pulse', description: 'Every character changes at once, on the beat' },
  { id: 'wave', label: 'Wave', description: 'A front of change sweeps diagonally across' },
  { id: 'ripple', label: 'Ripple', description: 'Rings of change spread out from the centre' },
  { id: 'crt', label: 'CRT', description: 'A refresh beam sweeps down over static scanlines' },
];

/** Rows repaint as the beam passes; this is how fast it falls relative to one hold. */
const CRT_BEAM_DECAY = 12;
/** Alternate-row dimming — the standing scanline pattern of a phosphor display. */
const CRT_SCANLINE_DIM = 0.78;
const CRT_BASE = 0.72;
const CRT_GLOW = 0.75;

/**
 * Brightness multiplier for a cell under the CRT beam.
 *
 * The beam falls top to bottom once per hold period. Rows just behind it are still hot and
 * fade off exponentially; every other row is dimmed to stand in for the phosphor line
 * structure. Returned as a multiplier so the caller can scale the cell's own colour rather
 * than replacing it.
 */
export function crtBrightness(row: number, rows: number, t: number, holdSeconds: number): number {
  const beam = (t / holdSeconds) % 1;
  const pos = rows > 1 ? row / (rows - 1) : 0;
  // distance *behind* the beam, wrapped — ahead of the beam is fully decayed
  let behind = pos - beam;
  if (behind < 0) behind += 1;
  const glow = Math.exp(-behind * CRT_BEAM_DECAY);
  const scan = row % 2 === 0 ? 1 : CRT_SCANLINE_DIM;
  return (CRT_BASE + CRT_GLOW * glow) * scan;
}

export interface GlyphAnimationOptions {
  /** Interchangeable ramp indices per index, from glyphDensity.getGlyphSet(). */
  alternatives: number[][];
  style: AnimationStyle;
  /** How long a single cell holds one glyph, in milliseconds. */
  holdMs: number;
  /**
   * Repeat the sequence every N steps. Set this when exporting so the last frame hands
   * back to the first and the clip loops seamlessly.
   */
  loopSteps?: number;
  seed?: number;
}

/**
 * Deterministic per-cell hash.
 *
 * Deterministic rather than Math.random() so a given step always renders identically:
 * a re-render mid-step (resize, param tweak) must not reshuffle the glyphs, and an
 * exported clip must reproduce exactly what the preview showed.
 */
export function cellHash(cell: number, salt: number, seed: number): number {
  let h = (Math.imul(cell, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b) ^ seed) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

const PHASE_SALT = 0x5f3759df;
const OFFSET_SALT = 0x1b873593;

/** Stable per-cell offset in [0, 1), used by the shimmer style to scatter change times. */
export function phaseOf(cell: number, seed: number): number {
  return cellHash(cell, PHASE_SALT, seed) / 0x1_0000_0000;
}

/**
 * When a cell takes its turn within the hold window, as a fraction.
 *
 * A larger phase means the cell changes *earlier*, since the step counter is
 * `floor(t / hold + phase)`. The position-based styles are written accordingly, so Wave
 * runs top-left to bottom-right and Ripple expands outward from the centre.
 */
export function phaseFor(
  style: AnimationStyle,
  cell: number,
  cols: number,
  rows: number,
  seed: number,
): number {
  switch (style) {
    // Every cell shares one phase, so the entire grid crosses the step boundary together.
    case 'pulse':
      return 0;
    case 'wave': {
      const x = cell % cols;
      const y = (cell / cols) | 0;
      const span = Math.max(1, cols + rows - 2);
      return 1 - (x + y) / span;
    }
    case 'ripple': {
      const x = cell % cols;
      const y = (cell / cols) | 0;
      const cx = (cols - 1) / 2;
      const cy = (rows - 1) / 2;
      // Character cells are about twice as tall as they are wide, so scale the vertical
      // distance to keep the rings round rather than oval.
      const d = Math.hypot(x - cx, (y - cy) * 2);
      const max = Math.hypot(cx, cy * 2) || 1;
      return 1 - Math.min(1, d / max);
    }
    // Purely vertical, so rows repaint in step with the beam sweeping down them.
    case 'crt': {
      const y = (cell / cols) | 0;
      return 1 - y / Math.max(1, rows - 1);
    }
    case 'shimmer':
    default:
      return phaseOf(cell, seed);
  }
}

export function createGlyphAnimator(opts: GlyphAnimationOptions): Modulator {
  const { alternatives, style, holdMs, loopSteps, seed = 0x5eed } = opts;
  const holdSeconds = Math.max(holdMs, 1) / 1000;

  return {
    id: `glyph-${style}`,
    apply(frame: AsciiFrame, t: number): AsciiFrame {
      const { cols, rows } = frame;
      const chars = new Uint16Array(frame.chars);

      // Only CRT touches colour, and copying the RGBA buffer costs 4 bytes per cell —
      // worth avoiding entirely for the styles that leave it alone.
      const shadesColor = style === 'crt';
      const rgba = shadesColor ? new Uint8ClampedArray(frame.rgba) : frame.rgba;

      for (let i = 0; i < chars.length; i++) {
        // A matted-out cell has no glyph on screen, and swapping the one it nominally holds
        // would make the removed background flicker back into view every hold.
        if (frame.rgba[i * 4 + 3] <= BLANK_ALPHA) continue;

        const group = alternatives[chars[i]];

        if (group && group.length >= 2) {
          // Quantise into discrete holds so each glyph sits still long enough to read.
          const phase = phaseFor(style, i, cols, rows, seed);
          let step = Math.floor(t / holdSeconds + phase);
          if (loopSteps && loopSteps > 0) step = ((step % loopSteps) + loopSteps) % loopSteps;

          // Walk the density group one position per step from a random per-cell start.
          // Cycling rather than re-rolling guarantees the glyph actually differs from the
          // previous step — with a random pick a cell could draw the same glyph twice and
          // visibly fail to change on a beat, which Pulse in particular must not do.
          const offset = cellHash(i, OFFSET_SALT, seed) % group.length;
          chars[i] = group[(offset + step) % group.length];
        }

        if (shadesColor) {
          // Applied to every cell, including ones with no glyph partner — the beam has to
          // sweep the whole picture, not just the cells that happen to be swappable.
          const b = crtBrightness((i / cols) | 0, rows, t, holdSeconds);
          const o = i * 4;
          rgba[o] = frame.rgba[o] * b;
          rgba[o + 1] = frame.rgba[o + 1] * b;
          rgba[o + 2] = frame.rgba[o + 2] * b;
        }
      }

      return { ...frame, chars, rgba };
    },
  };
}
