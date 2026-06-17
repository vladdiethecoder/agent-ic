import { isStripeLive } from './providerStatus.js';

export function buildStripeSkillReceipt(evaluation, skillName = 'stripe-link-cli') {
  const cap = evaluation.spendEnvelope?.cap || evaluation.autonomousSpendCap || 100;
  const skillCatalog = {
    'stripe-link-cli': {
      name: 'stripe-link-cli',
      displayName: 'Stripe Link CLI',
      action: 'Buy SaaS subscription with one-time virtual card',
      amount: 15,
      merchant: 'OpenAI API top-up',
      approvalGate: 'Human Link app approval required — Hermes cannot self-approve',
      credentialLifecycle: 'One-time virtual card; token scrubbed after transaction settles',
      policy: 'Allowed only inside an active Checkout Session and below the per-authorization cap',
      status: 'approved',
    },
    'mpp-agent': {
      name: 'mpp-agent',
      displayName: 'MPP Agent',
      action: 'Pay a per-call API that returns HTTP 402',
      amount: 4,
      merchant: 'Market-rate lookup API',
      approvalGate: 'mppx attaches a payment token; human authorizes the budget line first',
      credentialLifecycle: 'Payment token bound to this workstream; expires with the session',
      policy: 'Machine Payments Protocol only; blocked if server rejects token or cap is hit',
      status: 'approved',
    },
    'stripe-projects': {
      name: 'stripe-projects',
      displayName: 'Stripe Projects',
      action: 'Provision a Neon free-tier database',
      amount: 0,
      merchant: 'Neon / Twilio / Vercel',
      approvalGate: 'Project owner approves provisioning request',
      credentialLifecycle: 'Generated credentials synced to .env; rotated on teardown',
      policy: 'Free tier only; paid tiers require separate budget line',
      status: 'approved',
    },
  };

  const selected = skillCatalog[skillName] || skillCatalog['stripe-link-cli'];
  return {
    ...selected,
    sessionCap: cap,
    proposalId: evaluation.proposalId,
    mode: isStripeLive() ? 'live' : 'demo',
  };
}
