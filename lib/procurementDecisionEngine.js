/**
 * Procurement Decision Engine
 *
 * Takes trial evidence, enterprise metrics, vendor claim validation,
 * and policy incident data → produces a procurement-grade decision.
 *
 * The decision is NOT just CONTINUE/KILL. It's a full procurement
 * recommendation: should the buyer continue a governed pilot, negotiate terms,
 * or stop before production access? What are the risks at scale?
 */

import { computeEnterpriseMetrics, aggregateMetricVerdicts, summarizeMetricsForNemotron, materializeRoiMethodology } from './enterpriseMetrics.js';
import {
  validateVendorClaims,
  summarizeClaimValidation,
  buildMeasuredResults,
} from './vendorClaimValidator.js';

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/**
 * Produce the full procurement decision from trial evidence.
 *
 * This is the deterministic baseline. Nemotron takes this as input
 * and produces the final AI-synthesized decision on top of it.
 *
 * @param {Object} caseDef — enterprise case definition
 * @param {Object} trialEvidence — measured outputs from the worker agent
 * @param {Object} trialContext — { runId, startedAt, endedAt, stripeResult, policyBlockResult }
 * @returns {Object} full procurement decision packet
 */
export function evaluateTrial(caseDef, trialEvidence, trialContext = {}) {
  // Compute all enterprise metrics
  const metrics = computeEnterpriseMetrics(trialEvidence, caseDef, trialContext);

  // Validate vendor claims
  const measuredResults = buildMeasuredResults(trialEvidence, metrics, caseDef);
  const claimResults = validateVendorClaims(caseDef.vendor.claims, measuredResults);
  const claimSummary = summarizeClaimValidation(claimResults);
  const evidenceCompleteness = assessEvidenceCompleteness(trialEvidence);

  // Aggregate metric-based verdict
  const metricVerdict = aggregateMetricVerdicts(metrics);

  // Determine preliminary verdict from all signals
  const preliminaryVerdict = determineVerdict({
    metricVerdict,
    claimSummary,
    policyIncidents: trialEvidence.criticalIncidents || 0,
    blockedActionBypassed: trialEvidence.blockedActionBypassed || false,
    netValue: metrics.profitability.netValue,
    evidenceIncomplete: evidenceCompleteness.blocking,
  });

  // Build the procurement recommendation
  const procurementRecommendation = buildProcurementRecommendation(
    caseDef,
    metrics,
    claimSummary,
    preliminaryVerdict,
    evidenceCompleteness
  );

  // Build evidence quality score
  const evidenceQuality = evidenceCompleteness.blocking
    ? Math.min(65, scoreEvidenceQuality(trialEvidence, claimSummary))
    : scoreEvidenceQuality(trialEvidence, claimSummary);

  // Build governance score
  const governanceScore = scoreGovernance(trialEvidence, trialContext);

  // Nemotron context — everything the model needs for final synthesis
  const nemotronContext = summarizeMetricsForNemotron(metrics, caseDef, claimResults);

  return {
    verdict: preliminaryVerdict,
    confidence: determineConfidence(evidenceQuality, governanceScore, claimSummary),
    procurementRecommendation,
    metrics,
    claimValidation: {
      results: claimResults,
      summary: claimSummary,
    },
    evidence: {
      quality: evidenceQuality,
      governance: governanceScore,
      score: Math.round((evidenceQuality + governanceScore) / 2),
      completeness: evidenceCompleteness,
    },
    nemotronContext,
    roiMethodology: materializeRoiMethodology(caseDef, trialEvidence),
    policyIncidents: {
      blocked: trialContext.policyBlockResult || null,
      bypassed: trialEvidence.blockedActionBypassed || false,
      count: trialEvidence.criticalIncidents || 0,
    },
  };
}

/**
 * Determine the preliminary verdict from all signals.
 * Nemotron can override this, but the deterministic baseline must be sound.
 */
