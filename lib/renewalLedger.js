/**
 * Evidence Ledger & Renewal Engine
 *
 * The recurring procurement layer. Each governed trial produces evidence
 * that persists across monthly cycles. The buyer sees accumulating trends:
 *   - Trial 1 ($100) → CONTINUE → expand
 *   - Trial 2 ($250) → CONTINUE → expand
 *   - Trial 3 ($500) → REVISE → hold
 *   - Monthly renewal: should we keep paying this vendor?
 *
 * Uses a local JSON file store (no external DB dependency for local development).
 */

import { RenewalCycleRecordSchema, parseSchema } from './schemas.js';
import { getCaseById } from './enterpriseCases.js';
import { clearTenantStore, readTenantCollection, writeTenantCollection } from './tenantStore.js';

const COLLECTION = 'renewal-ledger';
const DEFAULT_TENANT_ID = 'local-tenant';
const EMPTY_LEDGER = { cycles: [], vendors: {} };

function readLedger(tenantId = DEFAULT_TENANT_ID) {
  return readTenantCollection(tenantId, COLLECTION, EMPTY_LEDGER);
}

function writeLedger(ledger, tenantId = DEFAULT_TENANT_ID) {
  return writeTenantCollection(tenantId, COLLECTION, {
    cycles: Array.isArray(ledger.cycles) ? ledger.cycles : [],
    vendors: ledger.vendors && typeof ledger.vendors === 'object' ? ledger.vendors : {},
  });
}

/**
 * Record a completed trial cycle in the evidence ledger.
 *
 * @param {Object} trialResult — output from trialOrchestrator.runEnterpriseTrial
 * @returns {Object} the recorded cycle with renewal recommendation
 */
export function recordTrialCycle(trialResult) {
  const tenantId = trialResult.tenantId || DEFAULT_TENANT_ID;
  const ledger = readLedger(tenantId);
  const caseId = trialResult.caseId;
  const vendorKey = trialResult.vendor?.name || 'unknown';

  const cycle = {
    cycleId: `cycle-${Date.now()}`,
    tenantId,
    runId: trialResult.runId,
    caseId,
    vendor: trialResult.vendor,
    buyer: trialResult.buyer,
    domain: trialResult.domain,
    timestamp: trialResult.startedAt,
    verdict: trialResult.decision.verdict,
    confidence: trialResult.decision.confidence,
    spendCap: trialResult.spendEnvelope.cap,
    metrics: {
      netValue: trialResult.decision.metrics.profitability.netValue,
      wasteRatio: trialResult.decision.metrics.wasteRatio.ratio,
      riskAdjustedROI: trialResult.decision.metrics.riskAdjustedROI.multiple,
      throughputUplift: trialResult.decision.metrics.throughputUplift.multiple,
      annualizedValue: trialResult.decision.metrics.annualizedProjection.annualValue,
      accuracy: trialResult.workerResult?.evidence?.accuracy || 0,
      casesProcessed: trialResult.workerResult?.evidence?.casesProcessed || 0,
      falsePositiveRate: trialResult.workerResult?.evidence?.falsePositiveRate || 0,
    },
    claimValidation: trialResult.decision.claimValidation.summary,
    policyBlock: {
      status: trialResult.policyBlock.result.status,
      enforced: trialResult.policyBlock.result.blocked,
    },
    spendApproval: trialResult.spendApproval || null,
    productionAccessDecision: trialResult.productionAccessDecision || null,
    roiMethodology: trialResult.roiMethodology,
    evidenceHash: trialResult.workerResult?.evidence?.dataHash || null,
    provenance: {
      mode: 'observed_trial',
      source: 'trial_orchestrator',
      validationStatus: 'observed',
      runId: trialResult.runId,
      evidenceHash: trialResult.workerResult?.evidence?.dataHash || null,
    },
  };

  const parsed = parseSchema(RenewalCycleRecordSchema, cycle);
  if (!parsed.ok) {
    throw new Error(`Renewal cycle failed schema validation: ${parsed.error.issues?.[0]?.message || 'invalid cycle'}`);
  }

  // Add to cycles
  ledger.cycles.push(cycle);

  // Track per-vendor history
  if (!ledger.vendors[vendorKey]) {
    ledger.vendors[vendorKey] = { cycles: [], caseId };
  }
  ledger.vendors[vendorKey].cycles.push(cycle.cycleId);

  // Compute renewal recommendation
  const renewal = computeRenewalRecommendation(ledger, caseId, vendorKey);
  cycle.renewal = renewal;

  writeLedger(ledger, tenantId);

  return cycle;
}

