import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBytesCompact1, formatTransferProgress } from './format.js';

describe('formatBytesCompact1', () => {
  it('formats bytes without a decimal', () => {
    assert.equal(formatBytesCompact1(512), '512B');
  });

  it('formats KB and above with one decimal', () => {
    assert.equal(formatBytesCompact1(10_240), '10.0KB');
    assert.equal(formatBytesCompact1(Math.round(10.1 * 1024 ** 3)), '10.1GB');
  });
});

describe('formatTransferProgress', () => {
  it('shows downloaded and total compact sizes', () => {
    const total = Math.round(10.1 * 1024 ** 3);
    assert.equal(formatTransferProgress(10_486, total), '10.2KB/10.1GB');
  });
});
