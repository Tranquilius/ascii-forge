import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { AsciiFrame } from '../types';
import { createGlyphAnimator, type AnimationStyle } from '../modulators/glyphAnimation';
import { computeCanvasSize, renderToCanvas, type RenderOptions } from '../render/canvas';
import { planShimmerLoop } from './gif';

/**
 * MP4 export via WebCodecs.
 *
 * This exists because GIF cannot carry 60fps: its per-frame delay is stored in hundredths
 * of a second, so 16.67ms is unrepresentable and renderers clamp sub-20ms delays up to
 * 100ms. H.264 has no such limit.
 *
 * Encoding runs through VideoEncoder rather than MediaRecorder because MediaRecorder
 * captures in real time — a 5s clip would take 5s and inherit any dropped frames. This
 * path encodes as fast as the machine allows and gives exact per-frame timestamps.
 */

/** H.264 requires even dimensions for 4:2:0 chroma subsampling. */
function toEven(n: number): number {
  return n % 2 === 0 ? n : n - 1;
}

/**
 * Candidate codec strings, widest-capability first. The level embedded in the string caps
 * the resolution the encoder will accept, and ASCII output gets large fast, so we probe
 * from High@5.2 downward rather than assuming a baseline profile will take the frame.
 */
const CODEC_CANDIDATES = [
  'avc1.640034', // High @ 5.2
  'avc1.640028', // High @ 4.0
  'avc1.4d0028', // Main @ 4.0
  'avc1.42001f', // Baseline @ 3.1
];

export interface Mp4Support {
  supported: boolean;
  reason?: string;
}

/** Whether this browser can encode H.264 at all — checked before offering MP4 in the UI. */
export async function checkMp4Support(): Promise<Mp4Support> {
  if (typeof VideoEncoder === 'undefined') {
    return { supported: false, reason: 'This browser has no WebCodecs VideoEncoder.' };
  }
  for (const codec of CODEC_CANDIDATES) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec,
        width: 640,
        height: 480,
        bitrate: 2_000_000,
      });
      if (supported) return { supported: true };
    } catch {
      // try the next candidate
    }
  }
  return { supported: false, reason: 'This browser cannot encode H.264 video.' };
}

async function pickCodec(width: number, height: number, bitrate: number): Promise<string> {
  for (const codec of CODEC_CANDIDATES) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate });
      if (supported) return codec;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    `No supported H.264 profile for ${width}x${height}. Try a smaller Width or export scale.`,
  );
}

export interface AnimationMp4Options extends RenderOptions {
  alternatives: number[][];
  style: AnimationStyle;
  holdMs: number;
  durationSec: number;
  fps: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encode a glyph animation over a single still frame as a seamlessly looping MP4.
 *
 * Shares `planShimmerLoop` with the GIF path so both formats snap the clip to a whole
 * number of glyph holds and wrap the modulator's step counter — the last frame hands back
 * to the first with no visible seam.
 */
export async function exportAnimationMp4(
  frame: AsciiFrame,
  opts: AnimationMp4Options,
): Promise<Blob> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('This browser has no WebCodecs VideoEncoder, so MP4 export is unavailable.');
  }

  // MP4 has no 50fps ceiling, so the requested rate is used as-is rather than capped.
  const holdSec = Math.max(opts.holdMs, 1) / 1000;
  const loopSteps = Math.max(1, Math.round(opts.durationSec / holdSec));
  const effectiveDurationSec = loopSteps * holdSec;
  const fps = Math.min(Math.max(Math.round(opts.fps), 1), 120);
  const frameCount = Math.max(2, Math.round(effectiveDurationSec * fps));

  const raw = computeCanvasSize(frame, opts.fontFamily, opts.scale);
  const width = Math.max(2, toEven(raw.width));
  const height = Math.max(2, toEven(raw.height));

  // Generous but bounded: ASCII is high-frequency edge detail, which starves at low rates.
  const bitrate = Math.min(40_000_000, Math.max(2_000_000, Math.round(width * height * fps * 0.12)));
  const codec = await pickCodec(width, height, bitrate);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory',
  });

  let encodeError: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  encoder.configure({ codec, width, height, bitrate, framerate: fps });

  const modulator = createGlyphAnimator({
    alternatives: opts.alternatives,
    style: opts.style,
    holdMs: opts.holdMs,
    loopSteps,
  });

  const scratch = document.createElement('canvas');
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('Could not get a 2D context for MP4 export.');

  try {
    for (let i = 0; i < frameCount; i++) {
      if (encodeError) throw encodeError;

      // Sample across [0, duration) — landing on the period would repeat frame 0.
      const t = (i / frameCount) * effectiveDurationSec;
      renderToCanvas(modulator.apply(frame, t), scratch, opts);

      // H.264 is opaque, so flatten onto a backdrop instead of letting transparency
      // encode as black fringing around the glyphs.
      outCtx.fillStyle = opts.bgMode === 'solid' ? opts.bgColor : '#000000';
      outCtx.fillRect(0, 0, width, height);
      outCtx.drawImage(scratch, 0, 0, width, height);

      const videoFrame = new VideoFrame(out, {
        timestamp: Math.round((i / fps) * 1_000_000), // microseconds
        duration: Math.round((1 / fps) * 1_000_000),
      });
      // A keyframe every second keeps seeking usable without bloating the file.
      encoder.encode(videoFrame, { keyFrame: i % fps === 0 });
      videoFrame.close();

      opts.onProgress?.((i + 1) / frameCount);

      // Let the encoder drain and keep the UI responsive on long clips.
      if (encoder.encodeQueueSize > 8 || i % 4 === 3) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    await encoder.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();
    return new Blob([target.buffer as BlobPart], { type: 'video/mp4' });
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

/** Frame plan for the MP4 path, mirroring the GIF planner for UI display. */
export function planMp4Loop(durationSec: number, holdMs: number, fps: number) {
  const plan = planShimmerLoop(durationSec, holdMs, fps);
  const holdSec = Math.max(holdMs, 1) / 1000;
  const loopSteps = Math.max(1, Math.round(durationSec / holdSec));
  const effectiveDurationSec = loopSteps * holdSec;
  const effectiveFps = Math.min(Math.max(Math.round(fps), 1), 120);
  return {
    ...plan,
    effectiveFps,
    effectiveDurationSec,
    frameCount: Math.max(2, Math.round(effectiveDurationSec * effectiveFps)),
  };
}
