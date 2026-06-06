import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { AppConfig } from '../config.js';
import { saveConfig } from '../config.js';
import type { TorrentEngine } from '../engine/torrent-engine.js';
import { getMagnetForTorrent, searchCliflixStyle } from '../search/cliflix-search.js';
import { resolveTorrentId } from '../search/resolve-torrent-id.js';

export async function runMcpServer(engine: TorrentEngine, config: AppConfig): Promise<void> {
  const server = new Server(
    { name: 'clitorrents', version: '0.3.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search',
        description: 'Search torrent providers for a query',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
            provider: { type: 'string' },
          },
          required: ['query'],
        },
      },
      {
        name: 'add_torrent',
        description: 'Add torrent by magnet, hash, URL, or search query',
        inputSchema: {
          type: 'object',
          properties: {
            target: { type: 'string' },
            name: { type: 'string' },
            dir: { type: 'string' },
            pick: { type: 'number' },
          },
          required: ['target'],
        },
      },
      {
        name: 'list_transfers',
        description: 'List active torrent transfers',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'transfer_status',
        description: 'Get status for a torrent by info hash',
        inputSchema: {
          type: 'object',
          properties: { infoHash: { type: 'string' } },
          required: ['infoHash'],
        },
      },
      {
        name: 'pause_torrent',
        inputSchema: {
          type: 'object',
          properties: { infoHash: { type: 'string' } },
          required: ['infoHash'],
        },
      },
      {
        name: 'resume_torrent',
        inputSchema: {
          type: 'object',
          properties: { infoHash: { type: 'string' } },
          required: ['infoHash'],
        },
      },
      {
        name: 'remove_torrent',
        inputSchema: {
          type: 'object',
          properties: {
            infoHash: { type: 'string' },
            destroyFiles: { type: 'boolean' },
          },
          required: ['infoHash'],
        },
      },
      {
        name: 'set_limits',
        inputSchema: {
          type: 'object',
          properties: {
            downloadBps: { type: 'number' },
            uploadBps: { type: 'number' },
            defaultMaxRatio: { type: ['number', 'null'] },
            persist: { type: 'boolean' },
          },
        },
      },
      {
        name: 'get_config',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'set_config',
        inputSchema: {
          type: 'object',
          properties: {
            config: { type: 'object' },
            persist: { type: 'boolean' },
          },
          required: ['config'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case 'search': {
          const query = String(a.query ?? '');
          const { rows, info } = await searchCliflixStyle(query, {
            limit: a.limit ? Number(a.limit) : config.torrents.limit,
            activeProvider: a.provider ? String(a.provider) : config.torrents.providers.active,
            availableProviders: config.torrents.providers.available,
            categoryByProvider: config.torrents.categoryByProvider,
          });
          return textResult({ rows, info });
        }
        case 'add_torrent': {
          const target = String(a.target ?? '');
          let magnet: string | Uint8Array;
          let torrentName = a.name ? String(a.name) : target;
          const isDirect =
            target.startsWith('magnet:') ||
            /^[a-f0-9]{40}$/i.test(target) ||
            /^https?:\/\//i.test(target);
          if (isDirect) {
            magnet = await resolveTorrentId(target);
          } else {
            const pick = Math.max(1, Number(a.pick ?? 1)) - 1;
            const { rows } = await searchCliflixStyle(target, {
              limit: config.torrents.limit,
              activeProvider: config.torrents.providers.active,
              availableProviders: config.torrents.providers.available,
              categoryByProvider: config.torrents.categoryByProvider,
            });
            const row = rows[pick];
            if (!row) throw new Error('No search result at pick index');
            torrentName = row.title;
            const m = await getMagnetForTorrent(row._torrent);
            if (!m) throw new Error('Could not resolve magnet');
            magnet = m;
          }
          await engine.add(magnet, {
            name: torrentName,
            downloadDir: a.dir ? String(a.dir) : undefined,
          });
          const snap = engine.getSnapshots().at(-1);
          return textResult(snap);
        }
        case 'list_transfers':
          return textResult(engine.getSnapshots());
        case 'transfer_status': {
          const ih = String(a.infoHash ?? '');
          const snap = engine.getSnapshots().find((s) => s.infoHash === ih);
          if (!snap) throw new Error('Torrent not found');
          return textResult(snap);
        }
        case 'pause_torrent':
          engine.pauseDownload(String(a.infoHash ?? ''));
          return textResult({ ok: true });
        case 'resume_torrent':
          engine.resumeDownload(String(a.infoHash ?? ''));
          return textResult({ ok: true });
        case 'remove_torrent':
          await engine.removeTorrent(String(a.infoHash ?? ''), Boolean(a.destroyFiles));
          return textResult({ ok: true });
        case 'set_limits':
          if (a.downloadBps !== undefined || a.uploadBps !== undefined) {
            engine.setGlobalLimits(
              a.downloadBps !== undefined ? Number(a.downloadBps) : config.globalDownloadLimitBps,
              a.uploadBps !== undefined ? Number(a.uploadBps) : config.globalUploadLimitBps,
              Boolean(a.persist)
            );
          }
          if (a.defaultMaxRatio !== undefined) {
            engine.setDefaultMaxRatio(
              a.defaultMaxRatio as number | null,
              Boolean(a.persist)
            );
          }
          return textResult(engine.getConfig());
        case 'get_config':
          return textResult(engine.getConfig());
        case 'set_config': {
          const next = { ...config, ...(a.config as AppConfig) };
          engine.setConfig(next, { persist: Boolean(a.persist) });
          if (Boolean(a.persist)) saveConfig(next);
          return textResult(next);
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: JSON.stringify({ error: msg }) }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function textResult(data: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
