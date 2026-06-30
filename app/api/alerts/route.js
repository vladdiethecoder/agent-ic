import { NextResponse } from 'next/server.js';
import { requireApiAccessAsync } from '../../../lib/authz.js';
import { evaluateAlerts } from '../../../lib/alerting.js';
import { getMetricsSnapshot } from '../../../lib/observability.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_audit_log');
  if (!access.ok) return access.response;
  return NextResponse.json({ ok: true, alerts: evaluateAlerts({ snapshot: getMetricsSnapshot() }) });
}
