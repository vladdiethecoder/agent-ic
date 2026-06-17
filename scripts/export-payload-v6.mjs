import { writeFileSync } from 'node:fs';
import { POST as runPost } from '../app/api/run-capital-experiment/route.js';

const jsonHeaders = { 'content-type': 'application/json' };

function request(body) {
  return new Request('http://localhost:3000/api/run-capital-experiment', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
}

const response = await runPost(request({ proposalId: 'atlas-freight-rma-copilot' }));
if (!response.ok) {
  const err = await response.json();
  console.error('Failed to export payload', err);
  process.exit(1);
}

const payload = await response.json();
writeFileSync('remotion/src/payload.json', JSON.stringify(payload, null, 2));
console.log('Exported remotion/src/payload.json');
