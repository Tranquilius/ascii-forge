# ASCII Forge

Turn images, GIFs and video into ASCII art — then animate it. Everything runs in your
browser: no account, no upload, no server. Your images never leave your machine.

## Credits

This started as an attempt to rebuild [asciinator.app](https://asciinator.app/), which is
where the whole idea came from. Its control set and layout are what the first version of
this project was modelled on, and the reference output from it is what the sampling and tone
maths were tuned against.

**Asciinator is the better tool.** It is more polished and more considered than this is, and
if you just want good ASCII art you should use it. This exists because I wanted to build my
own and take it somewhere else — the animation styles, the language ramps, the crop tabs and
the background matting are features I wanted rather than gaps in the original.

No code was copied. The engine here was written from scratch, and the name, logo and styling
are its own.

## Features

**Conversion**
- Images (PNG/JPG/WEBP/SVG), animated GIFs, and video (MP4/WebM/MOV)
- Seven glyph ramps: Standard, Blocks, Detailed, Detailed+, Minimal, Custom, and Languages
- **Detailed+** is measured empirically — every printable glyph the render font can actually
  draw is rasterised, sorted by real ink coverage, and deduplicated into ~237 tonal steps
- **Languages** restricts the ramp to a single script — Latin, Greek, Cyrillic, Devanagari,
  Bengali, Tamil, Thai, Georgian, Armenian, Ethiopic, Cherokee, Japanese, Korean, Chinese,
  Braille or Runic. Combining marks are rejected by Unicode category, and the cell grid is
  measured from the ramp in use so full-width CJK stays aligned
- Live controls for width, character size, tone, density bias and colour mix

**Framing**
- **Crop** — select a region; the preview and every export use only that area. The crop is
  applied to the *source* before sampling, so the full column budget is spent on the region:
  a half-width crop still yields a full-width result, at roughly double the detail
- **Background removal** — colour-key matting with an auto-detected key, an eyedropper,
  adjustable tolerance and feathering. *Edges only* flood-fills inward from the border;
  *All matching* removes every matching cell. Exports as a real alpha cutout

**Animation**
- Five styles — Shimmer, Pulse, Wave, Ripple and CRT — that swap each character for another
  of **equal measured ink coverage**, so the picture appears to move while its tone holds still
- 60fps preview; export to GIF (50fps, a hard format limit) or MP4/H.264 (60fps)

**Export**
- PNG, SVG, TXT, ANSI, HTML, JSON, GIF, MP4 — or all of them at once as a zip

## Running locally

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm test         # unit suite
npm run lint
npm run build    # type-check + production build into dist/
```

## Architecture

A staged pipeline built around one data structure:

```
File ──decode──▶ SourceFrame[]           (ImageBitmap + durationMs)
                      │
                      ├─ crop()          → source rectangle
                      ├─ sample()        → RGBA grid at cols × rows
                      ├─ matte()         → background cells to alpha 0
                      ├─ tone()          → brightness / contrast / gamma
                      ├─ map()           → luminance → ramp index
                      └─ color()         → mix mode → per-cell RGBA
                      ▼
                 AsciiFrame  { cols, rows, chars: Uint16Array,
                               rgba: Uint8ClampedArray, ramp, durationMs }
                      │
                      ├─ modulate()      ← glyph animation
                      ▼
                 render/ ─▶ canvas · svg · txt · ansi · html · json · gif · mp4
```

`AsciiFrame` is the single seam. Renderers and exporters never touch the source image — they
only consume a frame — which is why a still (a length-1 sequence) and an animation (length N)
share every downstream path unchanged. `generate()` is pure and synchronous over one frame,
so it stays portable to a Web Worker.

Two details carry more weight than they look like they should:

- **Glyph coverage is measured, not assumed.** Each glyph is rasterised and its ink coverage
  computed, which is what orders the ramps *and* identifies which characters can substitute
  for each other without changing the image's tone. That measurement is the whole basis of
  the animation.
- **Cell metrics come from the ramp in use**, not from `'M'`. Width is the modal advance
  across the ramp's own glyphs, height is the maximum ink extent. Without this, full-width
  CJK glyphs overlap horizontally and tall glyphs smear into the row below.

Stack: Vite · React · TypeScript · Tailwind · Zustand · Vitest, with WebCodecs
(`ImageDecoder`/`VideoEncoder`), `gifenc`, `mp4-muxer` and `client-zip`.

## Deployment

Pushing to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Lint and tests gate the
deploy, so a failing build never reaches the live site.

Vite is configured with `base: './'` so the bundle works from any sub-path — GitHub Pages
serves a project site from `/<repo>/`, where absolute asset URLs would 404.

## Privacy

There is no backend. Decoding, conversion and encoding all happen on your device via Canvas
and WebCodecs. No image is ever transmitted, and the app makes no network requests after the
initial page load.

## License

[GNU General Public License v3.0](LICENSE).

You are free to use, study, modify and redistribute this software. GPL-3.0 is a *copyleft*
licence: if you **distribute** a modified version, you must release it under GPL-3.0 too and
make the source available. Note that merely hosting a modified version on a website is not
distribution under GPL-3.0, so it does not trigger that obligation — AGPL-3.0 is the variant
that closes that gap. See the [full text](LICENSE) for the exact terms.

Artwork you create with ASCII Forge is yours. The licence covers this software, not its
output.
