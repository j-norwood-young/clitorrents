import type { ServerResponse } from 'node:http';

export type SseEvent = {
  event: string;
  data: unknown;
};

export function formatSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function writeSse(res: ServerResponse, event: string, data: unknown): void {
  res.write(formatSse(event, data));
}

export function broadcastSse(clients: ReadonlySet<ServerResponse>, event: string, data: unknown): void {
  const chunk = formatSse(event, data);
  for (const client of clients) {
    try {
      client.write(chunk);
    } catch {
      // client disconnected
    }
  }
}

/** Parse one SSE event block (lines between blank lines). */
export function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split('\n').filter((line) => line.length > 0);
  if (lines.length === 0) return null;
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) as unknown };
  } catch {
    return null;
  }
}
