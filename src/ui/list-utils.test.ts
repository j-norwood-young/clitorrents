import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeMainLayout,
  formatTransferStatusBadge,
  resultsPageCount,
  resultsPageItemCount,
} from './list-utils.js';

describe('results pagination', () => {
  it('counts pages from total and page size', () => {
    assert.equal(resultsPageCount(0, 5), 1);
    assert.equal(resultsPageCount(10, 5), 2);
    assert.equal(resultsPageCount(11, 5), 3);
  });

  it('counts items on each page', () => {
    assert.equal(resultsPageItemCount(0, 10, 5), 5);
    assert.equal(resultsPageItemCount(1, 10, 5), 5);
    assert.equal(resultsPageItemCount(2, 11, 5), 1);
  });
});

describe('formatTransferStatusBadge', () => {
  it('shows paused, done, and downloading badges', () => {
    assert.equal(
      formatTransferStatusBadge({ done: false, paused: true, dlPaused: false, progress: 0.5 }),
      '[‖]'
    );
    assert.equal(
      formatTransferStatusBadge({ done: false, paused: false, dlPaused: true, progress: 0.5 }),
      '[‖]'
    );
    assert.equal(
      formatTransferStatusBadge({ done: true, paused: false, dlPaused: false, progress: 1 }),
      '[✓]'
    );
    assert.equal(
      formatTransferStatusBadge({ done: false, paused: false, dlPaused: false, progress: 0.42 }),
      '[↓42%]'
    );
  });
});

describe('computeMainLayout', () => {
  it('derives visible row counts from terminal size', () => {
    const layout = computeMainLayout(24, 80);
    assert.ok(layout.resultsVisible >= 3);
    assert.ok(layout.transfersVisible >= 2);
    assert.ok(layout.mainContentHeight >= 6);
  });
});
