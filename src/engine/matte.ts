/**
 * Matte stage: decide which cells are background and zero their alpha.
 *
 * Runs on the sampled cell grid rather than on source pixels. The grid is small (a 220-column
 * frame is roughly 21k cells), so a flood fill over it is effectively free and can re-run on
 * every animation frame — and sub-cell precision would be wasted anyway, since the ASCII cell
 * is the smallest thing the output can represent.
 *
 * It also runs *before* tone. Keying has to read the original source colours: if it ran after
 * tone, dragging the Brightness slider would silently change what gets removed.
 *
 * Nothing downstream needs to know this happened. Alpha already flows through the whole
 * pipeline, so zeroing it here is enough to make a cell vanish from every renderer.
 */

/** Alpha at or below this counts as "not drawn" — renderers substitute a space. */
export const BLANK_ALPHA = 8;

export type RGB = readonly [number, number, number];

export interface MatteOptions {
  /** Colour to key against. Omit to auto-detect from the frame border. */
  keyColor?: RGB | null;
  /** 0..100. Colour distance below which a cell counts as background. */
  tolerance: number;
  /** true: only background connected to the border. false: every matching cell. */
  contiguous: boolean;
  /** Cells of alpha falloff at the matte edge. 0 = hard edge. */
  feather: number;
}

/**
 * Perceptually weighted colour distance, normalised to 0..100.
 *
 * Weighted by the Rec.709 luma coefficients rather than treating channels equally, because a
 * given numeric shift in green reads as a much larger change than the same shift in blue.
 * Without this, one tolerance value behaves inconsistently across hues — a green screen and a
 * blue screen would need very different settings to key the same way.
 */
export function colorDistance(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  const sq = 0.2126 * dr * dr + 0.7152 * dg * dg + 0.0722 * db * db;
  // sqrt of the weighted square distance maxes out at 255 (pure black vs pure white).
  return (Math.sqrt(sq) / 255) * 100;
}

/** Coarse RGB cube resolution for the border histogram: 16 levels per channel. */
const HIST_LEVELS = 16;
const HIST_SHIFT = 4; // 256 / 16

/**
 * Guess the background colour from the border ring of the grid.
 *
 * Buckets the border cells into a coarse RGB cube and returns the mean colour of the most
 * populated bucket. Taking the modal bucket's *mean* rather than the bucket centre keeps the
 * result exact for flat backgrounds, which is the common case — a pure #00ff00 screen returns
 * exactly #00ff00, so tolerance 0 behaves as the user expects.
 *
 * The border is the honest place to look: whatever dominates the edge of the frame is
 * overwhelmingly likely to be behind the subject rather than part of it.
 */
export function detectBackgroundColor(
  rgba: Uint8ClampedArray,
  cols: number,
  rows: number,
): RGB | null {
  if (cols <= 0 || rows <= 0) return null;

  const sums = new Map<number, { r: number; g: number; b: number; n: number }>();

  const consider = (col: number, row: number) => {
    const o = (row * cols + col) * 4;
    // A cell that is already transparent tells us nothing about the background colour.
    if (rgba[o + 3] <= BLANK_ALPHA) return;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    const key =
      ((r >> HIST_SHIFT) * HIST_LEVELS + (g >> HIST_SHIFT)) * HIST_LEVELS + (b >> HIST_SHIFT);
    const bin = sums.get(key);
    if (bin) {
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bin.n++;
    } else {
      sums.set(key, { r, g, b, n: 1 });
    }
  };

  for (let col = 0; col < cols; col++) {
    consider(col, 0);
    if (rows > 1) consider(col, rows - 1);
  }
  for (let row = 1; row < rows - 1; row++) {
    consider(0, row);
    if (cols > 1) consider(cols - 1, row);
  }

  let best: { r: number; g: number; b: number; n: number } | null = null;
  for (const bin of sums.values()) {
    if (!best || bin.n > best.n) best = bin;
  }
  if (!best) return null;
  return [
    Math.round(best.r / best.n),
    Math.round(best.g / best.n),
    Math.round(best.b / best.n),
  ];
}

/** Read one cell's RGB out of a packed RGBA grid. */
function cellRgb(rgba: Uint8ClampedArray, index: number): RGB {
  const o = index * 4;
  return [rgba[o], rgba[o + 1], rgba[o + 2]];
}

