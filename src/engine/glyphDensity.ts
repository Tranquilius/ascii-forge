/**
 * Measures how much ink each glyph actually puts on the page, so glyphs can be swapped
 * for one another without changing the apparent tone of a cell.
 *
 * A ramp is *ordered* by density but not evenly spaced in it, and the real spacing depends
 * on the font. Picking a replacement by ramp-neighbour would visibly lighten or darken the
 * image; picking one with near-identical measured coverage does not.
 */

export interface GlyphSet {
  /** Ink coverage per ramp index, 0 (blank) .. 1 (solid). */
  coverage: Float32Array;
  /** Interchangeable ramp indices per index, always including the index itself. */
  alternatives: number[][];
}

/** Glyphs whose coverage differs by less than this read as the same tone. */
export const DEFAULT_COVERAGE_TOLERANCE = 0.04;

/** Render size used for measurement — large enough for stable antialiased coverage. */
const MEASURE_PX = 32;

const cache = new Map<string, GlyphSet>();
let measureCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

/**
 * Fraction of the cell box covered by ink, per glyph, using the alpha channel so
 * antialiased edges contribute proportionally.
 */
export function measureGlyphCoverage(ramp: readonly string[], fontFamily: string): Float32Array {
  const coverage = new Float32Array(ramp.length);
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return coverage;

  const w = Math.ceil(MEASURE_PX * 0.7);
  const h = Math.ceil(MEASURE_PX * 1.3);
  if (!measureCanvas) {
    measureCanvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : document.createElement('canvas');
  }
  measureCanvas.width = w;
  measureCanvas.height = h;
  const ctx = measureCanvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return coverage;

  ctx.font = `${MEASURE_PX}px ${fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const maxPossible = w * h * 255;
  for (let i = 0; i < ramp.length; i++) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillText(ramp[i], w / 2, h / 2);
    const { data } = ctx.getImageData(0, 0, w, h);
    let sum = 0;
    for (let p = 3; p < data.length; p += 4) sum += data[p];
    coverage[i] = sum / maxPossible;
  }

  // Normalise against the densest glyph so tolerance means the same thing regardless of
  // how much of the em box the font's heaviest character happens to fill.
  let max = 0;
  for (const c of coverage) if (c > max) max = c;
  if (max > 0) for (let i = 0; i < coverage.length; i++) coverage[i] /= max;

  return coverage;
}

/**
 * Group ramp indices whose coverage is within `tolerance`. Pure, so the grouping rule is
 * directly testable without a canvas.
 *
 * A glyph with no near-equal partner gets a single-entry list and simply never changes —
 * the honest outcome for a coarse ramp, where no two glyphs are interchangeable.
 */
export function buildAlternatives(coverage: Float32Array, tolerance: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < coverage.length; i++) {
    const group: number[] = [];
    for (let j = 0; j < coverage.length; j++) {
      if (Math.abs(coverage[j] - coverage[i]) <= tolerance) group.push(j);
    }
    out.push(group);
  }
  return out;
}

/** Measured, grouped, and cached per (ramp, font, tolerance). */
export function getGlyphSet(
  ramp: readonly string[],
  fontFamily: string,
  tolerance = DEFAULT_COVERAGE_TOLERANCE,
): GlyphSet {
  const key = `${ramp.join('')}|${fontFamily}|${tolerance}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const coverage = measureGlyphCoverage(ramp, fontFamily);
  const set: GlyphSet = { coverage, alternatives: buildAlternatives(coverage, tolerance) };
  cache.set(key, set);
  return set;
}

/** How many ramp positions have at least one interchangeable partner. */
export function countSwappable(alternatives: number[][]): number {
  let n = 0;
  for (const group of alternatives) if (group.length > 1) n++;
  return n;
}

export function clearGlyphSetCache(): void {
  cache.clear();
}

/**
 * Unicode blocks worth probing for ramp glyphs.
 *
 * Deliberately not "all of UTF-8": of ~1.1M codepoints, the overwhelming majority are
 * unusable here. CJK and emoji are double-width and would shear the character grid,
 * combining marks and format controls render as nothing or corrupt their neighbours, and
 * anything missing from the font shows as tofu. These blocks are the ones that plausibly
 * contain single-width printable glyphs; whatever the font can't render is filtered out
 * at measurement time rather than guessed at here.
 */
