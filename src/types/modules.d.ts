declare module 'webtorrent' {
  import { EventEmitter } from 'node:events';

  export interface Torrent {
    infoHash: string;
    name: string;
    progress: number;
    downloadSpeed: number;
    uploadSpeed: number;
    numPeers: number;
    timeRemaining: number;
    downloaded: number;
    uploaded: number;
    length: number;
    ratio: number;
    path: string;
    done: boolean;
    paused: boolean;
    ready: boolean;
    pieces: unknown[];
    files: { path: string }[];
    once(ev: string, fn: (...args: unknown[]) => void): this;
    on(ev: string, fn: (...args: unknown[]) => void): this;
    deselect(start: number, end: number): void;
    select(start: number, end: number, priority?: number): void;
    pause(): void;
    resume(): void;
  }

  export default class WebTorrent extends EventEmitter {
    constructor(opts?: Record<string, unknown>);
    torrents: Torrent[];
    downloadSpeed: number;
    uploadSpeed: number;
    add(torrentId: unknown, opts?: Record<string, unknown>): Torrent;
    remove(torrent: Torrent, opts?: Record<string, unknown>): Promise<void>;
    destroy(): Promise<void>;
    throttleDownload(rate: number): void;
    throttleUpload(rate: number): void;
  }
}

declare module 'parse-torrent' {
  const parseTorrent: (id: unknown) => Promise<Record<string, unknown>>;
  export function toMagnetURI(parsed: Record<string, unknown>): string;
  export default parseTorrent;
}
