import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { render } from 'ink-testing-library';
import { TransfersList } from './transfers-list.js';
import { makeSnapshot } from '../test/helpers.js';

describe('TransfersList', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => {
    unmount?.();
    unmount = undefined;
  });

  const draw = (props: Partial<Parameters<typeof TransfersList>[0]> = {}) => {
    const r = render(
      <TransfersList snaps={[]} selectedIndex={0} focused={false} visibleRows={5} sparkW={8} {...props} />
    );
    unmount = r.unmount;
    return r.lastFrame() ?? '';
  };

  it('shows an empty hint', () => {
    assert.match(draw(), /No active torrents/);
  });

  it('renders downloading, paused and done transfers with badges and stats', () => {
    const out = draw({
      focused: true,
      snaps: [
        makeSnapshot({
          infoHash: '1'.repeat(40),
          name: 'Downloading',
          progress: 0.25,
          downloaded: 250,
          downloadSpeed: 2048,
          timeRemaining: 65_000,
          numPeers: 3,
          history: [1, 2, 3],
          mediaCategory: 'movies',
        }),
        makeSnapshot({ infoHash: '2'.repeat(40), name: 'Stopped', dlPaused: true, maxRatio: 2, ratio: 0.5 }),
        makeSnapshot({ infoHash: '3'.repeat(40), name: 'Finished', done: true, progress: 1, downloaded: 1000 }),
      ],
    });
    assert.match(out, /Transfers \* \(1-3 of 3\)/);
    assert.match(out, /\[↓25%\] Downloading/);
    assert.match(out, /\[movies\]/);
    assert.match(out, /peers 3 · ratio 0\.00 · 2\.0 KB\/s ETA 1m 5s/);
    assert.match(out, /\[‖\] Stopped/);
    assert.match(out, /Paused · peers 0 · ratio 0\.50\/2/);
    assert.match(out, /\[✓\] Finished/);
    assert.match(out, /Complete/);
  });

  it('scrolls to keep the selection visible', () => {
    const snaps = Array.from({ length: 6 }, (_, i) =>
      makeSnapshot({ infoHash: String(i).repeat(40), name: `T${i}` })
    );
    const out = draw({ snaps, selectedIndex: 5, focused: true, visibleRows: 2 });
    assert.match(out, /\(5-6 of 6\)/);
    assert.match(out, /T5/);
    assert.doesNotMatch(out, /T0/);
  });

  it('shortens long download paths', () => {
    const out = draw({ snaps: [makeSnapshot({ downloadPath: `/very/${'long/'.repeat(20)}end` })] });
    assert.match(out, /→ …/);
  });
});
