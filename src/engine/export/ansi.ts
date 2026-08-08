import type { AsciiFrame } from '../types';
import { toAnsi } from '../render/text';

export function exportAnsi(frame: AsciiFrame): Blob {
  return new Blob([toAnsi(frame)], { type: 'text/plain;charset=utf-8' });
}
