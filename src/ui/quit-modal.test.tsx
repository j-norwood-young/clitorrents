import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
import { QuitModal } from './quit-modal.js';
import { Modal } from './modal.js';

describe('Modal', () => {
  it('renders the title and children', () => {
    // Modals are absolutely positioned, so they need a sized parent to render into.
    const r = render(
      <Box width={80} height={20}>
        <Modal title="Hello" areaWidth={80} areaHeight={20} modalWidth={40} modalHeight={8}>
          <Text>Body text</Text>
        </Modal>
      </Box>
    );
    const out = r.lastFrame() ?? '';
    r.unmount();
    assert.match(out, /Hello/);
    assert.match(out, /Body text/);
  });
});

describe('QuitModal', () => {
  it('shows the message and marks completed vs current steps', () => {
    const r = render(
      <Box width={80} height={24}>
        <QuitModal
          state={{ message: 'Shutting down…', log: ['Closed SSE', 'Stopping engine'] }}
          areaWidth={80}
          areaHeight={24}
        />
      </Box>
    );
    const out = r.lastFrame() ?? '';
    r.unmount();
    assert.match(out, /Quitting/);
    assert.match(out, /Shutting down…/);
    assert.match(out, /keep running in the background daemon/);
    assert.match(out, /✓ Closed SSE/);
    assert.match(out, /▸ Stopping engine/);
  });
});
