import { NextResponse } from 'next/server.js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readJsonBody, sanitizeProviderError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

const SKILL_DIR = process.env.AGENT_IC_SKILL_DIR
  ? resolve(process.env.AGENT_IC_SKILL_DIR)
  : join(process.cwd(), 'skills');
const ARTIFACT_DIR = process.env.AGENT_IC_ARTIFACT_DIR
  ? resolve(process.env.AGENT_IC_ARTIFACT_DIR)
  : join(process.cwd(), 'demo-out', 'artifacts');

export async function POST(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;

  const playbook = body.playbook || {};
  const proposalId = typeof body.proposalId === 'string' ? body.proposalId : 'unknown';
  const version = typeof body.version === 'string' ? body.version : 'v1';
  const filename = `bounded-capital-experiment-${version}.SKILL.md`;
  const content = buildSkillMarkdown(playbook, proposalId, version);

  try {
    for (const dir of [SKILL_DIR, ARTIFACT_DIR]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(join(dir, filename), content, 'utf8');
    }

    return NextResponse.json({
      ok: true,
      filename,
      filepath: join(SKILL_DIR, filename),
      artifactPath: join(ARTIFACT_DIR, filename),
      proposalId,
      version,
    });
  } catch (error) {
    const message = sanitizeProviderError(error);
    return NextResponse.json({ error: 'save_failed', message }, { status: 500 });
  }
}

function buildSkillMarkdown(playbook, proposalId, version) {
  const name = playbook.name || 'Bounded Capital Experiment Playbook';
  const description =
    playbook.description ||
    'Reusable Hermes skill for approving a spend envelope, running a governed micro-pilot, blocking out-of-policy actions, and deciding on evidence.';

  return `---
name: ${name}
version: ${version}
proposal: ${proposalId}
kind: hermes-skill
author: Agent IC
---

# ${name}

${description}

## Purpose

Encode the procedure Agent IC used to turn a pilot proposal into a governed capital experiment, so Hermes can replay it on similar missions.

## Inputs

- Normalized IC proposal (company, title, pain, ask, duration, evidence plan)
- Governance policy envelope (kill criteria, allowed tools, spend cap)
- Optional counterfactual overrides (QA agreement, envelope cap)

## Outputs

- Spend envelope with Stripe metadata
- Blocked-action audit entry for any out-of-policy tool request
- Evidence receipts (cases, QA, net value, incidents)
- CONTINUE / REVISE / KILL decision and next autonomy level

## Procedure

1. Load proposal and assert validity.
2. Score viability, governance, and evidence quality.
3. Create a bounded spend envelope and Stripe authorization.
4. Run the agent under NemoClaw / OpenShell network and credential policy.
5. Block any spend or tool call that breaches the envelope.
6. Import operational evidence.
7. Issue a capital decision and save a reusable playbook.

## Invariants

- No autonomous spend above the pre-authorized cap.
- Every tool call is scoped by proposal, budget line, approver, and expiry.
- Kill switch revokes tokens, freezes skills, and preserves the audit log.

## Example

\`\`\`yaml
demo: atlas-freight-rma-copilot
  qa_agreement: 91
  envelope_cap: 100
  expected_decision: CONTINUE
\`\`\`
`;
}
