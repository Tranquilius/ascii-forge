import type { AsciiParams } from './types';

export const DEFAULT_PARAMS: AsciiParams = {
  // 'detailed' by default: it carries roughly twice the tonal information of the 10-glyph
  // 'standard' ramp (~5.7 vs ~2.9 bits of glyph entropy on a typical photo), and the ramp
  // choice dominates perceived detail far more than any tone setting does.
  ramp: 'detailed',
  // 0 = use every glyph in the ramp; lower values simplify the output.
  levels: 0,
  // 1 = one character per grid cell (full detail).
  charSize: 1,
  customRamp: '',
  languageId: 'japanese',
  densityBias: 1.0,
  invert: false,

  // Measured from a reference output: ~220 columns, not the 120 the control panel's
  // label suggested. At 120 the grid holds ~3.3x fewer cells, which is the single
  // largest contributor to a flat, detail-poor result.
  cols: 220,
  heightScale: 1.0,
  pixelate: 0,

  // null = convert the whole frame. Set by the Crop overlay.
  crop: null,

  bgRemove: false,
  // '' auto-detects from the border of whatever region is being converted.
  bgKeyColor: '',
  bgTolerance: 18,
  // Edge-connected by default: the safe choice, since it can't punch holes in a subject
  // that happens to contain the background colour.
  bgContiguous: true,
  bgFeather: 1,

  brightness: 8,
  contrast: 22,
  gamma: 1.0,

  // 'original' keeps each cell's true source colour — the result you'd expect from
  // "convert this image". Mono and Multi are deliberate stylizations, so they are opt-in.
  mixMode: 'original',
  monoColor: '#e5e5e5',

  bgMode: 'solid',
  bgColor: '#000000',
  // Fixed. The blend-mode control was removed from the UI; the renderers still honour this
  // field, so leaving it at 'normal' keeps compositing predictable everywhere.
  blendMode: 'normal',

  exportScale: 1,
};
