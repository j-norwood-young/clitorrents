import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isQuitKey } from './keys.js';

describe('isQuitKey', () => {
  it('matches Ctrl+Q from Ink (input q + ctrl)', () => {
    assert.equal(isQuitKey('q', { ctrl: true }), true);
    assert.equal(isQuitKey('Q', { ctrl: true }), true);
  });

  it('matches raw control character', () => {
    assert.equal(isQuitKey('\x11', { ctrl: true }), true);
  });

  it('rejects plain q and other ctrl combos', () => {
    assert.equal(isQuitKey('q', { ctrl: false }), false);
    assert.equal(isQuitKey('c', { ctrl: true }), false);
  });
});
