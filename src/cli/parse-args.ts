export type ParsedCli =
  | { command: 'tui' }
  | { command: 'search'; query: string; provider?: string; limit?: number }
  | {
      command: 'download';
      target: string;
      dir?: string;
      provider?: string;
      ratio?: number | null;
      downloadLimit?: number;
      uploadLimit?: number;
      pick?: number;
    }
  | { command: 'mcp' }
  | { command: 'help' };

export function parseCliArgs(argv: string[]): ParsedCli {
  const args = [...argv];
  if (args.length === 0 || args[0] === 'tui') return { command: 'tui' };

  const cmd = args[0];
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') return { command: 'help' };

  if (cmd === 'mcp') return { command: 'mcp' };

  if (cmd === 'search') {
    const rest = collectFlags(args.slice(1));
    const query = rest.positional.join(' ').trim();
    if (!query) return { command: 'help' };
    return {
      command: 'search',
      query,
      provider: rest.flags.provider as string | undefined,
      limit: rest.flags.limit ? Number(rest.flags.limit) : undefined,
    };
  }

  if (cmd === 'download') {
    const rest = collectFlags(args.slice(1));
    const target = rest.positional.join(' ').trim();
    if (!target) return { command: 'help' };
    return {
      command: 'download',
      target,
      dir: rest.flags.dir as string | undefined,
      provider: rest.flags.provider as string | undefined,
      ratio: rest.flags.ratio !== undefined ? parseRatioFlag(String(rest.flags.ratio)) : undefined,
      downloadLimit: rest.flags['download-limit']
        ? Number(rest.flags['download-limit'])
        : undefined,
      uploadLimit: rest.flags['upload-limit'] ? Number(rest.flags['upload-limit']) : undefined,
      pick: rest.flags.pick ? Number(rest.flags.pick) : undefined,
    };
  }

  return { command: 'tui' };
}

function collectFlags(args: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const eq = key.indexOf('=');
      if (eq >= 0) {
        flags[key.slice(0, eq)] = key.slice(eq + 1);
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function parseRatioFlag(v: string): number | null {
  if (v === 'none' || v === 'null' || v === 'unlimited') return null;
  return Number(v);
}

export function printCliHelp(): void {
  console.log(`clitorrents — torrent search & download

Usage:
  clitorrents                    Launch TUI (default)
  clitorrents search <query>     Search and list results
  clitorrents download <target>  Download by query, magnet, hash, or .torrent URL
  clitorrents mcp                Start MCP server (stdio)

Search flags:
  --provider NAME    Active provider
  --limit N          Max results

Download flags:
  --dir PATH         Override download directory for this add
  --provider NAME    Provider when target is a search query
  --pick N           Pick Nth search result (default 1)
  --ratio N          Max seed ratio (use "none" for unlimited)
  --download-limit BPS   Global download limit bytes/sec (-1 = unlimited)
  --upload-limit BPS     Global upload limit bytes/sec
`);
}
