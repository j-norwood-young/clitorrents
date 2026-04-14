import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Open file manager at folder, or reveal file (macOS). */
export function openDownloadPath(fileOrDir: string): void {
  const resolved = path.resolve(fileOrDir);
  if (!fs.existsSync(resolved)) return;
  const stat = fs.statSync(resolved);
  const isDir = stat.isDirectory();
  if (process.platform === 'darwin') {
    if (isDir) {
      execFile('open', [resolved], () => {});
    } else {
      execFile('open', ['-R', resolved], () => {});
    }
  } else if (process.platform === 'win32') {
    execFile('explorer.exe', [isDir ? resolved : path.dirname(resolved)], () => {});
  } else {
    const dir = isDir ? resolved : path.dirname(resolved);
    execFile('xdg-open', [dir], () => {});
  }
}
