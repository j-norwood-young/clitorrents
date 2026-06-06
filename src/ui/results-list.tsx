import React from 'react';
import { Box, Text } from 'ink';
import type { AppConfig } from '../config.js';
import type { CliflixSearchRow } from '../search/cliflix-search.js';
import { formatCategoryLabel, planDownloadLocation } from '../media/classify.js';
import { formatBytes, shortenPath } from '../utils/format.js';
import { listScrollTop } from './list-utils.js';

export function ResultsList({
  results,
  selectedIndex,
  focused,
  dimmed = false,
  visibleRows,
  titleMax,
  config,
  baseDir,
}: {
  results: CliflixSearchRow[];
  selectedIndex: number;
  focused: boolean;
  dimmed?: boolean;
  visibleRows: number;
  titleMax: number;
  config: AppConfig;
  baseDir: string;
}): React.ReactNode {
  const routing = config.categories?.enabled ?? false;
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
        {routing ? <Text dimColor> (route preview)</Text> : null}
      </Text>
      {results.length === 0 ? (
        <Text dimColor>No results — run a search from the search pane</Text>
      ) : (
        results.slice(scrollTop, scrollTop + visibleRows).map((r, j) => {
          const i = scrollTop + j;
          const selected = focused && !dimmed && i === selectedIndex;
          const plan = routing ? planDownloadLocation(r.title, config, baseDir) : null;
          const routeSuffix = plan
            ? ` [${formatCategoryLabel(plan.category)}→${shortenPath(plan.dir, 18)}]`
            : '';
          const titleLen = Math.max(12, titleMax - routeSuffix.length);
          return (
            <Text key={`${i}-${r.title.slice(0, 48)}`} inverse={selected} dimColor={dimmed && !selected}>
              {r.title.slice(0, titleLen)}
              {routeSuffix ? <Text dimColor>{routeSuffix}</Text> : null}{' '}
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
