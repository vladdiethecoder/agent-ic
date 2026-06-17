import { NextResponse } from 'next/server.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POST as runExperiment } from '../run-capital-experiment-v8/route.js';

export const dynamic = 'force-dynamic';

const SKILL_PATH = join(process.cwd(), 'skills', 'bounded-capital-experiment-v1.SKILL.md');
const SECOND_MISSION_ID = 'helio-retail-price-agent';

export async function POST(request) {
  try {
    const skillMarkdown = readFileSync(SKILL_PATH, 'utf8');

    const syntheticRequest = new Request('http://localhost:3000/api/run-capital-experiment-v8', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposalId: SECOND_MISSION_ID }),
    });

    const response = await runExperiment(syntheticRequest);
    const data = await response.json();

    if (data?.error) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json({
      ...data,
      ranFromPlaybook: true,
      playbookSource: SKILL_PATH,
      playbookMission: SECOND_MISSION_ID,
      playbookPreview: skillMarkdown.slice(0, 600),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'run_from_playbook_failed', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}
