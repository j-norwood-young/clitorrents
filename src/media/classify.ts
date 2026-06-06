import path from 'node:path';
import type { AppConfig } from '../config.js';
import { resolveBaseDir } from '../config.js';

export type MediaCategory = 'tv' | 'movies' | 'music' | 'unknown';

export type DownloadPlan = {
  category: MediaCategory;
  dir: string;
};

const TV_PATTERNS = [
  /\bS\d{1,2}E\d{1,2}\b/i,
  /\bS\d{1,2}\b(?=.*\b(1080p|720p|2160p|4k|web-?dl|hdtv)\b)/i,
  /\b\d{1,2}x\d{1,2}\b/i,
  /\bseason\s*\d+/i,
  /\bseries\b/i,
  /\bcomplete\s+series\b/i,
  /\bmini\s*series\b/i,
];

const MUSIC_PATTERNS = [
  /\bflac\b/i,
  /\bmp3\b/i,
  /\baac\b/i,
  /\blossless\b/i,
  /\b\d{3}\s*kbps\b/i,
  /\bdiscography\b/i,
  /\bdeluxe\s+edition\b/i,
  /\balbum\b/i,
  /\b(?:\d{1,2}cd|multi-?cd)\b/i,
  /\bsingle\b/i,
  /\bvinyl\b/i,
  /\baudiobook\b/i,
  /\.(mp3|flac|aac|m4a|wav|ogg)(\b|$)/i,
];

const MOVIE_PATTERNS = [
  /\(\d{4}\)/,
  /\b\d{4}\b.*\b(1080p|720p|2160p|4k|bluray|web-?dl|webrip|hdtv|remux)\b/i,
  /\b(1080p|720p|2160p|4k|bluray|web-?dl|webrip|hdtv|remux)\b.*\b\d{4}\b/i,
  /\bmovie\b/i,
  /\bfilm\b/i,
  /\bdocumentary\b/i,
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

  if (/\b(1080p|720p|2160p|4k|bluray|web-?dl|remux)\b/i.test(n)) {
    return 'movies';
  }

  return 'unknown';
}

/** Default category folders under a base download directory. */
export function defaultCategoryPaths(baseDir: string): {
  tv: string;
  movies: string;
  music: string;
} {
  return {
    tv: path.join(baseDir, 'TV'),
    movies: path.join(baseDir, 'Movies'),
    music: path.join(baseDir, 'Music'),
  };
}

function categoryDir(
  category: MediaCategory,
  cats: NonNullable<AppConfig['categories']>
): string | undefined {
  switch (category) {
    case 'tv':
      return cats.tv;
    case 'movies':
      return cats.movies;
    case 'music':
      return cats.music;
    case 'unknown':
      return cats.unknown;
    default:
      return undefined;
  }
}

/** Resolve download directory at add time (fixed for the life of the torrent). */
export function resolveDownloadDir(
  name: string,
  config: AppConfig,
  baseDir?: string
): string {
  return planDownloadLocation(name, config, baseDir).dir;
}

/** Preview category and destination before adding a torrent. */
export function planDownloadLocation(
  name: string,
  config: AppConfig,
  baseDir?: string
): DownloadPlan {
  const base = baseDir ?? resolveBaseDir(config);
  const category = classifyMedia(name);
  const cats = config.categories;

  if (!cats?.enabled) {
    return { category, dir: base };
  }

  const dir = categoryDir(category, cats);
  if (dir) return { category, dir: path.resolve(dir) };
  return { category, dir: base };
}

export function formatCategoryLabel(category: MediaCategory): string {
  switch (category) {
    case 'tv':
      return 'TV';
    case 'movies':
      return 'Movie';
    case 'music':
      return 'Music';
    default:
      return 'Other';
  }
}
