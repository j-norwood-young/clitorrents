import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { render } from 'ink-testing-library';
import { Sparkline } from './sparkline.js';

const frame = (values: number[], width: number): string => {
  const r = render(<Sparkline values={values} width={width} />);
  const out = r.lastFrame() ?? '';
  r.unmount();
  return out;
};

describe('Sparkline', () => {
  it('renders a dot when there is no data', () => {
    assert.equal(frame([], 5), '·');
  });

  it('scales values to block heights', () => {
    assert.equal(frame([0, 50, 100], 10), '▁▄█');
  });

  it('keeps only the most recent `width` samples', () => {
    assert.equal(frame([100, 0, 0, 100], 2), '▁█');
  });

  it('renders flat zero traffic as the lowest block', () => {
    assert.equal(frame([0, 0], 2), '▁▁');
  });
});