const CANDIDATE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0020, 0x007e], // ASCII printable
  [0x00a1, 0x00ac], // Latin-1 punctuation/symbols (0x00ad is a soft hyphen — invisible)
  [0x00ae, 0x00ff], // Latin-1 symbols and accented letters
  [0x0100, 0x017f], // Latin Extended-A
  [0x0180, 0x024f], // Latin Extended-B
  [0x0391, 0x03c9], // Greek
  [0x0400, 0x045f], // Cyrillic
  [0x2010, 0x2027], // General punctuation (stops before the bidi/separator controls)
  [0x2030, 0x205e], // …resumes after them
  [0x2070, 0x209f], // Super/subscripts
  [0x20a0, 0x20bf], // Currency
  [0x2190, 0x21ff], // Arrows
  [0x2200, 0x22ff], // Mathematical operators
  [0x2300, 0x23ff], // Miscellaneous technical
  [0x2500, 0x257f], // Box drawing
  [0x2580, 0x259f], // Block elements
  [0x25a0, 0x25ff], // Geometric shapes
  [0x2660, 0x266f], // Card suits and music
];

/** A codepoint no font assigns, used to fingerprint this font's "missing glyph" box. */
const TOFU_PROBE = '\u{10FFFD}';

/**
 * Unicode Mark category — non-spacing, spacing-combining and enclosing marks.
 *
 * These attach to a preceding base character and have no independent form, so they are
 * excluded from measured ramps. Matching by category rather than by hand-listing ranges is
 * what lets a whole script be handed to the builder without curating out every vowel sign.
 */
const COMBINING_MARK = /\p{M}/u;

/**
 * How far a glyph's advance may sit from the chosen cluster and still be kept.
 *
 * The cell is drawn at one fixed width, so anything much wider spills into its neighbour.
 * Tight enough to keep the grid honest, loose enough that a proportional fallback face
 * still yields a usable ramp instead of a handful of same-width outliers.
 */
const ADVANCE_TOLERANCE = 0.08;

/** Coverage span treated as one tonal level when thinning the measured ramp. */
const LEVEL_EPSILON = 1 / 128;
/**
 * Glyphs kept per tonal level. More than one is deliberate: same-coverage glyphs are
 * exactly what the animation styles swap between, so thinning to a single glyph per level
 * would produce a beautiful ramp that cannot animate at all.
 */
const MAX_PER_LEVEL = 4;

export interface MeasuredGlyph {
  ch: string;
  coverage: number;
}

/**
 * Thin a coverage-sorted glyph list into an even ramp.
 *
 * Pure, so the selection rule is testable without a canvas. Left as-is, a large measured
 * set clusters heavily around common coverages; since luminance maps to a ramp *index*,
 * those clusters would become tonal plateaus. Bucketing by coverage and taking a fixed
 * number from each keeps index steps proportional to actual density.
 */
export function selectRampGlyphs(
  measured: readonly MeasuredGlyph[],
  epsilon = LEVEL_EPSILON,
  maxPerLevel = MAX_PER_LEVEL,
): string[] {
  const sorted = [...measured].sort((a, b) => a.coverage - b.coverage);
  const out: string[] = [];
  let levelStart = -Infinity;
  let takenInLevel = 0;

  for (const g of sorted) {
    if (g.coverage - levelStart > epsilon) {
      levelStart = g.coverage;
      takenInLevel = 0;
    }
    if (takenInLevel < maxPerLevel) {
      out.push(g.ch);
      takenInLevel++;
    }
  }
  return out;
}

const maximalCache = new Map<string, string[]>();

/**
 * Build the widest ramp this font can actually draw, ordered by measured ink coverage.
 *
 * Every candidate is rasterised and kept only if it is single-width (so the grid holds),
 * is not the font's missing-glyph box, and puts down some ink. Returns null when there is
 * no canvas to measure with, so callers can fall back to a static ramp.
 */
export function buildMaximalRamp(fontFamily: string): string[] | null {
  return buildRampFromRanges(CANDIDATE_RANGES, fontFamily, 'maximal');
}

/**
 * Measure an arbitrary set of Unicode ranges into a density-ordered ramp.
 *
 * Width filtering is relative to the set's own *modal* advance rather than to 'M'. That is
 * what lets full-width scripts work: every Japanese kana is twice the advance of a Latin
 * monospace glyph, so anchoring to 'M' would reject the entire alphabet. Anchoring to the
 * set's own mode keeps whichever width that alphabet uses and rejects only the outliers
 * that would break the grid.
 */
