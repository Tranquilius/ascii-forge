import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store';
import { advancePlayhead } from '@/engine/timeline';

/**
 * Drives store.frameIndex from a rAF clock while playing.
 *
 * All the timing math lives in engine/timeline.ts; this hook only supplies real elapsed
 * time and writes the resulting index back. It reads `frames`/`loop` through a ref so a
 * running loop never has to be torn down and restarted when those change mid-playback.
 */
export function usePlayback(): void {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const frameCount = useAppStore((s) => s.frames.length);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const elapsedInFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying || frameCount <= 1) return;

    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const { frames, frameIndex, loop, setFrameIndex, setPlaying } = useAppStore.getState();
      const next = advancePlayhead(frames, frameIndex, elapsedInFrameRef.current, delta, loop);
      elapsedInFrameRef.current = next.elapsedInFrameMs;

      if (next.index !== frameIndex) setFrameIndex(next.index);
      if (next.ended) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying, frameCount]);
}