/**
 * Compute the monthly renewal recommendation based on accumulated evidence.
 *
 * Answers: should the buyer keep paying this vendor's contract next month?
 *
 * @param {Object} ledger — full evidence ledger
 * @param {string} caseId — case to evaluate
 * @param {string} vendorKey — vendor to evaluate
 * @returns {Object} renewal recommendation
 */
function computeRenewalRecommendation(ledger, caseId, vendorKey) {
  const vendorCycles = ledger.cycles.filter(
    (c) => c.caseId === caseId && c.vendor?.name === vendorKey
  );

  if (vendorCycles.length === 0) {
    return { action: 'no_data', recommendation: 'No trial history yet.' };
  }

  // Single cycle — initial recommendation
  if (vendorCycles.length === 1) {
    const cycle = vendorCycles[0];
    const nextCap = cycle.verdict === 'CONTINUE'
      ? Math.round(cycle.spendCap * 2.5)
      : cycle.spendCap;

    return {
      action: cycle.verdict === 'CONTINUE' ? 'expand' : cycle.verdict === 'REVISE' ? 'hold' : 'cancel',
      nextCap,
      recommendation:
        cycle.verdict === 'CONTINUE'
          ? `Expand to $${nextCap} envelope next cycle based on positive first trial.`
          : cycle.verdict === 'REVISE'
            ? `Hold at $${cycle.spendCap}. Re-scope trial with stricter metrics before expansion.`
            : `Cancel vendor contract. Trial did not clear governance bar.`,
      accumulatedValue: cycle.metrics.netValue,
      cycleCount: 1,
      trend: 'initial',
    };
  }

  // Multiple cycles — trend analysis
  const sorted = vendorCycles.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];

  // Compute trends
  const valueTrend = latest.metrics.netValue - previous.metrics.netValue;
  const accuracyTrend = latest.metrics.accuracy - previous.metrics.accuracy;
  const wasteTrend = latest.metrics.wasteRatio - previous.metrics.wasteRatio;
  const totalValue = sorted.reduce((sum, c) => sum + (c.metrics.netValue || 0), 0);
  const totalCases = sorted.reduce((sum, c) => sum + (c.metrics.casesProcessed || 0), 0);
  const avgWaste = sorted.reduce((sum, c) => sum + (c.metrics.wasteRatio || 0), 0) / sorted.length;
  const allBlocked = sorted.every((c) => c.policyBlock.enforced);
  const anyBypass = sorted.some((c) => !c.policyBlock.enforced);

  // Renewal decision logic
  let action = 'renew';
  let confidence = 'high';

  if (anyBypass) {
    action = 'cancel';
    confidence = 'high';
  } else if (latest.verdict === 'KILL') {
    action = 'cancel';
  } else if (valueTrend < 0 && accuracyTrend < 0) {
    action = 'downgrade';
    confidence = 'medium';
  } else if (wasteTrend > 0.05) {
    action = 'hold';
    confidence = 'medium';
  } else if (latest.verdict === 'CONTINUE' && valueTrend >= 0) {
    action = 'renew_and_expand';
  }

  const nextCap = action === 'renew_and_expand'
    ? Math.round(latest.spendCap * 1.8)
    : action === 'downgrade'
      ? Math.round(latest.spendCap * 0.6)
      : latest.spendCap;

  // Build the renewal narrative
  const narratives = {
    renew_and_expand: `Vendor performance is ${improvingOrStable(valueTrend, accuracyTrend)}. ${sorted.length} cycles show accumulated value of $${totalValue.toLocaleString()} across ${totalCases} processed items. Recommend renewing at expanded $${nextCap} envelope.`,
    renew: `Vendor is performing adequately across ${sorted.length} cycles. Renew at current $${latest.spendCap} tier. Accumulated value: $${totalValue.toLocaleString()}.`,
    hold: `Waste ratio is trending up (${(avgWaste * 100).toFixed(1)}% average). Hold at current tier and require process improvement before expansion.`,
    downgrade: `Performance is declining (value ${valueTrend >= 0 ? 'flat' : 'down $' + Math.abs(valueTrend)}, accuracy ${accuracyTrend >= 0 ? 'stable' : 'down ' + (accuracyTrend * 100).toFixed(1) + '%'}). Reduce envelope to $${nextCap}.`,
    cancel: `${anyBypass ? 'Policy invariant breached — immediate cancellation.' : 'Latest cycle returned KILL verdict. Cancel vendor contract.'}`,
  };

  return {
    action,
    confidence,
    nextCap,
    recommendation: narratives[action],
    accumulated: {
      totalValue,
      totalCases,
      cycleCount: sorted.length,
      avgAccuracy: sorted.reduce((s, c) => s + c.metrics.accuracy, 0) / sorted.length,
      avgWaste,
      totalPolicyBlocks: sorted.filter((c) => c.policyBlock.enforced).length,
      policyBypasses: sorted.filter((c) => !c.policyBlock.enforced).length,
    },
    trend: {
      valueDirection: valueTrend >= 0 ? 'improving' : 'declining',
      accuracyDirection: accuracyTrend >= 0 ? 'stable_or_improving' : 'declining',
      wasteDirection: wasteTrend <= 0 ? 'stable_or_improving' : 'worsening',
      valueDelta: valueTrend,
      accuracyDelta: accuracyTrend,
      wasteDelta: wasteTrend,
    },
  };
}

