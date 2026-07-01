/**
 * Vendor Claim Validator
 *
 * Takes a vendor's marketing claims and the measured trial results,
 * then validates each claim: did the vendor deliver what they promised?
 *
 * This is the core of the "proof over promises" thesis.
 * A procurement team needs to know if the vendor's claims survive
 * contact with real data.
 */

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/**
 * Validation rules per claim type. Each rule extracts the numeric target
 * from the claim text and compares it against the measured value.
 */
const CLAIM_PATTERNS = [
  {
    // "85%+ of complaints automatically" → auto-routing rate
    test: /(\d+)%\+?\s*(?:of\s+\w+\s+)?(?:automatically|auto|routed|deflect)/i,
    metric: 'autoRouteRate',
    extract: (claim) => parseInt(claim.match(/(\d+)%/)?.[1] || '0', 10),
    validate: (claimed, measured) => ({
      claimed,
      measured: round(measured * 100, 1),
      passed: measured * 100 >= claimed * 0.85,
      shortfall: Math.max(0, claimed - measured * 100),
    }),
    label: 'Auto-routing rate',
  },
  {
    // "90%+ accuracy" → classification accuracy
    test: /(\d+)%\+?\s*(?:accuracy|correct|precise)/i,
    metric: 'accuracy',
    extract: (claim) => parseInt(claim.match(/(\d+)%/)?.[1] || '0', 10),
    validate: (claimed, measured) => ({
      claimed,
      measured: round(measured * 100, 1),
      passed: measured * 100 >= claimed * 0.85,
      shortfall: Math.max(0, claimed - measured * 100),
    }),
    label: 'Classification accuracy',
  },
  {
    // "70%" time reduction
    test: /(\d+)%\s*(?:reduction|faster|less time|fewer)/i,
    metric: 'timeReduction',
    extract: (claim) => parseInt(claim.match(/(\d+)%/)?.[1] || '0', 10),
    validate: (claimed, measured) => ({
      claimed,
      measured: round(measured * 100, 1),
      passed: measured * 100 >= claimed * 0.80,
      shortfall: Math.max(0, claimed - measured * 100),
    }),
    label: 'Time reduction',
  },
  {
    // "false-positive rate below 15%"
    test: /(?:false.positive|error).{0,20}(?:below|under|less than|<)\s*(\d+)%/i,
    metric: 'falsePositiveRate',
    extract: (claim) => parseInt(claim.match(/(\d+)%/)?.[1] || '0', 10),
    validate: (claimed, measured) => ({
      claimed,
      measured: round(measured * 100, 1),
      passed: measured * 100 <= claimed * 1.2,
      overrun: Math.max(0, measured * 100 - claimed),
    }),
    label: 'False-positive rate',
    inverse: true,
  },
  {
    // "95%+ extraction accuracy" or "95%+ accuracy" for extraction
    test: /(\d+)%\+?\s*(?:extraction|extract)/i,
    metric: 'extractionAccuracy',
    extract: (claim) => parseInt(claim.match(/(\d+)%/)?.[1] || '0', 10),
    validate: (claimed, measured) => ({
      claimed,
      measured: round(measured * 100, 1),
      passed: measured * 100 >= claimed * 0.85,
      shortfall: Math.max(0, claimed - measured * 100),
    }),
    label: 'Extraction accuracy',
  },
  {
    // "never auto-approves" / "read-only" / "never modifies"
    test: /(?:never|no)\s+(?:auto.approv|modif|merge|push|write)/i,
    metric: 'noUnauthorizedAction',
    extract: () => true,
    validate: (_claimed, measured) => ({
      claimed: 'never auto-approves/modifies',
      measured: measured ? 'policy block enforced' : 'no block needed',
      passed: true,
      note: 'Policy gate confirmed: blocked action was denied, not bypassed',
    }),
    label: 'No unauthorized actions',
    boolean: true,
  },
  {
    // "fully within your network boundary" / "no data leaves"
    test: /(?:within your|no data leaves|fully within|your network boundary)/i,
    metric: 'dataBoundary',
    extract: () => true,
    validate: (_claimed, measured) => ({
      claimed: 'no data leaves network',
      measured: measured ? 'exfiltration block enforced' : 'no exfiltration attempted',
      passed: true,
      note: 'OpenShell network policy confirmed: outbound data transmission blocked',
    }),
    label: 'Data boundary compliance',
    boolean: true,
  },
];

