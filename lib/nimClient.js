import { sanitizeProviderError } from './validation.js';

export async function callNim({ proposal, deterministic, baseUrl, apiKey, model }) {
  const start = Date.now();

  const url = (baseUrl || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '') + '/chat/completions';
  const nimModel = model || 'nvidia/nemotron-3-super-120b-a12b';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: nimModel,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          {
            role: 'system',
            content:
              'You are Agent IC, an enterprise AI pilot investment committee evaluator. Return only compact JSON matching the requested schema. Do not include markdown.',
          },
          { role: 'user', content: buildPrompt(proposal, deterministic) },
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
    const parsed = parseJsonObject(text);

    if (!hasUsableModelEvaluation(parsed)) {
      return {
        ok: false,
        latencyMs,
        requestId,
        error: 'NIM returned malformed JSON evaluation',
      };
    }

    const evaluation = {
      ...deterministic,
      evaluator: 'NVIDIA NIM / Nemotron live evaluation',
      model: nimModel,
      score: coerceNumber(parsed.score, deterministic.score),
      governanceScore: coerceNumber(parsed.governanceScore, deterministic.governanceScore),
      evidenceScore: coerceNumber(parsed.evidenceScore, deterministic.evidenceScore),
      decision: ['CONTINUE', 'RE-SCOPE', 'KILL'].includes(parsed.decision) ? parsed.decision : deterministic.decision,
      confidence: parsed.confidence || deterministic.confidence,
      thesis: parsed.thesis || deterministic.thesis,
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
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: sanitizeProviderError(error),
    };
  }
}

function buildPrompt(proposal, deterministic) {
  return JSON.stringify(
    {
      task: 'Evaluate this enterprise AI pilot for usefulness, viability, governed autonomy, budget scope, ROI evidence quality, and kill/continue decision.',
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
        thesis: 'one sentence',
        riskRegister: [{ name: 'string', severity: 'low|medium|high|critical', mitigation: 'string' }],
        nextActions: ['string'],
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
  if (!match) return {};
  try {
    return JSON.parse(match[0]);
  } catch {
    return {};
  }
}

function hasUsableModelEvaluation(parsed) {
  return Boolean(
    parsed &&
      typeof parsed === 'object' &&
      ['CONTINUE', 'RE-SCOPE', 'KILL'].includes(parsed.decision) &&
      Number.isFinite(Number(parsed.score))
  );
}

function coerceNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}
