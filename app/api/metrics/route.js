import { NextResponse } from 'next/server.js';
import { requireApiAccessAsync } from '../../../lib/authz.js';
import { getMetricsSnapshot, metricsAsPrometheus } from '../../../lib/observability.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_audit_log');
  if (!access.ok) return access.response;

  const snapshot = getMetricsSnapshot();
  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/plain')) {
    return new Response(metricsAsPrometheus(snapshot), {
      status: 200,
      headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' },
    });
  }

  return NextResponse.json({ ok: true, metrics: snapshot });
}
