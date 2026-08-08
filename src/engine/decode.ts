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
const VIDEO_TARGET_FPS = 12;

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
async function decodeAnimatedGif(file: File): Promise<SourceFrame[] | null> {
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
async function decodeVideo(file: File): Promise<SourceFrame[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not load that video.'));
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('That video has no readable duration.');
    }

    const frameInterval = 1 / VIDEO_TARGET_FPS;
    const frameCount = Math.min(Math.max(1, Math.floor(duration * VIDEO_TARGET_FPS)), MAX_FRAMES);

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

    const frames: SourceFrame[] = [];
    for (let i = 0; i < frameCount; i++) {
      const t = i * frameInterval;
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error('Failed while seeking the video.'));
        video.currentTime = Math.min(t, duration - 0.001);
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({
        bitmap: await createImageBitmap(canvas),
        durationMs: frameInterval * 1000,
      });
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
export async function decodeFile(file: File): Promise<SourceFrame[]> {
  if (isVideoFile(file)) return decodeVideo(file);

  if (isGif(file)) {
    const animated = await decodeAnimatedGif(file);
    if (animated && animated.length > 0) return animated;
  }

  // Stills keep their full resolution. One bitmap is cheap to hold, and letting the
  // sampler downscale straight from the original in a single step preserves detail that
  // a pre-shrink would have already thrown away.
  return [{ bitmap: await createImageBitmap(file), durationMs: 0 }];
}
