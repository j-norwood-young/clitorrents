#!/usr/bin/env node
import { ensureConfigExists } from './config.js';
import { parseCliArgs, printCliHelp } from './cli/parse-args.js';

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.command === 'help') {
    printCliHelp();
    process.exit(0);
  }

  const config = ensureConfigExists();

  if (parsed.command === 'search') {
    const { runSearchCommand } = await import('./cli/search-cmd.js');
    const code = await runSearchCommand(parsed.query, config, {
      provider: parsed.provider,
      limit: parsed.limit,
    });
    process.exit(code);
  }

  if (parsed.command === 'daemon') {
    const { runDaemonCommand } = await import('./cli/daemon-cmd.js');
    await runDaemonCommand(config);
    return;
  }

  if (parsed.command === 'stop') {
    const { runStopDaemonCommand } = await import('./cli/stop-daemon-cmd.js');
    const code = await runStopDaemonCommand(config);
    process.exit(code);
  }

  if (parsed.command === 'status') {
    const { runStatusCommand } = await import('./cli/status-cmd.js');
    const code = await runStatusCommand(config);
    process.exit(code);
  }

  if (parsed.command === 'download') {
    const { connectEngine } = await import('./daemon/ensure-daemon.js');
    const { runDownloadCommand } = await import('./cli/download-cmd.js');
    const engine = await connectEngine(config);
    const code = await runDownloadCommand(engine, config, parsed);
    engine.destroy();
    process.exit(code);
  }

  if (parsed.command === 'mcp') {
    const { connectEngine } = await import('./daemon/ensure-daemon.js');
    const { runMcpServer } = await import('./mcp/server.js');
    const engine = await connectEngine(config);
    await runMcpServer(engine, config);
    return;
  }

  const { connectEngine } = await import('./daemon/ensure-daemon.js');
  const { render } = await import('ink');
  const { App } = await import('./app.js');
  const engine = await connectEngine(config);
  render(<App engine={engine} initialConfig={config} />);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
