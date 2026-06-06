/** Seed ratio presets for per-torrent and global defaults */
export const RATIO_PRESETS: (number | null)[] = [null, 0.5, 1, 1.5, 2, 5];

/** Global download/upload limit presets in bytes/sec; -1 = unlimited */
export const SPEED_LIMIT_PRESETS = {
  download: [-1, 0, 512_000, 1_000_000, 5_000_000, 10_000_000] as const,
  upload: [-1, 0, 128_000, 512_000, 1_000_000, 5_000_000] as const,
};

export function cyclePreset<T>(presets: readonly T[], current: T): T {
  const idx = presets.findIndex((p) => p === current);
  const nextIdx = idx < 0 ? 0 : (idx + 1) % presets.length;
  return presets[nextIdx]!;
}

export function cyclePresetBackward<T>(presets: readonly T[], current: T): T {
  const idx = presets.findIndex((p) => p === current);
  const nextIdx = idx <= 0 ? presets.length - 1 : idx - 1;
  return presets[nextIdx]!;
}
