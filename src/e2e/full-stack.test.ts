import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { runDownloadCommand } from '../cli/download-cmd.js';
import { connectEngine } from '../daemon/ensure-daemon.js';
import { registerSearchProvider, removeSearchProvider } from '../search/cliflix-search.js';
import { applyMockServerEnv, MOCK_PROVIDER_NAME } from '../search/mock-provider.js';
import { createEngineFixture, sha1File } from '../test/engine-fixture.js';
import { startDaemonFixture } from '../test/daemon-fixture.js';
import { captureOutput } from '../test/helpers.js';
import { startMockTorrentServer, type MockTorrentServer } from '../test/mock-torrent-server.js';

describe('full stack: search → daemon → swarm → disk', () => {
  let swarm: MockTorrentServer;

  before(async () => {
    swarm = await startMockTorrentServer();
  });

  after(async () => {
    removeSearchProvider(MOCK_PROVIDER_NAME);
    await swarm.close();
  });

  it('downloads a searched torrent through the daemon API', async () => {
    const fx = createEngineFixture({ categories: { enabled: true, tv: undefined } });
    const daemon = await startDaemonFixture(fx.engine, fx.config);
    try {
      const config = applyMockServerEnv(daemon.config, registerSearchProvider, {
        CLITORRENTS_MOCK_SERVER: swarm.url,
      });
      const client = await connectEngine(config);
      const { result, stdout } = await captureOutput((out) =>
        runDownloadCommand(client, config, { target: 'show' }, out)
      );
      assert.equal(result, 0, stdout);
      assert.match(stdout, /Selected: Mock\.Show\.S01E02\.720p/);
      assert.match(stdout, /Category: TV/);
      assert.match(stdout, /Done — /);

      const show = swarm.torrents[1]!;
      for (const [rel, hash] of Object.entries(show.sha1s)) {
        assert.equal(sha1File(path.join(fx.downloadDir, show.name, rel)), hash);
      }
    } finally {
      await daemon.close();
      await fx.cleanup();
    }
  });
});
