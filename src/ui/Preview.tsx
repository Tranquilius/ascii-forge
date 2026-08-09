import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { computeCanvasSize, glyphPixelSize, renderToCanvas } from '@/engine/render/canvas';
import { RENDER_FONT_FAMILY } from '@/engine/pipeline';
import { computeFitZoom, safeRenderScale, stepZoom } from '@/ui/zoom';
import { ZoomControls } from '@/ui/ZoomControls';
import { getGlyphSet } from '@/engine/glyphDensity';
import { createGlyphAnimator } from '@/engine/modulators/glyphAnimation';
import { CropOverlay } from '@/ui/CropOverlay';
import { CropTabs } from '@/ui/CropTabs';
import { measureRampCell } from '@/engine/metrics';
import { clientToNormalised } from '@/ui/cropGeometry';
import { resolveCrop } from '@/engine/crop';

// Fixed mid-dark checker, independent of the page's light/dark theme — the same choice
// Figma/Photoshop make so a transparent-background glyph color stays legible regardless
// of the viewer's OS theme.
const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #3a3d46 25%, transparent 25%), linear-gradient(-45deg, #3a3d46 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #3a3d46 75%), linear-gradient(-45deg, transparent 75%, #3a3d46 75%)',
  backgroundColor: '#26282f',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
};

/** Padding inside the scroll area, subtracted when measuring available fit space. */
const STAGE_PADDING = 32;

