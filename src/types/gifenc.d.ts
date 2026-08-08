/**
 * Minimal ambient types for `gifenc`, which ships untyped JS.
 *
 * Covers only the three entry points this project uses (GIFEncoder, quantize,
 * applyPalette); extend as needed rather than reaching for `any` at call sites.
 * Signatures verified against node_modules/gifenc/src/{index,palettize}.js.
 */
declare module 'gifenc' {
  export type Palette = number[][];

  export interface WriteFrameOptions {
    palette?: Palette | null;
    /** Frame delay in milliseconds. */
    delay?: number;
    transparent?: boolean;
    transparentIndex?: number;
    /** -1 = play once, 0 = loop forever, >0 = repeat count. */
    repeat?: number;
    colorDepth?: number;
    dispose?: number;
  }

  export interface GIFEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: WriteFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
    readonly buffer: ArrayBuffer;
  }

  export interface GIFEncoderOptions {
    auto?: boolean;
    initialCapacity?: number;
  }

  export function GIFEncoder(opt?: GIFEncoderOptions): GIFEncoderInstance;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: {
      format?: 'rgb565' | 'rgb444' | 'rgba4444';
      oneBitAlpha?: boolean | number;
      clearAlpha?: boolean;
      clearAlphaColor?: number;
      clearAlphaThreshold?: number;
    },
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: 'rgb565' | 'rgb444' | 'rgba4444',
  ): Uint8Array;

  export default GIFEncoder;
}
