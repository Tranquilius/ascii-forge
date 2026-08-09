import { create } from 'zustand';
import type { AsciiFrame, AsciiParams, CropRect, SourceFrame } from './engine/types';
import { DEFAULT_PARAMS } from './engine/defaults';
import { clampZoom, stepZoom } from './ui/zoom';
import { composeCrop } from './engine/crop';
import type { AnimationStyle } from './engine/modulators/glyphAnimation';

/**
 * One open view of the source, with its own complete settings.
 *
 * A tab owns a full AsciiParams rather than just a crop, so each view is an independent
 * document: it starts as a snapshot of whatever was on screen when it was created, and
 * every adjustment afterwards belongs to that tab alone. `params.crop` of null is the
 * whole image.
 */
export interface CropTab {
  id: string;
  label: string;
  params: AsciiParams;
}

export const FULL_TAB_ID = 'full';

let tabSeq = 0;

/**
 * Write settings to the active tab and to the top-level mirror in one step.
 *
 * `params` duplicates the active tab's settings so the many `s.params` selectors around the
 * app keep working untouched. That duplication is only safe while every write goes through
 * here — updating one without the other is how the two silently drift apart.
 */
function writeParams(state: { params: AsciiParams; tabs: CropTab[]; activeTabId: string }, next: AsciiParams) {
  return {
    params: next,
    tabs: state.tabs.map((t) => (t.id === state.activeTabId ? { ...t, params: next } : t)),
  };
}

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
  /**
   * Frames decoded so far and expected, or null when the work is not countable.
   * Extraction runs for tens of seconds on a long video; without a real count the UI can
   * only show a spinner, which is indistinguishable from a hang.
   */
  loadingProgress: { done: number; total: number } | null;
  /** Seconds captured when a source was longer than the frame ceiling allows. */
  truncatedToSec: number | null;
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
   * Open views of the same source, one per crop — the first is always the whole image.
   *
   * Cropping opens a new view rather than replacing the current one, so a crop is
   * non-destructive: the full image stays one click away and several framings of the same
   * source can be compared without redrawing them.
   */
  tabs: CropTab[];
  activeTabId: string;

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
  setLoadingProgress: (progress: { done: number; total: number } | null) => void;
  setTruncatedToSec: (sec: number | null) => void;
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
  /**
   * Commit a crop selection, opening it as a new tab that snapshots the current settings.
   * The selection is normalised against the active view, so it is composed into that view's
   * own crop rather than taken as source coordinates.
   */
  commitCrop: (selection: CropRect | null) => void;
  selectTab: (id: string) => void;
  closeTab: (id: string) => void;
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
  loadingProgress: null,
  truncatedToSec: null,
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
  tabs: [{ id: FULL_TAB_ID, label: 'Full', params: { ...DEFAULT_PARAMS } }],
  activeTabId: FULL_TAB_ID,
  cropping: false,
  pickingKeyColor: false,
  zoom: 1,
  zoomMode: 'fit',
  fitZoom: 1,

  setParam: (key, value) => set((state) => writeParams(state, { ...state.params, [key]: value })),
  setParams: (patch) => set((state) => writeParams(state, { ...state.params, ...patch })),
  // Reset restores the look, not the framing: wiping this tab's crop would silently turn a
  // cropped view back into the full image, which is a different document.
  resetParams: () =>
    set((state) => writeParams(state, { ...DEFAULT_PARAMS, crop: state.params.crop })),
  toggleInvert: () =>
    set((state) => writeParams(state, { ...state.params, invert: !state.params.invert })),
  setRandomizeBias: (randomizeBias) => set({ randomizeBias }),
  rerollBias: () => {
    if (!get().randomizeBias) return;
    const bias = Math.round((0.3 + Math.random() * 2.7) * 100) / 100;
    set((state) => writeParams(state, { ...state.params, densityBias: bias }));
  },

  setFrames: (frames, sourceFileName) => {
    // ImageBitmaps hold GPU/native memory that GC won't reclaim promptly — an animated
    // source can be hundreds of them, so release the previous sequence explicitly.
    for (const prev of get().frames) {
      if (!frames.includes(prev)) prev.bitmap.close();
    }
    set((state) => ({
      frames,
      frameIndex: 0,
      sourceFileName,
      error: null,
      // Autoplay animated sources; a still has nothing to play.
      isPlaying: frames.length > 1,
      // Crops are framings of a specific image, so they cannot carry over to a new one.
      // The look does carry over — only the framing is image-specific.
      tabs: [{ id: FULL_TAB_ID, label: 'Full', params: { ...state.params, crop: null } }],
      activeTabId: FULL_TAB_ID,
      cropping: false,
      params: { ...state.params, crop: null },
    }));
  },
  setFrameIndex: (index) => {
    const { frames } = get();
    if (frames.length === 0) return;
    const clamped = Math.min(Math.max(index, 0), frames.length - 1);
    set({ frameIndex: clamped });
  },
  setLoading: (isLoading, loadingLabel = null) =>
    // Clear the counter when loading ends, so a stale bar never lingers over the result.
    set(isLoading ? { isLoading, loadingLabel } : { isLoading, loadingLabel, loadingProgress: null }),
  setLoadingProgress: (loadingProgress) => set({ loadingProgress }),
  setTruncatedToSec: (truncatedToSec) => set({ truncatedToSec }),
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

  /** Discard the active crop view and fall back to the full image, with its own settings. */
  clearCrop: () =>
    set((state) => {
      if (state.activeTabId === FULL_TAB_ID) {
        return { ...writeParams(state, { ...state.params, crop: null }), cropping: false };
      }
      const tabs = state.tabs.filter((t) => t.id !== state.activeTabId);
      const full = tabs.find((t) => t.id === FULL_TAB_ID);
      return {
        tabs,
        activeTabId: FULL_TAB_ID,
        params: full ? full.params : { ...state.params, crop: null },
        cropping: false,
      };
    }),

  commitCrop: (selection) =>
    set((state) => {
      if (!selection) return { cropping: false };

      // The selection was drawn over whatever the active tab displays, so it is normalised
      // against *that view*, not the original image. Compose it into the view's own crop or
      // a second crop would be reinterpreted against the full source and jump elsewhere.
      const parent = state.tabs.find((t) => t.id === state.activeTabId)?.params.crop ?? null;
      const crop = composeCrop(parent, selection);

      // The new tab starts from a snapshot of the settings in force right now, and owns it
      // from here on — so tuning the crop afterwards never reaches back into the view it
      // came from.
      const params: AsciiParams = { ...state.params, crop };

      // Every crop yields a new view, including one taken from an existing crop, so a
      // sequence of crops reads as a trail you can step back through.
      tabSeq += 1;
      const tab: CropTab = { id: `crop-${tabSeq}`, label: `Crop ${tabSeq}`, params };
      return {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
        params,
        // Close the overlay: the crop is now its own image, ready to zoom or crop again.
        cropping: false,
      };
    }),

  // Switching tabs swaps in that view's whole settings, not just its crop — each tab is an
  // independent document.
  selectTab: (id) =>
    set((state) => {
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab) return {};
      return { activeTabId: id, params: tab.params, cropping: false };
    }),

  closeTab: (id) =>
    set((state) => {
      if (id === FULL_TAB_ID) return {};
      const tabs = state.tabs.filter((t) => t.id !== id);
      if (state.activeTabId !== id) return { tabs };
      // Closing the active tab falls back to the full image rather than a neighbouring
      // crop, which keeps "close" predictable however many views are open.
      const full = tabs.find((t) => t.id === FULL_TAB_ID);
      return {
        tabs,
        activeTabId: FULL_TAB_ID,
        params: full ? full.params : { ...state.params, crop: null },
      };
    }),
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
