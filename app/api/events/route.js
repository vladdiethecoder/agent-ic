import { readAudit, subscribeAuditStream } from '../../../lib/auditStore.js';

export const dynamic = 'force-dynamic';

const SSE_TIMEOUT_MS = 60_000;
const encoder = new TextEncoder();

function idSequence(id) {
  const match = String(id || '').match(/AUD-(\d+)/);
  return match ? Number(match[1]) : 0;
}

function parseSinceId(sinceId) {
  if (!sinceId) return -1;
  const seq = idSequence(sinceId);
  return Number.isFinite(seq) && seq > 0 ? seq : -1;
}

function sendEvent(controller, entry) {
  try {
    controller.enqueue(encoder.encode(`event: audit\ndata: ${JSON.stringify(entry)}\n\n`));
  } catch {
    // Controller may be closed; ignore.
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sinceId = searchParams.get('sinceId');
  const sinceSeq = parseSinceId(sinceId);

  const stream = new ReadableStream({
    start(controller) {
      let unsubscribe = null;

      let timeout = null;

      function cleanup() {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (timeout !== null) {
          clearTimeout(timeout);
          timeout = null;
        }
        try {
          request.signal.removeEventListener('abort', cleanup);
        } catch {
          // ignore
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      }

      // Replay historical rows newer than sinceId in chronological order.
      const existing = readAudit();
      const historical = existing
        .filter((entry) => idSequence(entry.id) > sinceSeq)
        .sort((a, b) => idSequence(a.id) - idSequence(b.id));
      for (const entry of historical) {
        sendEvent(controller, entry);
      }

      // Push future rows as they are appended.
      unsubscribe = subscribeAuditStream((entry) => {
        sendEvent(controller, entry);
      });

      // Close after timeout or when the client disconnects.
      timeout = setTimeout(cleanup, SSE_TIMEOUT_MS);
      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
