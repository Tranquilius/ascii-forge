import type { AsciiFrame, Modulator } from './types';

/**
 * Apply a list of modulators to a frame at time `t` (seconds), in order.
 *
 * v1 always calls this with an empty modulator list, making it the identity — the frame
 * passes through unchanged. The seam exists so the animation phase can introduce
 * modulators (character shimmer, ramp-cycling, dissolve masks, ...) as pure
 * AsciiFrame -> AsciiFrame functions without touching the generate/render code paths.
 */
export function applyModulators(frame: AsciiFrame, modulators: readonly Modulator[], t: number): AsciiFrame {
  let current = frame;
  for (const modulator of modulators) {
    current = modulator.apply(current, t);
  }
  return current;
}

/** No modulators — the default in v1. */
export const NO_MODULATORS: readonly Modulator[] = [];
