import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStripeProof } from '../scripts/agent-ic-proof.mjs';

test('Stripe proof helper distinguishes live and non-production receipts', () => {
  const nonProduction = classifyStripeProof({ mode: 'non-production', testMode: true, sessionId: 'cs_test_1234567890' });
  assert.equal(nonProduction.hasCheckoutSession, true);
  assert.equal(nonProduction.nonProductionReceipt, true);
  assert.equal(nonProduction.liveReceipt, false);
  assert.equal(nonProduction.state, 'non-production-session-recorded');
  assert.match(nonProduction.limitation, /not live money movement/);

  const live = classifyStripeProof({ mode: 'live', testMode: false, sessionId: 'cs_live_1234567890' });
  assert.equal(live.hasCheckoutSession, true);
  assert.equal(live.nonProductionReceipt, false);
  assert.equal(live.liveReceipt, true);
  assert.equal(live.state, 'live-session-recorded');
  assert.equal(live.limitation, null);

  const missing = classifyStripeProof({ mode: 'unavailable', testMode: false });
  assert.equal(missing.hasCheckoutSession, false);
  assert.equal(missing.liveReceipt, false);
  assert.equal(missing.state, 'unavailable-or-local-envelope');
});
