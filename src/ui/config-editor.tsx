import React from 'react';
import { Box, Text } from 'ink';
import type { AppConfig } from '../config.js';
import { DEFAULT_TORRENT_PROVIDERS } from '../config.js';
import { formatSpeed } from '../utils/format.js';
import { RATIO_PRESETS, SPEED_LIMIT_PRESETS } from '../constants.js';
import { MODAL_PANEL_BG } from './modal.js';

export type ConfigField =
  | 'downloadDir'
  | 'activeProvider'
  | 'defaultMaxRatio'
  | 'globalDownloadLimitBps'
  | 'globalUploadLimitBps'
  | 'categoriesEnabled'
  | 'categoryTv'
  | 'categoryMovies'
  | 'categoryMusic'
  | 'categoryUnknown'
  | 'onReachLimit';

export type ConfigFieldKind = 'text' | 'boolean' | 'choice';

const FIELDS: ConfigField[] = [
  'downloadDir',
  'activeProvider',
  'defaultMaxRatio',
  'globalDownloadLimitBps',
  'globalUploadLimitBps',
  'categoriesEnabled',
  'categoryTv',
  'categoryMovies',
  'categoryMusic',
  'categoryUnknown',
  'onReachLimit',
];

export function getFieldKind(field: ConfigField): ConfigFieldKind {
  switch (field) {
    case 'categoriesEnabled':
      return 'boolean';
    case 'activeProvider':
    case 'defaultMaxRatio':
    case 'globalDownloadLimitBps':
    case 'globalUploadLimitBps':
    case 'onReachLimit':
      return 'choice';
    default:
      return 'text';
  }
}

export function getChoiceOptions(field: ConfigField, config: AppConfig): string[] {
  switch (field) {
    case 'activeProvider':
      return [...new Set([config.torrents.providers.active, ...config.torrents.providers.available, ...DEFAULT_TORRENT_PROVIDERS])];
    case 'defaultMaxRatio':
      return RATIO_PRESETS.map((r) => (r == null ? 'unlimited' : String(r)));
    case 'globalDownloadLimitBps':
      return SPEED_LIMIT_PRESETS.download.map(formatLimitOption);
    case 'globalUploadLimitBps':
      return SPEED_LIMIT_PRESETS.upload.map(formatLimitOption);
    case 'onReachLimit':
      return ['pause_seed', 'remove_keep_files'];
    default:
      return [];
  }
}

export function getChoiceIndex(field: ConfigField, config: AppConfig): number {
  const options = getChoiceOptions(field, config);
  const current = getChoiceDisplayValue(field, config);
  const idx = options.indexOf(current);
  return idx >= 0 ? idx : 0;
}

export function getChoiceDisplayValue(field: ConfigField, config: AppConfig): string {
  switch (field) {
    case 'activeProvider':
      return config.torrents.providers.active;
    case 'defaultMaxRatio':
      return config.defaultMaxRatio == null ? 'unlimited' : String(config.defaultMaxRatio);
    case 'globalDownloadLimitBps':
      return formatLimitOption(config.globalDownloadLimitBps);
    case 'globalUploadLimitBps':
      return formatLimitOption(config.globalUploadLimitBps);
    case 'onReachLimit':
      return config.onReachLimit;
    default:
      return '';
  }
}

export function applyChoiceSelection(
  field: ConfigField,
  config: AppConfig,
  optionLabel: string
): AppConfig {
  const next = { ...config };
  switch (field) {
    case 'activeProvider':
      next.torrents = {
        ...next.torrents,
        providers: { ...next.torrents.providers, active: optionLabel },
      };
      break;
    case 'defaultMaxRatio':
      next.defaultMaxRatio = optionLabel === 'unlimited' ? null : Number(optionLabel);
      break;
    case 'globalDownloadLimitBps':
      next.globalDownloadLimitBps = parseLimitOption(optionLabel);
      break;
    case 'globalUploadLimitBps':
      next.globalUploadLimitBps = parseLimitOption(optionLabel);
      break;
    case 'onReachLimit':
      next.onReachLimit = optionLabel as AppConfig['onReachLimit'];
      break;
  }
  return next;
}

function formatLimitOption(bps: number): string {
  if (bps < 0) return '∞ unlimited';
  if (bps === 0) return '0 blocked';
  return formatSpeed(bps);
}

