import React from 'react';
import { Box, Text } from 'ink';
import type { TorrentEngine } from '../engine/torrent-engine.js';
import { formatBytes, formatEta, formatRatio, formatSpeed } from '../utils/format.js';
import { Sparkline } from './sparkline.js';
import { isTorrentUiPaused } from './list-utils.js';
import { MODAL_PANEL_BG } from './modal.js';

export function DetailPane({
  engine,
  infoHash,
  width,
  sparkW,
  maxPeerLines = 12,
}: {
  engine: TorrentEngine;
  infoHash: string;
  width: number;
  sparkW: number;
  maxPeerLines?: number;
}): React.ReactNode {
  const s = engine.getSnapshots().find((x) => x.infoHash === infoHash);
  const peers = engine.getPeers(infoHash);
  const paused = s ? isTorrentUiPaused(s) : false;
  if (!s) {
    return (
      <Box marginTop={1}>
        <Text color="red">Torrent not found (finished or removed). Press Esc.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginTop={1} backgroundColor={MODAL_PANEL_BG}>
      <Text backgroundColor={MODAL_PANEL_BG}>{s.name}</Text>
      <Text backgroundColor={MODAL_PANEL_BG}>
        Progress {((s.progress ?? 0) * 100).toFixed(1)}% | DL {formatSpeed(s.downloadSpeed ?? 0)} | UL{' '}
        {formatSpeed(s.uploadSpeed ?? 0)} | ETA {formatEta(s.timeRemaining ?? 0)}
        {paused ? (
          <Text bold color="yellow">
            {' '}
            | Paused
          </Text>
        ) : null}
      </Text>
      <Text backgroundColor={MODAL_PANEL_BG}>
        Peers {s.numPeers} | Ratio {formatRatio(s.ratio ?? 0)} | maxRatio{' '}
        {s.maxRatio ?? 'inherit global'} | maxUp{' '}
        {s.maxUploadBytes == null ? 'inherit global' : formatBytes(s.maxUploadBytes)}
      </Text>
      <Text color="green" backgroundColor={MODAL_PANEL_BG}>Save to: {s.downloadPath}</Text>
      {s.mediaCategory ? <Text dimColor backgroundColor={MODAL_PANEL_BG}>Category: {s.mediaCategory}</Text> : null}
      <Box marginY={1}>
        <Sparkline values={s.history ?? []} width={sparkW} />
      </Box>
      <Text bold backgroundColor={MODAL_PANEL_BG}>Peers ({peers.length})</Text>
      {peers
        .slice(0, Math.min(maxPeerLines, width > 100 ? 20 : 10))
        .map((p) => (
          <Text key={p.key} backgroundColor={MODAL_PANEL_BG}>
            {p.remoteAddress}:{p.remotePort} ↓{formatSpeed(p.downSpeed)} ↑
            {formatSpeed(p.upSpeed)}
          </Text>
        ))}
    </Box>
  );
}
