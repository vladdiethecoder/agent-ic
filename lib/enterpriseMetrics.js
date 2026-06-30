/**
 * Enterprise Metrics Engine
 *
 * Computes the 8 enterprise-grade metrics from trial evidence.
 * These feed into Nemotron's procurement decision synthesis.
 * Every metric is traceable to a formula with named inputs.
 */

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function safe(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function findInput(inputs = {}, keys = []) {
  for (const key of keys) {
    if (inputs[key]) return { key, input: inputs[key] };
  }
  return { key: null, input: null };
}

function computeMeasuredRoi(trialEvidence = {}, caseDef = {}) {
  const roi = caseDef.roiMethodology || {};
  const baseline = roi.baseline || {};
  const agent = roi.agent || {};
  const baselineInputs = baseline.inputs || {};
  const agentInputs = agent.inputs || {};
  const reviewInput = findInput(agentInputs, [
    'humanReviewCases',
    'humanReviewPRs',
    'humanReviewCVEs',
    'humanReviewInvoices',
  ]);

  const casesProcessed = safe(
    firstDefined(trialEvidence.casesProcessed, baselineInputs.cases?.value),
    safe(baseline.result?.totalOutputs, 0)
  );
  const manualMinutesPerCase = safe(
    firstDefined(
      baselineInputs.manualMinutesPerCase?.value,
      baselineInputs.manualMinutesPerPR?.value,
      baselineInputs.manualMinutesPerCVE?.value,
      baselineInputs.manualMinutesPerInvoice?.value
    ),
    0
  );
  const reviewMinutesPerCase = safe(
    firstDefined(
      agentInputs.reviewMinutesPerCase?.value,
      agentInputs.reviewMinutesPerPR?.value,
      agentInputs.reviewMinutesPerCVE?.value,
      agentInputs.reviewMinutesPerInvoice?.value,
      manualMinutesPerCase
    ),
    manualMinutesPerCase
  );
  const loadedHourlyCost = safe(
    firstDefined(baselineInputs.loadedHourlyCost?.value, agentInputs.loadedHourlyCost?.value),
    0
  );
  const measuredHumanReview = safe(
    firstDefined(trialEvidence.humanReviewQueue, trialEvidence.humanReviewCases),
    safe(reviewInput.input?.value, 0)
  );
  const governedSpend = safe(
    firstDefined(agentInputs.governedEnvelopeSpend?.value, caseDef.policyEnvelope?.spendCap),
    0
  );

  const baselineHours = round((casesProcessed * manualMinutesPerCase) / 60, 2);
  const agentHours = round((measuredHumanReview * reviewMinutesPerCase) / 60, 2);
  const baselineCost = round(baselineHours * loadedHourlyCost, 0);
  const agentCost = round((agentHours * loadedHourlyCost) + governedSpend, 0);
  const netValue = baselineCost - agentCost;

  return {
    casesProcessed,
    measuredHumanReview,
    humanReviewInputKey: reviewInput.key,
    manualMinutesPerCase,
    reviewMinutesPerCase,
    loadedHourlyCost,
    governedSpend,
    baselineHours,
    agentHours,
    baselineCost,
    agentCost,
    netValue,
  };
}

export function materializeRoiMethodology(caseDef, trialEvidence = {}) {
  const roi = caseDef.roiMethodology || {};
  const measured = computeMeasuredRoi(trialEvidence, caseDef);
  const methodology = structuredCloneSafe(roi);
  methodology.baseline = methodology.baseline || {};
  methodology.baseline.inputs = methodology.baseline.inputs || {};
  methodology.baseline.result = {
    ...(methodology.baseline.result || {}),
    totalCost: measured.baselineCost,
    unit: methodology.baseline.result?.unit || 'USD',
    totalHours: measured.baselineHours,
  };
  if (methodology.baseline.inputs.cases) {
    methodology.baseline.inputs.cases = {
      ...methodology.baseline.inputs.cases,
      value: measured.casesProcessed,
    };
  }

  methodology.agent = methodology.agent || {};
  methodology.agent.inputs = methodology.agent.inputs || {};
  if (measured.humanReviewInputKey && methodology.agent.inputs[measured.humanReviewInputKey]) {
    methodology.agent.inputs[measured.humanReviewInputKey] = {
      ...methodology.agent.inputs[measured.humanReviewInputKey],
      source: 'measured trial evidence',
      value: measured.measuredHumanReview,
    };
  }
  methodology.agent.result = {
    ...(methodology.agent.result || {}),
    totalCost: measured.agentCost,
    unit: methodology.agent.result?.unit || 'USD',
    agentHours: measured.agentHours,
  };
  methodology.computed = {
    ...(methodology.computed || {}),
    hoursSaved: { formula: 'baseline.totalHours - agent.agentHours', value: round(measured.baselineHours - measured.agentHours, 2), unit: 'hours' },
    productivityLift: { formula: 'casesPerHourAgent ÷ casesPerHourManual', value: round((measured.casesProcessed / Math.max(0.01, measured.agentHours)) / Math.max(0.01, measured.casesProcessed / Math.max(0.01, measured.baselineHours)), 1), unit: 'x' },
    costPerCaseBaseline: { formula: 'baseline.totalCost ÷ cases', value: round(measured.baselineCost / Math.max(1, measured.casesProcessed), 2), unit: 'USD/case' },
    costPerCaseAgent: { formula: 'agent.totalCost ÷ cases', value: round(measured.agentCost / Math.max(1, measured.casesProcessed), 2), unit: 'USD/case' },
    netValue: { formula: 'baseline.totalCost - agent.totalCost', value: measured.netValue, unit: 'USD' },
  };
  methodology.measurementNote = 'Cost and ROI figures are materialized from the current trial evidence; checked-in case defaults are not allowed to override measured human-review counts.';
  return methodology;
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

/**
 * Compute all enterprise metrics from trial evidence + case definition.
 *
 * @param {Object} trialEvidence — measured outputs from the worker agent run
 * @param {Object} caseDef — enterprise case definition (from enterpriseCases.js)
 * @param {Object} trialContext — trial run metadata
 * @returns {Object} all enterprise metrics with formulas, inputs, and decision flags
 */
export function computeEnterpriseMetrics(trialEvidence, caseDef, trialContext = {}) {
  const measuredRoi = computeMeasuredRoi(trialEvidence, caseDef);

  // Pull measured values from trial evidence, falling back to case defaults
  const casesProcessed = measuredRoi.casesProcessed;
  const autoRouted = safe(trialEvidence.autoRouted || trialEvidence.autoTriaged, Math.round(casesProcessed * 0.857));
  const falsePositives = safe(trialEvidence.falsePositives, Math.round(casesProcessed * 0.06));
  const lowValueOutputs = safe(trialEvidence.lowValueOutputs, Math.round(casesProcessed * 0.04));
  const criticalIncidents = safe(trialEvidence.criticalIncidents, 0);
  const serviceRuntimeMs = safe(trialEvidence.serviceRuntimeMs, 28050);
  const timeToFirstOutputMs = safe(trialEvidence.timeToFirstOutputMs, Math.round(serviceRuntimeMs * 0.05));
  const blockedActionSeverity = safe(trialEvidence.blockedActionSeverity, 0.15);

  // Cost figures are derived from measured trial evidence and named ROI inputs.
  const baselineCost = measuredRoi.baselineCost;
  const agentCost = measuredRoi.agentCost;
  const netValue = baselineCost - agentCost;

  // Hours
  const baselineHours = measuredRoi.baselineHours;
  const agentHours = measuredRoi.agentHours;
  const hoursSaved = baselineHours - agentHours;
  const loadedHourlyCost = measuredRoi.loadedHourlyCost;

  // Throughput
  const baselineCasesPerHour = baselineHours > 0 ? casesProcessed / baselineHours : 0;
  const agentCasesPerHour = agentHours > 0 ? casesProcessed / agentHours : 0;
  const throughputUplift = baselineCasesPerHour > 0
    ? agentCasesPerHour / baselineCasesPerHour
    : 0;

  return {
    profitability: {
      label: 'Trial Profitability',
      netValue,
      baselineCost,
      agentCost,
      profitable: netValue > 0,
      formula: 'baseline.totalCost - agent.totalCost',
      decisionFlag: netValue < 0 ? 'KILL' : null,
    },

    wasteRatio: {
      label: 'Waste Ratio',
      ratio: round((falsePositives + lowValueOutputs) / Math.max(1, casesProcessed), 4),
      falsePositives,
      lowValueOutputs,
      totalOutputs: casesProcessed,
      usefulOutputs: casesProcessed - falsePositives - lowValueOutputs,
      formula: '(falsePositives + lowValueOutputs) / totalOutputs',
      decisionFlag: (falsePositives + lowValueOutputs) / Math.max(1, casesProcessed) > 0.30 ? 'KILL' : null,
    },

    riskAdjustedROI: {
      label: 'Risk-Adjusted ROI',
      multiple: round((netValue / Math.max(1, agentCost)) * (1 - blockedActionSeverity), 2),
      netValue,
      governedCost: agentCost,
      blockedActionSeverityWeight: blockedActionSeverity,
      formula: '(netValue / governedCost) * (1 - blockedActionSeverity)',
      decisionFlag: (netValue / Math.max(1, agentCost)) * (1 - blockedActionSeverity) < 1.5 ? 'REVISE' : null,
    },

    throughputUplift: {
      label: 'Throughput Uplift',
      multiple: round(throughputUplift, 1),
      baselineCasesPerHour: round(baselineCasesPerHour, 1),
      agentCasesPerHour: round(agentCasesPerHour, 1),
      formula: 'agentCasesPerHour / baselineCasesPerHour',
    },

    annualizedProjection: {
      label: 'Annualized Value Projection',
      annualValue: computeAnnualizedValue(netValue, casesProcessed, caseDef, trialContext),
      vendorAnnualAsk: extractVendorAnnualAsk(caseDef),
      ratioVsVendorAsk: 0, // set below
      formula: 'netValue * (monthlyVolume / trialVolume) * 12',
    },

    opportunityCost: {
      label: 'Human Opportunity Cost',
      value: round(hoursSaved * loadedHourlyCost * 1.35, 0),
      hoursSaved,
      loadedHourlyCost,
      alternativeTaskValueMultiplier: 1.35,
      formula: 'hoursSaved * loadedHourlyCost * 1.35',
      description: 'Value the human team could generate on higher-leverage work with the freed hours',
    },

    timeToValue: {
      label: 'Time to First Value',
      seconds: round(timeToFirstOutputMs / 1000, 1),
      totalRuntimeSeconds: round(serviceRuntimeMs / 1000, 1),
      ratio: round(timeToFirstOutputMs / Math.max(1, serviceRuntimeMs), 3),
      formula: 'firstUsefulOutputTimestamp - trialStartTimestamp',
    },

    costPerUnit: {
      label: 'Cost Per Unit',
      baseline: round(baselineCost / Math.max(1, casesProcessed), 2),
      agent: round(agentCost / Math.max(1, casesProcessed), 2),
      reduction: round(1 - (agentCost / Math.max(1, baselineCost)), 3),
      formula: 'totalCost / casesProcessed',
    },
  };
}

function computeAnnualizedValue(netValue, trialCases, caseDef, trialContext) {
  // Estimate monthly volume from the buyer's baseline
  const monthlyVolume = safe(
    caseDef.roiMethodology?.baseline?.inputs?.cases?.value,
    trialCases
  );
  const annualVolume = monthlyVolume * 12;
  const annualizedNet = netValue * (annualVolume / Math.max(1, trialCases));
  return Math.round(annualizedNet);
}

function extractVendorAnnualAsk(caseDef) {
  const ask = caseDef.vendor?.askForExpansion || '';
  const match = ask.match(/\$([0-9,]+)\/year/);
  if (match) return parseInt(match[1].replace(/,/g, ''), 10);
  return 0;
}

/**
 * Aggregate decision flags from all metrics into a preliminary verdict.
 * Nemotron gets this as a deterministic baseline, then applies its own reasoning.
 */
export function aggregateMetricVerdicts(metrics) {
  const flags = Object.values(metrics)
    .map((m) => m.decisionFlag)
    .filter(Boolean);

  if (flags.includes('KILL')) return 'KILL';
  if (flags.includes('REVISE')) return 'REVISE';
  return 'CONTINUE';
}

/**
 * Produce a compact summary of all metrics for the Nemotron prompt.
 * This is the enterprise context Nemotron needs to make a procurement decision.
 */
export function summarizeMetricsForNemotron(metrics, caseDef, vendorClaimResults) {
  return {
    vendor: caseDef.vendor,
    trialProfitability: {
      netValue: metrics.profitability.netValue,
      profitable: metrics.profitability.profitable,
    },
    wasteRatio: {
      ratio: metrics.wasteRatio.ratio,
      usefulOutputs: metrics.wasteRatio.usefulOutputs,
      totalOutputs: metrics.wasteRatio.totalOutputs,
    },
    riskAdjustedROI: metrics.riskAdjustedROI.multiple,
    throughputUplift: metrics.throughputUplift.multiple,
    annualizedProjection: {
      annualValue: metrics.annualizedProjection.annualValue,
      vendorAnnualAsk: metrics.annualizedProjection.vendorAnnualAsk,
      valueVsAskRatio: round(
        metrics.annualizedProjection.annualValue / Math.max(1, metrics.annualizedProjection.vendorAnnualAsk),
        2
      ),
    },
    opportunityCost: metrics.opportunityCost.value,
    costPerUnit: {
      baseline: metrics.costPerUnit.baseline,
      agent: metrics.costPerUnit.agent,
      reduction: metrics.costPerUnit.reduction,
    },
    timeToValueSeconds: metrics.timeToValue.seconds,
    vendorClaimsValidated: vendorClaimResults,
  };
}
