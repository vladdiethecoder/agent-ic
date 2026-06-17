export const seededProposals = [
  {
    id: 'atlas-freight-rma-copilot',
    company: 'Atlas Freight',
    sponsor: 'SVP Operations',
    title: 'Autonomous RMA + claims copilot for late freight exceptions',
    category: 'Operations automation',
    ask: 185000,
    microPilotAsk: 12500,
    durationWeeks: 8,
    pain:
      'Exception claims are handled by a 34-person ops queue. Average resolution is 42 hours, creating refund leakage, churn risk, and repetitive manual evidence gathering.',
    proposal:
      'Deploy a governed Hermes agent that watches shipment events, drafts customer updates, gathers proof of delivery/temperature telemetry, opens claims packets, and escalates only exceptions above the authority threshold.',
    dataReadiness: 92,
    integrationRisk: 41,
    complianceRisk: 34,
    businessUrgency: 88,
    automationLeverage: 84,
    baseline: {
      monthlyCases: 12200,
      manualMinutesPerCase: 18,
      loadedHourlyCost: 74,
      refundLeakageMonthly: 138000,
      churnRiskMonthly: 91000,
    },
    target: {
      deflectionRate: 0.57,
      minutesSavedPerCase: 11.5,
      leakageReduction: 0.22,
      paybackDays: 64,
    },
    requestedTools: ['Snowflake read replica', 'Zendesk drafts', 'Shipwell event stream', 'Stripe Checkout', 'Slack approval room'],
    evidencePlan: [
      'A/B queue cohort: 12.2k monthly cases, random by customer hash',
      'Holdout: 15% human-only control with identical SLA alerts',
      'Primary outcome: resolved cases per operator-hour',
      'Secondary outcome: refund leakage dollars, customer escalation rate, false-action rate',
    ],
    microPilot: {
      mission: 'Resolve 100 late-freight exception tickets in 72 hours with a governed Hermes agent',
      envelopeDollars: 100,
      durationHours: 72,
      successMetric: 'Save at least 10 support hours with zero critical incidents',
      allowedTools: ['Shipment event API', 'Draft reply tool', 'Evidence collector', 'Slack approval room'],
      blockedTool: {
        name: 'Premium market-rate lookup API',
        category: 'Unapproved external data vendor',
        reason: 'Merchant category outside the approved SaaS list and per-authorization cap exceeded',
      },
    },
  },
  {
    id: 'bramble-bank-kyc-agent',
    company: 'Bramble Bank',
    sponsor: 'Chief Risk Officer',
    title: 'KYC document remediation agent for SME onboarding backlog',
    category: 'Regulated ops',
    ask: 240000,
    durationWeeks: 10,
    pain:
      '4,800 SME onboarding packets are stalled each month because missing documents are requested manually and evidence collection is inconsistent.',
    proposal:
      'Use a document-intelligence agent to classify missing KYC evidence, draft outreach, and route high-risk cases to compliance analysts with deterministic audit packets.',
    dataReadiness: 75,
    integrationRisk: 69,
    complianceRisk: 82,
    businessUrgency: 81,
    automationLeverage: 61,
    baseline: {
      monthlyCases: 4800,
      manualMinutesPerCase: 31,
      loadedHourlyCost: 112,
      refundLeakageMonthly: 0,
      churnRiskMonthly: 165000,
    },
    target: {
      deflectionRate: 0.31,
      minutesSavedPerCase: 13.2,
      leakageReduction: 0,
      paybackDays: 143,
    },
    requestedTools: ['Doc parser', 'CRM draft emails', 'Case management read/write', 'Analyst approval queue'],
    evidencePlan: [
      'Shadow mode for 2 weeks before any customer contact',
      'Compliance packet precision audited on 400 stratified cases',
      'No autonomous external messages above risk tier 2',
      'Primary outcome: days from application to complete packet',
    ],
  },
  {
    id: 'helio-retail-price-agent',
    company: 'Helio Retail',
    sponsor: 'VP Merchandising',
    title: 'Promotion margin guardrail agent for category managers',
    category: 'Revenue operations',
    ask: 90000,
    durationWeeks: 6,
    pain:
      'Promotions are launched from spreadsheets; 3.4% of SKUs run below margin floor before finance catches the error.',
    proposal:
      'Agent reviews draft promotions, blocks margin-floor violations, files evidence, and buys external market-pricing lookups only inside per-category budgets.',
    dataReadiness: 86,
    integrationRisk: 47,
    complianceRisk: 28,
    businessUrgency: 72,
    automationLeverage: 78,
    baseline: {
      monthlyCases: 31000,
      manualMinutesPerCase: 2.8,
      loadedHourlyCost: 94,
      refundLeakageMonthly: 221000,
      churnRiskMonthly: 0,
    },
    target: {
      deflectionRate: 0.46,
      minutesSavedPerCase: 1.9,
      leakageReduction: 0.18,
      paybackDays: 51,
    },
    requestedTools: ['ERP read', 'Promo planner write', 'Market price API', 'Stripe spend card', 'Finance Slack'],
    microPilot: {
      mission: 'Replay 180 days of historical promo drafts and flag below-floor margin violations',
      envelopeDollars: 120,
      durationHours: 72,
      successMetric: 'Prevent at least one below-floor launch with zero false approvals',
      allowedTools: ['ERP read', 'Promo planner read', 'Margin calculator', 'Finance Slack'],
      blockedTool: {
        name: 'Premium market-price lookup API',
        category: 'Unapproved external data vendor',
        reason: 'Merchant category outside approved SaaS list and per-authorization cap exceeded',
      },
    },
    evidencePlan: [
      'Replay 180 days of historical promo drafts',
      'Live canary on two categories with finance veto',
      'Primary outcome: prevented below-floor launches',
      'Cost evidence: API lookup spend tied to retained margin dollars',
    ],
  },
];

