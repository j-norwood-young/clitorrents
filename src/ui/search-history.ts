export const SEARCH_HISTORY_MAX = 100;

/** Newest first; moves a repeated query to the front. */
export function pushSearchHistory(
  history: string[],
  query: string,
  max = SEARCH_HISTORY_MAX
): string[] {
  const q = query.trim();
  if (!q) return history;
  return [q, ...history.filter((h) => h !== q)].slice(0, max);
}

/**
 * Step through history. index -1 is the in-progress draft; 0 is the newest entry.
 * Entries identical to `current` are skipped so every step visibly changes the text.
 * Returns null when there is nowhere to go.
 */
export function stepSearchHistory(
  history: string[],
  index: number,
  direction: 'older' | 'newer',
  current: string,
  draft: string
): number | null {
  const delta = direction === 'older' ? 1 : -1;
  for (let next = index + delta; next >= -1 && next < history.length; next += delta) {
    const text = next === -1 ? draft : history[next];
    if (text !== current || next === -1) return next;
  }
  return null;
}
