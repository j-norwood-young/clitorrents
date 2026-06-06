import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCliArgs } from './parse-args.js';

describe('parseCliArgs', () => {
  it('defaults to tui with no args', () => {
    assert.deepEqual(parseCliArgs([]), { command: 'tui' });
  });

  it('parses search command', () => {
    const parsed = parseCliArgs(['search', 'ubuntu', 'iso']);
    assert.equal(parsed.command, 'search');
    if (parsed.command === 'search') {
      assert.equal(parsed.query, 'ubuntu iso');
    }
  });

  it('parses search flags', () => {
    const parsed = parseCliArgs(['search', 'test', '--provider', '1337x', '--limit', '5']);
    assert.equal(parsed.command, 'search');
    if (parsed.command === 'search') {
      assert.equal(parsed.provider, '1337x');
      assert.equal(parsed.limit, 5);
    }
  });

  it('parses download command', () => {
    const parsed = parseCliArgs(['download', 'magnet:?xt=urn:btih:abc']);
    assert.equal(parsed.command, 'download');
    if (parsed.command === 'download') {
      assert.equal(parsed.target, 'magnet:?xt=urn:btih:abc');
    }
  });

  it('parses mcp command', () => {
    assert.deepEqual(parseCliArgs(['mcp']), { command: 'mcp' });
  });

  it('parses daemon command', () => {
    assert.deepEqual(parseCliArgs(['daemon']), { command: 'daemon' });
  });

  it('parses stop command', () => {
    assert.deepEqual(parseCliArgs(['stop']), { command: 'stop' });
  });

  it('parses status command', () => {
    assert.deepEqual(parseCliArgs(['status']), { command: 'status' });
  });
});
