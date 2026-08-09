import type { SourceFrame } from './types';

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const ACCEPTED_IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];
export const ACCEPTED_VIDEO_EXT = ['.mp4', '.webm', '.mov'];

/**
 * Long-edge cap for *animated* sources only.
 *
 * An animation holds every frame as a live ImageBitmap at once, so an uncapped 1080p
 * source at MAX_FRAMES would run into the gigabytes. Stills are deliberately exempt: one
 * bitmap costs nothing to keep, and pre-shrinking it resamples the image twice before it
 * ever reaches the sampler, which measurably costs detail at higher column counts.
 */
const MAX_ANIMATED_SOURCE_EDGE = 640;

/** Hard ceiling on decoded frames, so a long video/GIF can't exhaust memory. */
export const MAX_FRAMES = 300;

/** Fallback frame duration when a GIF frame declares none (matches common browser behavior). */
const DEFAULT_FRAME_MS = 100;

/** Target sampling rate for video sources. */
export const VIDEO_TARGET_FPS = 12;

/**
 * Seconds of video the frame ceiling allows.
 *
 * Derived rather than written down, so the figure shown in the UI can never drift away
 * from the limit actually enforced.
 */
export const MAX_VIDEO_SECONDS = MAX_FRAMES / VIDEO_TARGET_FPS;

/** How close counts as "already there", so we don't await a seek that will never fire. */
const SEEK_EPSILON = 1e-3;
const SEEK_TIMEOUT_MS = 10_000;
const METADATA_TIMEOUT_MS = 20_000;

/**
 * Progress during decoding.
 *
 * Extraction of a long video runs for tens of seconds. Without this the UI can only show a
 * fixed "Decoding…" and is indistinguishable from a hang, which is the single most common
 * reason to assume the app is broken.
 */
export interface DecodeProgressEvent {
  /** Frames finished so far. */
  done: number;
  /** Frames that will be produced in total. Known up front for both video and GIF. */
  total: number;
  stage: 'reading' | 'extracting';
  /**
   * Set when the source is longer than MAX_FRAMES allows, carrying the seconds actually
   * captured. Silently truncating a video is worse than saying so.
   */
  truncatedToSec?: number;
}

export type DecodeProgress = (event: DecodeProgressEvent) => void;

/** Reject with a useful message rather than hanging forever on a stalled decoder. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export function isVideoFile(file: File): boolean {
  if (ACCEPTED_VIDEO_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_VIDEO_EXT.some((ext) => name.endsWith(ext));
}

export function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type) || isVideoFile(file)) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_IMAGE_EXT.some((ext) => name.endsWith(ext));
}

function isGif(file: File): boolean {
  return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
}

/** Downscale options for createImageBitmap so a frame's long edge fits `maxEdge`. */
function resizeOptions(width: number, height: number, maxEdge: number): ImageBitmapOptions {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return {};
  const scale = maxEdge / longEdge;
  return {
    resizeWidth: Math.max(1, Math.round(width * scale)),
    resizeHeight: Math.max(1, Math.round(height * scale)),
    resizeQuality: 'high',
  };
}

/**
 * Decode every frame of an animated GIF using the WebCodecs ImageDecoder.
 * Returns null when ImageDecoder is unavailable or the file turns out to be a still,
 * so the caller can fall back to the single-frame path.
 */
async function decodeAnimatedGif(
  file: File,
  onProgress?: DecodeProgress,
): Promise<SourceFrame[] | null> {
  if (typeof ImageDecoder === 'undefined') return null;

  try {
    const data = await file.arrayBuffer();
    const decoder = new ImageDecoder({ data, type: 'image/gif' });
    // `tracks.ready` is what populates the track list — awaiting only `completed`
    // leaves `tracks` empty, which silently looks like a single-frame image.
    await decoder.tracks.ready;
    await decoder.completed;

    const track = decoder.tracks.selectedTrack;
    const frameCount = Math.min(track?.frameCount ?? 1, MAX_FRAMES);
    if (frameCount <= 1) {
      decoder.close();
      return null;
    }

    onProgress?.({ done: 0, total: frameCount, stage: 'extracting' });

    const frames: SourceFrame[] = [];
    for (let i = 0; i < frameCount; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      const bitmap = await createImageBitmap(
        image,
        resizeOptions(image.displayWidth, image.displayHeight, MAX_ANIMATED_SOURCE_EDGE),
      );
      // VideoFrame.duration is in microseconds; 0/null means "unspecified".
      const durationMs = image.duration ? image.duration / 1000 : DEFAULT_FRAME_MS;
      image.close();
      frames.push({ bitmap, durationMs });
      onProgress?.({ done: i + 1, total: frameCount, stage: 'extracting' });
    }
    decoder.close();
    return frames;
  } catch {
    // Corrupt or unsupported GIF — let the caller fall back to first-frame decoding.
    return null;
  }
}

