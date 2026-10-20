import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { render } from 'ink-testing-library';
import { DetailPane } from './detail-pane.js';
import { FakeEngine, makeSnapshot } from '../test/helpers.js';

describe('DetailPane', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => {
    unmount?.();
    unmount = undefined;
  });

  it('shows a not-found message for unknown torrents', () => {
    const r = render(<DetailPane engine={new FakeEngine()} infoHash="x" width={100} sparkW={10} />);
    unmount = r.unmount;
    assert.match(r.lastFrame() ?? '', /Torrent not found/);
  });

  it('shows progress, policy, path, category and peers', () => {
    const engine = new FakeEngine();
    const ih = 'a'.repeat(40);
    engine.snapshots = [
      makeSnapshot({
        infoHash: ih,
        name: 'Detail Me',
        progress: 0.5,
        dlPaused: true,
        maxUploadBytes: 1024,
        downloadPath: '/dl/here',
        mediaCategory: 'tv',
      }),
    ];
    engine.peers[ih] = Array.from({ length: 15 }, (_, i) => ({
      key: `p${i}`,
      remoteAddress: '10.0.0.' + i,
      remotePort: 6881,
      downSpeed: 1024,
      upSpeed: 0,
      downloaded: 0,
      uploaded: 0,
    }));
    const r = render(<DetailPane engine={engine} infoHash={ih} width={80} sparkW={10} />);
    unmount = r.unmount;
    const out = r.lastFrame() ?? '';
    assert.match(out, /Detail Me/);
    assert.match(out, /Progress 50\.0%/);
    assert.match(out, /\| Paused/);
    assert.match(out, /maxRatio inherit global \| maxUp 1\.0 KB/);
    assert.match(out, /Save to: \/dl\/here/);
    assert.match(out, /Category: tv/);
    assert.match(out, /Peers \(15\)/);
    assert.match(out, /10\.0\.0\.9:6881/);
    // Narrow terminals cap the peer list at 10 rows.
    assert.doesNotMatch(out, /10\.0\.0\.10:6881/);
  });
});
