/**
 * Alphabets that can stand in for the glyph ramp.
 *
 * Each is a set of Unicode ranges rather than a fixed string: the actual ramp is measured
 * from the render font at runtime, so whatever the font can't draw is dropped instead of
 * appearing as tofu. That also means the ordering is by real ink coverage rather than a
 * guess at which characters look heavier.
 *
 * Deliberately excluded: Arabic, Hebrew and other cursive or right-to-left scripts, whose
 * glyphs change shape by position and reorder under bidi — neither survives being placed
 * one-per-cell in a grid.
 *
 * Ranges may be given wholesale: the builder drops combining marks by Unicode category, so
 * a script's dependent vowel signs need not be curated out by hand.
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
    id: 'devanagari',
    label: 'Devanagari',
    ranges: [
      [0x0905, 0x0914], // independent vowels
      [0x0915, 0x0939], // consonants
      [0x0950, 0x0950], // ॐ
      [0x0958, 0x0961], // additional consonants and vocalic vowels
      [0x0964, 0x0965], // danda, double danda
      [0x0966, 0x096f], // digits
    ],
    note: 'Sanskrit and Hindi letters. Dependent vowel signs are combining marks and are skipped.',
  },
  {
    id: 'bengali',
    label: 'Bengali',
    ranges: [
      [0x0985, 0x098c],
      [0x098f, 0x0990],
      [0x0993, 0x09b9],
      [0x09ce, 0x09ce],
      [0x09e6, 0x09ef],
    ],
  },
  {
    id: 'tamil',
    label: 'Tamil',
    ranges: [
      [0x0b85, 0x0b94], // vowels
      [0x0b95, 0x0bb9], // consonants
      [0x0be6, 0x0bef], // digits
    ],
  },
  {
    id: 'thai',
    label: 'Thai',
    ranges: [
      [0x0e01, 0x0e2e], // consonants
      [0x0e2f, 0x0e30],
      [0x0e40, 0x0e46], // leading vowels — these are spacing, unlike the marks above/below
      [0x0e50, 0x0e59], // digits
    ],
    note: 'Consonants and spacing vowels; tone marks sit above a base and are skipped.',
  },
  {
    id: 'georgian',
    label: 'Georgian',
    ranges: [
      [0x10d0, 0x10fa], // Mkhedruli
      [0x10fb, 0x10fc],
    ],
    note: 'Mkhedruli has no letter case, so the ramp is unusually even.',
  },
  {
    id: 'armenian',
    label: 'Armenian',
    ranges: [
      [0x0531, 0x0556], // capitals
      [0x0561, 0x0586], // lowercase
      [0x055a, 0x055f],
    ],
  },
  {
    id: 'ethiopic',
    label: 'Ethiopic',
    ranges: [
      [0x1200, 0x1357], // the syllabary
      [0x1361, 0x1368], // punctuation
      [0x1369, 0x1371], // digits
    ],
    note: 'A large syllabary of standalone glyphs — one of the richest tonal ranges here.',
  },
  {
    id: 'cherokee',
    label: 'Cherokee',
    ranges: [[0x13a0, 0x13f4]],
    note: 'A syllabary devised by Sequoyah; every glyph stands alone.',
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
