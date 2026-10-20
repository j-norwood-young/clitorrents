import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TorrentEngine } from '../engine/torrent-engine.js';
import type { AppConfig } from '../config.js';
import { fakeConnectivity, makeConfig, waitFor } from './helpers.js';
import { LOCAL_ONLY_CLIENT_OPTIONS } from './mock-torrent-server.js';

export type EngineFixture = {
  engine: TorrentEngine;
  connectivity: ReturnType<typeof fakeConnectivity>;
  configDir: string;
  downloadDir: string;
  config: AppConfig;
  /** Build another engine sharing this fixture's config + download dirs (e.g. to test session restore). */
  reopen(patch?: Partial<AppConfig>): TorrentEngine;
  cleanup(): Promise<void>;
};

/**
 * Real TorrentEngine that only talks to the local mock tracker: isolated XDG config dir,
 * temp download dir, fake connectivity monitor, DHT/LSD off.
 */
export function createEngineFixture(patch: Partial<AppConfig> = {}): EngineFixture {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clitorrents-cfg-'));
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clitorrents-dl-'));
  const prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = configDir;

  const config = makeConfig({ downloadDir, ...patch });
  const engines: TorrentEngine[] = [];
  const connectivity = fakeConnectivity(true);

  const open = (cfg: AppConfig): TorrentEngine => {
    const e = new TorrentEngine(cfg, {
      connectivity: engines.length === 0 ? connectivity : fakeConnectivity(true),
      clientOptions: LOCAL_ONLY_CLIENT_OPTIONS,
    });
    engines.push(e);
    return e;
  };

  const engine = open(config);

  return {
    engine,
    connectivity,
    configDir,
    downloadDir,
    config,
    reopen: (p = {}) => open({ ...config, ...p }),
    async cleanup() {
      for (const e of engines) {
        try {
          await e.shutdown();
        } catch {
          // already shut down
        }
      }
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevXdg;
      fs.rmSync(configDir, { recursive: true, force: true });
      fs.rmSync(downloadDir, { recursive: true, force: true });
    },
  };
}

export function sha1File(file: string): string {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

export async function waitForDone(
  engine: Pick<TorrentEngine, 'getSnapshots'>,
  infoHash: string,
  timeoutMs = 15_000
): Promise<void> {
  await waitFor(() => engine.getSnapshots().find((s) => s.infoHash === infoHash)?.done, {
    timeoutMs,
    message: `torrent ${infoHash} to finish`,
  });
}