function parseLimitOption(label: string): number {
  if (label.startsWith('∞') || label.includes('unlimited')) return -1;
  if (label.startsWith('0 blocked')) return 0;
  const presets = [...SPEED_LIMIT_PRESETS.download, ...SPEED_LIMIT_PRESETS.upload];
  for (const p of presets) {
    if (formatLimitOption(p) === label) return p;
  }
  return -1;
}

export function ConfigEditor({
  config,
  selectedField,
  editing,
  editingText,
  pickerOpen,
  pickerIndex,
  baseDirLive,
}: {
  config: AppConfig;
  selectedField: ConfigField;
  editing: boolean;
  editingText: string;
  pickerOpen: boolean;
  pickerIndex: number;
  baseDirLive: string;
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      {FIELDS.map((field) => (
        <ConfigRow
          key={field}
          field={field}
          config={config}
          selected={field === selectedField}
          editing={field === selectedField && editing}
          editingText={field === selectedField ? editingText : ''}
          pickerOpen={field === selectedField && pickerOpen}
          pickerIndex={field === selectedField ? pickerIndex : 0}
          baseDirLive={baseDirLive}
        />
      ))}
    </Box>
  );
}

function ConfigRow({
  field,
  config,
  selected,
  editing,
  editingText,
  pickerOpen,
  pickerIndex,
  baseDirLive,
}: {
  field: ConfigField;
  config: AppConfig;
  selected: boolean;
  editing: boolean;
  editingText: string;
  pickerOpen: boolean;
  pickerIndex: number;
  baseDirLive: string;
}): React.ReactNode {
  const label = fieldLabel(field);
  const kind = getFieldKind(field);
  let value = displayValue(field, config, editing, editingText);

  return (
    <Box flexDirection="column">
      <Text inverse={selected && !pickerOpen} backgroundColor={MODAL_PANEL_BG}>
        {selected ? '> ' : '  '}
        {label}: {value}
        {editing ? <Text color="cyan"> ▌</Text> : null}
        {selected && kind === 'choice' && !pickerOpen && !editing ? (
          <Text dimColor> (Enter to choose)</Text>
        ) : null}
        {selected && kind === 'boolean' ? (
          <Text dimColor> (Space to toggle)</Text>
        ) : null}
      </Text>
      {pickerOpen && selected ? (
        <Box flexDirection="column" marginLeft={2}>
          {getChoiceOptions(field, config).map((opt, i) => (
            <Text key={opt} inverse={i === pickerIndex} backgroundColor={MODAL_PANEL_BG}>
              {i === pickerIndex ? '▸ ' : '  '}
              {opt}
            </Text>
          ))}
        </Box>
      ) : null}
      {field === 'downloadDir' && selected && !pickerOpen ? (
        <Text dimColor>{'  '}effective: {config.downloadDir ?? baseDirLive}</Text>
      ) : null}
    </Box>
  );
}

function displayValue(
  field: ConfigField,
  config: AppConfig,
  editing: boolean,
  editingText: string
): string {
  if (editing) return editingText;

  switch (field) {
    case 'downloadDir':
      return config.downloadDir ?? '(empty = cwd)';
    case 'activeProvider':
      return config.torrents.providers.active;
    case 'defaultMaxRatio':
      return getChoiceDisplayValue(field, config);
    case 'globalDownloadLimitBps':
    case 'globalUploadLimitBps':
      return getChoiceDisplayValue(field, config);
    case 'categoriesEnabled':
      return config.categories?.enabled ? 'on' : 'off';
    case 'categoryTv':
      return config.categories?.tv ?? '(unset)';
    case 'categoryMovies':
      return config.categories?.movies ?? '(unset)';
    case 'categoryMusic':
      return config.categories?.music ?? '(unset)';
    case 'categoryUnknown':
      return config.categories?.unknown ?? '(unset = base dir)';
    case 'onReachLimit':
      return config.onReachLimit;
    default:
      return '';
  }
}

function fieldLabel(field: ConfigField): string {
  const labels: Record<ConfigField, string> = {
    downloadDir: 'Download dir (blank=cwd)',
    activeProvider: 'Active provider',
    defaultMaxRatio: 'Default max ratio',
    globalDownloadLimitBps: 'Global DL limit',
    globalUploadLimitBps: 'Global UL limit',
    categoriesEnabled: 'Category routing',
    categoryTv: 'TV dir',
    categoryMovies: 'Movies dir',
    categoryMusic: 'Music dir',
    categoryUnknown: 'Other dir',
    onReachLimit: 'On reach limit',
  };
  return labels[field];
}

export { FIELDS as CONFIG_FIELDS, RATIO_PRESETS, SPEED_LIMIT_PRESETS };
