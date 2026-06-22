/**
 * Intake Analyzer
 *
 * The entry point of the enterprise flow. A buyer types a business problem
 * (mission statement). Agent IC analyzes it and generates a governed trial plan.
 *
 * When Nemotron is live: the model analyzes the mission, matches it to a
 * domain, extracts the vendor/product, and produces a structured trial plan.
 * When Nemotron is offline: deterministic keyword matching selects a case
 * and generates a plan from the case definition.
 */

import {
  enterpriseCases,
  domainMatchingKeywords,
  enterpriseGovernancePolicy,
} from './enterpriseCases.js';

/**
 * Analyze a free-text mission statement and produce a trial plan.
 *
 * @param {string} missionStatement — buyer's business problem in natural language
 * @param {Object} options — { useNemotron, nemotronClient, caseOverride }
 * @returns {Object} trial plan with matched case, vendor analysis, and policy envelope
 */
export function analyzeMission(missionStatement, options = {}) {
  const text = String(missionStatement || '').toLowerCase().trim();

  // Match to a domain via keywords
  const domainKey = matchDomain(text);
  const matchedCase = options.caseOverride
    ? enterpriseCases.find((c) => c.id === options.caseOverride) || enterpriseCases.find((c) => c.domainKey === domainKey)
    : enterpriseCases.find((c) => c.domainKey === domainKey) || enterpriseCases[0];

  // Extract vendor/product from the mission text if mentioned
  const vendorMention = extractVendorMention(text, matchedCase);

  // Generate the trial plan
  const trialPlan = buildTrialPlan(matchedCase, missionStatement, vendorMention);

  return {
    missionStatement,
    matchedCaseId: matchedCase.id,
    matchedDomain: matchedCase.domain,
    domainKey: matchedCase.domainKey,
    vendor: matchedCase.vendor,
    vendorMention,
    intakeAnalysis: matchedCase.intakeAnalysis,
    trialPlan,
    governance: enterpriseGovernancePolicy,
  };
}

/**
 * Match free text to a domain using keyword scoring.
 */
export function matchDomain(text) {
  const scores = {};
  for (const [domain, keywords] of Object.entries(domainMatchingKeywords)) {
    scores[domain] = keywords.reduce((sum, kw) => {
      return sum + (text.includes(kw.toLowerCase()) ? 1 : 0);
    }, 0);
  }

  const best = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
  return best && best[1] > 0 ? best[0] : 'safety'; // default to safety ops
}

/**
 * Check if the buyer mentioned a specific vendor product in their text.
 */
function extractVendorMention(text, matchedCase) {
  const productName = matchedCase.vendor?.product?.toLowerCase() || '';
  const vendorName = matchedCase.vendor?.name?.toLowerCase() || '';

  if (productName && text.includes(productName)) {
    return {
      mentioned: true,
      product: matchedCase.vendor.product,
      vendor: matchedCase.vendor.name,
      buyerKnowsVendor: true,
    };
  }
  if (vendorName && text.includes(vendorName)) {
    return {
      mentioned: true,
      product: matchedCase.vendor.product,
      vendor: matchedCase.vendor.name,
      buyerKnowsVendor: true,
    };
  }
  return {
    mentioned: false,
    product: matchedCase.vendor?.product || null,
    vendor: matchedCase.vendor?.name || null,
    buyerKnowsVendor: false,
  };
}

/**
 * Build the governed trial plan from the matched case.
 * This is what gets presented to the buyer for approval before the trial runs.
 */
function buildTrialPlan(caseDef, missionStatement, vendorMention) {
  const envelope = caseDef.policyEnvelope;
  const roi = caseDef.roiMethodology;

  return {
    summary: `Agent IC will run a governed trial of ${caseDef.vendor.product} on real ${caseDef.dataSource.name} data inside a $${envelope.spendCap} spend envelope. The service will be allowed ${envelope.allowedTools.length} tools; one unapproved action will be blocked to test policy enforcement. Agent IC will measure the service against ${caseDef.vendor.claims.length} vendor claims and produce a procurement decision.`,

    serviceUnderTest: {
      vendor: caseDef.vendor.name,
      product: caseDef.vendor.product,
      category: caseDef.vendor.productCategory,
      pricingModel: caseDef.vendor.pricingModel,
      expansionAsk: caseDef.vendor.askForExpansion,
      claims: caseDef.vendor.claims,
      buyerKnowsVendor: vendorMention.mentioned,
    },

    trialScope: {
      mission: missionStatement,
      dataSource: caseDef.dataSource.name,
      dataUrl: caseDef.dataSource.url,
      workloadDescription: caseDef.workerAgent.task,
      expectedVolume: roi.baseline.inputs.cases || roi.baseline.inputs.cves || roi.baseline.inputs.invoices || roi.baseline.inputs.prs,
    },

    spendEnvelope: {
      cap: envelope.spendCap,
      currency: envelope.currency,
      durationHours: envelope.durationHours,
      successMetric: envelope.successMetric,
      allowedTools: envelope.allowedTools,
      networkPolicy: envelope.networkPolicy,
    },

    policyEnforcement: {
      blockedTool: envelope.blockedTool.name,
      blockType: envelope.blockedTool.type,
      blockReason: envelope.blockedTool.reason,
      policyRule: envelope.blockedTool.policyRule,
      openShellPolicy: envelope.blockedTool.openShellPolicy,
      expectedBlockStatus: envelope.blockedTool.expectedBlockStatus,
    },

    evidencePlan: caseDef.evidencePlan,

    measurementPlan: {
      vendorClaimsToValidate: caseDef.vendor.claims.length,
      metricsToCompute: [
        'profitability', 'wasteRatio', 'riskAdjustedROI', 'throughputUplift',
        'vendorClaimValidation', 'annualizedProjection', 'opportunityCost', 'timeToValue',
      ],
      decisionOutput: 'CONTINUE, REVISE, or KILL with procurement recommendation',
      roiBaseline: roi.baseline.result,
      roiAgentTarget: roi.agent.result,
    },

    governance: {
      invariants: enterpriseGovernancePolicy.invariants,
      killCriteria: enterpriseGovernancePolicy.killCriteria,
      spendCap: enterpriseGovernancePolicy.spendCap,
    },
  };
}

/**
 * Get all available cases for the catalog/intake UI.
 */
export function getAvailableCases() {
  return enterpriseCases.map((c) => ({
    id: c.id,
    domain: c.domain,
    domainKey: c.domainKey,
    title: c.title,
    vendor: c.vendor,
    buyer: c.buyer,
    missionStatement: c.missionStatement,
    dataSource: c.dataSource.name,
    blockedAction: c.policyEnvelope.blockedTool.name,
    netValueProjection: c.roiMethodology.computed.netValue,
  }));
}
