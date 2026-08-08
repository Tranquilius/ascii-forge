import type { AsciiFrame } from '../types';
import { toJsonData } from '../render/text';

export function exportJson(frame: AsciiFrame): Blob {
  return new Blob([JSON.stringify(toJsonData(frame))], { type: 'application/json;charset=utf-8' });
}
