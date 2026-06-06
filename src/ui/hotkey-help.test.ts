import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getHotkeyHelp } from './hotkey-help.js';

describe('getHotkeyHelp', () => {
  it('shows search keys when search pane focused', () => {
    const help = getHotkeyHelp({ view: { kind: 'main' }, focus: 'search', configEditing: false, configPickerOpen: false });
    assert.match(help, /Enter search/);
    assert.doesNotMatch(help, /Enter download/);
  });

  it('shows results keys when results pane focused', () => {
    const help = getHotkeyHelp({ view: { kind: 'main' }, focus: 'results', configEditing: false, configPickerOpen: false });
    assert.match(help, /Enter download/);
  });

  it('shows picker keys when config picker open', () => {
    const help = getHotkeyHelp({
      view: { kind: 'config' },
      focus: 'search',
      configEditing: false,
      configPickerOpen: true,
    });
    assert.match(help, /confirm/);
  });
});
