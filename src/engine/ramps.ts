import type { RampPreset } from './types';
import { buildMaximalRamp, buildRampFromRanges } from './glyphDensity';
import { findLanguageSet } from './languages';

/**
 * Built-in glyph ramps, ordered dark -> light. Stored as string[] (codepoint array via
 * Array.from), not the result of `.split('')`, so multi-byte glyphs like block elements
 * survive intact — `.split('')` would tear surrogate pairs in half.
 */
const DETAILED = ' `.\'",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';

const RAMPS: Record<Exclude<RampPreset, 'custom'>, string> = {
  standard: ' .:-=+*#%@',
  blocks: ' ░▒▓█',
  detailed: DETAILED,
  // Only used when the font can't be measured; otherwise resolveRamp builds this live.
  detailedPlus: DETAILED,
  // Only reached when the font can't be measured; otherwise built from languages.ts.
  language: DETAILED,
  minimal: ' .:#',
};

/**
 * Resolve a ramp preset (or custom string) to an ordered array of glyphs, dark -> light.
 *
 * Every preset is a fixed sequence except `detailedPlus`, which is measured from the
 * render font: it sweeps every plausible Unicode block, keeps what the font can actually
 * draw at single-cell width, and orders the result by real ink coverage. That yields far
 * more tonal steps than any hand-written sequence and adapts to whichever font is in use.
 * Falls back to the fixed `detailed` sequence when there's no canvas to measure with
 * (e.g. under Node), so behaviour stays deterministic in tests.
 */
export function resolveRamp(
  ramp: RampPreset,
  customRamp: string,
  fontFamily?: string,
  languageId?: string,
): string[] {
  if (ramp === 'detailedPlus' && fontFamily) {
    const measured = buildMaximalRamp(fontFamily);
    if (measured && measured.length > 1) return measured;
  }

  if (ramp === 'language' && fontFamily) {
    const set = findLanguageSet(languageId ?? '');
    if (set) {
      const measured = buildRampFromRanges(set.ranges, fontFamily, `lang:${set.id}`);
      if (measured && measured.length > 1) return measured;
    }
  }

  const source = ramp === 'custom' ? customRamp : RAMPS[ramp];
  const glyphs = Array.from(source ?? '');
  return glyphs.length > 0 ? glyphs : Array.from(RAMPS.standard);
}

/**
 * Reduce a ramp to `levels` evenly spaced glyphs, keeping the darkest and lightest.
 *
 * Simplifies the output without touching the ramp string: fewer tonal steps means fewer
 * distinct characters and a chunkier, more legible result. Equivalent to hand-typing a
 * shorter ramp, but adjustable live and reversible.
 *
 * `levels` of 0 (or anything >= the ramp length) leaves the ramp untouched.
 */
export function applyLevels(ramp: string[], levels: number): string[] {
  if (!Number.isFinite(levels) || levels < 2 || levels >= ramp.length) return ramp;
  const out: string[] = [];
  for (let i = 0; i < levels; i++) {
    out.push(ramp[Math.round((i / (levels - 1)) * (ramp.length - 1))]);
  }
  return out;
}

export const RAMP_PRESET_LABELS: Record<RampPreset, string> = {
  standard: 'Standard',
  blocks: 'Blocks',
  detailed: 'Detailed',
  detailedPlus: 'Detailed+',
  minimal: 'Minimal',
  custom: 'Custom',
  language: 'Languages',
};

export const RAMP_PRESET_HINTS: Partial<Record<RampPreset, string>> = {
  detailed: 'Classic 69-glyph ASCII ramp',
  detailedPlus: 'Every single-width glyph your font can draw, ordered by measured ink coverage',
  language: 'Use a specific alphabet as the glyph set',
};
