import { NextResponse } from 'next/server.js';
import { appendAudit } from '../../../../lib/auditStore.js';
import { authContext, requireApiAccessAsync } from '../../../../lib/authz.js';
import { exportTelemetry } from '../../../../lib/telemetryExport.js';
import { readJsonBody } from '../../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_metrics');
  if (!access.ok) return access.response;
  const result = await exportTelemetry({ dryRun: true });
  return NextResponse.json({ auth: authContext(access.principal), telemetry: result });
}

export async function POST(request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const access = await requireApiAccessAsync(request, 'view_metrics');
  if (!access.ok) return access.response;
  const dryRun = parsed.body?.dryRun === true;
  const endpoint = typeof parsed.body?.endpoint === 'string' ? parsed.body.endpoint : undefined;
  const result = await exportTelemetry({ endpoint, dryRun });
  appendAudit({
    ...authContext(access.principal),
    kind: 'observability',
    action: result.ok ? 'telemetry_exported' : 'telemetry_export_failed',
    detail: `Telemetry export ${result.ok ? 'completed' : 'failed'}${dryRun ? ' as dry-run' : ''}`,
    destination: result.destination,
    dryRun,
    code: result.code || null,
  });
  return NextResponse.json({ auth: authContext(access.principal), telemetry: result }, { status: result.ok ? 200 : 502 });
}
