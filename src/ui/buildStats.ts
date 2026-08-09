/**
 * Token cost of building this app.
 *
 * ASCII Forge was written end-to-end in a Claude Code session; these are the real usage
 * figures summed from that session's transcript, deduplicated by assistant message id.
 * They are a build-time constant, not something the app can measure at runtime — the
 * numbers describe the conversation that produced the code, not anything the page does.
 *
 * Refreshed by re-running scripts/count-tokens.mjs against the session transcript.
 */
export interface BuildStats {
  /** Assistant turns in the session. */
  turns: number;
  /** Newly written prompt tokens (cache writes) plus uncached input. */
  input: number;
  /** Tokens read back from the prompt cache — the same context re-read each turn. */
  cacheRead: number;
  /** Tokens generated. */
  output: number;
  /** Everything processed, cache reads included. */
  total: number;
  /** Excludes cache reads: the volume of genuinely distinct content. */
  fresh: number;
  /** ISO date these figures were last refreshed. */
  asOf: string;
}

export const BUILD_STATS: BuildStats = {
  turns: 987,
  input: 2_081_782,
  cacheRead: 320_317_358,
  output: 759_856,
  total: 323_158_996,
  fresh: 2_841_638,
  asOf: '2026-08-09',
};

/** Compact human form: 251.9M, 2.5M, 647.3K. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
