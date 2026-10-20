import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './server.js';
import { VERSION } from '../constants.js';
import { loadConfig, type AppConfig } from '../config.js';
import { registerSearchProvider, removeSearchProvider } from '../search/cliflix-search.js';
import { createMockProvider, MOCK_PROVIDER_NAME } from '../search/mock-provider.js';
import { FakeEngine, makeConfig, makeSnapshot, withTempConfigDir } from '../test/helpers.js';
import { startMockTorrentServer, type MockTorrentServer } from '../test/mock-torrent-server.js';

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

describe('MCP server', () => {
  let swarm: MockTorrentServer;
  let engine: FakeEngine;
  let client: Client;
  let config: AppConfig;

  before(async () => {
    swarm = await startMockTorrentServer();
    registerSearchProvider(createMockProvider(swarm.url));
  });

  after(async () => {
    removeSearchProvider(MOCK_PROVIDER_NAME);
    await swarm.close();
  });

  beforeEach(async () => {
    config = makeConfig({
      torrents: {
        limit: 10,
        providers: { active: MOCK_PROVIDER_NAME, available: [MOCK_PROVIDER_NAME] },
      },
    });
    engine = new FakeEngine(config, '/downloads');
    const server = createMcpServer(engine, config);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
  });

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as ToolResult;
    return { data: JSON.parse(res.content[0]!.text) as Record<string, unknown> & unknown[], isError: res.isError };
  };

  it('identifies itself with the package version', () => {
    assert.deepEqual(client.getServerVersion(), { name: 'clitorrents', version: VERSION });
  });

  it('lists every tool', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name),
      [
        'search',
        'add_torrent',
        'list_transfers',
        'transfer_status',
        'pause_torrent',
        'resume_torrent',
        'remove_torrent',
        'set_limits',
        'get_config',
        'set_config',
      ]
    );
  });

  it('search returns rows from the configured provider', async () => {
    const { data } = await call('search', { query: 'mock', limit: 1 });
    const rows = data.rows as { title: string }[];
    assert.equal(rows.length, 1);
    assert.match(String(data.info), /MockServer: 1/);
  });

  it('add_torrent with a magnet adds directly', async () => {
    const t = swarm.torrents[0]!;
    const searchesBefore = swarm.searches.length;
    const { data } = await call('add_torrent', { target: t.magnet, name: 'Named', dir: '/x' });
    assert.equal(engine.added[0]!.torrentId, t.magnet);
    assert.equal(engine.added[0]!.name, 'Named');
    assert.equal(engine.added[0]!.dir, '/x');
    assert.equal(data.infoHash, t.infoHash);
    assert.equal(swarm.searches.length, searchesBefore);
  });

  it('add_torrent with a .torrent URL resolves to a magnet', async () => {
    const t = swarm.torrents[1]!;
    await call('add_torrent', { target: `${swarm.url}/torrent/${t.infoHash}.torrent` });
    assert.match(String(engine.added[0]!.torrentId), new RegExp(`btih:${t.infoHash}`));
  });

  it('add_torrent with a query searches and adds the picked result', async () => {
    const show = swarm.torrents[1]!;
    await call('add_torrent', { target: 'show', pick: 1 });
    assert.equal(engine.added[0]!.torrentId, show.magnet);
    assert.equal(engine.added[0]!.name, show.name);
  });

  it('add_torrent errors when the pick is out of range', async () => {
    const { data, isError } = await call('add_torrent', { target: 'show', pick: 5 });
    assert.equal(isError, true);
    assert.equal(data.error, 'No search result at pick index');
  });

  it('list_transfers and transfer_status read engine snapshots', async () => {
    engine.snapshots = [makeSnapshot({ infoHash: 'b'.repeat(40), name: 'One' })];
    const list = await call('list_transfers');
    assert.equal((list.data as unknown as { name: string }[])[0]!.name, 'One');

    const status = await call('transfer_status', { infoHash: 'b'.repeat(40) });
    assert.equal(status.data.name, 'One');

    const missing = await call('transfer_status', { infoHash: 'c'.repeat(40) });
    assert.equal(missing.isError, true);
    assert.equal(missing.data.error, 'Torrent not found');
  });

  it('pause, resume and remove call through to the engine', async () => {
    const ih = 'd'.repeat(40);
    engine.snapshots = [makeSnapshot({ infoHash: ih })];
    assert.deepEqual((await call('pause_torrent', { infoHash: ih })).data, { ok: true });
    assert.equal(engine.paused.has(ih), true);
    await call('resume_torrent', { infoHash: ih });
    assert.equal(engine.paused.has(ih), false);
    await call('remove_torrent', { infoHash: ih, destroyFiles: true });
    assert.deepEqual(engine.removed, [{ infoHash: ih, destroyFiles: true }]);
  });

  it('set_limits updates only the given values, building on current config', async () => {
    await call('set_limits', { downloadBps: 1000 });
    const { data } = await call('set_limits', { uploadBps: 500, defaultMaxRatio: 2 });
    assert.deepEqual(engine.globalLimits, { download: 1000, upload: 500 });
    assert.equal(engine.defaultRatio, 2);
    assert.equal(data.globalDownloadLimitBps, 1000);

    await call('set_limits', { defaultMaxRatio: null });
    assert.equal(engine.defaultRatio, null);
  });

  it('get_config and set_config merge partial config onto the current one', async () => {
    assert.equal((await call('get_config')).data.onReachLimit, 'pause_seed');
    await call('set_config', { config: { onReachLimit: 'remove_keep_files' } });
    const { data } = await call('set_config', { config: { downloadDir: '/elsewhere' } });
    assert.equal(data.onReachLimit, 'remove_keep_files');
    assert.equal(data.downloadDir, '/elsewhere');
    assert.equal(engine.config.downloadDir, '/elsewhere');
  });

  it('set_config with persist delegates persistence to the engine', async () => {
    await withTempConfigDir(async () => {
      let persisted: boolean | undefined;
      engine.setConfig = (c: AppConfig, opts?: { persist?: boolean }) => {
        engine.config = c;
        persisted = opts?.persist;
      };
      await call('set_config', { config: { downloadDir: '/p' }, persist: true });
      assert.equal(persisted, true);
      // The MCP server no longer writes config itself; the engine owns that.
      assert.equal(loadConfig().downloadDir, null);
    });
  });

  it('reports engine errors and unknown tools as isError results', async () => {
    engine.addError = new Error('disk full');
    const add = await call('add_torrent', { target: swarm.torrents[0]!.magnet });
    assert.equal(add.isError, true);
    assert.equal(add.data.error, 'disk full');

    const unknown = await call('nope');
    assert.equal(unknown.isError, true);
    assert.equal(unknown.data.error, 'Unknown tool: nope');
  });
});
