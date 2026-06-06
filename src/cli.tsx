#!/usr/bin/env node
import { render } from 'ink';
import { App } from './app.js';
import { ensureConfigExists } from './config.js';
import { parseCliArgs, printCliHelp } from './cli/parse-args.js';
import { runSearchCommand } from './cli/search-cmd.js';
import { runDownloadCommand } from './cli/download-cmd.js';
import { runMcpServer } from './mcp/server.js';
import { runDaemonCommand } from './cli/daemon-cmd.js';
import { runStopDaemonCommand } from './cli/stop-daemon-cmd.js';
import { runStatusCommand } from './cli/status-cmd.js';
import { connectEngine } from './daemon/ensure-daemon.js';

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.command === 'help') {
    printCliHelp();
    process.exit(0);
  }

  const config = ensureConfigExists();

  if (parsed.command === 'search') {
    const code = await runSearchCommand(parsed.query, config, {
      provider: parsed.provider,
      limit: parsed.limit,
    });
    process.exit(code);
  }

  if (parsed.command === 'daemon') {
    await runDaemonCommand(config);
    return;
  }

  if (parsed.command === 'stop') {
    const code = await runStopDaemonCommand(config);
    process.exit(code);
  }

  if (parsed.command === 'status') {
    const code = await runStatusCommand(config);
    process.exit(code);
  }

  if (parsed.command === 'download') {
    const engine = await connectEngine(config);
    const code = await runDownloadCommand(engine, config, parsed);
    engine.destroy();
    process.exit(code);
  }

  if (parsed.command === 'mcp') {
    const engine = await connectEngine(config);
    await runMcpServer(engine, config);
    return;
  }

  const engine = await connectEngine(config);
  render(<App engine={engine} initialConfig={config} />);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
