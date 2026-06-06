import type { SessionFile, SessionTorrent } from '../config.js';

export type SessionSyncAction =
  | { type: 'pause'; infoHash: string }
  | { type: 'resume'; infoHash: string }
  | { type: 'add'; entry: SessionTorrent }
  | { type: 'remove'; infoHash: string };

export function planSessionSync(
  activeHashes: ReadonlySet<string>,
  pendingHashes: ReadonlySet<string>,
  localPausedByHash: ReadonlyMap<string, boolean>,
  disk: SessionFile
): SessionSyncAction[] {
  const diskByHash = new Map(disk.torrents.map((entry) => [entry.infoHash, entry]));
  const actions: SessionSyncAction[] = [];

  for (const entry of diskByHash.values()) {
    if (!activeHashes.has(entry.infoHash) && !pendingHashes.has(entry.infoHash)) {
      actions.push({ type: 'add', entry });
      continue;
    }
    if (!activeHashes.has(entry.infoHash)) continue;
    const localPaused = localPausedByHash.get(entry.infoHash) ?? false;
    if (entry.dlPaused !== localPaused) {
      actions.push({
        type: entry.dlPaused ? 'pause' : 'resume',
        infoHash: entry.infoHash,
      });
    }
  }

  for (const hash of activeHashes) {
    if (!diskByHash.has(hash)) {
      actions.push({ type: 'remove', infoHash: hash });
    }
  }

  return actions;
}