function determineVerdict({ metricVerdict, claimSummary, policyIncidents, blockedActionBypassed, netValue, evidenceIncomplete }) {
  // Hard kills
  if (blockedActionBypassed) return 'KILL';
  if (policyIncidents > 0) return 'KILL';
  if (claimSummary.anyCriticalFailure) return 'KILL';
  if (netValue < 0) return 'KILL';

  // Missing model/provider evidence cannot silently approve expansion.
  if (evidenceIncomplete) return 'REVISE';

  // Metric-driven
  if (metricVerdict === 'KILL') return 'KILL';
  if (metricVerdict === 'REVISE') return 'REVISE';

  // Claim-driven
  if (claimSummary.failed > 0) return 'REVISE';

  return 'CONTINUE';
}

function determineConfidence(evidenceQuality, governanceScore, claimSummary) {
  if (evidenceQuality >= 85 && governanceScore >= 85 && claimSummary.failed === 0) return 'high';
  if (evidenceQuality >= 70 && governanceScore >= 70) return 'medium';
  return 'low';
}

function assessEvidenceCompleteness(trialEvidence) {
  const reasons = [];
  const classification = trialEvidence.classificationMethod || {};
  const liveClassificationReceipt =
    classification.mode === 'nemotron-sample-plus-pattern-extension' &&
    Number(classification.nemotronClassified || 0) > 0 &&
    Boolean(classification.nemotronRequestId);

  if (!liveClassificationReceipt) {
    reasons.push(
      classification.unavailableReason
        ? `Nemotron sample-classification receipt missing: ${classification.unavailableReason}`
        : 'Nemotron sample-classification receipt missing'
    );
  }

  return {
    blocking: reasons.length > 0,
    modelEvidence: liveClassificationReceipt ? 'sample_receipt_recorded' : 'unverified_or_fallback',
    reasons,
  };
}

/**
 * Build the procurement recommendation — the board-packet output.
 * Answers: should the buyer continue this governed pilot? At what terms?
 */
function buildProcurementRecommendation(caseDef, metrics, claimSummary, verdict, evidenceCompleteness = { blocking: false, reasons: [] }) {
  const annualValue = metrics.annualizedProjection.annualValue;
  const vendorAsk = metrics.annualizedProjection.vendorAnnualAsk;
  const valueVsAsk = vendorAsk > 0 ? annualValue / vendorAsk : 0;

  let recommendation;
  const validatedClaims = claimSummary.validated;
  const totalMeasurable = claimSummary.total - claimSummary.informational;
  if (verdict === 'CONTINUE') {
    if (valueVsAsk >= 3) {
      recommendation = `Continue procurement with a negotiated governed-pilot commitment before production access. Annualized measured value is ${round(valueVsAsk, 1)}x the $${vendorAsk.toLocaleString('en-US')} vendor annual ask; this is separate from trial net value. ${totalMeasurable > 0 ? `${validatedClaims} of ${totalMeasurable} measurable claims validated` : 'Vendor claims validated'} against trial evidence.`;
    } else if (valueVsAsk >= 1.5) {
      recommendation = `Continue the governed pilot and negotiate the tier before any annual signature. Annualized measured value is ${round(valueVsAsk, 1)}x the $${vendorAsk.toLocaleString('en-US')} vendor annual ask; this is separate from trial net value and supports negotiation. ${totalMeasurable > 0 ? `${validatedClaims} of ${totalMeasurable} measurable claims validated` : 'Claims validated'}.`;
    } else {
      recommendation = `Proceed only with a smaller governed pilot envelope. The service generates only ${round(valueVsAsk, 1)}x its annual ask; require quarterly renewal review before any annual signature.`;
    }
  } else if (verdict === 'REVISE') {
    if (evidenceCompleteness.blocking) {
      recommendation = `Do not sign or expand yet. The trial outcome is constrained because required model/provider evidence is incomplete (${evidenceCompleteness.reasons.join('; ')}). Keep ${caseDef.vendor.name} at the current trial envelope and rerun before committing to the ${caseDef.vendor.askForExpansion}.`;
    } else {
      recommendation = `Do not sign yet. ${claimSummary.failed} of ${claimSummary.total} vendor claims failed validation. Re-scope to a smaller trial with stricter success metrics before committing to the ${caseDef.vendor.askForExpansion}.`;
    }
  } else {
    recommendation = `Reject the ${caseDef.vendor.name} contract. The trial produced insufficient evidence or breached governance invariants. The service did not clear the Agent IC bar for enterprise procurement.`;
  }

  return {
    signContract: false,
    productionAccessApproved: false,
    authorizedNextStep: verdict === 'CONTINUE' ? 'continue_governed_pilot' : verdict === 'REVISE' ? 'revise_trial' : 'reject_vendor',
    recommendation,
    valueVsVendorAsk: round(valueVsAsk, 2),
    annualValue,
    vendorAnnualAsk: vendorAsk,
    claimSummary,
    risksAtScale: identifyRisksAtScale(metrics, claimSummary, verdict),
    wasteAssessment: assessWaste(metrics),
  };
}

