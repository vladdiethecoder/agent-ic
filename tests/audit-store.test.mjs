import test from 'node:test';
import assert from 'node:assert/strict';
import { appendAudit, readAudit, resetAudit } from '../lib/auditStore.js';

test('audit store assigns unique monotonic IDs after retention boundary', () => {
  resetAudit();
  const ids = [];
  for (let index = 0; index < 125; index += 1) {
    ids.push(appendAudit({ actor: 'test', action: `event ${index}`, detail: 'ok', kind: 'test' }).id);
  }
  assert.equal(new Set(ids).size, ids.length, 'every appended audit id must be unique');
  assert.equal(readAudit().length, 100, 'retention keeps latest 100 events');
});

test('audit store redacts obvious secrets before persisting entries', () => {
  resetAudit();
  appendAudit({
    actor: 'test',
    action: 'secret scan',
    detail: 'stripe=sk_test_1234567890abcdef nemotron=nvapi-abcdef1234567890 password=hunter2',
    kind: 'test',
  });
  const [entry] = readAudit();
  assert.ok(!entry.detail.includes('sk_test_1234567890abcdef'));
  assert.ok(!entry.detail.includes('nvapi-abcdef1234567890'));
  assert.ok(!entry.detail.includes('hunter2'));
  assert.match(entry.detail, /\[REDACTED\]/);
});