function improvingOrStable(valueTrend, accuracyTrend) {
  if (valueTrend > 0 && accuracyTrend >= 0) return 'improving';
  if (valueTrend >= 0) return 'stable';
  return 'mixed';
}

/**
 * Get the full renewal history for a case/vendor.
 *
 * @param {string} caseId
 * @returns {Object} all cycles + current renewal recommendation
 */
export function getRenewalHistory(caseId, { tenantId = DEFAULT_TENANT_ID } = {}) {
  const ledger = readLedger(tenantId);
  const cycles = ledger.cycles.filter((c) => c.caseId === caseId);

  if (cycles.length === 0) {
    return { caseId, cycles: [], renewal: null };
  }

  const vendorKey = cycles[cycles.length - 1].vendor?.name || 'unknown';
  const renewal = computeRenewalRecommendation(ledger, caseId, vendorKey);

  return {
    caseId,
    vendor: cycles[cycles.length - 1].vendor,
    cycles: cycles.map((c) => ({
      cycleId: c.cycleId,
      timestamp: c.timestamp,
      verdict: c.verdict,
      spendCap: c.spendCap,
      netValue: c.metrics.netValue,
      accuracy: c.metrics.accuracy,
      wasteRatio: c.metrics.wasteRatio,
      casesProcessed: c.metrics.casesProcessed,
      policyEnforced: c.policyBlock.enforced,
      spendApproval: c.spendApproval || null,
      productionAccessDecision: c.productionAccessDecision || null,
      roiMethodology: c.roiMethodology || null,
      runId: c.runId,
      evidenceHash: c.evidenceHash || null,
      provenance: c.provenance || {
        mode: String(c.runId || '').startsWith('seed-run-') ? 'illustrative_seed' : 'observed_trial',
        source: String(c.runId || '').startsWith('seed-run-') ? 'legacy_seed' : 'legacy_trial_record',
        validationStatus: String(c.runId || '').startsWith('seed-run-') ? 'illustrative_not_observed' : 'observed',
      },
    })),
    renewal,
    totalAccumulatedValue: cycles.reduce((s, c) => s + c.metrics.netValue, 0),
    totalCasesProcessed: cycles.reduce((s, c) => s + c.metrics.casesProcessed, 0),
  };
}

