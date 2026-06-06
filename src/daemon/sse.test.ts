import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatSse, parseSseBlock } from './sse.js';

describe('formatSse', () => {
  it('formats event blocks', () => {
    assert.equal(formatSse('state', { ok: true }), 'event: state\ndata: {"ok":true}\n\n');
  });
});

describe('parseSseBlock', () => {
  it('parses event and JSON data', () => {
    const parsed = parseSseBlock('event: state\ndata: {"snapshots":[]}');
    assert.deepEqual(parsed, { event: 'state', data: { snapshots: [] } });
  });

  it('returns null for empty blocks', () => {
    assert.equal(parseSseBlock(''), null);
  });
});
