import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pushSearchHistory, stepSearchHistory } from './search-history.js';
import { loadSearchHistory, saveSearchHistory } from '../config.js';
import { withTempConfigDir } from '../test/helpers.js';

describe('pushSearchHistory', () => {
  it('adds newest first and trims', () => {
    assert.deepEqual(pushSearchHistory(['a'], '  b '), ['b', 'a']);
  });

  it('ignores blank queries', () => {
    assert.deepEqual(pushSearchHistory(['a'], '   '), ['a']);
  });

  it('moves duplicates to the front', () => {
    assert.deepEqual(pushSearchHistory(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
  });

  it('caps length', () => {
    assert.deepEqual(pushSearchHistory(['a', 'b'], 'c', 2), ['c', 'a']);
  });
});

describe('stepSearchHistory', () => {
  const h = ['newest', 'older'];

  it('walks older from the draft', () => {
    assert.equal(stepSearchHistory(h, -1, 'older', '', ''), 0);
    assert.equal(stepSearchHistory(h, 0, 'older', 'newest', ''), 1);
    assert.equal(stepSearchHistory(h, 1, 'older', 'older', ''), null);
  });

  it('walks newer back to the draft', () => {
    assert.equal(stepSearchHistory(h, 1, 'newer', 'older', ''), 0);
    assert.equal(stepSearchHistory(h, 0, 'newer', 'newest', ''), -1);
    assert.equal(stepSearchHistory(h, -1, 'newer', '', ''), null);
  });

  it('skips the entry matching the just-searched text', () => {
    assert.equal(stepSearchHistory(h, -1, 'older', 'newest', 'newest'), 1);
  });

  it('skips matching entries going newer, but always allows the draft', () => {
    assert.equal(stepSearchHistory(['a', 'a2', 'b'], 2, 'newer', 'b', 'x'), 1);
    assert.equal(stepSearchHistory(['a', 'b'], 0, 'newer', 'a', 'a'), -1);
  });

  it('does nothing with empty history', () => {
    assert.equal(stepSearchHistory([], -1, 'older', '', ''), null);
  });
});

describe('search history persistence', () => {
  it('round-trips and tolerates a missing file', async () => {
    await withTempConfigDir(() => {
      assert.deepEqual(loadSearchHistory(), []);
      saveSearchHistory(['x', 'y']);
      assert.deepEqual(loadSearchHistory(), ['x', 'y']);
    });
  });
});
