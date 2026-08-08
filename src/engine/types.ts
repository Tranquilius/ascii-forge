/**
 * Core data model for the ASCII engine.
 *
 * The pipeline is: File -> SourceFrame[] -> (per frame) AsciiFrame -> render/export.
 *
 * AsciiFrame is the single seam the rest of the app is built around. Renderers and
 * exporters only ever consume an AsciiFrame — never the source image directly — which
 * is what lets a static image (a length-1 frame sequence) and a future animated GIF/video
 * (an N-length sequence) share every downstream code path unchanged.
 */

/** One decoded frame from a source file, prior to any ASCII processing. */
export interface SourceFrame {
  bitmap: ImageBitmap;
  /** Playback duration of this frame in milliseconds. 0 for a still image. */
  durationMs: number;
}

/** A fully generated ASCII frame, ready to render or export. */
export interface AsciiFrame {
  cols: number;
  rows: number;
  /** Ramp index per cell, row-major, length cols*rows. */
  chars: Uint16Array;
  /** Per-cell RGBA color, length cols*rows*4. */
  rgba: Uint8ClampedArray;
  /** The glyph ramp `chars` indexes into, dark -> light. */
  ramp: readonly string[];
  /** Carried through from the source frame; 0 for stills, meaningful once animated. */
  durationMs: number;
}

export type RampPreset =
  | 'standard'
  | 'blocks'
  | 'detailed'
  | 'detailedPlus'
  | 'minimal'
  | 'custom'
  | 'language';
export type MixMode = 'mono' | 'multi' | 'original';
export type BackgroundMode = 'transparent' | 'solid';
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'soft-light'
  | 'hard-light';

/**
 * A crop rectangle in normalised 0..1 source coordinates.
 *
 * Normalised rather than pixels for two reasons: the same crop must stay meaningful when the
 * column count changes, and it must apply identically to every frame of an animated source,
 * which all share one geometry.
 */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** All user-facing generation parameters. Pure data — no functions, easy to persist/reset. */
export interface AsciiParams {
  ramp: RampPreset;
  customRamp: string;
  /** Which alphabet supplies the glyphs when `ramp` is 'language'. See languages.ts. */
  languageId: string;
  /** Tonal steps actually used, 0 = the full ramp. Lower values simplify the output. */
  levels: number;
  densityBias: number;
  invert: boolean;

  /**
   * How many grid cells each character stands in for, per axis. 1 is full detail; 3 means
   * one character covers a 3x3 block, so the grid gets coarser and each glyph is drawn
   * proportionally larger — fewer, bigger, more legible characters at the same output size.
   */
  charSize: number;

  cols: number;
  heightScale: number;
  pixelate: number;

  /**
   * Region of the source to convert, or null for the whole frame. Applied before sampling,
   * so the full column budget is spent on the selected region — a half-width crop still
   * yields `cols` columns rather than half of them.
   */
  crop: CropRect | null;

  /** Cut the background out, leaving those cells transparent. */
  bgRemove: boolean;
  /** Background colour to key against; '' means auto-detect from the frame border. */
  bgKeyColor: string;
  /** Colour distance below which a cell counts as background, 0..100. */
  bgTolerance: number;
  /**
   * true: flood-fill inward from the border, so only background *connected to the edge* is
   * removed. false: remove every matching cell anywhere in the frame.
   */
  bgContiguous: boolean;
  /** Cells of alpha falloff at the matte edge, so the cut isn't hard-edged. */
  bgFeather: number;

  brightness: number;
  contrast: number;
  gamma: number;

  mixMode: MixMode;
  monoColor: string;

  bgMode: BackgroundMode;
  bgColor: string;
  blendMode: BlendMode;

  exportScale: number;
}

/**
 * A per-cell transform applied to a generated AsciiFrame before rendering, parameterized
 * by a clock `t` (seconds). Unused in v1 (the array is always empty and `modulate.apply`
 * is the identity) but the seam exists now so animation is additive: filling this in and
 * driving `t` from a playback clock is the whole delta to "swap glyphs over time."
 */
export interface Modulator {
  id: string;
  apply(frame: AsciiFrame, t: number): AsciiFrame;
}
