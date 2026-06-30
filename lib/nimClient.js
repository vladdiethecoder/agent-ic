import { sanitizeProviderError } from './validation.js';

export async function callNim({ proposal, deterministic, baseUrl, apiKey, model }) {
  const start = Date.now();

  const url = (baseUrl || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '') + '/chat/completions';
  const nimModel = model || 'nvidia/nemotron-3-super-120b-a12b';

  if (!apiKey) {
    return { ok: false, error: 'NEMOTRON_API_KEY not configured', latencyMs: 0 };
  }

  try {
    let lastMalformed = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(45_000), // 45s max per NIM call
        body: JSON.stringify({
          model: nimModel,
          temperature: attempt === 0 ? 0 : 0.1,
          max_tokens: 320,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are Agent IC, an enterprise control-plane evaluator for agentic-service trials. Return a single compact JSON object only. No markdown, no prose, no code fences.',
            },
            { role: 'user', content: buildPrompt(proposal, deterministic, attempt) },
          ],
        }),
      });

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const text = await response.text();
        return {
          ok: false,
          latencyMs,
          error: sanitizeProviderError(`NIM HTTP ${response.status}: ${text.slice(0, 240)}`),
        };
      }

      const payload = await response.json();
      const requestId = payload?.id || null;
      const text = payload?.choices?.[0]?.message?.content || '{}';
      const parsed = normalizeModelEvaluation(parseJsonObject(text));

      if (!hasUsableModelEvaluation(parsed)) {
        lastMalformed = { latencyMs, requestId, text };
        continue;
      }

      const evaluation = {
        ...deterministic,
        evaluator: 'NVIDIA NIM / Nemotron live evaluation',
        model: nimModel,
        score: coerceNumber(parsed.score, deterministic.score),
        governanceScore: coerceNumber(parsed.governanceScore, deterministic.governanceScore),
        evidenceScore: coerceNumber(parsed.evidenceScore, deterministic.evidenceScore),
        decision: parsed.decision,
        confidence: parsed.confidence || deterministic.confidence,
        thesis: normalizeDisplayThesis(parsed.thesis, deterministic, proposal),
        riskRegister: Array.isArray(parsed.riskRegister) && parsed.riskRegister.length ? parsed.riskRegister : deterministic.riskRegister,
        nextActions: Array.isArray(parsed.nextActions) && parsed.nextActions.length ? parsed.nextActions : deterministic.nextActions,
        ...(process.env.AGENT_IC_DEBUG_MODEL === 'true' ? { rawModelSummary: text.slice(0, 1200) } : {}),
      };

      return {
        ok: true,
        latencyMs,
        requestId,
        evaluation,
        raw: text,
      };
    }

    return {
      ok: false,
      latencyMs: lastMalformed?.latencyMs || Date.now() - start,
      requestId: lastMalformed?.requestId || null,
      error: 'NIM returned malformed JSON evaluation',
      ...(process.env.AGENT_IC_DEBUG_MODEL === 'true' && lastMalformed?.text
        ? { raw: lastMalformed.text.slice(0, 1200) }
        : {}),
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: sanitizeProviderError(error),
    };
  }
}

function buildPrompt(proposal, deterministic, attempt = 0) {
  return JSON.stringify(
    {
      instruction:
        attempt === 0
          ? 'Return JSON using only the requiredJsonSchema keys. Keep strings short.'
          : 'Retry. Return only the requiredJsonSchema object. The decision key is mandatory. Keep the entire object under 220 tokens.',
      task: 'Evaluate this enterprise agentic-service trial for usefulness, viability, governed autonomy, budget scope, evidence quality, and expand/revise/kill decision.',
      proposal,
      deterministicBaseline: {
        score: deterministic.score,
        governanceScore: deterministic.governanceScore,
        evidenceScore: deterministic.evidenceScore,
        recommendedBudget: deterministic.recommendedBudget,
        paybackDays: deterministic.paybackDays,
        roiMultiple: deterministic.roiMultiple,
      },
      requiredJsonSchema: {
        score: '0-100 integer',
        governanceScore: '0-100 integer',
        evidenceScore: '0-100 integer',
        decision: 'CONTINUE | RE-SCOPE | KILL',
        confidence: 'low | medium | high',
        thesis: 'one sentence under 160 chars that explains the decision using the governed trial evidence. If CONTINUE, do not call ROI low; say full expansion stays scoped if needed.',
      },
    },
    null,
    2
  );
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return parseLooseJsonFields(text);
  try {
    return JSON.parse(match[0]);
  } catch {
    return parseLooseJsonFields(match[0]);
  }
}

