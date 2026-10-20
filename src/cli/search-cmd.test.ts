import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { runSearchCommand } from './search-cmd.js';
import { registerSearchProvider, removeSearchProvider } from '../search/cliflix-search.js';
import { createMockProvider, MOCK_PROVIDER_NAME } from '../search/mock-provider.js';
import { captureOutput, makeConfig } from '../test/helpers.js';
import { startMockTorrentServer, type MockTorrentServer } from '../test/mock-torrent-server.js';

describe('runSearchCommand', () => {
  let swarm: MockTorrentServer;
  const config = makeConfig({
    torrents: { limit: 10, providers: { active: MOCK_PROVIDER_NAME, available: [MOCK_PROVIDER_NAME] } },
  });

  before(async () => {
    swarm = await startMockTorrentServer();
    registerSearchProvider(createMockProvider(swarm.url));
  });

  after(async () => {
    removeSearchProvider(MOCK_PROVIDER_NAME);
    await swarm.close();
  });

  it('prints numbered results with seeders and size', async () => {
    const { result, stdout } = await captureOutput(() => runSearchCommand('mock', config));
    assert.equal(result, 0);
    assert.match(stdout, /^# 2 results \(MockServer: 2\)/);
    assert.match(stdout, /1\. Mock\.Movie\.2024\.1080p\.mkv\n {3}seeders: 42 {2}size: 256\.0 KB/);
    assert.match(stdout, /2\. Mock\.Show\.S01E02\.720p/);
  });

  it('honours the limit option', async () => {
    const { stdout } = await captureOutput(() => runSearchCommand('mock', config, { limit: 1 }));
    assert.match(stdout, /# 1 results/);
  });

  it('returns 1 and explains when there are no results', async () => {
    const { result, stderr } = await captureOutput(() => runSearchCommand('__empty', config));
    assert.equal(result, 1);
    assert.match(stderr, /No results — MockServer: 0/);
  });

  it('uses the provider override', async () => {
    const { result, stderr } = await captureOutput(() =>
      runSearchCommand('mock', config, { provider: 'NoSuchProvider' })
    );
    // Falls back to configured providers after the override fails.
    assert.equal(result, 0);
    assert.equal(stderr, '');
  });
});
