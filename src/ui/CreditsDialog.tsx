import { useEffect, useRef } from 'react';

interface CreditsDialogProps {
  onClose: () => void;
}

/** Libraries doing the parts that would otherwise be a project each. */
const LIBRARIES: ReadonlyArray<{ name: string; role: string; href: string }> = [
  { name: 'gifenc', role: 'GIF encoding', href: 'https://github.com/mattdesl/gifenc' },
  { name: 'mp4-muxer', role: 'MP4 container', href: 'https://github.com/Vanilagy/mp4-muxer' },
  { name: 'client-zip', role: 'zip bundling', href: 'https://github.com/Touffy/client-zip' },
  { name: 'zustand', role: 'state', href: 'https://github.com/pmndrs/zustand' },
];

export function CreditsDialog({ onClose }: CreditsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Esc closes, and focus moves into the dialog so keyboard users are not left behind on
  // the page underneath.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      // Only a click that both starts and ends on the backdrop closes — otherwise
      // releasing a text selection outside the panel would dismiss it mid-drag.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-title"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 id="credits-title" className="text-sm font-semibold text-[var(--text)]">
            Credits
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close credits"
            className="rounded-md border border-[var(--panel-border)] px-2 py-0.5 text-xs text-[var(--text-dim)] hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-3 text-xs leading-relaxed text-[var(--text-dim)]">
          <p>
            This started as an attempt to rebuild{' '}
            <a
              href="https://asciinator.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline underline-offset-2"
            >
              asciinator.app
            </a>
            , which is where the whole idea came from. Its control set and layout are what the
            first version of this project was modelled on, and its output is what the sampling
            and tone maths were tuned against.
          </p>

          <p className="text-[var(--text)]">
            Asciinator is the better tool — more polished and more considered than this is. If
            you just want good ASCII art, use it.
          </p>

          <p>
            This exists because I wanted to build my own and take it somewhere else. The
            animation styles, language ramps, crop tabs and background matting are features I
            wanted, rather than gaps in the original.
          </p>

          <p>
            No code was copied. The engine here was written from scratch, and the name, logo
            and styling are its own.
          </p>

          <div className="border-t border-[var(--panel-border)] pt-3">
            <p className="mb-1.5">Built with:</p>
            <ul className="flex flex-col gap-1">
              {LIBRARIES.map((lib) => (
                <li key={lib.name}>
                  <a
                    href={lib.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[var(--text)] underline underline-offset-2"
                  >
                    {lib.name}
                  </a>{' '}
                  — {lib.role}
                </li>
              ))}
            </ul>
          </div>

          <p className="border-t border-[var(--panel-border)] pt-3">
            Released under the{' '}
            <a
              href="https://www.gnu.org/licenses/gpl-3.0.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline underline-offset-2"
            >
              GNU GPL v3.0
            </a>
            . Artwork you make with it is yours.
          </p>
        </div>
      </div>
    </div>
  );
}
