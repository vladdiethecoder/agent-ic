import { NextResponse } from 'next/server.js';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sanitizeProviderError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

const SKILL_DIR = process.env.AGENT_IC_SKILL_DIR
  ? resolve(process.env.AGENT_IC_SKILL_DIR)
  : join(process.cwd(), 'skills');

const DEFAULT_VERSION = 'v1';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const version = typeof searchParams.get('version') === 'string'
    ? searchParams.get('version')
    : DEFAULT_VERSION;
  const filename = `bounded-capital-experiment-${version}.SKILL.md`;
  const filepath = join(SKILL_DIR, filename);

  try {
    if (!existsSync(filepath)) {
      return NextResponse.json(
        { ok: false, error: 'not_found', filename, filepath },
        { status: 404 }
      );
    }

    const content = readFileSync(filepath, 'utf8');
    return NextResponse.json({
      ok: true,
      filename,
      filepath,
      version,
      content,
    });
  } catch (error) {
    const message = sanitizeProviderError(error);
    return NextResponse.json(
      { ok: false, error: 'read_failed', filename, message },
      { status: 500 }
    );
  }
}
