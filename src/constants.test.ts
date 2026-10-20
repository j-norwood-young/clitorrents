import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { cyclePreset, cyclePresetBackward, RATIO_PRESETS, SPEED_LIMIT_PRESETS, VERSION } from './constants.js';

describe('VERSION', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    assert.equal(VERSION, pkg.version);
  });
});

describe('cyclePreset', () => {
  it('steps forward and wraps around', () => {
    assert.equal(cyclePreset(RATIO_PRESETS, null), 0.5);
    assert.equal(cyclePreset(RATIO_PRESETS, 5), null);
  });

  it('starts at the first preset for unknown values', () => {
    assert.equal(cyclePreset(SPEED_LIMIT_PRESETS.download, 1234), -1);
  });
});

describe('cyclePresetBackward', () => {
  it('steps backward and wraps around', () => {
    assert.equal(cyclePresetBackward(RATIO_PRESETS, 0.5), null);
    assert.equal(cyclePresetBackward(RATIO_PRESETS, null), 5);
  });

  it('starts at the last preset for unknown values', () => {
    assert.equal(cyclePresetBackward(SPEED_LIMIT_PRESETS.upload, 1234), 5_000_000);
  });
});
