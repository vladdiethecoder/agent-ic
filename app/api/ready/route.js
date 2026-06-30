import { NextResponse } from 'next/server.js';
import { validateProductionConfig } from '../../../lib/productionConfig.js';
import { getTracePath } from '../../../lib/liveTrace.js';
import { storeHealth } from '../../../lib/tenantStore.js';
import { migrationStatus } from '../../../lib/migrationRunner.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = validateProductionConfig();
  let openshellAvailable = false;
  try {
    const { isOpenShellAvailable } = await import('../../../lib/openShellIntegration.js');
    openshellAvailable = isOpenShellAvailable();
  } catch {}

  const body = {
    status: config.ok ? 'ready' : 'not_ready',
    readinessScope: config.production ? 'production' : 'development',
    productionReady: config.production === true && config.ok === true,
    truthModel: config.production
      ? 'Production readiness requires every required production control to pass in this deployment environment.'
      : 'Development readiness means local runtime checks pass; it is not a production-readiness claim.',
    mode: config.mode,
    production: config.production,
    blockers: config.blockers,
    checks: config.checks.map(({ id, ok, required, message }) => ({ id, ok, required, message })),
    dependencies: {
      openshell: openshellAvailable,
      tracePathConfigured: Boolean(getTracePath()),
      tenantStore: storeHealth(),
      migrations: migrationStatus(),
    },
  };

  return NextResponse.json(body, { status: config.ok ? 200 : 503 });
}
