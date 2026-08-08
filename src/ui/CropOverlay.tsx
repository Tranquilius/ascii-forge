import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store';
import type { CropRect } from '@/engine/types';
import {
  ASPECT_PRESETS,
  applyAspect,
  clientToNormalised,
  CORNER_HANDLES,
  croppedGridSize,
  EDGE_HANDLES,
  isUsableRect,
  moveCrop,
  normalisedToBox,
  rectFromPoints,
  resizeCrop,
  type AspectPresetId,
  type CropHandle,
  type DisplayBox,
  type Point,
} from '@/ui/cropGeometry';

interface CropOverlayProps {
  /** The canvas being cropped — measured for its *displayed* box, never its backing size. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Source pixel dimensions, needed to express aspect ratios and the grid readout. */
  sourceWidth: number;
  sourceHeight: number;
  cellAspect: number;
}

type Drag =
  | { kind: 'new'; origin: Point }
  | { kind: 'handle'; handle: CropHandle; start: CropRect; origin: Point };

const HANDLE_CURSOR: Record<CropHandle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  move: 'move',
};

/** Handle position as a percentage of the selection box. */
const HANDLE_POS: Record<string, { left: string; top: string }> = {
  nw: { left: '0%', top: '0%' },
  n: { left: '50%', top: '0%' },
  ne: { left: '100%', top: '0%' },
  e: { left: '100%', top: '50%' },
  se: { left: '100%', top: '100%' },
  s: { left: '50%', top: '100%' },
  sw: { left: '0%', top: '100%' },
  w: { left: '0%', top: '50%' },
};

