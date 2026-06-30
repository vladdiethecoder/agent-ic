import { NextResponse } from 'next/server.js';
import { requireApiAccessAsync } from '../../../lib/authz.js';
import { evaluateAlerts } from '../../../lib/alerting.js';
import { getMetricsSnapshot } from '../../../lib/observability.js';
import { evaluateSLOs } from '../../../lib/slo.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_metrics');
  if (!access.ok) return access.response;
  const snapshot = getMetricsSnapshot();
  return NextResponse.json({ ok: true, slo: evaluateSLOs({ snapshot, alerts: evaluateAlerts({ snapshot }) }) });
}
