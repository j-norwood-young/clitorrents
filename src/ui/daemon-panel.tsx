import React from 'react';
import { Box, Text } from 'ink';
import type { DaemonPanelStatus } from '../daemon/control.js';
import { formatDuration, formatSpeed } from '../utils/format.js';
import { MODAL_PANEL_BG } from './modal.js';

export type DaemonAction = 'start' | 'stop' | 'restart';

export function DaemonPanel({
  status,
  busy,
  progress,
}: {
  status: DaemonPanelStatus | null;
  /** Action in flight, if any. */
  busy: DaemonAction | null;
  progress: string;
}): React.ReactNode {
  const bg = MODAL_PANEL_BG;
  return (
    <Box flexDirection="column" marginTop={1} backgroundColor={bg}>
      {status == null ? (
        <Text dimColor backgroundColor={bg}>
          Checking daemon…
        </Text>
      ) : status.running ? (
        <>
          <Text backgroundColor={bg}>
            <Text bold color="green">
              ● running
            </Text>
            {'  '}v{status.version} · pid {status.pid || '?'}
            {status.pidFileMatches ? '' : ' (pid file mismatch)'}
            {status.uptimeMs != null ? ` · up ${formatDuration(status.uptimeMs)}` : ''}
          </Text>
          <Text backgroundColor={bg}>URL       {status.url}</Text>
          <Text backgroundColor={bg}>
            Network   {status.networkOnline ? 'online' : <Text color="red">offline</Text>}
          </Text>
          <Text backgroundColor={bg}>
            Transfers {status.transferCount} · DL {formatSpeed(status.downloadSpeed)} · UL{' '}
            {formatSpeed(status.uploadSpeed)}
          </Text>
          <Text backgroundColor={bg}>
            Clients   {status.sseClients != null ? `${status.sseClients} connected (TUI / MCP / download)` : '—'}
          </Text>
        </>
      ) : (
        <>
          <Text backgroundColor={bg}>
            <Text bold color="red">
              ● not running
            </Text>
            {status.orphanPid != null ? `  (pid ${status.orphanPid} alive but API unreachable)` : ''}
          </Text>
          <Text backgroundColor={bg}>URL       {status.url}</Text>
        </>
      )}

      <Box marginTop={1} backgroundColor={bg}>
        {busy ? (
          <Text color="yellow" backgroundColor={bg}>
            ▸ {progress || `${busy}…`}
          </Text>
        ) : (
          <Text backgroundColor={bg}>
            <Text bold>s</Text> start · <Text bold>x</Text> stop · <Text bold>r</Text> restart ·{' '}
            <Text bold>Esc</Text> back
          </Text>
        )}
      </Box>
      {!busy && progress ? (
        <Text dimColor backgroundColor={bg}>
          {progress}
        </Text>
      ) : null}
      <Text dimColor backgroundColor={bg}>
        Restart if transfers sit at 0 peers — downloads resume from the saved session.
      </Text>
    </Box>
  );
}