export function CropOverlay({ canvasRef, sourceWidth, sourceHeight, cellAspect }: CropOverlayProps) {
  const crop = useAppStore((s) => s.params.crop);
  const cols = useAppStore((s) => s.params.cols);
  const heightScale = useAppStore((s) => s.params.heightScale);
  const setParam = useAppStore((s) => s.setParam);
  const setCropping = useAppStore((s) => s.setCropping);
  const clearCrop = useAppStore((s) => s.clearCrop);

  const [draft, setDraft] = useState<CropRect | null>(null);
  const [aspect, setAspect] = useState<AspectPresetId>('free');
  const dragRef = useRef<Drag | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * The draft mirrored into a ref.
   *
   * The pointer-up handler needs the in-flight rectangle so it can commit it, but reading it
   * through a `setDraft` updater would mean calling the store setter inside that updater —
   * and React runs updaters during the render phase, so that writes to another component
   * mid-render. A ref gives the same value synchronously without the violation.
   */
  const draftRef = useRef<CropRect | null>(null);

  const updateDraft = useCallback((rect: CropRect | null) => {
    draftRef.current = rect;
    setDraft(rect);
  }, []);

  const active = draft ?? crop;

  /**
   * The canvas's displayed box. Read from getBoundingClientRect rather than canvas.width:
   * the backing store is scaled by both the device pixel ratio and the zoom level, so its
   * dimensions bear no fixed relationship to what the pointer is actually over.
   */
  const measure = useCallback((): DisplayBox | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, [canvasRef]);

  const [box, setBox] = useState<DisplayBox | null>(null);

  // Re-measure whenever the canvas can have moved or resized: zooming, panel reflow, and
  // scrolling the stage all change where the canvas sits in client space.
  useEffect(() => {
    const update = () => setBox(measure());
    update();
    const canvas = canvasRef.current;
    const observer = new ResizeObserver(update);
    if (canvas) observer.observe(canvas);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [measure, canvasRef]);

  const commit = useCallback(
    (rect: CropRect | null) => {
      setParam('crop', rect);
      updateDraft(null);
    },
    [setParam, updateDraft],
  );

  // Pointer move/up live on the window so a drag that leaves the canvas still tracks — the
  // common case when selecting all the way to an edge.
  useEffect(() => {
    if (!dragRef.current) return undefined;

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const b = measure();
      if (!drag || !b) return;
      const point = clientToNormalised(e.clientX, e.clientY, b);

      let next: CropRect;
      if (drag.kind === 'new') {
        next = rectFromPoints(drag.origin, point);
      } else if (drag.handle === 'move') {
        next = moveCrop(drag.start, point.x - drag.origin.x, point.y - drag.origin.y);
      } else {
        next = resizeCrop(drag.start, drag.handle, point);
      }

      // Moving a locked-ratio crop must not resize it, so aspect is enforced on every
      // interaction except a straight translation.
      const preset = ASPECT_PRESETS.find((p) => p.id === aspect);
      const isMove = drag.kind === 'handle' && drag.handle === 'move';
      if (preset?.ratio && !isMove) {
        next = applyAspect(next, preset.ratio, sourceWidth, sourceHeight);
      }
      updateDraft(next);
    };

    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      const current = draftRef.current;
      // A click with no meaningful drag clears rather than applying a sliver.
      if (current && isUsableRect(current)) setParam('crop', current);
      else if (drag.kind === 'new') setParam('crop', null);
      updateDraft(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  });

  // Esc closes crop mode; Enter confirms. Registered while the overlay is mounted only.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        updateDraft(null);
        setCropping(false);
      } else if (e.key === 'Enter') {
        setCropping(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCropping, updateDraft]);

  function beginNew(e: React.PointerEvent) {
    const b = measure();
    if (!b) return;
    e.preventDefault();
    const origin = clientToNormalised(e.clientX, e.clientY, b);
    dragRef.current = { kind: 'new', origin };
    updateDraft({ x: origin.x, y: origin.y, w: 0, h: 0 });
  }

  function beginHandle(e: React.PointerEvent, handle: CropHandle) {
    const b = measure();
    if (!b || !active) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      kind: 'handle',
      handle,
      start: active,
      origin: clientToNormalised(e.clientX, e.clientY, b),
    };
    updateDraft(active);
  }

  function chooseAspect(id: AspectPresetId) {
    setAspect(id);
    const preset = ASPECT_PRESETS.find((p) => p.id === id);
    if (preset?.ratio && active) {
      commit(applyAspect(active, preset.ratio, sourceWidth, sourceHeight));
    }
  }

  if (!box) return null;

  const sel = active ? normalisedToBox(active, box) : null;
  const grid = croppedGridSize(active, cols, sourceWidth, sourceHeight, cellAspect, heightScale);
  const cropPx = active
    ? `${Math.round(active.w * sourceWidth)}×${Math.round(active.h * sourceHeight)}px`
    : `${sourceWidth}×${sourceHeight}px`;

  return (
    // inset-0 inside a wrapper sized to the canvas: the overlay covers the canvas by
    // construction, so there is no offset arithmetic to get wrong when the stage scrolls.
    <div
      ref={rootRef}
      className="absolute inset-0 z-20 touch-none select-none"
      style={{ cursor: 'crosshair' }}
      onPointerDown={beginNew}
    >
      {/* Four dimming panels around the selection rather than one box-shadow: this keeps the
          selected region completely untinted, so what you see is what gets converted. */}
      {sel && (
        <>
          <div className="absolute bg-black/55" style={{ left: 0, top: 0, width: '100%', height: sel.top }} />
          <div
            className="absolute bg-black/55"
            style={{ left: 0, top: sel.top + sel.height, width: '100%', bottom: 0 }}
          />
          <div className="absolute bg-black/55" style={{ left: 0, top: sel.top, width: sel.left, height: sel.height }} />
          <div
            className="absolute bg-black/55"
            style={{ left: sel.left + sel.width, top: sel.top, right: 0, height: sel.height }}
          />
        </>
      )}
      {!sel && <div className="absolute inset-0 bg-black/30" />}

      {sel && (
        <div
          className="absolute border border-[var(--accent)]"
          style={{ left: sel.left, top: sel.top, width: sel.width, height: sel.height, cursor: 'move' }}
          onPointerDown={(e) => beginHandle(e, 'move')}
        >
          {/* Rule-of-thirds guides, the standard framing aid. */}
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <div className="absolute top-1/3 h-px w-full bg-white/60" />
            <div className="absolute top-2/3 h-px w-full bg-white/60" />
            <div className="absolute left-1/3 h-full w-px bg-white/60" />
            <div className="absolute left-2/3 h-full w-px bg-white/60" />
          </div>

          {[...CORNER_HANDLES, ...EDGE_HANDLES].map((h) => (
            <div
              key={h}
              role="presentation"
              data-handle={h}
              onPointerDown={(e) => beginHandle(e, h)}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-[var(--accent)] bg-[var(--bg)]"
              style={{ ...HANDLE_POS[h], cursor: HANDLE_CURSOR[h] }}
            />
          ))}
        </div>
      )}

      {/* Pinned to the viewport, not to the canvas: when zoomed in the canvas is far taller
          than the window, so a toolbar anchored to its bottom edge scrolls out of reach.
          stopPropagation so clicking a button doesn't start a new selection underneath it. */}
      <div
        className="fixed left-1/2 bottom-6 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-2 py-1.5 shadow-lg"
        style={{ cursor: 'default' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {ASPECT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => chooseAspect(p.id)}
            aria-pressed={aspect === p.id}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              aspect === p.id
                ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text)]'
                : 'border-[var(--panel-border)] text-[var(--text-dim)] hover:text-[var(--text)]'
            }`}
          >
            {p.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-[var(--panel-border)]" />
        <span className="font-mono text-xs text-[var(--text-dim)]">
          {cropPx} · {grid.cols}×{grid.rows} cells
        </span>
        <span className="mx-1 h-4 w-px bg-[var(--panel-border)]" />
        <button
          type="button"
          onClick={() => clearCrop()}
          className="rounded-md border border-[var(--panel-border)] px-2 py-1 text-xs text-[var(--text)] hover:border-[var(--accent)]"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => setCropping(false)}
          className="rounded-md border border-[var(--accent)] bg-[var(--accent-dim)] px-2 py-1 text-xs text-[var(--text)]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
