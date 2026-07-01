import { z } from 'zod';

// Primitives
export const DecisionSchema = z.enum(['CONTINUE', 'RE-SCOPE', 'KILL', 'REVISE', 'OBSERVE']);
export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);
export const CurrencySchema = z.literal('USD');

// Mission / proposal
export const BaselineSchema = z.object({
  monthlyCases: z.number().int().min(0),
  manualMinutesPerCase: z.number().min(0),
  loadedHourlyCost: z.number().min(0),
  refundLeakageMonthly: z.number().min(0),
  churnRiskMonthly: z.number().min(0),
});

export const TargetSchema = z.object({
  deflectionRate: z.number().min(0).max(1),
  minutesSavedPerCase: z.number().min(0),
  leakageReduction: z.number().min(0).max(1),
  paybackDays: z.number().int().min(0).optional(),
});

export const BlockedToolSchema = z.object({
  name: z.string(),
  category: z.string(),
  reason: z.string(),
});

export const MicroPilotSchema = z.object({
  mission: z.string(),
  envelopeDollars: z.number().min(0).optional(),
  durationHours: z.number().int().min(0),
  successMetric: z.string(),
  allowedTools: z.array(z.string()),
  blockedTool: BlockedToolSchema.nullable().optional(),
});

export const ProposalSchema = z.object({
  id: z.string().min(1),
  company: z.string(),
  sponsor: z.string().optional(),
  title: z.string(),
  category: z.string().optional(),
  ask: z.number().min(0),
  durationWeeks: z.number().int().min(1).max(104),
  pain: z.string(),
  proposal: z.string().optional(),
  dataReadiness: z.number().int().min(0).max(100),
  integrationRisk: z.number().int().min(0).max(100),
  complianceRisk: z.number().int().min(0).max(100),
  businessUrgency: z.number().int().min(0).max(100),
  automationLeverage: z.number().int().min(0).max(100),
  baseline: BaselineSchema,
  target: TargetSchema,
  requestedTools: z.array(z.string()).optional(),
  evidencePlan: z.array(z.string()).min(1),
  microPilot: MicroPilotSchema.optional(),
});

// Governance policy
export const ToolScopeSchema = z.object({
  tool: z.string(),
  scope: z.string(),
  maxSpend: z.number().min(0),
  approval: z.string(),
});

export const GovernancePolicySchema = z.object({
  name: z.string(),
  version: z.string(),
  invariants: z.array(z.string()),
  toolScopes: z.array(ToolScopeSchema),
  killCriteria: z.array(z.string()),
});

// Spend envelope
export const SpendEnvelopeSchema = z.object({
  mission: z.string(),
  cap: z.number().min(0),
  currency: CurrencySchema,
  durationHours: z.number().int().min(0),
  successMetric: z.string(),
  allowedTools: z.array(z.string()),
  blockedTool: BlockedToolSchema.nullable().optional(),
});

// Evidence receipt
export const EvidenceReceiptSchema = z.object({
  metric: z.string(),
  value: z.union([z.number(), z.string()]),
  unit: z.string(),
  source: z.string(),
});

// Blocked event
export const BlockedCallSchema = z.object({
  host: z.string(),
  method: z.string(),
  path: z.string(),
  attemptedAmount: z.number().min(0),
  status: z.number().int().min(0),
  policy: z.string(),
  detail: z.string(),
});

export const BlockedEventSchema = z.object({
  actor: z.string(),
  action: z.string(),
  proposalId: z.string(),
  detail: z.string(),
  kind: z.literal('blocked'),
  policyBreach: z.string(),
  attemptedTool: z.string().nullable().optional(),
  attemptedAmount: z.number().min(0),
  cap: z.number().min(0),
  status: z.number().int().min(0).optional(),
  stripeResult: z.string().optional(),
  realBlockedCall: BlockedCallSchema.optional(),
  rawRequest: z.record(z.unknown()).optional(),
  rawResponse: z.record(z.unknown()).optional(),
});