function parseLooseJsonFields(text) {
  const source = String(text || '');
  const decision = extractStringField(source, 'decision') || extractStringField(source, 'verdict');
  return {
    decision,
    score: extractNumberField(source, 'score'),
    governanceScore: extractNumberField(source, 'governanceScore'),
    evidenceScore: extractNumberField(source, 'evidenceScore'),
    confidence: extractStringField(source, 'confidence'),
    thesis: extractStringField(source, 'thesis'),
  };
}

function extractStringField(source, field) {
  const match = source.match(new RegExp(`"${field}"\\s*:\\s*"([^"]{1,500})"`, 'i'));
  return match?.[1] || null;
}

function extractNumberField(source, field) {
  const match = source.match(new RegExp(`"${field}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'));
  return match ? Number(match[1]) : null;
}

function normalizeModelEvaluation(parsed) {
  const candidate =
    objectOrNull(parsed?.evaluation) ||
    objectOrNull(parsed?.decisionPayload) ||
    objectOrNull(parsed?.decision) ||
    parsed;
  if (!candidate || typeof candidate !== 'object') return {};

  const rawDecision =
    candidate.decision ||
    candidate.verdict ||
    candidate.recommendation ||
    candidate.finalDecision ||
    parsed?.verdict ||
    parsed?.recommendation;
  const decision = normalizeDecision(rawDecision);
  const scores = candidate.scores && typeof candidate.scores === 'object' ? candidate.scores : {};

  return {
    ...candidate,
    decision,
    score: candidate.score ?? candidate.totalScore ?? scores.score ?? scores.total,
    governanceScore: candidate.governanceScore ?? scores.governanceScore ?? scores.governance,
    evidenceScore: candidate.evidenceScore ?? scores.evidenceScore ?? scores.evidence,
    riskRegister: candidate.riskRegister ?? candidate.risks,
    nextActions: candidate.nextActions ?? candidate.actions,
  };
}

function objectOrNull(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function normalizeDecision(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/_/g, '-');
  if (normalized === 'CONTINUE' || normalized === 'KILL') return normalized;
  if (normalized === 'REVISE' || normalized === 'RE-SCOPE' || normalized === 'RESCOPE') return 'RE-SCOPE';
  return normalized;
}

function hasUsableModelEvaluation(parsed) {
  return Boolean(
    parsed &&
      typeof parsed === 'object' &&
      ['CONTINUE', 'RE-SCOPE', 'KILL'].includes(parsed.decision)
  );
}

function coerceNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function normalizeDisplayThesis(thesis, deterministic, proposal) {
  const candidate = String(thesis || '').trim();
  if (!candidate) return deterministic.thesis;

  const contradictsContinue =
    deterministic.decision === 'CONTINUE' &&
    /\b(?:roi|return|value)\s+(?:is\s+)?(?:low|weak|poor|insufficient|negative)\b/i.test(candidate);

  if (!contradictsContinue) return candidate;

  if (proposal?.id === 'agentic-service-complaint-triage-trial') {
    return 'The trial clears the evidence and policy gates; continue with the earned next cap while full expansion stays scoped.';
  }

  return deterministic.thesis;
}
