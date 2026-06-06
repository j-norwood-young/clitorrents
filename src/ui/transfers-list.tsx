import React from 'react';
import { Box, Text } from 'ink';
import type { TorrentSnapshot } from '../engine/torrent-engine.js';
import { formatEta, formatSpeed } from '../utils/format.js';
import { Sparkline } from './sparkline.js';
import { isTorrentUiPaused, listScrollTop } from './list-utils.js';

export function TransfersList({
  snaps,
  selectedIndex,
  focused,
  dimmed = false,
  visibleRows,
  sparkW,
}: {
  snaps: TorrentSnapshot[];
  selectedIndex: number;
  focused: boolean;
  dimmed?: boolean;
  visibleRows: number;
  sparkW: number;
}): React.ReactNode {
  const scrollTop = listScrollTop(snaps.length, selectedIndex, visibleRows);
  const windowEnd = Math.min(snaps.length, scrollTop + visibleRows);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={focused && !dimmed ? 'green' : 'gray'}
      paddingX={1}
      flexGrow={1}
    >
      <Text bold={focused && !dimmed} color={focused && !dimmed ? 'green' : undefined} dimColor={dimmed}>
        Transfers {focused && !dimmed ? '*' : ''}
        {snaps.length > 0 ? ` (${scrollTop + 1}-${windowEnd} of ${snaps.length})` : ''}
      </Text>
      {snaps.length === 0 ? (
        <Text dimColor>No active torrents</Text>
      ) : (
        snaps.slice(scrollTop, windowEnd).map((s, j) => {
          const i = scrollTop + j;
          const paused = isTorrentUiPaused(s);
          const selected = focused && !dimmed && i === selectedIndex;
          const pathShort =
            s.downloadPath.length > 42
              ? '…' + s.downloadPath.slice(-41)
              : s.downloadPath;
          return (
            <Box key={s.infoHash} flexDirection="column" marginBottom={0}>
              <Text inverse={selected} dimColor={dimmed && !selected}>
                {paused ? (
                  <>
                    <Text bold color="yellow">
                      PAUSED{' '}
                    </Text>
                    <Text>
                      {s.name.slice(0, 32)} {(s.progress * 100).toFixed(1)}%
                    </Text>
                  </>
                ) : (
                  `${s.name.slice(0, 36)} ${(s.progress * 100).toFixed(1)}% ${formatSpeed(s.downloadSpeed)} ETA ${formatEta(s.timeRemaining)}`
                )}
              </Text>
              <Text dimColor>
                {'  → '}
                {pathShort}
                {s.mediaCategory ? ` [${s.mediaCategory}]` : ''}
              </Text>
              <Text dimColor={dimmed}>
                {'  '}
                <Sparkline values={s.history} width={sparkW} /> peers {s.numPeers}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}
