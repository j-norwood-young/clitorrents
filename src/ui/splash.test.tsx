import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { render } from 'ink-testing-library';
import { Splash } from './splash.js';
import { waitFor } from '../test/helpers.js';

describe('Splash', () => {
  it('shows the loading spinner and calls onDone after minMs', async () => {
    let done = 0;
    const r = render(<Splash minMs={50} onDone={() => done++} />);
    try {
      assert.match(r.lastFrame() ?? '', /Loading torrent engine/);
      assert.equal(done, 0);
      await waitFor(() => done === 1, { timeoutMs: 2000, message: 'onDone' });
    } finally {
      r.unmount();
    }
  });
});
