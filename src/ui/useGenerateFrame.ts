import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store';
import { generate } from '@/engine/pipeline';

/**
 * Drives store.baseFrame from the current source frame + params.
 *
 * Regeneration is rAF-coalesced rather than debounced: a burst of slider-drag updates
 * collapses to one generate() call on the next paint, so dragging stays responsive
 * instead of lagging behind a timer. Mount this once (in App).
 *
 * Shimmer is NOT applied here. Preview applies it per animation frame, so a 60fps effect
 * never re-runs the expensive sampling/tone work — it only rewrites glyph indices.
 */
export function useGenerateFrame(): void {
  const frames = useAppStore((s) => s.frames);
  const frameIndex = useAppStore((s) => s.frameIndex);
  const params = useAppStore((s) => s.params);
  const setFrame = useAppStore((s) => s.setFrame);
  const setError = useAppStore((s) => s.setError);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const source = frames[frameIndex];
    if (!source) {
      setFrame(null);
      return;
    }

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      try {
        setFrame(generate(source, params));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate ASCII art.');
      }
    });

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [frames, frameIndex, params, setFrame, setError]);
}
