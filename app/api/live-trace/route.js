import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { clearLiveTrace, getTracePath } from '../../../lib/liveTrace.js';
import { readJsonBody } from '../../../lib/validation.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromBody, tenantFromUrl } from '../../../lib/authz.js';
import { appendAudit } from '../../../lib/auditStore.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_audit_log');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;

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

export async function POST(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;
  const access = await requireApiAccessAsync(request, 'reset_trace');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromBody(body));
  if (!tenantScope.ok) return tenantScope.response;

  if (body.reset !== true || body.confirmReset !== 'AGENT_IC_TRACE_RESET') {
    return Response.json(
      { error: 'reset requires AGENT_IC_TRACE_RESET confirmation' },
      { status: 403 }
    );
  }

  clearLiveTrace();
  appendAudit({ ...authContext(access.principal), kind: 'admin', action: 'live_trace_reset', detail: 'Live trace reset with confirmation token' });
  return Response.json({ trace: [] });
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