// Decision memo
export const DecisionMemoSchema = z.object({
  verdict: DecisionSchema,
  nextCap: z.number().min(0),
  autonomy: z.string(),
  qaThreshold: z.number().int().min(0).max(100).optional(),
  envelopeCap: z.number().min(0).optional(),
});

// Hermes playbook
export const HermesPlaybookSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string(),
  inputs: z.record(z.string()).optional(),
  outputs: z.record(z.string()).optional(),
  reusedOn: z.array(z.string()).optional(),
  artifact: z.string().optional(),
  hermesNative: z.boolean().optional(),
  ts: z.string().datetime().optional(),
});

// Stripe session
export const StripeSessionCreateSchema = z.object({
  id: z.string(),
  object: z.string(),
  mode: z.string(),
  payment_status: z.string(),
  status: z.string(),
  amount_total: z.number().int().min(0),
  currency: z.string(),
  url: z.string().nullable().optional(),
  client_reference_id: z.string().optional(),
  metadata: z.record(z.string()),
});

export const StripeSessionStatusSchema = z.object({
  id: z.string(),
  status: z.string(),
  payment_status: z.string(),
  amount_total: z.number().int().min(0).optional(),
  currency: z.string().optional(),
});

// API request bodies
export const EvaluateRequestSchema = z.object({
  proposalId: z.string().optional(),
});

export const StripeSessionRequestSchema = z.object({
  proposalId: z.string(),
  evaluation: z.object({}).passthrough().optional(),
  idempotencyKey: z.string().optional(),
});

export const RunCapitalExperimentRequestSchema = z.object({
  proposalId: z.string().optional(),
  clientRunId: z.string().optional(),
  qaAgreement: z.union([z.number(), z.string()]).optional(),
  envelopeCap: z.union([z.number(), z.string()]).optional(),
  skipNemotron: z.boolean().optional(),
  preflightNemotronReceipt: z.object({
    requestId: z.string(),
    model: z.string().optional().nullable(),
    latencyMs: z.union([z.number(), z.string()]).optional().nullable(),
    rationale: z.string().optional().nullable(),
    confidence: z.string().optional().nullable(),
    score: z.union([z.number(), z.string()]).optional().nullable(),
    governanceScore: z.union([z.number(), z.string()]).optional().nullable(),
    evidenceScore: z.union([z.number(), z.string()]).optional().nullable(),
  }).optional(),
  requireLiveProof: z.boolean().optional(),
});

export const AuditRequestSchema = z.object({
  actor: z.string().optional(),
  action: z.string().optional(),
  proposalId: z.string().optional(),
  detail: z.string().optional(),
  kind: z.string().optional(),
  reset: z.boolean().optional(),
  confirmReset: z.string().optional(),
});

// Provider receipts
export const ProviderStateSchema = z.object({
  state: z.enum(['live', 'available', 'unavailable', 'handoff', 'local-proof', 'error', 'test', 'local', 'pending']),
  mode: z.enum(['live', 'capability-check', 'unavailable', 'local-disabled', 'local-policy', 'test', 'artifact']),
  detail: z.string().optional(),
});

export const NemotronReceiptSchema = z.object({
  state: z.string(),
  mode: z.enum(['live', 'local']).optional(),
  model: z.string(),
  requestId: z.string().nullable().optional(),
  latencyMs: z.union([z.string(), z.number()]),
  evaluator: z.string(),
});

export const StripeReceiptSchema = z.object({
  state: z.string(),
  mode: z.enum(['live', 'non-production', 'local', 'test']).optional(),
  apiMode: z.string().optional(),
  testMode: z.boolean().optional(),
  sessionId: z.string().nullable(),
  clientReferenceId: z.string(),
  amountCents: z.number().int().min(0),
  metadata: z.record(z.string()),
});

export const HermesReceiptSchema = z.object({
  state: z.string(),
  mode: z.enum(['live', 'local', 'artifact']).optional(),
  playbookId: z.string(),
  taskId: z.string(),
  skillPlan: z.array(z.string()).nullable().optional(),
  skillSource: z.string().optional(),
  playbook: z.record(z.unknown()).nullable().optional(),
  gatewayUrl: z.string().nullable().optional(),
  reusedOn: z.array(z.string()).optional(),
});