/**
 * Seed the ledger with explicitly illustrative multi-cycle history for product navigation.
 * Creates 3 cycles showing progression: trial → expand → renew.
 */
export function seedIllustrativeRenewalHistory(caseId, caseDef, { tenantId = DEFAULT_TENANT_ID } = {}) {
  const ledger = readLedger(tenantId);

  // Don't seed if history already exists
  if (ledger.cycles.some((c) => c.caseId === caseId)) {
    return getRenewalHistory(caseId, { tenantId });
  }

  const vendorKey = caseDef.vendor.name;
  const now = Date.now();
  const monthMs = 30 * 24 * 60 * 60 * 1000;

  const caps = [100, 250, 500];
  const cycleCounts = [3, 2, 3, 3]; // varied cycle counts per vendor
  const baseNetValue = caseDef.roiMethodology.computed.netValue.value;
  const cases = caseDef.roiMethodology.baseline.inputs.cases?.value ||
    caseDef.roiMethodology.baseline.inputs.cves?.value ||
    caseDef.roiMethodology.baseline.inputs.invoices?.value ||
    caseDef.roiMethodology.baseline.inputs.prs?.value || 100;

  for (let i = 0; i < 3; i++) {
    const cap = caps[i];
    // Simulate improving accuracy over cycles
    const accuracy = Math.min(0.97, 0.88 + i * 0.04);
    const wasteRatio = Math.max(0.03, 0.10 - i * 0.02);
    const volumeMultiplier = cap / 100;

    // For vendors with fewer cycles, stop early (cycleCounts controls this)
    const vendorIndex = ['safety-ops-complaint-triage', 'engineering-code-review', 'security-ops-threat-detection', 'finance-ops-invoice-audit'].indexOf(caseId);
    const maxCycles = vendorIndex >= 0 ? cycleCounts[vendorIndex] : 3;
    if (i >= maxCycles) continue;

    const cycle = {
      cycleId: `seed-cycle-${caseId}-${i}`,
      tenantId,
      runId: `seed-run-${i}`,
      caseId,
      vendor: caseDef.vendor,
      buyer: caseDef.buyer,
      domain: caseDef.domain,
      timestamp: new Date(now - (2 - i) * monthMs).toISOString(),
      verdict: i === 2 && caseId === 'finance-ops-invoice-audit' ? 'REVISE' : 'CONTINUE',
      confidence: i === 0 ? 'medium' : 'high',
      spendCap: cap,
      metrics: {
        netValue: Math.round(baseNetValue * volumeMultiplier * (1 + i * 0.12)),
        wasteRatio,
        riskAdjustedROI: Math.round((baseNetValue * volumeMultiplier) / Math.max(1, cap * 3) * 10) / 10,
        throughputUplift: caseDef.roiMethodology.computed.productivityLift?.value || 7,
        annualizedValue: Math.round(baseNetValue * 12 * (1 + i * 0.08)),
        accuracy,
        casesProcessed: Math.round(cases * volumeMultiplier),
        falsePositiveRate: Math.max(0.01, 0.06 - i * 0.015),
      },
      claimValidation: {
        total: caseDef.vendor.claims.length,
        validated: caseDef.vendor.claims.length - (i === 0 ? 1 : 0),
        failed: i === 0 ? 1 : 0,
        partiallyMet: 0,
        anyCriticalFailure: false,
        overallVerdict: i === 0 ? 'partial' : 'validated',
      },
      policyBlock: { status: 403, enforced: true },
      roiMethodology: caseDef.roiMethodology,
      evidenceHash: `seed-hash-${caseId}-${i}`,
      provenance: {
        mode: 'illustrative_seed',
        source: 'deterministic_seed_fixture',
        validationStatus: 'illustrative_not_observed',
        note: 'Illustrative renewal history for product navigation only; not observed business history.',
      },
      renewal: null,
    };

    ledger.cycles.push(cycle);

    if (!ledger.vendors[vendorKey]) {
      ledger.vendors[vendorKey] = { cycles: [], caseId };
    }
    ledger.vendors[vendorKey].cycles.push(cycle.cycleId);
  }

  // Compute renewal for the seeded history
  const renewal = computeRenewalRecommendation(ledger, caseId, vendorKey);
  ledger.cycles[ledger.cycles.length - 1].renewal = renewal;

  writeLedger(ledger, tenantId);

  return getRenewalHistory(caseId, { tenantId });
}

