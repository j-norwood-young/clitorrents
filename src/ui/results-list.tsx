import React from 'react';
import { Box, Text } from 'ink';
import type { TorrentSnapshot } from '../engine/torrent-engine.js';
import type { CliflixSearchRow } from '../search/cliflix-search.js';
import { findActiveSnapshot, formatActiveResultBadge } from '../search/result-match.js';
import { formatBytes } from '../utils/format.js';
import { resultsPageItemCount } from './list-utils.js';

export function ResultsList({
  results,
  selectedIndex,
  page,
  pageCount,
  totalCount,
  pageSize,
  focused,
  dimmed = false,
  titleMax,
  activeSnapshots,
}: {
  results: CliflixSearchRow[];
  selectedIndex: number;
  page: number;
  pageCount: number;
  totalCount: number;
  pageSize: number;
  focused: boolean;
  dimmed?: boolean;
  titleMax: number;
  activeSnapshots: readonly TorrentSnapshot[];
}): React.ReactNode {
  const pageLen = resultsPageItemCount(page, totalCount, pageSize);
  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = totalCount === 0 ? 0 : rangeStart + pageLen - 1;
  const label =
    totalCount === 0
      ? 'Results'
      : pageCount > 1
        ? `Results ${page + 1}/${pageCount} (${rangeStart}-${rangeEnd} of ${totalCount})`
        : `Results (${totalCount})`;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={focused && !dimmed ? 'cyan' : 'gray'}
      paddingX={1}
      marginTop={1}
      flexGrow={1}
    >
      <Text bold={focused && !dimmed} color={focused && !dimmed ? 'cyan' : undefined} dimColor={dimmed}>
        {label} {focused && !dimmed ? '*' : ''}
      </Text>
      {totalCount === 0 ? (
        <Text dimColor>No results — run a search from the search pane</Text>
      ) : (
        results.map((r, i) => {
          const selected = focused && !dimmed && i === selectedIndex;
          const activeSnap = findActiveSnapshot(r, activeSnapshots);
          const activeBadge = activeSnap ? `${formatActiveResultBadge(activeSnap)} ` : '';
          const titleLen = Math.max(12, titleMax - activeBadge.length);
          return (
            <Text key={`${page}-${i}-${r.title.slice(0, 48)}`} inverse={selected} dimColor={dimmed && !selected}>
              {activeSnap ? (
                <Text color={activeSnap.done ? 'green' : activeSnap.dlPaused || activeSnap.paused ? 'yellow' : 'green'}>
                  {activeBadge}
                </Text>
              ) : null}
              {r.title.slice(0, titleLen)}{' '}
              <Text dimColor>
                {r.seeders ?? '?'}S{' '}
                {typeof r.size === 'string'
                  ? r.size
                  : typeof r.size === 'number'
                    ? formatBytes(r.size)
                    : '?'}
              </Text>
            </Text>
          );
        })
      )}
    </Box>
  );
}