export function buildRampFromRanges(
  ranges: ReadonlyArray<readonly [number, number]>,
  fontFamily: string,
  cacheKey: string,
): string[] | null {
  const hit = maximalCache.get(`${cacheKey}|${fontFamily}`);
  if (hit) return hit;
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return null;

  const w = Math.ceil(MEASURE_PX * 0.7);
  const h = Math.ceil(MEASURE_PX * 1.3);
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return null;

  ctx.font = `${MEASURE_PX}px ${fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  /** Raster fingerprint + ink coverage for one glyph. */
  const probe = (ch: string) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillText(ch, w / 2, h / 2);
    const { data } = ctx.getImageData(0, 0, w, h);
    let sum = 0;
    let hash = 2166136261;
    for (let p = 3; p < data.length; p += 4) {
      sum += data[p];
      hash = Math.imul(hash ^ data[p], 16777619);
    }
    return { coverage: sum / (w * h * 255), hash: hash >>> 0 };
  };

  const tofuHash = probe(TOFU_PROBE).hash;

  // First pass: keep everything the font can draw, recording each advance.
  const candidates: Array<{ ch: string; coverage: number; advance: number }> = [];
  const advanceCounts = new Map<number, number>();
  for (const [lo, hi] of ranges) {
    for (let cp = lo; cp <= hi; cp++) {
      const ch = String.fromCodePoint(cp);
      // Combining marks have no standalone form. Drawn alone most fonts substitute a
      // dotted placeholder circle, which has real ink and a unique raster — so it passes
      // both the tofu and the blank test below, and a script like Devanagari or Thai would
      // fill the ramp with near-identical circles. They must be rejected by category.
      if (COMBINING_MARK.test(ch)) continue;

      const advance = Math.round(ctx.measureText(ch).width * 10) / 10;
      if (advance <= 0) continue;

      const { coverage, hash } = probe(ch);
      if (hash === tofuHash) continue; // font has no glyph for this codepoint
      if (coverage <= 0 && ch !== ' ') continue; // renders as nothing

      candidates.push({ ch, coverage, advance });
      advanceCounts.set(advance, (advanceCounts.get(advance) ?? 0) + 1);
    }
  }

  // Second pass: keep one advance cluster, so the grid stays rectangular.
  //
  // Counting exact advances only works for a script the monospace font actually covers.
  // Anything it lacks (Devanagari, Thai, Tamil…) falls back to a proportional face, where
  // ~60 glyphs can carry ~50 distinct advances — no single value holds a majority, and two
  // tiny clusters can tie and be settled by map order, which is how Devanagari ended up as
  // five wide vowels and no consonants at all.
  //
  // So score each advance by how many glyphs sit within tolerance of it, and keep that
  // window. For a true monospace script every advance is identical and this is a no-op.
  let modalAdvance = 0;
  let best = -1;
  for (const advance of advanceCounts.keys()) {
    let n = 0;
    for (const c of candidates) {
      if (Math.abs(c.advance - advance) <= advance * ADVANCE_TOLERANCE) n++;
    }
    // Ties go to the narrower glyph: it packs more per row and is the likelier body text
    // width, whereas the wide cluster is usually a handful of outliers.
    if (n > best || (n === best && advance < modalAdvance)) {
      best = n;
      modalAdvance = advance;
    }
  }
  const measured: MeasuredGlyph[] = candidates
    .filter((c) => Math.abs(c.advance - modalAdvance) <= modalAdvance * ADVANCE_TOLERANCE)
    .map(({ ch, coverage }) => ({ ch, coverage }));

  if (measured.length < 2) return null;

  // Normalise against the densest glyph so the ramp spans a full 0..1 tonal range.
  let max = 0;
  for (const g of measured) if (g.coverage > max) max = g.coverage;
  if (max > 0) for (const g of measured) g.coverage /= max;

  const ramp = selectRampGlyphs(measured);
  // A true blank at the dark end is what lets highlights drop out entirely.
  if (ramp[0] !== ' ') ramp.unshift(' ');

  maximalCache.set(`${cacheKey}|${fontFamily}`, ramp);
  return ramp;
}

export function clearMaximalRampCache(): void {
  maximalCache.clear();
}
