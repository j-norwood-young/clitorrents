import React from 'react';
import { Box, Text } from 'ink';
import type { TorrentSnapshot } from '../engine/torrent-engine.js';
import { formatEta, formatSpeed, formatTransferProgress } from '../utils/format.js';
import { Sparkline } from './sparkline.js';
import {
  formatTransferStatusBadge,
  isTorrentUiPaused,
  listScrollTop,
  transferUiStatus,
} from './list-utils.js';

function statusBadgeColor(s: TorrentSnapshot): 'green' | 'yellow' {
  const status = transferUiStatus(s);
  if (status === 'paused') return 'yellow';
  return 'green';
}

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
          const status = transferUiStatus(s);
          const paused = isTorrentUiPaused(s);
          const selected = focused && !dimmed && i === selectedIndex;
          const badge = formatTransferStatusBadge(s);
          const sizeLabel = formatTransferProgress(s.downloaded, s.length);
          const titleMax = Math.max(14, 42 - sizeLabel.length);
          const pathShort =
            s.downloadPath.length > 42
              ? '…' + s.downloadPath.slice(-41)
              : s.downloadPath;
          const statsLine =
            status === 'done'
              ? 'Complete'
              : paused
                ? 'Paused'
                : `${formatSpeed(s.downloadSpeed)} ETA ${formatEta(s.timeRemaining)}`;
          return (
            <Box key={s.infoHash} flexDirection="column" marginBottom={0}>
              <Box flexDirection="row">
                <Text color={statusBadgeColor(s)} bold={paused}>
                  {badge}{' '}
                </Text>
                <Text inverse={selected} dimColor={dimmed && !selected} wrap="truncate">
                  {s.name.slice(0, titleMax)} {sizeLabel}
                </Text>
              </Box>
              <Text dimColor>
                {'  → '}
                {pathShort}
                {s.mediaCategory ? ` [${s.mediaCategory}]` : ''}
              </Text>
              <Text dimColor={dimmed} color={paused ? 'yellow' : undefined}>
                {'  '}
                {paused ? (
                  <>Paused · peers {s.numPeers}</>
                ) : (
                  <>
                    <Sparkline values={s.history} width={sparkW} /> peers {s.numPeers} · {statsLine}
                  </>
                )}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}
