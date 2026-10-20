import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { runDownloadCommand } from './download-cmd.js';
import { registerSearchProvider, removeSearchProvider } from '../search/cliflix-search.js';
import { createMockProvider, MOCK_PROVIDER_NAME } from '../search/mock-provider.js';
import { captureOutput, FakeEngine, makeConfig } from '../test/helpers.js';
import { startMockTorrentServer, type MockTorrentServer } from '../test/mock-torrent-server.js';

describe('runDownloadCommand', () => {
  let swarm: MockTorrentServer;
  const config = makeConfig({
    torrents: { limit: 10, providers: { active: MOCK_PROVIDER_NAME, available: [MOCK_PROVIDER_NAME] } },
  });

  before(async () => {
    swarm = await startMockTorrentServer();
    registerSearchProvider(createMockProvider(swarm.url));
    const noMagnet = createMockProvider(swarm.url, 'NoMagnet') as { getMagnet: () => Promise<undefined> };
    noMagnet.getMagnet = async () => undefined;
    registerSearchProvider(noMagnet);
  });

  after(async () => {
    removeSearchProvider(MOCK_PROVIDER_NAME);
    removeSearchProvider('NoMagnet');
    await swarm.close();
  });

  const engine = () => {
    const e = new FakeEngine(config, '/downloads');
    e.completeOnAdd = true;
    return e;
  };

  it('adds a magnet directly and waits until done', async () => {
    const e = engine();
    const t = swarm.torrents[0]!;
    const { result, stdout } = await captureOutput((out) => runDownloadCommand(e, config, { target: t.magnet }, out));
    assert.equal(result, 0);
    assert.equal(e.added[0]!.torrentId, t.magnet);
    assert.match(stdout, /Save to: \/downloads/);
    assert.match(stdout, /100\.0% DL/);
    assert.match(stdout, /Done — 1000 B saved to \/downloads/);
    assert.equal(e.destroyed, true);
  });

  it('resolves a .torrent URL before adding', async () => {
    const e = engine();
    const t = swarm.torrents[1]!;
    await captureOutput((out) =>
      runDownloadCommand(e, config, { target: `${swarm.url}/torrent/${t.infoHash}.torrent` }, out)
    );
    assert.match(String(e.added[0]!.torrentId), new RegExp(`btih:${t.infoHash}`));
  });

  it('searches and adds the picked result into the requested dir', async () => {
    const e = engine();
    const { result, stdout } = await captureOutput((out) =>
      runDownloadCommand(e, config, { target: 'mock', pick: 2, dir: '/custom' }, out)
    );
    assert.equal(result, 0);
    assert.match(stdout, /Selected: Mock\.Show\.S01E02\.720p/);
    assert.match(stdout, /Save to: \/custom/);
    assert.equal(e.added[0]!.torrentId, swarm.torrents[1]!.magnet);
    assert.equal(e.added[0]!.dir, '/custom');
  });

  it('prints the category when categories are enabled', async () => {
    const cfg = { ...config, categories: { enabled: true, movies: '/media/movies' } };
    const e = engine();
    const { stdout } = await captureOutput((out) => runDownloadCommand(e, cfg, { target: 'movie' }, out));
    assert.match(stdout, /Category: Movie/);
    assert.match(stdout, /Save to: \/media\/movies/);
  });

  it('applies limit and ratio overrides before adding', async () => {
    const e = engine();
    await captureOutput((out) =>
      runDownloadCommand(e, config, { target: swarm.torrents[0]!.magnet, uploadLimit: 500, ratio: 1.5 }, out)
    );
    assert.deepEqual(e.globalLimits, { download: -1, upload: 500 });
    assert.equal(e.defaultRatio, 1.5);
  });

  it('returns 1 when the search has no results', async () => {
    const { result, stderr } = await captureOutput((out) => runDownloadCommand(engine(), config, { target: '__empty' }, out));
    assert.equal(result, 1);
    assert.match(stderr, /No results/);
  });

  it('returns 1 when the pick is out of range', async () => {
    const { result, stderr } = await captureOutput((out) =>
      runDownloadCommand(engine(), config, { target: 'mock', pick: 9 }, out)
    );
    assert.equal(result, 1);
    assert.match(stderr, /Pick 9 out of range \(2 results\)/);
  });

  it('returns 1 when the magnet cannot be resolved', async () => {
    const { result, stderr } = await captureOutput((out) =>
      runDownloadCommand(engine(), config, { target: 'mock', provider: 'NoMagnet' }, out)
    );
    assert.equal(result, 1);
    assert.match(stderr, /Could not resolve magnet/);
  });
});
