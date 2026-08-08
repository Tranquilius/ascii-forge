import { useAppStore } from '@/store';
import { MAX_ZOOM, MIN_ZOOM } from '@/ui/zoom';

interface ZoomControlsProps {
  /** The zoom actually applied — resolved fit zoom, or the manual value. */
  effectiveZoom: number;
}

// These controls float over the preview stage, which is deliberately dark in both light
// and dark themes — so their colors are fixed rather than theme-aware. Using var(--text)
// here would render near-black text on the dark bar in light mode, i.e. invisible.
// Written as complete literal class strings: Tailwind scans source text, so a class
// assembled from template-literal variables would never be generated.
const BUTTON =
  'flex h-7 w-7 items-center justify-center rounded-md border border-[#3a3d46] bg-[#1c1e24]/90 text-sm text-[#e5e7eb] transition-colors hover:border-[#7dd3fc] disabled:cursor-not-allowed disabled:opacity-40';

const PILL_BASE = 'rounded-md border px-2 py-1 text-xs transition-colors bg-[#1c1e24]/90';
const PILL_ON = 'border-[#7dd3fc] text-[#e5e7eb]';
const PILL_OFF = 'border-[#3a3d46] text-[#8b909c] hover:border-[#7dd3fc]';

export function ZoomControls({ effectiveZoom }: ZoomControlsProps) {
  const zoomMode = useAppStore((s) => s.zoomMode);
  const zoomBy = useAppStore((s) => s.zoomBy);
  const zoomToFit = useAppStore((s) => s.zoomToFit);
  const zoomToActual = useAppStore((s) => s.zoomToActual);

  const percent = Math.round(effectiveZoom * 100);
  const isActual = zoomMode === 'manual' && Math.abs(effectiveZoom - 1) < 0.005;

  return (
    <div
      className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1.5"
      // Sits over the scroll area, so only the controls themselves take pointer events.
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-[#3a3d46] bg-[#14161c]/90 p-1 backdrop-blur">
        <button
          type="button"
          className={BUTTON}
          onClick={() => zoomBy(-1)}
          disabled={effectiveZoom <= MIN_ZOOM + 1e-6}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>

        <span
          className="min-w-14 text-center font-mono text-xs tabular-nums text-[#e5e7eb]"
          aria-live="polite"
        >
          {percent}%
        </span>

        <button
          type="button"
          className={BUTTON}
          onClick={() => zoomBy(1)}
          disabled={effectiveZoom >= MAX_ZOOM - 1e-6}
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>

        <span className="mx-0.5 h-4 w-px bg-[#3a3d46]" />

        <button
          type="button"
          onClick={zoomToFit}
          aria-pressed={zoomMode === 'fit'}
          title="Fit to view"
          className={`${PILL_BASE} ${zoomMode === 'fit' ? PILL_ON : PILL_OFF}`}
        >
          Fit
        </button>

        <button
          type="button"
          onClick={zoomToActual}
          aria-pressed={isActual}
          title="Actual size (100%)"
          className={`${PILL_BASE} ${isActual ? PILL_ON : PILL_OFF}`}
        >
          1:1
        </button>
      </div>
    </div>
  );
}
