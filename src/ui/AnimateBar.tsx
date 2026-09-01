import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { countSwappable, getGlyphSet } from '@/engine/glyphDensity';
import { RENDER_FONT_FAMILY } from '@/engine/pipeline';
import { computeCanvasSize, glyphPixelSize, type RenderOptions } from '@/engine/render/canvas';
import { ANIMATION_STYLES } from '@/engine/modulators/glyphAnimation';
import { GIF_MAX_FPS, exportAnimationGif, planShimmerLoop } from '@/engine/export/gif';
import { checkMp4Support, exportAnimationMp4, planMp4Loop } from '@/engine/export/mp4';
import { triggerDownload } from '@/ui/download';

/** MP4 can carry 60; GIF tops out at 50 because delay is stored in 10ms units. */
const FPS_OPTIONS = { gif: [12, 24, 30, 50], mp4: [24, 30, 60] } as const;

/**
 * Animation controls: style, timing, and GIF export.
 *
 * Surfaces how many ramp positions actually have an equal-density partner. With a coarse
 * ramp (Blocks, Minimal) nothing is interchangeable, so the button would appear to do
 * nothing — saying so beats leaving the user to wonder.
 */
export function AnimateBar() {
  const frame = useAppStore((s) => s.frame);
  const params = useAppStore((s) => s.params);
  const animating = useAppStore((s) => s.animating);
  const style = useAppStore((s) => s.animStyle);
  const holdMs = useAppStore((s) => s.animHoldMs);
  const durationSec = useAppStore((s) => s.animDurationSec);
  const fps = useAppStore((s) => s.animFps);
  const toggleAnimating = useAppStore((s) => s.toggleAnimating);
  const setAnimating = useAppStore((s) => s.setAnimating);
  const setStyle = useAppStore((s) => s.setAnimStyle);
  const setHoldMs = useAppStore((s) => s.setAnimHoldMs);
  const setDurationSec = useAppStore((s) => s.setAnimDurationSec);
  const setFps = useAppStore((s) => s.setAnimFps);
  const format = useAppStore((s) => s.animFormat);
  const setFormat = useAppStore((s) => s.setAnimFormat);
  const sourceFileName = useAppStore((s) => s.sourceFileName);
  const setError = useAppStore((s) => s.setError);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mp4Reason, setMp4Reason] = useState<string | null>(null);
  // Collapsed by default: animation is a deliberate step, and the settings block is the
  // tallest thing under the preview. Folding it lets the image dominate the layout.
  const [open, setOpen] = useState(false);

  // Probe H.264 support once; MP4 is offered only if the browser can actually encode it.
  useEffect(() => {
    let cancelled = false;
    void checkMp4Support().then((r) => {
      if (!cancelled) setMp4Reason(r.supported ? null : (r.reason ?? 'MP4 is unavailable.'));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { alternatives } = getGlyphSet(frame?.ramp ?? [], RENDER_FONT_FAMILY);
  const swappable = countSwappable(alternatives);
  const canAnimate = swappable > 0;

  // Expanding the section is the user opting into the animation preview, so start it for
  // them rather than making them find the Animate button too — but only on the open
  // transition, so toggling it off by hand while expanded sticks.
  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (open && !wasOpenRef.current && canAnimate) setAnimating(true);
    wasOpenRef.current = open;
  }, [open, canAnimate, setAnimating]);

  if (!frame) return null;

  const isMp4 = format === 'mp4';
  const plan = isMp4 ? planMp4Loop(durationSec, holdMs, fps) : planShimmerLoop(durationSec, holdMs, fps);
  const size = computeCanvasSize(frame, RENDER_FONT_FAMILY, params.exportScale, glyphPixelSize(params.charSize));
  // Rough guide only — real size depends entirely on how well the frames compress. H.264
  // compresses far harder than GIF's per-frame palettes, so the two use different divisors.
  const estMb = (plan.frameCount * size.width * size.height) / (isMp4 ? 90_000_000 : 6_000_000);
  const heavy = plan.frameCount * size.width * size.height > 150_000_000;

  const activeStyle = ANIMATION_STYLES.find((s) => s.id === style);
  const baseName = (sourceFileName?.replace(/\.[^.]+$/, '') || 'ascii').replace(/[^a-z0-9_-]+/gi, '_');

  function selectFormat(next: 'gif' | 'mp4') {
    setFormat(next);
    // Carry the rate over only if the new container can actually carry it.
    const allowed = FPS_OPTIONS[next] as readonly number[];
    if (!allowed.includes(fps)) setFps(allowed[allowed.length - 1]);
  }

  async function handleExport() {
    if (!frame) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const renderOpts: RenderOptions = {
        fontFamily: RENDER_FONT_FAMILY,
        scale: params.exportScale,
        fontSize: glyphPixelSize(params.charSize),
        bgMode: params.bgMode,
        bgColor: params.bgColor,
        blendMode: params.blendMode,
      };
      const common = {
        ...renderOpts,
        alternatives,
        style,
        holdMs,
        durationSec,
        fps,
        onProgress: setProgress,
      };
      const blob = isMp4
        ? await exportAnimationMp4(frame, common)
        : await exportAnimationGif(frame, common);
      triggerDownload(blob, `${baseName}-${style}.${isMp4 ? 'mp4' : 'gif'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to encode the animation.');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-[var(--panel-border)] bg-[var(--panel)]">
      {/* Header row is always visible: collapsing hides the settings, never the Animate
          button itself, so the feature stays one click away rather than two. */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="animate-settings"
          className="flex items-center gap-2 text-xs font-medium text-[var(--text)]"
        >
          <span
            aria-hidden
            className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}
          >
            ›
          </span>
          Animation
        </button>
        {!open && (
          <span className="truncate text-xs text-[var(--text-dim)]">
            {animating ? 'Playing' : 'Paused'} · {activeStyle?.label} · {plan.effectiveFps}fps{' '}
            {format.toUpperCase()}
          </span>
        )}
      </div>

      {open && (
    <div className="flex flex-col gap-3 border-t border-[var(--panel-border)] px-3 py-2.5" id="animate-settings">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggleAnimating}
          disabled={!canAnimate}
          aria-pressed={animating}
          className={`w-24 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            animating
              ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]'
              : 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text)]'
          }`}
        >
          {animating ? 'Stop' : 'Animate'}
        </button>

        {canAnimate ? (
          <div className="flex flex-wrap gap-1">
            {ANIMATION_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                aria-pressed={style === s.id}
                title={s.description}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  style === s.id
                    ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text)]'
                    : 'border-[var(--panel-border)] text-[var(--text-dim)] hover:text-[var(--text)]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[var(--text-dim)]">
            This ramp is too coarse to animate — try Detailed or Standard
          </span>
        )}
      </div>

      {canAnimate && (
        <p className="text-xs text-[var(--text-dim)]">
          {activeStyle?.description} · 60fps preview ·{' '}
          <span className="font-mono text-[var(--text)]">
            {swappable}/{frame.ramp.length}
          </span>{' '}
          glyphs have an equal-density match
        </p>
      )}

      {canAnimate && (
        <div className="flex flex-wrap items-end gap-4 border-t border-[var(--panel-border)] pt-2.5">
          <label className="flex min-w-36 flex-1 flex-col gap-1">
            <span className="flex justify-between text-xs text-[var(--text-dim)]">
              <span>Glyph hold</span>
              <span className="font-mono text-[var(--text)]">{holdMs}ms</span>
            </span>
            <input
              type="range"
              min={60}
              max={1000}
              step={20}
              value={holdMs}
              onChange={(e) => setHoldMs(Number(e.target.value))}
            />
          </label>

          <label className="flex min-w-36 flex-1 flex-col gap-1">
            <span className="flex justify-between text-xs text-[var(--text-dim)]">
              <span>Loop length</span>
              <span className="font-mono text-[var(--text)]">
                {plan.effectiveDurationSec.toFixed(1)}s
              </span>
            </span>
            <input
              type="range"
              min={0.5}
              max={6}
              step={0.5}
              value={durationSec}
              onChange={(e) => setDurationSec(Number(e.target.value))}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-[var(--text-dim)]">Format</span>
            <div className="flex gap-1">
              {(['gif', 'mp4'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => selectFormat(f)}
                  aria-pressed={format === f}
                  disabled={f === 'mp4' && mp4Reason !== null}
                  title={f === 'mp4' ? (mp4Reason ?? 'H.264 — supports 60fps') : 'Widest compatibility, 50fps max'}
                  className={`rounded-md border px-2.5 py-1 text-xs uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    format === f
                      ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text)]'
                      : 'border-[var(--panel-border)] text-[var(--text-dim)] hover:text-[var(--text)]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-[var(--text-dim)]">fps</span>
            <div className="flex gap-1">
              {FPS_OPTIONS[format].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFps(v)}
                  aria-pressed={fps === v}
                  className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                    fps === v
                      ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text)]'
                      : 'border-[var(--panel-border)] text-[var(--text-dim)] hover:text-[var(--text)]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={busy}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? `Encoding… ${Math.round(progress * 100)}%` : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      )}

      {canAnimate && (
        <p className="text-xs text-[var(--text-dim)]">
          {plan.frameCount} frames at {plan.effectiveFps}fps · {size.width}×{size.height} · ~
          {estMb < 1 ? '<1' : Math.round(estMb)}MB
          {heavy && (
            <span className="text-amber-400">
              {' '}
              — large; lower fps, loop length, or Width to speed this up
            </span>
          )}
          {!isMp4 && fps >= GIF_MAX_FPS && (
            <>
              {' '}
              · GIF stores delay in 10ms units, so {GIF_MAX_FPS}fps is its ceiling — switch to MP4
              for 60
            </>
          )}
          {isMp4 && plan.effectiveFps >= 60 && <> · true 60fps, H.264</>}
        </p>
      )}
    </div>
      )}
    </div>
  );
}