/**
 * Mark background cells. Returns a Uint8Array where 1 = background.
 *
 * Exported separately from `applyMatte` because the mask is the interesting thing to assert
 * in tests — alpha blending on top of it is mechanical.
 */
export function buildMatteMask(
  rgba: Uint8ClampedArray,
  cols: number,
  rows: number,
  key: RGB,
  tolerance: number,
  contiguous: boolean,
): Uint8Array {
  const count = cols * rows;
  const mask = new Uint8Array(count);
  const matches = (i: number) => colorDistance(cellRgb(rgba, i), key) <= tolerance;

  if (!contiguous) {
    for (let i = 0; i < count; i++) {
      if (matches(i)) mask[i] = 1;
    }
    return mask;
  }

  // Edge-connected flood fill. Iterative with a preallocated queue rather than recursion:
  // a large uniform background would be tens of thousands of frames deep.
  const queue = new Uint32Array(count);
  let head = 0;
  let tail = 0;

  const push = (i: number) => {
    if (mask[i] || !matches(i)) return;
    mask[i] = 1;
    queue[tail++] = i;
  };

  for (let col = 0; col < cols; col++) {
    push(col);
    if (rows > 1) push((rows - 1) * cols + col);
  }
  for (let row = 0; row < rows; row++) {
    push(row * cols);
    if (cols > 1) push(row * cols + cols - 1);
  }

  while (head < tail) {
    const i = queue[head++];
    const col = i % cols;
    const row = (i / cols) | 0;
    if (col > 0) push(i - 1);
    if (col < cols - 1) push(i + 1);
    if (row > 0) push(i - cols);
    if (row < rows - 1) push(i + cols);
  }

  return mask;
}

/**
 * Chebyshev distance (in cells) from each kept cell to the nearest background cell, capped at
 * `maxDistance`. Two passes over the grid — forward then backward — which is the standard
 * cheap approximation and plenty at feather radii of 1-3 cells.
 */
function distanceToBackground(mask: Uint8Array, cols: number, rows: number, maxDistance: number): Uint8Array {
  const dist = new Uint8Array(mask.length);
  const cap = Math.max(1, maxDistance) + 1;

  for (let i = 0; i < mask.length; i++) dist[i] = mask[i] ? 0 : cap;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (dist[i] === 0) continue;
      let best = dist[i];
      if (col > 0) best = Math.min(best, dist[i - 1] + 1);
      if (row > 0) best = Math.min(best, dist[i - cols] + 1);
      dist[i] = Math.min(best, cap);
    }
  }
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = cols - 1; col >= 0; col--) {
      const i = row * cols + col;
      if (dist[i] === 0) continue;
      let best = dist[i];
      if (col < cols - 1) best = Math.min(best, dist[i + 1] + 1);
      if (row < rows - 1) best = Math.min(best, dist[i + cols] + 1);
      dist[i] = Math.min(best, cap);
    }
  }
  return dist;
}

/**
 * Apply a background matte to a sampled RGBA grid, returning a new buffer.
 *
 * Alpha is *multiplied* rather than assigned, so a source that already carries transparency
 * (a PNG cutout, say) keeps it — removal can only ever take alpha away, never add it back.
 */
export function applyMatte(
  rgba: Uint8ClampedArray,
  cols: number,
  rows: number,
  opts: MatteOptions,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);
  if (cols <= 0 || rows <= 0) return out;

  const key = opts.keyColor ?? detectBackgroundColor(rgba, cols, rows);
  if (!key) return out;

  const mask = buildMatteMask(rgba, cols, rows, key, opts.tolerance, opts.contiguous);
  const feather = Math.max(0, Math.round(opts.feather));

  if (feather <= 0) {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) out[i * 4 + 3] = 0;
    }
    return out;
  }

  const dist = distanceToBackground(mask, cols, rows, feather);
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    if (mask[i]) {
      out[o + 3] = 0;
      continue;
    }
    // Cells within `feather` of the cut ramp linearly back up to full opacity.
    const d = dist[i];
    if (d <= feather) {
      const factor = d / (feather + 1);
      out[o + 3] = Math.round(rgba[o + 3] * factor);
    }
  }
  return out;
}
