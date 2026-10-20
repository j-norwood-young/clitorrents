import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type OpenDeps = {
  platform: NodeJS.Platform;
  run: (cmd: string, args: string[]) => void;
};

const defaultDeps: OpenDeps = {
  platform: process.platform,
  run: (cmd, args) => execFile(cmd, args, () => {}),
};

/** Open file manager at folder, or reveal file (macOS). */
export function openDownloadPath(fileOrDir: string, deps: OpenDeps = defaultDeps): void {
  const resolved = path.resolve(fileOrDir);
  if (!fs.existsSync(resolved)) return;
  const stat = fs.statSync(resolved);
  const isDir = stat.isDirectory();
  if (deps.platform === 'darwin') {
    if (isDir) {
      deps.run('open', [resolved]);
    } else {
      deps.run('open', ['-R', resolved]);
    }
  } else if (deps.platform === 'win32') {
    deps.run('explorer.exe', [isDir ? resolved : path.dirname(resolved)]);
  } else {
    const dir = isDir ? resolved : path.dirname(resolved);
    deps.run('xdg-open', [dir]);
  }
}