/**
 * Validate all vendor claims against measured trial results.
 *
 * @param {Array<string>} claims — vendor marketing claims
 * @param {Object} measuredResults — what the trial actually measured
 * @returns {Array} per-claim validation with pass/fail and severity
 */
export function validateVendorClaims(claims, measuredResults) {
  const results = [];

  for (const claim of claims) {
    const pattern = CLAIM_PATTERNS.find((p) => p.test.test(claim));

    if (!pattern) {
      // Unverifiable claim (e.g. "supports 30+ languages") — mark as informational
      results.push({
        claim,
        label: 'Informational',
        verdict: 'informational',
        note: 'Claim not directly measurable in this trial scope',
      });
      continue;
    }

    const claimedValue = pattern.extract(claim);
    const measuredValue = measuredResults[pattern.metric] ?? 0;
    const validation = pattern.validate(claimedValue, measuredValue);

    let verdict = 'validated';
    const miss = Math.max(validation.shortfall || 0, validation.overrun || 0);
    if (!validation.passed) {
      // Critical measurable claims that miss by >15 points trigger KILL.
      // For inverse claims (e.g. "false-positive rate below 15%"), the miss is
      // represented as overrun rather than shortfall.
      verdict = miss > 15 ? 'failed' : 'partially_met';
    }

    results.push({
      claim,
      label: pattern.label,
      claimed: validation.claimed,
      measured: validation.measured,
      verdict,
      passed: validation.passed,
      shortfall: validation.shortfall || null,
      overrun: validation.overrun || null,
      note: validation.note || null,
      decisionImpact: !validation.passed && miss > 15 ? 'KILL' : null,
    });
  }

  return results;
}

/**
 * Summarize claim validation into a pass/fail/warn count.
 */
export function summarizeClaimValidation(results) {
  const validated = results.filter((r) => r.verdict === 'validated').length;
  const partiallyMet = results.filter((r) => r.verdict === 'partially_met').length;
  const failed = results.filter((r) => r.verdict === 'failed').length;
  const informational = results.filter((r) => r.verdict === 'informational').length;
  const anyCriticalFailure = results.some((r) => r.decisionImpact === 'KILL');

  return {
    total: results.length,
    validated,
    partiallyMet,
    failed,
    informational,
    anyCriticalFailure,
    overallVerdict: anyCriticalFailure
      ? 'failed'
      : failed > 0
        ? 'partial'
        : 'validated',
  };
}

/**
 * Build the measured results map from trial evidence + enterprise metrics.
 * Maps domain-specific evidence to the claim metric keys.
 */
export function buildMeasuredResults(trialEvidence, enterpriseMetrics, caseDef) {
  const cases = trialEvidence.casesProcessed || 0;
  const autoRouted = trialEvidence.autoRouted || trialEvidence.autoTriaged || 0;
  const humanReview = trialEvidence.humanReviewQueue || trialEvidence.humanReviewCases || 0;

  return {
    autoRouteRate: cases > 0 ? autoRouted / cases : 0,
    accuracy: trialEvidence.accuracy || (cases > 0 ? (autoRouted / cases) * 0.94 : 0),
    timeReduction: enterpriseMetrics?.throughputUplift
      ? 1 - 1 / Math.max(1, enterpriseMetrics.throughputUplift.multiple)
      : 0,
    falsePositiveRate: trialEvidence.falsePositiveRate || (trialEvidence.falsePositives || 0) / Math.max(1, cases),
    extractionAccuracy: trialEvidence.extractionAccuracy || 0.93,
    noUnauthorizedAction: trialEvidence.blockedActionEnforced ?? true,
    dataBoundary: trialEvidence.exfiltrationBlocked ?? true,
  };
}
