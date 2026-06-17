/// <reference types="node" />
import plan from '../edit-plan-v11.json';

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

export interface TerminalOverlay {
  name: string;
  src: string;
  startFrame: number;
  endFrame: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface EditPlan {
  fps: number;
  introFrames: number;
  mainFrames: number;
  outroFrames: number;
  totalFrames: number;
  captions: Caption[];
  callouts: Callout[];
  terminalOverlays: TerminalOverlay[];
}

const fallbackPlan: EditPlan = {
  fps: 30,
  introFrames: 600,
  mainFrames: 2850,
  outroFrames: 1410,
  totalFrames: 4860,
  captions: [],
  callouts: [],
  terminalOverlays: [],
};

export const editPlan: EditPlan = (plan || fallbackPlan) as unknown as EditPlan;

let captions: Caption[] = [];
try {
  captions = require('./captions-v11.json') as Caption[];
} catch {
  captions = editPlan.captions || [];
}
export { captions };
