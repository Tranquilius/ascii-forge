import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { AsciiFrame, AsciiParams, SourceFrame } from '../types';
import { generate } from '../pipeline';
import { applyModulators, NO_MODULATORS } from '../modulate';
import { createGlyphAnimator, type AnimationStyle } from '../modulators/glyphAnimation';
import { computeCanvasSize, renderToCanvas, type RenderOptions } from '../render/canvas';

/**
 * Highest frame rate a GIF can actually carry.
 *
 * The format stores per-frame delay in hundredths of a second, so 60fps (16.67ms) is not
 * representable — it rounds to 20ms. Worse, essentially every renderer clamps delays
 * below 20ms up to 100ms, so asking for 60fps yields a *slower* GIF than asking for 50.
 * 50fps (delay = 2) is the real ceiling.
 */
export const GIF_MAX_FPS = 50;

/** Per-frame delay in ms, snapped to the 10ms grid the format stores. */
export function gifDelayMs(fps: number): number {
  const clamped = Math.min(Math.max(fps, 1), GIF_MAX_FPS);
  return Math.max(20, Math.round(1000 / clamped / 10) * 10);
}

/**
 * Frame plan for a seamless shimmer loop.
 *
 * The clip only loops cleanly if its length is a whole number of glyph holds — otherwise
 * the last frame lands mid-hold and the wrap is visible as a jump. Duration is snapped
 * up to the nearest whole hold for that reason.
 */
export function planShimmerLoop(durationSec: number, holdMs: number, fps: number) {
  const holdSec = Math.max(holdMs, 1) / 1000;
  const loopSteps = Math.max(1, Math.round(durationSec / holdSec));
  const effectiveDurationSec = loopSteps * holdSec;
  const effectiveFps = Math.min(Math.max(fps, 1), GIF_MAX_FPS);
  const frameCount = Math.max(2, Math.round(effectiveDurationSec * effectiveFps));
  return { loopSteps, effectiveDurationSec, effectiveFps, frameCount, holdSec };
}

export interface GifExportOptions extends RenderOptions {
  /** Called with 0..1 after each frame so the UI can show progress on long sequences. */
  onProgress?: (progress: number) => void;
  /** Minimum per-frame delay in ms. See GIF_MAX_FPS for why 20 is the practical floor. */
  minDelayMs?: number;
}

/**
 * Shared per-frame encode step: rasterise an AsciiFrame, flatten it onto an opaque
 * backdrop, quantise, and append it to the encoder.
 *
 * GIF has no partial alpha, so transparent pixels must be composited rather than left to
 * encode as black. The scratch canvases are hoisted by the callers and reused across
 * frames — allocating a pair per frame is what makes a 100-frame export crawl.
 */
function encodeFrame(
  encoder: ReturnType<typeof GIFEncoder>,
  ascii: AsciiFrame,
  scratch: HTMLCanvasElement,
  out: HTMLCanvasElement,
  opts: RenderOptions,
  delayMs: number,
): void {
  const { width, height } = out;
  renderToCanvas(ascii, scratch, opts);

  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('Could not get a 2D context for GIF export.');
  outCtx.clearRect(0, 0, width, height);
  outCtx.fillStyle = opts.bgMode === 'solid' ? opts.bgColor : '#000000';
  outCtx.fillRect(0, 0, width, height);
  outCtx.drawImage(scratch, 0, 0, width, height);

  const { data } = outCtx.getImageData(0, 0, width, height);
  const palette = quantize(data, 256);
  const index = applyPalette(data, palette);
  encoder.writeFrame(index, width, height, { palette, delay: delayMs });
}

/** Yield to the event loop periodically so a long export doesn't lock the UI thread. */
async function breathe(i: number): Promise<void> {
  if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * ASCII-ify every source frame and encode the sequence as an animated GIF.
 *
 * Runs the same generate -> modulate -> renderToCanvas path the live preview uses, so the
 * exported animation is guaranteed to match what was on screen. gifenc's palette
 * quantizer suits this output well: ASCII frames are flat-colored with a small number of
 * distinct values, which is exactly the case where a no-dither quantizer looks clean.
 */
export async function exportGif(
  sources: readonly SourceFrame[],
  params: AsciiParams,
  opts: GifExportOptions,
): Promise<Blob> {
  if (sources.length === 0) throw new Error('No frames to export.');

  const encoder = GIFEncoder();
  const scratch = document.createElement('canvas');
  const out = document.createElement('canvas');
  const minDelayMs = opts.minDelayMs ?? 20;

  // A GIF has one logical screen size, so every frame must rasterize to identical
  // dimensions. The first frame sets the size and the rest are pinned to it.
  const firstAscii = generate(sources[0], params);
  const size = computeCanvasSize(firstAscii, opts.fontFamily, opts.scale);
  out.width = size.width;
  out.height = size.height;

  for (let i = 0; i < sources.length; i++) {
    const ascii = i === 0 ? firstAscii : generate(sources[i], params);
    const modulated = applyModulators(ascii, NO_MODULATORS, 0);
    encodeFrame(encoder, modulated, scratch, out, opts, Math.max(minDelayMs, sources[i].durationMs || 100));
    opts.onProgress?.((i + 1) / sources.length);
    await breathe(i);
  }

  encoder.finish();
  return new Blob([encoder.bytes() as BlobPart], { type: 'image/gif' });
}

export interface AnimationGifOptions extends RenderOptions {
  /** Interchangeable ramp indices, from glyphDensity.getGlyphSet(). */
  alternatives: number[][];
  style: AnimationStyle;
  /** How long one cell holds a glyph, ms — the same value the preview animates with. */
  holdMs: number;
  durationSec: number;
  fps: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encode a glyph animation over a single still frame as a seamlessly looping GIF.
 *
 * The animation is deterministic, so stepping the modulator over the clip's timeline
 * reproduces exactly what the preview shows. `planShimmerLoop` snaps the duration to a
 * whole number of holds and the modulator wraps its step counter to match, so the last
 * frame hands back to the first with no visible seam.
 */
export async function exportAnimationGif(
  frame: AsciiFrame,
  opts: AnimationGifOptions,
): Promise<Blob> {
  const { loopSteps, effectiveDurationSec, effectiveFps, frameCount } = planShimmerLoop(
    opts.durationSec,
    opts.holdMs,
    opts.fps,
  );

  const modulator = createGlyphAnimator({
    alternatives: opts.alternatives,
    style: opts.style,
    holdMs: opts.holdMs,
    loopSteps,
  });

  const encoder = GIFEncoder();
  const scratch = document.createElement('canvas');
  const out = document.createElement('canvas');
  const size = computeCanvasSize(frame, opts.fontFamily, opts.scale);
  out.width = size.width;
  out.height = size.height;

  const delay = gifDelayMs(effectiveFps);

  for (let i = 0; i < frameCount; i++) {
    // Sample across [0, effectiveDuration) — landing exactly on the period would repeat
    // frame 0 and stutter the loop.
    const t = (i / frameCount) * effectiveDurationSec;
    encodeFrame(encoder, modulator.apply(frame, t), scratch, out, opts, delay);
    opts.onProgress?.((i + 1) / frameCount);
    await breathe(i);
  }

  encoder.finish();
  return new Blob([encoder.bytes() as BlobPart], { type: 'image/gif' });
}