export const governancePolicy = {
  name: 'NemoClaw / OpenShell-style operating envelope',
  version: '2026.06-hackathon-demo',
  invariants: [
    'Every tool call is scoped by proposal, budget line, approver, and expiry.',
    'No autonomous spend above the pre-authorized Stripe line item cap.',
    'External customer messages are draft-only until evidence grade reaches B+ and sponsor approvals are current.',
    'PII access is read-only, purpose-bound, and excluded from model prompts unless explicitly transformed into approved evidence features.',
    'Kill switch revokes tokens, expires Stripe Checkout Sessions, freezes agent skills, and preserves the audit log.',
  ],
  toolScopes: [
    { tool: 'Hermes skills', scope: 'proposal-local skill + task ledger', maxSpend: 0, approval: 'Agent IC chair' },
    { tool: 'Nemotron evaluator', scope: 'proposal text + non-sensitive metrics only', maxSpend: 1200, approval: 'Auto if budget approved' },
    { tool: 'Stripe Checkout', scope: 'one pilot budget authorization session', maxSpend: 250000, approval: 'CFO delegate' },
    { tool: 'SaaS provisioning', scope: 'sandbox tenant + read replicas', maxSpend: 35000, approval: 'IT owner' },
    { tool: 'Evidence warehouse', scope: 'append-only ROI events', maxSpend: 0, approval: 'Data owner' },
  ],
  killCriteria: [
    'Evidence grade below B after week 4',
    'False autonomous action rate above 1.0%',
    'Forecast payback above 120 days after spend is committed',
    'Any governance invariant breach',
  ],
};

export const seededTimeline = [
  { week: 0, label: 'Proposal intake', metric: 'baseline locked', impact: 0, grade: 'C' },
  { week: 2, label: 'Shadow mode', metric: '94.1% correct packet assembly', impact: 42000, grade: 'B-' },
  { week: 4, label: 'Canary', metric: '36% queue deflection, 0 critical incidents', impact: 121000, grade: 'B+' },
  { week: 6, label: 'Controlled autonomy', metric: '52% deflection, 0.34% false action rate', impact: 214000, grade: 'A-' },
  { week: 8, label: 'Decision gate', metric: '64-day payback forecast verified', impact: 337000, grade: 'A' },
];

export const judgeRubric = [
  { label: 'Useful', copy: 'Turns vague AI pilots into scoped, budgeted, measured investment decisions.' },
  { label: 'Viable', copy: 'Runs without secrets in demo mode; upgrades to NIM/Hermes/Stripe by setting env vars.' },
  { label: 'Presentable', copy: 'One-screen executive narrative plus audit-grade drilldown for a 1–3 minute video.' },
];

export const productModeConfig = {
  enabled: false, // Set to true to hide all demo scaffolding
  heroEyebrow: 'Governed capital account for autonomous work',
  heroSubcopy:
    'Agent IC gives autonomous agents a governed capital account: approve a spend envelope, run a micro-pilot, block unsafe actions, import evidence, and decide whether the work earned more capital.',
  primaryCTA: 'Run mission',
  secondaryCTA: 'View record',
  navItems: ['Workbench', 'Governance', 'Audit'],
  hideRubric: true,
  hideStoryboard: true,
  hideDemoArc: true,
  hideSourceLine: true,
};
