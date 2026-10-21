import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '../config.js';

/** Create `dir` if needed and make sure we can write files into it; throws a readable error otherwise. */
export function ensureWritableDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK | fs.constants.X_OK);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new Error(`Download folder is not writable: ${dir}${code ? ` (${code})` : ''}`);
  }
}

/** Every folder a new download could land in: the base dir plus any enabled category dirs. */
export function downloadDirsFor(config: AppConfig, baseDir: string): string[] {
  const dirs = [baseDir];
  const cats = config.categories;
  if (cats?.enabled) {
    for (const dir of [cats.tv, cats.movies, cats.music, cats.unknown]) {
      if (dir) dirs.push(path.resolve(dir));
    }
  }
  return [...new Set(dirs)];
}

/** One message per download folder that is missing and can't be created, or isn't writable. */
export function findDownloadDirProblems(config: AppConfig, baseDir: string): string[] {
  const problems: string[] = [];
  for (const dir of downloadDirsFor(config, baseDir)) {
    try {
      ensureWritableDir(dir);
    } catch (err) {
      problems.push((err as Error).message);
    }
  }
  return problems;
}
