/**
 * Alphabets that can stand in for the glyph ramp.
 *
 * Each is a set of Unicode ranges rather than a fixed string: the actual ramp is measured
 * from the render font at runtime, so whatever the font can't draw is dropped instead of
 * appearing as tofu. That also means the ordering is by real ink coverage rather than a
 * guess at which characters look heavier.
 *
 * Deliberately excluded: Arabic and other cursive scripts, whose glyphs change shape by
 * position and reorder under bidi — neither survives being placed one-per-cell in a grid.
 */

export interface LanguageSet {
  id: string;
  label: string;
  /** Inclusive codepoint ranges to probe. */
  ranges: ReadonlyArray<readonly [number, number]>;
  /** Shown under the picker so the trade-offs are visible before selecting. */
  note?: string;
}

export const LANGUAGE_SETS: readonly LanguageSet[] = [
  {
    id: 'latin',
    label: 'Latin',
    ranges: [
      [0x0041, 0x005a], // A-Z
      [0x0061, 0x007a], // a-z
      [0x0030, 0x0039], // 0-9
      [0x0021, 0x002f], // punctuation
      [0x003a, 0x0040],
    ],
  },
  {
    id: 'greek',
    label: 'Greek',
    ranges: [
      [0x0391, 0x03a9], // uppercase
      [0x03b1, 0x03c9], // lowercase
      [0x0387, 0x0387],
    ],
  },
  {
    id: 'cyrillic',
    label: 'Cyrillic',
    ranges: [
      [0x0410, 0x044f],
      [0x0401, 0x0401],
      [0x0451, 0x0451],
    ],
  },
  {
    id: 'hebrew',
    label: 'Hebrew',
    ranges: [
      [0x05d0, 0x05ea], // consonants only — vowel points are combining marks
      [0x05be, 0x05be],
      [0x05c0, 0x05c0],
    ],
    note: 'Hebrew is right-to-left; glyphs are placed per cell, not as running text.',
  },
  {
    id: 'japanese',
    label: 'Japanese',
    ranges: [
      [0x3041, 0x3096], // hiragana
      [0x30a1, 0x30fa], // katakana
      [0x3001, 0x3003], // 、。〃
      [0x30fb, 0x30fc], // ・ー
    ],
    note: 'Kana and punctuation. Full-width, so the grid uses wider cells.',
  },
  {
    id: 'korean',
    label: 'Korean',
    ranges: [
      [0x3131, 0x3163], // compatibility jamo — the 11k syllable block is impractical
    ],
    note: 'Jamo letters rather than the full syllable block.',
  },
  {
    id: 'chinese',
    label: 'Chinese',
    ranges: [
      // A slice of CJK Unified Ideographs. The set is sorted by measured density and
      // thinned per tonal level anyway, so a sample is as useful as the full 20k block
      // and vastly cheaper to measure.
      [0x4e00, 0x4f5f],
      [0x5200, 0x52ff],
      [0x6100, 0x61ff],
      [0x7530, 0x760f],
      [0x8a00, 0x8aff],
    ],
    note: 'A sample of Han characters. Full-width, so the grid uses wider cells.',
  },
  {
    id: 'braille',
    label: 'Braille',
    ranges: [[0x2800, 0x28ff]],
    note: 'Dot patterns give an unusually even tonal ramp.',
  },
  {
    id: 'runic',
    label: 'Runic',
    ranges: [[0x16a0, 0x16f0]],
  },
];

export function findLanguageSet(id: string): LanguageSet | undefined {
  return LANGUAGE_SETS.find((l) => l.id === id);
}
