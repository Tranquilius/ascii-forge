import { useAppStore } from '@/store';
import { generate } from '@/engine/pipeline';
import { applyModulators, NO_MODULATORS } from '@/engine/modulate';
import { isValidCrop } from '@/engine/crop';

export function Header() {
  const frames = useAppStore((s) => s.frames);
  const frameIndex = useAppStore((s) => s.frameIndex);
  const params = useAppStore((s) => s.params);
  const randomizeBias = useAppStore((s) => s.randomizeBias);
  const rerollBias = useAppStore((s) => s.rerollBias);
  const setFrame = useAppStore((s) => s.setFrame);
  const setError = useAppStore((s) => s.setError);
  const resetParams = useAppStore((s) => s.resetParams);
  const toggleInvert = useAppStore((s) => s.toggleInvert);
  const cropping = useAppStore((s) => s.cropping);
  const toggleCropping = useAppStore((s) => s.toggleCropping);

  const source = frames[frameIndex];
  // The button stays highlighted while a crop is in effect, so an active crop is never
  // invisible state — the most likely "why does my export look wrong" trap here.
  const hasCrop = isValidCrop(params.crop);

  function handleGenerate() {
    if (!source) return;
    if (randomizeBias) {
      rerollBias();
      return;
    }
    try {
      const frame = generate(source, params);
      setFrame(applyModulators(frame, NO_MODULATORS, 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate ASCII art.');
    }
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--panel-border)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg font-bold text-[var(--accent)]">#</span>
        <span className="font-semibold tracking-tight">ASCII Forge</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={!source}
          onClick={handleGenerate}
          className="rounded-md border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Generate
        </button>
        <button
          type="button"
          disabled={!source}
          onClick={toggleCropping}
          aria-pressed={cropping}
          title="Select a region — the preview and every export use only that area"
          className={`rounded-md border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
            cropping || hasCrop
              ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text)]'
              : 'border-[var(--panel-border)] text-[var(--text)] hover:border-[var(--accent)]'
          }`}
        >
          {hasCrop && !cropping ? 'Crop ·' : 'Crop'}
        </button>
        <span className="mx-1 h-4 w-px bg-[var(--panel-border)]" />
        <button
          type="button"
          onClick={resetParams}
          className="rounded-md border border-[var(--panel-border)] px-3 py-1.5 text-xs text-[var(--text)] hover:border-[var(--accent)]"
        >
          Reset
        </button>
        <button
          type="button"
          disabled={!source}
          onClick={toggleInvert}
          className="rounded-md border border-[var(--panel-border)] px-3 py-1.5 text-xs text-[var(--text)] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Invert
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="rounded-md border border-[var(--panel-border)] px-3 py-1.5 text-xs text-[var(--text-dim)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          L
        </button>
      </div>
    </header>
  );
}
