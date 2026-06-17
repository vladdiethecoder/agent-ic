import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GET } from '../app/api/playbook/route.js';

const SKILL_DIR = join(process.cwd(), 'skills');

function getRequest(version = 'v1') {
  return new Request(`http://localhost:3000/api/playbook?version=${version}`, {
    method: 'GET',
  });
}

test('GET /api/playbook returns SKILL.md content when it exists', async () => {
  if (!existsSync(SKILL_DIR)) mkdirSync(SKILL_DIR, { recursive: true });
  const filepath = join(SKILL_DIR, 'bounded-capital-experiment-v1.SKILL.md');
  const content = '---\nname: Bounded Capital Experiment Playbook\n---\n\n# Playbook\n';
  writeFileSync(filepath, content, 'utf8');

  const response = await GET(getRequest('v1'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.filename, 'bounded-capital-experiment-v1.SKILL.md');
  assert.equal(body.content, content);
});

test('GET /api/playbook returns 404 when SKILL.md is missing', async () => {
  const response = await GET(getRequest('missing'));
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'not_found');
});

test.after(() => {
  try {
    rmSync(join(SKILL_DIR, 'bounded-capital-experiment-v1.SKILL.md'), { force: true });
  } catch {
    // ignore cleanup errors
  }
});
