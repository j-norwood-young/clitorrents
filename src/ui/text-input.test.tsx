import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { render } from 'ink-testing-library';
import { SearchField } from './text-input.js';

describe('SearchField', () => {
  let unmount: (() => void) | undefined;

  afterEach(() => {
    unmount?.();
    unmount = undefined;
  });

  it('renders value with cursor', () => {
    const result = render(<SearchField value="hello" cursor={3} focused={true} />);
    unmount = result.unmount;
    assert.match(result.lastFrame() ?? '', /hello/);
    assert.match(result.lastFrame() ?? '', /Search/);
  });

  it('renders unfocused state', () => {
    const result = render(<SearchField value="query" cursor={5} focused={false} />);
    unmount = result.unmount;
    assert.match(result.lastFrame() ?? '', /query/);
  });
});
