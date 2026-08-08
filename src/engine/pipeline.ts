import type { AsciiFrame, AsciiParams, SourceFrame } from './types';
import { applyLevels, resolveRamp } from './ramps';
import { measureRampCell } from './metrics';
import { computeRows, effectiveCols, sampleImage } from './sample';
import { resolveCrop } from './crop';
import { applyMatte, type RGB } from './matte';
import { applyToneRGBA } from './tone';
import { luminance709, luminanceToRampIndex } from './map';
import { parseHexColor, resolveCellColor } from './color';

/** The render font family — kept in one place since metrics.ts and render/canvas.ts must agree. */
export const RENDER_FONT_FAMILY = 'ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace';

/**
 * Generate an AsciiFrame from one decoded SourceFrame. Pure and synchronous over a single
 * frame — this is what keeps it portable to a Web Worker once the animation phase needs to
 * process many frames without blocking the UI thread.
 */
export function generate(source: SourceFrame, params: AsciiParams): AsciiFrame {
  const ramp = applyLevels(
    resolveRamp(params.ramp, params.customRamp, RENDER_FONT_FAMILY, params.languageId),
    params.levels,
  );
  // Measured from the ramp's own glyphs so a full-width alphabet (Japanese, Korean)
  // produces a correspondingly wider cell instead of overlapping characters.
  const { aspect: cellAspect } = measureRampCell(RENDER_FONT_FAMILY, 100, ramp);

  const cols = effectiveCols(params.cols, params.charSize);
  // Rows come from the *cropped* dimensions, not the source's — feeding the full size here
  // is the one mistake that would silently stretch a cropped result.
  const rect = resolveCrop(params.crop, source.bitmap.width, source.bitmap.height);
  const rows = computeRows(cols, rect.sw, rect.sh, cellAspect, params.heightScale);

  const sampled = sampleImage(source.bitmap, cols, rows, params.pixelate, rect);
  // Matte before tone: keying has to read the original colours, or dragging Brightness
  // would quietly change which cells count as background.
  const matted = params.bgRemove
    ? applyMatte(sampled, cols, rows, {
        keyColor: params.bgKeyColor ? (parseHexColor(params.bgKeyColor) as RGB) : null,
        tolerance: params.bgTolerance,
        contiguous: params.bgContiguous,
        feather: params.bgFeather,
      })
    : sampled;
  const toned = applyToneRGBA(matted, params.brightness, params.contrast, params.gamma);

  const cellCount = cols * rows;
  const chars = new Uint16Array(cellCount);
  const rgba = new Uint8ClampedArray(cellCount * 4);
  const monoColor = parseHexColor(params.monoColor);

  for (let i = 0; i < cellCount; i++) {
    const o = i * 4;
    const r = toned[o];
    const g = toned[o + 1];
    const b = toned[o + 2];
    const a = toned[o + 3];

    const lum = luminance709(r, g, b);
    chars[i] = luminanceToRampIndex(lum, ramp.length, params.densityBias, params.invert);

    const [cr, cg, cb] = resolveCellColor(params.mixMode, monoColor, [r, g, b]);
    rgba[o] = cr;
    rgba[o + 1] = cg;
    rgba[o + 2] = cb;
    rgba[o + 3] = a;
  }

  return { cols, rows, chars, rgba, ramp, durationMs: source.durationMs };
}
