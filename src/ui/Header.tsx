import { useAppStore } from '@/store';
import { generate } from '@/engine/pipeline';
import { applyModulators, NO_MODULATORS } from '@/engine/modulate';

export function Header() {
  const frames = useAppStore((s) => s.frames);
  const frameIndex = useAppStore((s) => s.frameIndex);
  const params = useAppStore((s) => s.params);
  const randomizeBias = useAppStore((s) => s.randomizeBias);
  const rerollBias = useAppStore((s) => s.rerollBias);
  const setFrame = useAppStore((s) => s.setFrame);
  const setError = useAppStore((s) => s.setError);
  const resetParams = useAppStore((s) => s.resetParams);

  const source = frames[frameIndex];

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
          onClick={resetParams}
          className="rounded-md border border-[var(--panel-border)] px-3 py-1.5 text-xs text-[var(--text)] hover:border-[var(--accent)]"
        >
          Reset
        </button>
      </div>
    </header>
  );
}
