import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { makeTempDir, waitFor } from '../test/helpers.js';
import { sha1File } from '../test/engine-fixture.js';
import { startMockTorrentServer, type MockTorrentServer } from '../test/mock-torrent-server.js';

/**
 * Drives the built CLI (dist/cli.js) as a user would. Run via `npm run test:e2e`,
 * which builds first.
 */
const CLI = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

describe('clitorrents CLI (spawned)', () => {
  let swarm: MockTorrentServer;
  let configHome: ReturnType<typeof makeTempDir>;
  let downloads: ReturnType<typeof makeTempDir>;
  let port: number;
  let daemon: ChildProcess | undefined;

  const env = (extra: Record<string, string> = {}) => ({
    ...process.env,
    XDG_CONFIG_HOME: configHome.dir,
    CLITORRENTS_MOCK_SERVER: swarm.url,
    ...extra,
  });

  const run = (args: string[], timeout = 30_000) =>
    new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      execFile(process.execPath, [CLI, ...args], { env: env(), timeout }, (err, stdout, stderr) => {
        // execFile puts the exit code on err.code (a string code means it never ran).
        const code = err ? (err as { code?: unknown }).code : 0;
        resolve({ code: typeof code === 'number' ? code : 1, stdout, stderr });
      });
    });

  before(async () => {
    assert.ok(fs.existsSync(CLI), 'dist/cli.js missing — run `npm run build` (npm run test:e2e does this)');
    swarm = await startMockTorrentServer();
    configHome = makeTempDir('clitorrents-e2e-cfg-');
    downloads = makeTempDir('clitorrents-e2e-dl-');
    port = await freePort();
    const cfgDir = path.join(configHome.dir, 'clitorrents');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(
      path.join(cfgDir, 'config.json'),
      JSON.stringify({ downloadDir: downloads.dir, daemon: { host: '127.0.0.1', port } })
    );
  });

  after(async () => {
    if (daemon && daemon.exitCode === null) {
      daemon.kill('SIGKILL');
    }
    await swarm.close();
    configHome.cleanup();
    downloads.cleanup();
  });

  it('help prints usage and exits 0', async () => {
    const { code, stdout } = await run(['help']);
    assert.equal(code, 0);
    assert.match(stdout, /clitorrents/);
    assert.match(stdout, /download/);
  });

  it('status exits 1 when no daemon is running', async () => {
    const { code, stdout } = await run(['status']);
    assert.equal(code, 1);
    assert.match(stdout, /not running/);
  });

  it('search uses the mock provider from CLITORRENTS_MOCK_SERVER', async () => {
    const { code, stdout } = await run(['search', 'mock']);
    assert.equal(code, 0);
    assert.match(stdout, /# 2 results \(MockServer: 2\)/);
  });

  it('daemon starts, takes the pid lock and reports status', async () => {
    daemon = spawn(process.execPath, [CLI, 'daemon'], { env: env(), stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    daemon.stderr!.on('data', (c) => (stderr += String(c)));
    await waitFor(() => stderr.includes('listening'), { timeoutMs: 15_000, message: 'daemon listening' });

    const pidFile = path.join(configHome.dir, 'clitorrents', 'daemon.pid');
    assert.equal(fs.readFileSync(pidFile, 'utf8').trim(), String(daemon.pid));

    const { code, stdout } = await run(['status']);
    assert.equal(code, 0);
    assert.match(stdout, /daemon: running/);
    assert.match(stdout, new RegExp(`PID:\\s+${daemon.pid}\\n`));

    const second = await run(['daemon'], 10_000);
    assert.notEqual(second.code, 0);
    assert.match(second.stderr, /already running/);
  });

  it('download searches the mock provider and completes through the daemon', async () => {
    const { code, stdout } = await run(['download', 'movie'], 60_000);
    assert.equal(code, 0, stdout);
    assert.match(stdout, /Selected: Mock\.Movie\.2024\.1080p\.mkv/);
    assert.match(stdout, /Done — /);
    const movie = swarm.torrents[0]!;
    assert.equal(sha1File(path.join(downloads.dir, movie.name)), movie.sha1s[movie.name]);
  });

  it('stop shuts the daemon down and removes the pid file', async () => {
    const exited = new Promise<number | null>((resolve) => daemon!.once('exit', (c) => resolve(c)));
    const { code, stdout } = await run(['stop']);
    assert.equal(code, 0);
    assert.match(stdout, /Daemon stopped\./);
    assert.equal(await exited, 0);
    assert.equal(fs.existsSync(path.join(configHome.dir, 'clitorrents', 'daemon.pid')), false);

    const status = await run(['status']);
    assert.equal(status.code, 1);
  });
});
