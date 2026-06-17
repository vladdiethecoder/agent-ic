/// <reference types="node" />
import payload from './payload-final.json';
import plan from '../edit-plan-final.json';

export interface RunPayload {
  runId: string;
  mission: {
    company: string;
    description: string;
    durationHours: number;
    allowedTools: string[];
    killCriteria: string[];
  };
  envelope: { cap: number; spent: number; remaining: number };
  stripe: { sessionId: string; mode: string };
  stripeSkill: { displayName: string; action: string; amount: number; approvalGate: string };
  blocked: { attemptedTool: string; attemptedAmount: number; cap: number; policyBreach: string };
  evidence: {
    casesProcessed: number;
    autoTriaged: number;
    qaAgreement: number;
    hoursSaved: number;
    grossValue: number;
    netValue: number;
    criticalIncidents: number;
    spendConsumed: number;
  };
  decision: { verdict: string; nextCap: number; autonomy: string; qaThreshold: number };
  hermesPlaybook: { name: string };
  sandbox: { blockedCall: { status: number; host: string; policy: string } };
  stages: { id: string; label: string; detail: string }[];
  skills?: { displayName: string; action: string; amount: number; result: string }[];
  nemotron?: { state: string; model: string; provider?: string };
  providerReceipts?: {
    nemotron?: { state: string };
    stripe?: { state: string };
    hermes?: { state: string };
    governance?: { state: string };
    audit?: { rowCount: number };
  };
  auditRows?: unknown[];
}

export const runPayload = payload as unknown as RunPayload;

export interface Caption {
  startFrame: number;
  endFrame: number;
  text: string;
}

export interface Callout {
  stageId: string;
  startFrame: number;
  endFrame: number;
  x: number;
  y: number;
  width: number;
  text: string;
}

export interface EditPlan {
  fps: number;
  introFrames: number;
  mainFrames: number;
  outroFrames: number;
  totalFrames: number;
  captions: Caption[];
  callouts: Callout[];
}

export const editPlan = (plan || {
  fps: 30,
  introFrames: 90,
  mainFrames: 4500,
  outroFrames: 90,
  totalFrames: 4680,
  captions: [],
  callouts: [],
}) as unknown as EditPlan;

let captions: Caption[] = [];
try {
  captions = require('./captions-final.json') as Caption[];
} catch {
  captions = editPlan.captions || [];
}
export { captions };
