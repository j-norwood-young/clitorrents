import type { AppView, FocusPane } from './list-utils.js';

export type HotkeyHelpContext = {
  view: AppView;
  focus: FocusPane;
  configEditing: boolean;
  configPickerOpen: boolean;
  compact?: boolean;
};

const GLOBAL = 'Tab / Shift+Tab pane · Ctrl+O settings · Ctrl+Q quit';
const LIMITS = ',/. DL cap · <> UL cap · { } default ratio';

export function getHotkeyHelp(ctx: HotkeyHelpContext): string {
  const { view, focus, configEditing, configPickerOpen, compact } = ctx;

  if (view.kind === 'config') {
    if (configPickerOpen) {
      return compact
        ? '↑↓ · Enter confirm · Esc cancel · Ctrl+Q quit'
        : '↑↓ choose option · Enter confirm · Esc cancel picker · Ctrl+Q quit';
    }
    if (configEditing) {
      return compact
        ? 'Enter save · Esc cancel · Ctrl+Q quit'
        : 'Type value · Enter save field · Esc cancel edit · Ctrl+Q quit';
    }
    return compact
      ? '↑↓ · Enter · Space · Esc save · Ctrl+Q quit'
      : `↑↓ field · Enter edit/choose · Space toggle bool · Esc save & back · ${GLOBAL}`;
  }

  if (view.kind === 'detail') {
    return compact
      ? 'Esc · p · o · [ ] · Ctrl+O · Ctrl+Q'
      : `Esc back · p pause/resume · o open folder · [ ] ratio · ${GLOBAL}`;
  }

  switch (focus) {
    case 'search':
      return compact
        ? 'Enter search · Tab · Ctrl+O · Ctrl+Q'
        : `Type query · Enter search · ${GLOBAL} · ${LIMITS}`;
    case 'results':
      return compact
        ? '↑↓ · Enter add · Tab · Ctrl+O · Ctrl+Q'
        : `↑↓ navigate · Enter download · ${GLOBAL} · ${LIMITS}`;
    case 'transfers':
      return compact
        ? '↑↓ · Enter · p · o · x · Tab · Ctrl+O · Ctrl+Q'
        : `↑↓ navigate · Enter detail · p pause · o open · x remove · X wipe · [ ] ratio · ${GLOBAL} · ${LIMITS}`;
    default:
      return GLOBAL;
  }
}
