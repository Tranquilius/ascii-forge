import { useAppStore } from '@/store';
import { totalDurationMs } from '@/engine/timeline';

/** Playback transport for animated sources. Renders nothing for a still image. */
export function Transport() {
  const frames = useAppStore((s) => s.frames);
  const frameIndex = useAppStore((s) => s.frameIndex);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const loop = useAppStore((s) => s.loop);
  const togglePlaying = useAppStore((s) => s.togglePlaying);
  const setFrameIndex = useAppStore((s) => s.setFrameIndex);
  const setPlaying = useAppStore((s) => s.setPlaying);
  const setLoop = useAppStore((s) => s.setLoop);

  if (frames.length <= 1) return null;

  const durationSec = totalDurationMs(frames) / 1000;
  const fps = durationSec > 0 ? frames.length / durationSec : 0;

  function scrub(index: number) {
    // Scrubbing implies taking manual control of the playhead.
    setPlaying(false);
    setFrameIndex(index);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2">
      <button
        type="button"
        onClick={togglePlaying}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className="w-16 rounded-md border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text)]"
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      <input
        type="range"
        min={0}
        max={frames.length - 1}
        step={1}
        value={frameIndex}
        onChange={(e) => scrub(Number(e.target.value))}
        aria-label="Frame"
        className="min-w-32 flex-1"
      />

      <span className="font-mono text-xs tabular-nums text-[var(--text-dim)]">
        {String(frameIndex + 1).padStart(String(frames.length).length, '0')} / {frames.length}
      </span>

      <button
        type="button"
        onClick={() => setLoop(!loop)}
        aria-pressed={loop}
        className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
          loop
            ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text)]'
            : 'border-[var(--panel-border)] text-[var(--text-dim)]'
        }`}
      >
        Loop
      </button>

      <span className="font-mono text-xs text-[var(--text-dim)]">~{fps.toFixed(1)} fps</span>
    </div>
  );
}
