import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { getTracePath } from '../../../lib/liveTrace.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const tracePath = getTracePath();
  const url = new URL(request.url);
  const since = Number(url.searchParams.get('since')) || 0;

  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-cache',
    'content-type': 'text/event-stream',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let lastSize = existsSync(tracePath) ? statSync(tracePath).size : 0;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => {
        if (closed) return;
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Replay existing events that are newer than `since`.
      try {
        const raw = existsSync(tracePath) ? await readFile(tracePath, 'utf8') : '';
        raw
          .split('\n')
          .filter(Boolean)
          .forEach((line) => {
            try {
              const event = JSON.parse(line);
              if (event.ts >= since) {
                send(event);
              }
            } catch {
              // skip malformed lines
            }
          });
      } catch {
        // ignore read errors
      }

      const interval = setInterval(() => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        try {
          const stats = existsSync(tracePath) ? statSync(tracePath) : null;
          if (!stats || stats.size === lastSize) return;

          const start = lastSize;
          lastSize = stats.size;

          const chunk = readChunk(tracePath, start, stats.size - start);
          chunk
            .split('\n')
            .filter(Boolean)
            .forEach((line) => {
              try {
                send(JSON.parse(line));
              } catch {
                // skip malformed lines
              }
            });
        } catch {
          // ignore tail errors
        }
      }, 500);

      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    },

    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: corsHeaders,
  });
}

function readChunk(path, start, length) {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, start);
    return buffer.toString('utf8');
  } finally {
    closeSync(fd);
  }
}
