import { create } from 'zustand';
import type { AsciiFrame, AsciiParams, SourceFrame } from './engine/types';
import { DEFAULT_PARAMS } from './engine/defaults';
import { clampZoom, stepZoom } from './ui/zoom';
import type { AnimationStyle } from './engine/modulators/glyphAnimation';

interface AppState {
  params: AsciiParams;
  /**
   * The decoded source sequence. A still image is a length-1 sequence, so nothing
   * downstream has to branch on whether the source moves.
   */
  frames: SourceFrame[];
  frameIndex: number;
  sourceFileName: string | null;
  isLoading: boolean;
  /** Progress message shown while decoding a long GIF/video. */
  loadingLabel: string | null;
  error: string | null;
  /** True once the density-bias "dice" toggle is active — Generate rerolls a random bias. */
  randomizeBias: boolean;
  /** Pipeline output for the current frame index. Modulators (glyph animation) are applied at
   *  render time by Preview rather than stored, so the animation never round-trips
   *  through React state. */
  frame: AsciiFrame | null;

  /** Whether the glyph animation is running. */
  animating: boolean;
  /** Which animation style is applied — differs only in when each cell takes its turn. */
  animStyle: AnimationStyle;
  /** How long one cell holds a glyph, ms. Lower = busier churn, not a higher frame rate. */
  animHoldMs: number;
  /** Length of an exported animation clip, seconds. */
  animDurationSec: number;
  /** Frame rate for the exported GIF. */
  animFps: number;
  /** Output container. MP4 exists because GIF cannot represent 60fps. */
  animFormat: 'gif' | 'mp4';

  isPlaying: boolean;
  loop: boolean;

  /**
   * Crop overlay is open. A mode rather than a modifier key, because the preview stage
   * already uses drag to scroll when zoomed in — an explicit mode avoids fighting it.
   */
  cropping: boolean;
  /** Eyedropper armed: the next click on the preview sets the background key colour. */
  pickingKeyColor: boolean;

  /** Manual zoom level; only consulted when zoomMode is 'manual'. */
  zoom: number;
  zoomMode: 'fit' | 'manual';
  /** Fit zoom measured by Preview, mirrored here so ZoomControls can show the real
   *  percentage without duplicating the container measurement. */
  fitZoom: number;

  setParam: <K extends keyof AsciiParams>(key: K, value: AsciiParams[K]) => void;
  setParams: (patch: Partial<AsciiParams>) => void;
  resetParams: () => void;
  toggleInvert: () => void;
  setRandomizeBias: (value: boolean) => void;
  rerollBias: () => void;
  setFrames: (frames: SourceFrame[], fileName: string | null) => void;
  setFrameIndex: (index: number) => void;
  setLoading: (loading: boolean, label?: string | null) => void;
  setError: (error: string | null) => void;
  setFrame: (frame: AsciiFrame | null) => void;
  setAnimating: (on: boolean) => void;
  setAnimStyle: (style: AnimationStyle) => void;
  toggleAnimating: () => void;
  setAnimHoldMs: (ms: number) => void;
  setAnimDurationSec: (sec: number) => void;
  setAnimFps: (fps: number) => void;
  setAnimFormat: (format: 'gif' | 'mp4') => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setLoop: (loop: boolean) => void;
  setCropping: (cropping: boolean) => void;
  toggleCropping: () => void;
  clearCrop: () => void;
  setPickingKeyColor: (picking: boolean) => void;
  setZoom: (zoom: number) => void;
  zoomBy: (direction: 1 | -1) => void;
  zoomToFit: () => void;
  zoomToActual: () => void;
  setFitZoom: (fitZoom: number) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  params: { ...DEFAULT_PARAMS },
  frames: [],
  frameIndex: 0,
  sourceFileName: null,
  isLoading: false,
  loadingLabel: null,
  error: null,
  randomizeBias: false,
  frame: null,
  animating: false,
  animStyle: 'shimmer',
  animHoldMs: 500,
  animDurationSec: 2,
  animFps: 50,
  animFormat: 'gif',
  isPlaying: false,
  loop: true,
  cropping: false,
  pickingKeyColor: false,
  zoom: 1,
  zoomMode: 'fit',
  fitZoom: 1,

  setParam: (key, value) => set((state) => ({ params: { ...state.params, [key]: value } })),
  setParams: (patch) => set((state) => ({ params: { ...state.params, ...patch } })),
  resetParams: () => set({ params: { ...DEFAULT_PARAMS } }),
  toggleInvert: () => set((state) => ({ params: { ...state.params, invert: !state.params.invert } })),
  setRandomizeBias: (randomizeBias) => set({ randomizeBias }),
  rerollBias: () => {
    if (!get().randomizeBias) return;
    const bias = Math.round((0.3 + Math.random() * 2.7) * 100) / 100;
    set((state) => ({ params: { ...state.params, densityBias: bias } }));
  },

  setFrames: (frames, sourceFileName) => {
    // ImageBitmaps hold GPU/native memory that GC won't reclaim promptly — an animated
    // source can be hundreds of them, so release the previous sequence explicitly.
    for (const prev of get().frames) {
      if (!frames.includes(prev)) prev.bitmap.close();
    }
    set({
      frames,
      frameIndex: 0,
      sourceFileName,
      error: null,
      // Autoplay animated sources; a still has nothing to play.
      isPlaying: frames.length > 1,
    });
  },
  setFrameIndex: (index) => {
    const { frames } = get();
    if (frames.length === 0) return;
    const clamped = Math.min(Math.max(index, 0), frames.length - 1);
    set({ frameIndex: clamped });
  },
  setLoading: (isLoading, loadingLabel = null) => set({ isLoading, loadingLabel }),
  setError: (error) => set({ error }),
  setFrame: (frame) => set({ frame }),
  setAnimating: (animating) => set({ animating }),
  setAnimStyle: (animStyle) => set({ animStyle }),
  toggleAnimating: () => set((state) => ({ animating: !state.animating })),
  setAnimHoldMs: (animHoldMs) => set({ animHoldMs }),
  setAnimDurationSec: (animDurationSec) => set({ animDurationSec }),
  setAnimFps: (animFps) => set({ animFps }),
  setAnimFormat: (animFormat) => set({ animFormat }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  togglePlaying: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setLoop: (loop) => set({ loop }),

  // The two preview modes are mutually exclusive: both want the next click on the canvas,
  // so arming one always disarms the other.
  setCropping: (cropping) => set({ cropping, pickingKeyColor: false }),
  toggleCropping: () => set((state) => ({ cropping: !state.cropping, pickingKeyColor: false })),
  clearCrop: () =>
    set((state) => ({ params: { ...state.params, crop: null }, cropping: false })),
  setPickingKeyColor: (pickingKeyColor) => set({ pickingKeyColor, cropping: false }),

  setZoom: (zoom) => set({ zoom: clampZoom(zoom), zoomMode: 'manual' }),
  zoomBy: (direction) => {
    // Stepping while in fit mode continues from whatever fit resolved to, so the first
    // click nudges the view instead of jumping back to 100%.
    const { zoom, zoomMode, fitZoom } = get();
    const base = zoomMode === 'fit' ? fitZoom : zoom;
    set({ zoom: stepZoom(base, direction), zoomMode: 'manual' });
  },
  zoomToFit: () => set({ zoomMode: 'fit' }),
  zoomToActual: () => set({ zoom: 1, zoomMode: 'manual' }),
  setFitZoom: (fitZoom) => set({ fitZoom }),
}));
