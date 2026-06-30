import { NextResponse } from 'next/server.js';
import { buildOpenApiSpec } from '../../../lib/openapiSpec.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(buildOpenApiSpec({ publicUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://agent-ic.example.com' }));
}