export function Preview() {
  const frame = useAppStore((s) => s.frame);
  const { bgMode, bgColor, blendMode, charSize } = useAppStore((s) => s.params);
  const isLoading = useAppStore((s) => s.isLoading);
  const loadingLabel = useAppStore((s) => s.loadingLabel);
  const hasSource = useAppStore((s) => s.frames.length > 0);

  const animating = useAppStore((s) => s.animating);
  const animStyle = useAppStore((s) => s.animStyle);
  const animHoldMs = useAppStore((s) => s.animHoldMs);

  const cropping = useAppStore((s) => s.cropping);
  const pickingKeyColor = useAppStore((s) => s.pickingKeyColor);
  const setPickingKeyColor = useAppStore((s) => s.setPickingKeyColor);
  const setParams = useAppStore((s) => s.setParams);
  const sourceBitmap = useAppStore((s) => s.frames[s.frameIndex]?.bitmap ?? null);
  const crop = useAppStore((s) => s.params.crop);

  const zoom = useAppStore((s) => s.zoom);
  const zoomMode = useAppStore((s) => s.zoomMode);
  const setFitZoom = useAppStore((s) => s.setFitZoom);
  const setZoom = useAppStore((s) => s.setZoom);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  // Track the stage box so 'fit' reacts to window resizes and panel reflow.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStageSize({ width, height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Base (100%) size of the current frame, before zoom. Memoized because it feeds the
  // render effect's dependency list — a fresh object each render would redraw endlessly.
  const base = useMemo(
    () => (frame ? computeCanvasSize(frame, RENDER_FONT_FAMILY, 1, glyphPixelSize(charSize)) : null),
    [frame, charSize],
  );

  const fitZoom = base
    ? computeFitZoom(
        base.width,
        base.height,
        Math.max(0, stageSize.width - STAGE_PADDING),
        Math.max(0, stageSize.height - STAGE_PADDING),
      )
    : 1;

  const effectiveZoom = zoomMode === 'fit' ? fitZoom : zoom;

  // Publish the measured fit zoom so the controls can show the true percentage.
  useEffect(() => {
    setFitZoom(fitZoom);
  }, [fitZoom, setFitZoom]);

  // Source pixels the active view actually covers — the whole image, or just the crop.
  const viewSize = useMemo(
    () =>
      sourceBitmap
        ? resolveCrop(crop, sourceBitmap.width, sourceBitmap.height)
        : { sx: 0, sy: 0, sw: 1, sh: 1 },
    [sourceBitmap, crop],
  );

  const displayWidth = base ? Math.round(base.width * effectiveZoom) : 0;
  const displayHeight = base ? Math.round(base.height * effectiveZoom) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || !base) return;

    // Re-render at the zoomed resolution rather than CSS-scaling a 1x canvas, so glyph
    // edges stay sharp when zoomed in instead of turning into blurry blocks.
    // renderToCanvas sets the backing-store size (the width/height *attributes*); the CSS
    // display size is driven by React through the style prop below. Setting the CSS size
    // imperatively here would fight React's style reconciliation and get wiped on the
    // next render.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const renderScale = safeRenderScale(base.width, base.height, dpr * effectiveZoom);
    const renderOpts = {
      fontFamily: RENDER_FONT_FAMILY,
      scale: renderScale,
      fontSize: glyphPixelSize(charSize),
      bgMode,
      bgColor,
      blendMode,
    };

    if (!animating) {
      renderToCanvas(frame, canvas, renderOpts);
      return;
    }

    // Animate straight off a rAF loop rather than pushing each frame through the store.
    // At 60fps a store round-trip would mean 60 React renders a second; here React only
    // re-runs this effect when something structural actually changes.
    const { alternatives } = getGlyphSet(frame.ramp, RENDER_FONT_FAMILY);
    const modulator = createGlyphAnimator({ alternatives, style: animStyle, holdMs: animHoldMs });

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      renderToCanvas(modulator.apply(frame, t), canvas, renderOpts);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frame, base, effectiveZoom, bgMode, bgColor, blendMode, charSize, animating, animStyle, animHoldMs]);

  /**
   * Eyedropper: sample the *source* colour under a click and use it as the background key.
   *
   * Reads the source bitmap rather than the rendered canvas, because keying happens before
   * the tone stage — picking the on-screen colour would hand back a brightness-adjusted
   * value that never matches what the matte actually compares against.
   *
   * Averages roughly one cell's worth of source pixels instead of taking a single one, so a
   * click on a noisy JPEG background returns the colour the sampler will see, not one
   * unlucky pixel.
   */
  function pickKeyColorAt(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas || !sourceBitmap || !frame) return;
    const r = canvas.getBoundingClientRect();
    const p = clientToNormalised(clientX, clientY, {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    });

    const rect = resolveCrop(crop, sourceBitmap.width, sourceBitmap.height);
    const cellW = Math.max(1, Math.round(rect.sw / Math.max(1, frame.cols)));
    const cellH = Math.max(1, Math.round(rect.sh / Math.max(1, frame.rows)));
    const sx = Math.min(rect.sx + rect.sw - cellW, Math.max(rect.sx, Math.round(rect.sx + p.x * rect.sw - cellW / 2)));
    const sy = Math.min(rect.sy + rect.sh - cellH, Math.max(rect.sy, Math.round(rect.sy + p.y * rect.sh - cellH / 2)));

    const scratch = document.createElement('canvas');
    scratch.width = 1;
    scratch.height = 1;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    // Drawing an NxN region into a 1x1 canvas with smoothing on *is* the box average.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceBitmap, sx, sy, cellW, cellH, 0, 0, 1, 1);
    const [red, green, blue] = ctx.getImageData(0, 0, 1, 1).data;
    const hex = `#${[red, green, blue].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

    setParams({ bgKeyColor: hex, bgRemove: true });
    setPickingKeyColor(false);
  }

  // Ctrl/Cmd + wheel to zoom. Registered natively with passive:false because React's
  // synthetic wheel handler can't preventDefault, which would let the page zoom instead.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const { zoom: z, zoomMode: mode, fitZoom: fz } = useAppStore.getState();
      const current = mode === 'fit' ? fz : z;
      setZoom(stepZoom(current, e.deltaY < 0 ? 1 : -1));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  const canvasStyle: React.CSSProperties = {
    ...(bgMode === 'transparent' ? CHECKERBOARD_STYLE : null),
    width: displayWidth || undefined,
    height: displayHeight || undefined,
    cursor: pickingKeyColor ? 'crosshair' : undefined,
  };

  return (
    // min-w-0 on both levels: a flex item defaults to min-width:auto, so without it a
    // zoomed canvas widens the whole page instead of scrolling inside the stage.
    <div className="relative flex min-h-[280px] min-w-0 flex-1 flex-col">
      <CropTabs />
      <div
        ref={stageRef}
        className="flex min-h-[280px] min-w-0 flex-1 overflow-auto rounded-lg border border-[var(--panel-border)] p-4"
        style={{ background: '#1c1e24' }}
      >
        {!hasSource && !isLoading && (
          <p className="m-auto text-sm text-[#8b909c]">Drop an image, GIF, or video to get started</p>
        )}
        {isLoading && <p className="m-auto text-sm text-[#8b909c]">{loadingLabel ?? 'Decoding…'}</p>}
        {hasSource && !isLoading && (
          // margin:auto rather than justify/align-center: in a scroll container, flex
          // centering clips the top-left overflow and makes it unreachable.
          // The wrapper is sized to the canvas so the crop overlay can sit at inset-0 and
          // cover it exactly, with no offset arithmetic to drift out of sync.
          <div
            className="relative m-auto block"
            style={{ width: displayWidth || undefined, height: displayHeight || undefined }}
          >
            <canvas
              ref={canvasRef}
              className="block"
              style={canvasStyle}
              onClick={pickingKeyColor ? (e) => pickKeyColorAt(e.clientX, e.clientY) : undefined}
            />
            {cropping && sourceBitmap && frame && (
              <CropOverlay
                canvasRef={canvasRef}
                // The dimensions of what is *on screen*, not of the original file. On a
                // crop tab the canvas shows only that region, so the overlay's pixel
                // readout and aspect-ratio presets have to measure against the region —
                // using the full source would overstate both.
                sourceWidth={viewSize.sw}
                sourceHeight={viewSize.sh}
                cellAspect={measureRampCell(RENDER_FONT_FAMILY, 100, frame.ramp).aspect}
              />
            )}
          </div>
        )}
      </div>
      {hasSource && !isLoading && <ZoomControls effectiveZoom={effectiveZoom} />}
    </div>
  );
}
