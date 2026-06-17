import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { POST as savePost } from '../app/api/save-playbook/route.js';

const jsonHeaders = { 'content-type': 'application/json' };

function request(body) {
  return new Request('http://localhost:3000/api/save-playbook', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
}

async function payload(response) {
  return response.json();
}

test('save-playbook writes a SKILL.md artifact', async () => {
  const response = await savePost(
    request({
      proposalId: 'atlas-freight-rma-copilot',
      version: 'v1',
      playbook: {
        name: 'Bounded Capital Experiment Playbook',
        description: 'Reusable Hermes skill for governed capital experiments.',
      },
    })
  );
  assert.equal(response.status, 200);
  const body = await payload(response);
  assert.equal(body.ok, true);
  assert.equal(body.filename, 'bounded-capital-experiment-v1.SKILL.md');
  assert.ok(existsSync(body.filepath), 'SKILL.md file must exist on disk');
});

test('save-playbook rejects malformed JSON', async () => {
  const req = new Request('http://localhost:3000/api/save-playbook', {
    method: 'POST',
    headers: jsonHeaders,
    body: '{',
  });
  const response = await savePost(req);
  assert.equal(response.status, 400);
});


