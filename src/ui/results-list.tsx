import React from 'react';
import { Box, Text } from 'ink';
import type { CliflixSearchRow } from '../search/cliflix-search.js';
import { formatBytes } from '../utils/format.js';
import { listScrollTop } from './list-utils.js';

export function ResultsList({
  results,
  selectedIndex,
  focused,
  dimmed = false,
  visibleRows,
  titleMax,
}: {
  results: CliflixSearchRow[];
  selectedIndex: number;
  focused: boolean;
  dimmed?: boolean;
  visibleRows: number;
  titleMax: number;
}): React.ReactNode {
  const scrollTop = listScrollTop(results.length, selectedIndex, visibleRows);
  const windowEnd = Math.min(results.length, scrollTop + visibleRows);
  const label =
    results.length === 0
      ? 'Results'
      : `Results ${scrollTop + 1}-${windowEnd} of ${results.length}`;

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
      {results.length === 0 ? (
        <Text dimColor>No results — run a search from the search pane</Text>
      ) : (
        results.slice(scrollTop, scrollTop + visibleRows).map((r, j) => {
          const i = scrollTop + j;
          const selected = focused && !dimmed && i === selectedIndex;
          return (
            <Text key={`${i}-${r.title.slice(0, 48)}`} inverse={selected} dimColor={dimmed && !selected}>
              {r.title.slice(0, titleMax)}{' '}
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
