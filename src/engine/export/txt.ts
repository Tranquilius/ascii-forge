import type { AsciiFrame } from '../types';
import { toPlainText } from '../render/text';

export function exportTxt(frame: AsciiFrame): Blob {
  return new Blob([toPlainText(frame)], { type: 'text/plain;charset=utf-8' });
}
