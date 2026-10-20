import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { openDownloadPath } from './open-location.js';
import { makeTempDir } from '../test/helpers.js';

describe('openDownloadPath', () => {
  const tmp = makeTempDir();
  const file = path.join(tmp.dir, 'movie.mkv');
  fs.writeFileSync(file, 'x');
  after(tmp.cleanup);

  const record = (platform: NodeJS.Platform) => {
    const calls: [string, string[]][] = [];
    return { calls, deps: { platform, run: (cmd: string, args: string[]) => calls.push([cmd, args]) } };
  };

  it('does nothing for missing paths', () => {
    const r = record('darwin');
    openDownloadPath(path.join(tmp.dir, 'missing'), r.deps);
    assert.deepEqual(r.calls, []);
  });

  it('opens folders and reveals files on macOS', () => {
    const r = record('darwin');
    openDownloadPath(tmp.dir, r.deps);
    openDownloadPath(file, r.deps);
    assert.deepEqual(r.calls, [
      ['open', [tmp.dir]],
      ['open', ['-R', file]],
    ]);
  });

  it('uses explorer.exe on Windows and xdg-open elsewhere, opening the parent for files', () => {
    const win = record('win32');
    openDownloadPath(file, win.deps);
    assert.deepEqual(win.calls, [['explorer.exe', [tmp.dir]]]);

    const linux = record('linux');
    openDownloadPath(tmp.dir, linux.deps);
    openDownloadPath(file, linux.deps);
    assert.deepEqual(linux.calls, [
      ['xdg-open', [tmp.dir]],
      ['xdg-open', [tmp.dir]],
    ]);
  });
});
