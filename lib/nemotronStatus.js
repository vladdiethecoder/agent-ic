import { isNemotronLive } from './providerStatus.js';

export function buildNemotronStatus(evaluation, measuredLatencyMs = null) {
  const live = isNemotronLive();
  const model = process.env.NEMOTRON_MODEL || 'nvidia/nemotron-3-super-120b-a12b';

  return {
    state: live ? 'live' : 'fallback',
    model,
    provider: live ? 'NVIDIA NIM' : 'Local deterministic evaluator',
    latencyMs: measuredLatencyMs != null ? `${measuredLatencyMs}` : live ? '~800-1400' : '0 (deterministic)',
    badge: live ? 'NVIDIA NIM / Nemotron live' : 'Deterministic Nemotron-style fallback',
    evaluator: evaluation.evaluator,
    confidence: evaluation.confidence || null,
    rationale: evaluation.thesis || null,
    score: evaluation.score ?? null,
    governanceScore: evaluation.governanceScore ?? null,
    evidenceScore: evaluation.evidenceScore ?? null,
  };
}
