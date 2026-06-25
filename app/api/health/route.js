import { NextResponse } from 'next/server.js';
import { isNemotronLive, isStripeLive } from '../../../lib/providerStatus.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  let openshellAvailable = false;
  try {
    const { isOpenShellAvailable } = await import('../../../lib/openShellIntegration.js');
    openshellAvailable = isOpenShellAvailable();
  } catch {}

  return NextResponse.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      nemotron: isNemotronLive(),
      stripe: isStripeLive(),
      openshell: openshellAvailable,
    },
  });
}