/**
 * Extract frames from a video by seeking at a fixed rate.
 *
 * Seeking rather than playing with requestVideoFrameCallback means extraction runs as
 * fast as the decoder allows instead of in real time, and gives an even frame cadence
 * regardless of the source's variable frame rate.
 */
async function decodeVideo(file: File, onProgress?: DecodeProgress): Promise<SourceFrame[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Could not load that video.'));
      }),
      METADATA_TIMEOUT_MS,
      'Timed out reading that video — the format may not be supported.',
    );

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('That video has no readable duration.');
    }

    const frameInterval = 1 / VIDEO_TARGET_FPS;
    const wanted = Math.max(1, Math.floor(duration * VIDEO_TARGET_FPS));
    const frameCount = Math.min(wanted, MAX_FRAMES);
    // A long video is cut to the first MAX_FRAMES worth. Report how many seconds actually
    // survived so the caller can say so rather than leaving the rest to vanish unexplained.
    const truncatedToSec = frameCount < wanted ? frameCount * frameInterval : undefined;

    const canvas = document.createElement('canvas');
    const { resizeWidth, resizeHeight } = resizeOptions(
      video.videoWidth,
      video.videoHeight,
      MAX_ANIMATED_SOURCE_EDGE,
    );
    canvas.width = resizeWidth ?? video.videoWidth;
    canvas.height = resizeHeight ?? video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create a canvas to read video frames.');

    onProgress?.({ done: 0, total: frameCount, stage: 'extracting', truncatedToSec });

    const frames: SourceFrame[] = [];
    try {
      for (let i = 0; i < frameCount; i++) {
        const target = Math.min(i * frameInterval, duration - 0.001);

        // Assigning currentTime the value it already holds fires no 'seeked' event, so a
        // naive await here never settles — which is exactly what happens on the very first
        // frame, where both are 0. Resolve immediately when we are already close enough,
        // and put a timeout on the rest so a stalled decoder fails loudly rather than
        // hanging with the UI stuck on a spinner forever.
        if (Math.abs(video.currentTime - target) > SEEK_EPSILON) {
          await withTimeout(
            new Promise<void>((resolve, reject) => {
              video.onseeked = () => resolve();
              video.onerror = () => reject(new Error('Failed while seeking the video.'));
              video.currentTime = target;
            }),
            SEEK_TIMEOUT_MS,
            `Timed out extracting frame ${i + 1} of ${frameCount}.`,
          );
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push({
          bitmap: await createImageBitmap(canvas),
          durationMs: frameInterval * 1000,
        });

        onProgress?.({ done: i + 1, total: frameCount, stage: 'extracting', truncatedToSec });
      }
    } catch (err) {
      // Release what was already decoded — ImageBitmaps hold native memory that GC will
      // not reclaim promptly, and a failed extraction could otherwise strand hundreds.
      for (const f of frames) f.bitmap.close();
      throw err;
    }
    return frames;
  } finally {
    video.src = '';
    video.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * Decode a File into a sequence of SourceFrames.
 *
 * Still images yield a single frame; animated GIFs and videos yield the full sequence.
 * Every consumer downstream treats a still as a length-1 animation, so nothing else in
 * the pipeline has to branch on whether the source moves.
 */
export async function decodeFile(file: File, onProgress?: DecodeProgress): Promise<SourceFrame[]> {
  if (isVideoFile(file)) return decodeVideo(file, onProgress);

  if (isGif(file)) {
    const animated = await decodeAnimatedGif(file, onProgress);
    if (animated && animated.length > 0) return animated;
  }

  // A still resolves in one step; report it so the caller's progress state is consistent
  // rather than left at whatever a previous file set it to.
  onProgress?.({ done: 0, total: 1, stage: 'reading' });

  // Stills keep their full resolution. One bitmap is cheap to hold, and letting the
  // sampler downscale straight from the original in a single step preserves detail that
  // a pre-shrink would have already thrown away.
  return [{ bitmap: await createImageBitmap(file), durationMs: 0 }];
}
