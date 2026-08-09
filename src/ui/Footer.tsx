import { useState } from 'react';
import { BUILD_STATS, formatTokens } from '@/ui/buildStats';
import { CreditsDialog } from '@/ui/CreditsDialog';

export function Footer() {
  const { total, output, turns } = BUILD_STATS;
  const [showCredits, setShowCredits] = useState(false);

  return (
    <>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--panel-border)] px-4 py-3 text-xs text-[var(--text-dim)]">
        <span>
          Built with <span className="font-mono text-[var(--text)]">{formatTokens(total)}</span>{' '}
          tokens
          {' · '}
          <span className="font-mono">{formatTokens(output)}</span> generated over {turns} turns
        </span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCredits(true)}
            className="underline underline-offset-2 hover:text-[var(--text)]"
          >
            Credits
          </button>
          <span>ASCII Forge · v0.1</span>
        </span>
      </footer>

      {showCredits && <CreditsDialog onClose={() => setShowCredits(false)} />}
    </>
  );
}
