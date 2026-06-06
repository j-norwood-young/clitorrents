import path from 'node:path';
import type { AppConfig } from '../config.js';
import { resolveBaseDir } from '../config.js';

export type MediaCategory = 'tv' | 'movies' | 'music' | 'unknown';

const TV_PATTERNS = [
  /\bS\d{1,2}E\d{1,2}\b/i,
  /\b\d{1,2}x\d{1,2}\b/i,
  /\bseason\s*\d+/i,
  /\bseries\b/i,
  /\bcomplete\s+series\b/i,
];

const MUSIC_PATTERNS = [
  /\bflac\b/i,
  /\bmp3\b/i,
  /\baac\b/i,
  /\b\d{3}\s*kbps\b/i,
  /\bdiscography\b/i,
  /\balbum\b/i,
  /\bEP\b/,
  /\bsingle\b/i,
  /\bvinyl\b/i,
  /\.(mp3|flac|aac|m4a|wav|ogg)(\b|$)/i,
];

const MOVIE_PATTERNS = [
  /\(\d{4}\)/,
  /\b\d{4}\b.*\b(1080p|720p|2160p|4k|bluray|web-?dl|webrip|hdtv)\b/i,
  /\b(1080p|720p|2160p|4k|bluray|web-?dl|webrip|hdtv)\b.*\b\d{4}\b/i,
  /\bmovie\b/i,
  /\bfilm\b/i,
];

/** Classify torrent name into TV / movies / music / unknown (name-based heuristics). */
export function classifyMedia(name: string): MediaCategory {
  const n = name.trim();
  if (!n) return 'unknown';

  for (const re of TV_PATTERNS) {
    if (re.test(n)) return 'tv';
  }
  for (const re of MUSIC_PATTERNS) {
    if (re.test(n)) return 'music';
  }
  for (const re of MOVIE_PATTERNS) {
    if (re.test(n)) return 'movies';
  }

  // Resolution tags without TV episode markers often indicate movies
  if (/\b(1080p|720p|2160p|4k|bluray|web-?dl)\b/i.test(n)) {
    return 'movies';
  }

  return 'unknown';
}

/** Resolve download directory at add time (fixed for the life of the torrent). */
export function resolveDownloadDir(
  name: string,
  config: AppConfig,
  baseDir?: string
): string {
  const base = baseDir ?? resolveBaseDir(config);
  const cats = config.categories;
  if (!cats?.enabled) return base;

  const category = classifyMedia(name);
  const dir =
    category === 'tv'
      ? cats.tv
      : category === 'movies'
        ? cats.movies
        : category === 'music'
          ? cats.music
          : undefined;

  if (dir) return path.resolve(dir);
  return base;
}
