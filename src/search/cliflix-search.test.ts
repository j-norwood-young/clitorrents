import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  getMagnetForTorrent,
  registerSearchProvider,
  removeSearchProvider,
  searchCliflixStyle,
} from './cliflix-search.js';
import { applyMockServerEnv, createMockProvider, MOCK_PROVIDER_NAME } from './mock-provider.js';
import { startMockTorrentServer, type MockTorrentServer } from '../test/mock-torrent-server.js';
import { makeConfig } from '../test/helpers.js';

describe('searchCliflixStyle (mock provider)', () => {
  let server: MockTorrentServer;

  before(async () => {
    server = await startMockTorrentServer();
    registerSearchProvider(createMockProvider(server.url));
    // Points at a closed port, so every search errors.
    registerSearchProvider(createMockProvider('http://127.0.0.1:9', 'DeadProvider'));
  });

  after(async () => {
    removeSearchProvider(MOCK_PROVIDER_NAME);
    removeSearchProvider('DeadProvider');
    await server.close();
  });

  const opts = (active: string, available: string[] = []) => ({
    limit: 10,
    activeProvider: active,
    availableProviders: available,
  });

  it('returns rows mapped from the provider', async () => {
    const { rows, info } = await searchCliflixStyle('mock', opts(MOCK_PROVIDER_NAME));
    assert.equal(info, `${MOCK_PROVIDER_NAME}: 2`);
    assert.deepEqual(
      rows.map((r) => r.title).sort(),
      server.torrents.map((t) => t.name).sort()
    );
    const movie = rows.find((r) => r.title.startsWith('Mock.Movie'))!;
    assert.equal(movie.seeders, 42);
    assert.equal(movie.peers, 7);
    assert.equal(movie.size, '256.0 KB');
    assert.equal(movie.time, '2024-01-01');
    assert.equal(movie._torrent.provider, MOCK_PROVIDER_NAME);
  });

  it('respects the result limit', async () => {
    const { rows } = await searchCliflixStyle('mock', { ...opts(MOCK_PROVIDER_NAME), limit: 1 });
    assert.equal(rows.length, 1);
  });

  it('trims the query and short-circuits empty queries', async () => {
    assert.deepEqual(await searchCliflixStyle('   ', opts(MOCK_PROVIDER_NAME)), {
      rows: [],
      info: 'empty query',
    });
    const before = server.searches.length;
    await searchCliflixStyle('  show  ', opts(MOCK_PROVIDER_NAME));
    assert.equal(server.searches.at(before), 'show');
  });

  it('falls back to the next provider when the active one errors', async () => {
    const { rows, info } = await searchCliflixStyle(
      'movie',
      opts('DeadProvider', ['DeadProvider', MOCK_PROVIDER_NAME])
    );
    assert.equal(rows.length, 1);
    assert.match(info, /^DeadProvider: error .+ \| MockServer: 1$/);
  });

  it('reports every provider when none return results', async () => {
    const { rows, info } = await searchCliflixStyle('__empty', opts(MOCK_PROVIDER_NAME, ['DeadProvider']));
    assert.deepEqual(rows, []);
    assert.match(info, /^MockServer: 0 \| DeadProvider: error/);
  });

  it('records an error for unknown providers', async () => {
    const { info } = await searchCliflixStyle('x', opts('NoSuchProvider'));
    assert.match(info, /NoSuchProvider: error/);
  });

  it('reports "no providers" when there is nothing to try', async () => {
    assert.deepEqual(await searchCliflixStyle('x', opts('')), { rows: [], info: 'no providers' });
  });

  it('getMagnetForTorrent resolves magnets through the provider', async () => {
    const { rows } = await searchCliflixStyle('movie', opts(MOCK_PROVIDER_NAME));
    const magnet = await getMagnetForTorrent(rows[0]!._torrent);
    assert.equal(magnet, server.torrents[0]!.magnet);
  });

  it('getMagnetForTorrent returns undefined for unknown providers or non-magnets', async () => {
    assert.equal(await getMagnetForTorrent({ title: 'x', provider: 'Nope' }), undefined);
    assert.equal(
      await getMagnetForTorrent({ title: 'x', provider: MOCK_PROVIDER_NAME, infoHash: 'f'.repeat(40) }),
      undefined
    );
  });
});

describe('applyMockServerEnv', () => {
  it('leaves config alone when the env var is unset', () => {
    const config = makeConfig();
    let registered = 0;
    assert.equal(applyMockServerEnv(config, () => registered++, {}), config);
    assert.equal(registered, 0);
  });

  it('registers the mock provider and makes it the only provider', () => {
    const registered: object[] = [];
    const next = applyMockServerEnv(makeConfig(), (p) => registered.push(p), {
      CLITORRENTS_MOCK_SERVER: 'http://127.0.0.1:1234/',
    });
    assert.equal(registered.length, 1);
    assert.equal((registered[0] as { name: string }).name, MOCK_PROVIDER_NAME);
    assert.deepEqual(next.torrents.providers, {
      active: MOCK_PROVIDER_NAME,
      available: [MOCK_PROVIDER_NAME],
    });
    assert.equal(next.torrents.limit, 30);
  });
});
