import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { resolveTorrentId } from './resolve-torrent-id.js';
import { startMockTorrentServer, type MockTorrentServer } from '../test/mock-torrent-server.js';
import { infoHashFromMagnet } from '../engine/session-utils.js';

describe('resolveTorrentId', () => {
  let server: MockTorrentServer;

  before(async () => {
    server = await startMockTorrentServer();
  });

  after(async () => {
    await server.close();
  });

  it('passes magnets through unchanged (after trimming)', async () => {
    const m = server.torrents[0]!.magnet;
    assert.equal(await resolveTorrentId(`  ${m}  `), m);
  });

  it('turns a hex info hash into a magnet', async () => {
    const ih = server.torrents[0]!.infoHash;
    const magnet = (await resolveTorrentId(ih.toUpperCase())) as string;
    assert.match(magnet, /^magnet:\?/);
    assert.equal(infoHashFromMagnet(magnet), ih);
  });

  it('turns a base32 info hash into a magnet', async () => {
    const magnet = (await resolveTorrentId('CWDLWTMLGEUA4B643U57775DO5LBG3SC')) as string;
    assert.match(magnet, /^magnet:\?xt=urn:btih:/);
  });

  it('downloads a .torrent URL and converts it to a magnet', async () => {
    const t = server.torrents[1]!;
    const magnet = (await resolveTorrentId(`${server.url}/torrent/${t.infoHash}.torrent`)) as string;
    assert.equal(infoHashFromMagnet(magnet), t.infoHash);
    assert.match(magnet, /dn=Mock\.Show/);
    assert.match(magnet, /tr=http/);
  });

  it('throws on HTTP errors', async () => {
    await assert.rejects(
      resolveTorrentId(`${server.url}/torrent/${'0'.repeat(40)}.torrent`),
      /Failed to download torrent metadata \(404\)/
    );
  });
});
