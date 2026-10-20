import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { render } from 'ink-testing-library';
import {
  applyChoiceSelection,
  CONFIG_FIELDS,
  ConfigEditor,
  getChoiceDisplayValue,
  getChoiceIndex,
  getChoiceOptions,
  getFieldKind,
} from './config-editor.js';
import { makeConfig } from '../test/helpers.js';

describe('config editor helpers', () => {
  it('classifies field kinds', () => {
    assert.equal(getFieldKind('categoriesEnabled'), 'boolean');
    assert.equal(getFieldKind('onReachLimit'), 'choice');
    assert.equal(getFieldKind('downloadDir'), 'text');
    assert.deepEqual(
      CONFIG_FIELDS.filter((f) => getFieldKind(f) === 'choice'),
      ['activeProvider', 'defaultMaxRatio', 'globalDownloadLimitBps', 'globalUploadLimitBps', 'onReachLimit']
    );
  });

  it('lists provider options with the active one first and no duplicates', () => {
    const cfg = makeConfig();
    const opts = getChoiceOptions('activeProvider', {
      ...cfg,
      torrents: { ...cfg.torrents, providers: { active: 'Custom', available: ['1337x'] } },
    });
    assert.equal(opts[0], 'Custom');
    assert.equal(new Set(opts).size, opts.length);
    assert.deepEqual(getChoiceOptions('downloadDir', cfg), []);
  });

  it('round-trips every choice option through display value and index', () => {
    const cfg = makeConfig();
    for (const field of CONFIG_FIELDS.filter((f) => getFieldKind(f) === 'choice')) {
      getChoiceOptions(field, cfg).forEach((label, i) => {
        const next = applyChoiceSelection(field, cfg, label);
        assert.equal(getChoiceDisplayValue(field, next), label, `${field}=${label}`);
        // The active provider is always listed first, so its index is always 0.
        assert.equal(getChoiceIndex(field, next), field === 'activeProvider' ? 0 : i, `${field} index`);
      });
    }
  });

  it('maps limit labels back to bytes per second', () => {
    const cfg = makeConfig();
    assert.equal(applyChoiceSelection('globalDownloadLimitBps', cfg, '∞ unlimited').globalDownloadLimitBps, -1);
    assert.equal(applyChoiceSelection('globalUploadLimitBps', cfg, '0 blocked').globalUploadLimitBps, 0);
    assert.equal(applyChoiceSelection('globalUploadLimitBps', cfg, 'garbage').globalUploadLimitBps, -1);
    assert.equal(applyChoiceSelection('defaultMaxRatio', cfg, 'unlimited').defaultMaxRatio, null);
  });

  it('defaults the index to 0 for values outside the presets', () => {
    assert.equal(getChoiceIndex('defaultMaxRatio', makeConfig({ defaultMaxRatio: 3.3 })), 0);
  });
});

describe('ConfigEditor', () => {
  const draw = (props: Partial<Parameters<typeof ConfigEditor>[0]> = {}) => {
    const r = render(
      <ConfigEditor
        config={makeConfig()}
        selectedField="downloadDir"
        editing={false}
        editingText=""
        pickerOpen={false}
        pickerIndex={0}
        baseDirLive="/live/base"
        {...props}
      />
    );
    const out = r.lastFrame() ?? '';
    r.unmount();
    return out;
  };

  it('renders every field with current values', () => {
    const out = draw();
    assert.match(out, /> Download dir \(blank=cwd\): \(empty = cwd\)/);
    assert.match(out, /effective: \/live\/base/);
    assert.match(out, /Active provider: 1337x/);
    assert.match(out, /Global DL limit: ∞ unlimited/);
    assert.match(out, /Category routing: off/);
    assert.match(out, /Other dir: \(unset = base dir\)/);
    assert.match(out, /On reach limit: pause_seed/);
  });

  it('shows edit text, choice hints, toggle hints and the picker', () => {
    assert.match(draw({ editing: true, editingText: '/typed' }), /Download dir \(blank=cwd\): \/typed ▌/);
    assert.match(draw({ selectedField: 'onReachLimit' }), /\(Enter to choose\)/);
    assert.match(draw({ selectedField: 'categoriesEnabled' }), /\(Space to toggle\)/);
    const picker = draw({ selectedField: 'onReachLimit', pickerOpen: true, pickerIndex: 1 });
    assert.match(picker, /▸ remove_keep_files/);
    assert.match(picker, / {2}pause_seed/);
  });
});
