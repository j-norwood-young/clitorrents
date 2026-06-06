import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeModalPlacement } from './modal.js';

describe('computeModalPlacement', () => {
  it('centers modal within area', () => {
    const p = computeModalPlacement(80, 20, 40, 10);
    assert.equal(p.width, 40);
    assert.equal(p.height, 10);
    assert.equal(p.marginLeft, 20);
    assert.equal(p.marginTop, 5);
  });

  it('clamps to area bounds', () => {
    const p = computeModalPlacement(30, 10, 100, 20);
    assert.equal(p.width, 28);
    assert.equal(p.height, 8);
  });
});