export const GovernanceReceiptSchema = z.object({
  state: z.string(),
  policyId: z.string().optional(),
  policyHash: z.string(),
  sandboxId: z.string().nullable().optional(),
  networkPolicy: z.string().optional(),
  blockedCount: z.number().int().min(0),
  approvedCount: z.number().int().min(0),
  killCriteria: z.array(z.string()),
});

export const AuditReceiptSchema = z.object({
  rowCount: z.number().int().min(0),
  newestId: z.string().nullable(),
  retentionLimit: z.number().int().min(0),
});

export const ProviderReceiptsSchema = z.object({
  nemotron: NemotronReceiptSchema,
  stripe: StripeReceiptSchema,
  hermes: HermesReceiptSchema,
  governance: GovernanceReceiptSchema,
  audit: AuditReceiptSchema,
});


export const SpendApprovalSchema = z.object({
  required: z.boolean(),
  status: z.enum(['approved', 'pending', 'rejected', 'missing', 'not_required_for_local_trial']),
  id: z.string().nullable().optional(),
  idMasked: z.string().nullable().optional(),
  spendCap: z.number().nullable().optional(),
  caseId: z.string().nullable().optional(),
  decidedAt: z.string().nullable().optional(),
  decidedByRole: z.string().nullable().optional(),
  evidence: z.string().optional(),
}).passthrough().superRefine((approval, ctx) => {
  if (approval.required && approval.status === 'approved') {
    if (!approval.id && !approval.idMasked) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'approved spend approval requires id or idMasked', path: ['id'] });
    }
    if (!Number.isFinite(Number(approval.spendCap)) || Number(approval.spendCap) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'approved spend approval requires positive spendCap', path: ['spendCap'] });
    }
  }
});

export const ProductionAccessDecisionSchema = z.object({
  approved: z.boolean(),
  status: z.enum(['approved', 'not_approved']),
  scope: z.enum(['scoped_production_access', 'governed_trial_only']),
  recommendedAction: z.string(),
  blockers: z.array(z.string()),
  evidence: z.record(z.unknown()).optional(),
}).passthrough().superRefine((decision, ctx) => {
  if (decision.approved) {
    if (decision.status !== 'approved') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'approved production access requires approved status', path: ['status'] });
    }
    if (decision.scope !== 'scoped_production_access') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'approved production access requires scoped_production_access scope', path: ['scope'] });
    }
    if (decision.blockers.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'approved production access cannot include blockers', path: ['blockers'] });
    }
  } else {
    if (decision.status !== 'not_approved') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'denied production access requires not_approved status', path: ['status'] });
    }
    if (decision.scope !== 'governed_trial_only') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'denied production access requires governed_trial_only scope', path: ['scope'] });
    }
    if (decision.blockers.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'denied production access requires at least one blocker', path: ['blockers'] });
    }
  }
});

const RoiComputedMetricSchema = z.object({
  formula: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1).optional(),
}).passthrough();

export const RoiMethodologySchema = z.object({
  baseline: z.object({
    inputs: z.record(z.unknown()),
    result: z.object({
      totalCost: z.number(),
    }).passthrough(),
  }).passthrough(),
  agent: z.object({
    inputs: z.record(z.unknown()),
    result: z.object({
      totalCost: z.number(),
    }).passthrough(),
  }).passthrough(),
  computed: z.object({
    netValue: RoiComputedMetricSchema,
  }).passthrough(),
}).passthrough().superRefine((roi, ctx) => {
  const netFormula = String(roi.computed?.netValue?.formula || '');
  if (!/baseline\.totalCost\s*-\s*agent\.totalCost/.test(netFormula)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ROI netValue requires baseline.totalCost - agent.totalCost formula', path: ['computed', 'netValue', 'formula'] });
  }
  const expectedNet = Number(roi.baseline.result.totalCost) - Number(roi.agent.result.totalCost);
  if (Number.isFinite(expectedNet) && roi.computed.netValue.value !== expectedNet) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ROI netValue must equal baseline.totalCost - agent.totalCost', path: ['computed', 'netValue', 'value'] });
  }
});