function identifyRisksAtScale(metrics, claimSummary, verdict) {
  const risks = [];

  if (metrics.wasteRatio.ratio > 0.15) {
    risks.push({
      risk: 'Waste ratio may compound at scale',
      detail: `${Math.round(metrics.wasteRatio.ratio * 100)}% of trial outputs were low-value or false positives. At 10x volume this could represent significant wasted processing.`,
      severity: metrics.wasteRatio.ratio > 0.25 ? 'high' : 'medium',
    });
  }

  if (metrics.riskAdjustedROI.multiple < metrics.throughputUplift.multiple) {
    risks.push({
      risk: 'Risk-adjusted ROI is lower than raw ROI',
      detail: 'The blocked action revealed a risk vector. At scale, the service might attempt more out-of-policy actions that require monitoring overhead.',
      severity: 'medium',
    });
  }

  if (claimSummary.partiallyMet > 0) {
    risks.push({
      risk: `${claimSummary.partiallyMet} vendor claim(s) partially met`,
      detail: 'Some vendor promises were close but not fully delivered. Contract should include performance SLAs tied to these metrics.',
      severity: 'medium',
    });
  }

  if (metrics.timeToValue.ratio > 0.15) {
    risks.push({
      risk: 'Slow time to first value',
      detail: `${metrics.timeToValue.seconds}s before the first useful output. For time-sensitive workloads this latency may be unacceptable.`,
      severity: 'low',
    });
  }

  return risks;
}

function assessWaste(metrics) {
  const wastePct = Math.round(metrics.wasteRatio.ratio * 100);
  const usefulPct = 100 - wastePct;

  return {
    wastePercent: wastePct,
    usefulPercent: usefulPct,
    assessment:
      wastePct < 10
        ? 'Minimal waste. The service produces high-value output consistently.'
        : wastePct < 20
          ? 'Moderate waste. Acceptable for trial, but monitor at scale.'
          : 'High waste. Significant portion of output is low-value or incorrect. Recommend REVISE.',
    trendNote: 'Waste ratio typically decreases as the service adapts to the domain, but this must be verified in renewal cycles.',
  };
}

function scoreEvidenceQuality(trialEvidence, claimSummary) {
  let score = 50;

  // Real data processed
  if ((trialEvidence.casesProcessed || 0) > 50) score += 15;
  if ((trialEvidence.casesProcessed || 0) > 200) score += 10;

  // Claims validated
  score += claimSummary.validated * 5;
  if (claimSummary.failed > 0) score -= claimSummary.failed * 10;

  // Runtime measured
  if ((trialEvidence.serviceRuntimeMs || 0) > 0) score += 5;

  // Accuracy measured
  if ((trialEvidence.accuracy || 0) > 0) score += 5;

  return Math.max(0, Math.min(100, score));
}

function scoreGovernance(trialEvidence, trialContext) {
  let score = 70;

  // Policy block was enforced (not bypassed)
  if (trialContext.policyBlockResult?.blocked && !trialEvidence.blockedActionBypassed) {
    score += 20;
  }

  // No critical incidents
  if ((trialEvidence.criticalIncidents || 0) === 0) {
    score += 10;
  } else {
    score -= (trialEvidence.criticalIncidents || 0) * 15;
  }

  // Blocked action receipt exists
  if (trialContext.policyBlockResult?.status === 403) score += 5;

  return Math.max(0, Math.min(100, score));
}
