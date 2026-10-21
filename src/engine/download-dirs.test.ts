import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { makeConfig } from '../test/helpers.js';
import { downloadDirsFor, ensureWritableDir, findDownloadDirProblems } from './download-dirs.js';

// Root ignores permission bits, so chmod can't make a folder unwritable.
const skipAsRoot = process.getuid?.() === 0 ? 'running as root' : false;

describe('download folder checks', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clitorrents-dirs-'));
  });

  afterEach(() => {
    fs.chmodSync(tmp, 0o700);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('creates a missing folder', () => {
    const dir = path.join(tmp, 'a', 'b');
    ensureWritableDir(dir);
    assert.ok(fs.statSync(dir).isDirectory());
  });

  it('rejects a read-only folder with a readable message', { skip: skipAsRoot }, () => {
    fs.chmodSync(tmp, 0o500);
    assert.throws(() => ensureWritableDir(tmp), /Download folder is not writable: .*\(EACCES\)/);
  });

  it('rejects a folder that cannot be created', { skip: skipAsRoot }, () => {
    fs.chmodSync(tmp, 0o500);
    assert.throws(() => ensureWritableDir(path.join(tmp, 'child')), /not writable: .*child/);
  });

  it('checks enabled category folders as well as the base folder', { skip: skipAsRoot }, () => {
    const base = path.join(tmp, 'base');
    const locked = path.join(tmp, 'locked');
    fs.mkdirSync(locked);
    fs.chmodSync(locked, 0o500);
    const config = makeConfig({
      categories: { enabled: true, movies: locked, tv: base },
    });
    assert.deepEqual(downloadDirsFor(config, base), [base, locked]);
    const problems = findDownloadDirProblems(config, base);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /locked/);
    fs.chmodSync(locked, 0o700);
  });

  it('ignores category folders when categories are disabled', () => {
    const config = makeConfig({ categories: { enabled: false, movies: '/nope' } });
    assert.deepEqual(downloadDirsFor(config, tmp), [tmp]);
  });
});