export const TrialRunRecordSchema = z.object({
  recordType: z.literal('trial-run-v1'),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  runId: z.string().min(1),
  caseId: z.string().min(1).optional(),
  spendApproval: SpendApprovalSchema,
  productionAccessDecision: ProductionAccessDecisionSchema,
  evidence: z.record(z.unknown()).optional(),
  decision: z.record(z.unknown()).optional(),
  policyBlock: z.record(z.unknown()).optional(),
  evidenceArtifacts: z.array(z.record(z.unknown())).optional(),
  roiMethodology: RoiMethodologySchema,
  storedAt: z.string(),
}).passthrough();


export const RenewalCycleRecordSchema = z.object({
  cycleId: z.string().min(1),
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  caseId: z.string().min(1),
  verdict: z.string().min(1),
  spendCap: z.number().min(0),
  metrics: z.record(z.unknown()),
  policyBlock: z.record(z.unknown()),
  spendApproval: SpendApprovalSchema,
  productionAccessDecision: ProductionAccessDecisionSchema,
  roiMethodology: RoiMethodologySchema,
  evidenceHash: z.string().nullable().optional(),
  provenance: z.record(z.unknown()),
}).passthrough();

export const TrialRunProofSummarySchema = z.object({
  runId: z.string().min(1),
  caseId: z.string().min(1).optional(),
  spendApproval: SpendApprovalSchema,
  productionAccessDecision: ProductionAccessDecisionSchema,
  evidence: z.record(z.unknown()).optional(),
  decision: z.record(z.unknown()).optional(),
  policyBlock: z.record(z.unknown()).optional(),
  evidenceArtifacts: z.array(z.record(z.unknown())).optional(),
  roiMethodology: RoiMethodologySchema,
}).passthrough();

export const StrictProviderProofErrorSchema = z.object({
  error: z.string().min(1),
  code: z.literal('strict_provider_proof_missing'),
  decision: z.literal('blocked'),
  missingProof: z.array(z.string().min(1)).min(1),
}).passthrough();

export const AllowedActionProofSchema = z.object({
  decision: z.literal('allowed'),
  status: z.number().int().refine((value) => value >= 200 && value < 300, 'allowed action requires 2xx status'),
  tool: z.string().min(1).optional(),
  evidenceSource: z.string().min(1).optional(),
  evidenceHash: z.string().min(1).optional(),
}).passthrough();

export const PolicyBlockResultSchema = z.object({
  blocked: z.literal(true),
  status: z.literal(403),
  allowedAction: AllowedActionProofSchema,
}).passthrough();

export const EnterpriseTrialResultSchema = z.object({
  runId: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  caseId: z.string().min(1),
  stripe: z.record(z.unknown()),
  spendApproval: SpendApprovalSchema,
  productionAccessDecision: ProductionAccessDecisionSchema,
  workerResult: z.object({ evidence: z.record(z.unknown()) }).passthrough(),
  policyBlock: z.object({ result: PolicyBlockResultSchema }).passthrough(),
  decision: z.object({ verdict: z.string().min(1), metrics: z.record(z.unknown()) }).passthrough(),
  roiMethodology: RoiMethodologySchema,
  evidenceArtifacts: z.array(z.record(z.unknown())).optional(),
}).passthrough();

export const ProofReportSchema = z.object({
  ok: z.boolean(),
  product: z.string(),
  proofSurfaces: z.record(z.unknown()),
  workloadEvidence: z.record(z.unknown()),
  latestTrial: TrialRunProofSummarySchema.nullable().optional(),
}).passthrough();

// Helpers
export function parseSchema(schema, value) {
  const result = schema.safeParse(value);
  return result.success ? { ok: true, data: result.data } : { ok: false, error: result.error };
}

export function normalizeWithSchema(schema, value) {
  const result = schema.safeParse(value);
  return result.success ? result.data : value;
}

export function coerceFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}