/**
 * Get a summary of all vendor relationships for a dashboard view.
 */
export function getAllVendorRelationships({ tenantId = DEFAULT_TENANT_ID } = {}) {
  const ledger = readLedger(tenantId);
  const relationships = [];

  for (const [vendorKey, data] of Object.entries(ledger.vendors)) {
    const cycles = ledger.cycles.filter((c) => c.vendor?.name === vendorKey);
    if (cycles.length === 0) continue;

    const latest = cycles[cycles.length - 1];
    const renewal = computeRenewalRecommendation(ledger, data.caseId, vendorKey);
    const illustrativeCycles = cycles.filter((c) => (c.provenance?.mode || '').includes('seed') || String(c.runId || '').startsWith('seed-run-')).length;
    const observedCycles = cycles.length - illustrativeCycles;
    const historyMode = observedCycles > 0
      ? illustrativeCycles > 0 ? 'mixed_observed_and_illustrative' : 'observed_trial'
      : 'illustrative_seed';

    relationships.push({
      vendor: latest.vendor,
      caseId: data.caseId,
      domain: latest.domain,
      cycleCount: cycles.length,
      observedCycles,
      illustrativeCycles,
      historyMode,
      historyLabel: historyMode === 'illustrative_seed'
        ? 'Illustrative seeded history — not observed business history'
        : historyMode === 'mixed_observed_and_illustrative'
          ? 'Mixed observed trial cycles and illustrative seeded history'
          : 'Observed trial history',
      latestVerdict: latest.verdict,
      totalValue: cycles.reduce((s, c) => s + c.metrics.netValue, 0),
      totalCases: cycles.reduce((s, c) => s + c.metrics.casesProcessed, 0),
      latestSpendCap: latest.spendCap,
      latestApprovalStatus: latest.spendApproval?.status || null,
      approvalRequired: latest.spendApproval?.required === true,
      productionAccessStatus: latest.productionAccessDecision?.status || null,
      productionAccessApproved: latest.productionAccessDecision?.approved === true,
      renewalAction: renewal.action,
      renewalRecommendation: renewal.recommendation,
    });
  }

  return relationships;
}

export function getRenewalExport({ tenantId = DEFAULT_TENANT_ID } = {}) {
  const ledger = readLedger(tenantId);
  return {
    relationships: getAllVendorRelationships({ tenantId }),
    cycles: Array.isArray(ledger.cycles) ? ledger.cycles.map(normalizeCycleForExport) : [],
  };
}

function normalizeCycleForExport(cycle = {}) {
  const seeded = (cycle.provenance?.mode || '').includes('seed') || String(cycle.runId || '').startsWith('seed-run-');
  const caseDef = getCaseById(cycle.caseId);
  return {
    ...cycle,
    roiMethodology: cycle.roiMethodology || (seeded && caseDef?.roiMethodology ? caseDef.roiMethodology : undefined),
    provenance: cycle.provenance || {
      mode: seeded ? 'illustrative_seed' : 'legacy_trial_record',
      source: seeded ? 'legacy_seed' : 'legacy_trial_record',
      validationStatus: seeded ? 'illustrative_not_observed' : 'observed',
    },
  };
}

/**
 * Clear the ledger (for testing/reset).
 */
export function clearLedger({ tenantId } = {}) {
  if (tenantId) writeLedger(EMPTY_LEDGER, tenantId);
  else clearTenantStore();
}
