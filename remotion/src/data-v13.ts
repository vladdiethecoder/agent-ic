/// <reference types="node" />
import plan from '../edit-plan-v13.json';

export interface Caption {
  startFrame: number;
  endFrame: number;
  text: string;
}

export interface StageLabel {
  id?: string;
  stageId?: string;
  label?: string;
  text?: string;
  startFrame: number;
  endFrame: number;
  x?: number;
  y?: number;
  width?: number;
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

export interface Highlight {
  stageId: string;
  startFrame: number;
  endFrame: number;
  x: number;
  y: number;
  label?: string;
  text?: string;
}

export interface CursorEvent {
  frame: number;
  x: number;
  y: number;
  click?: boolean;
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

export interface CaptionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditPlan {
  fps: number;
  introFrames: number;
  mainFrames: number;
  outroFrames: number;
  totalFrames: number;
  audioDuration?: number;
  uiSrc?: string;
  audioSrc?: string;
  cursorEventsSrc?: string;
  captionsSrc?: string;
  captionRegion?: CaptionRegion;
  captions?: Caption[];
  stageLabels?: StageLabel[];
  callouts?: Callout[];
  highlights?: Highlight[];
  terminalOverlays?: TerminalOverlay[];
}

const fallbackPlan: EditPlan = {
  fps: 30,
  introFrames: 30,
  mainFrames: 3699,
  outroFrames: 60,
  totalFrames: 3789,
  audioDuration: 123.307,
  uiSrc: 'ui-v13.webm',
  audioSrc: 'agent-ic-audio-mastered-v13.wav',
  cursorEventsSrc: 'cursor-events-v13.json',
  captionsSrc: 'captions-v13.json',
  captions: [],
  callouts: [],
  highlights: [],
  terminalOverlays: [],
};

export const editPlan: EditPlan = (plan || fallbackPlan) as unknown as EditPlan;

export const uiSrc = editPlan.uiSrc || 'ui-v13.webm';
export const audioSrc = editPlan.audioSrc || 'agent-ic-audio-mastered-v13.wav';
export const cursorEventsSrc = editPlan.cursorEventsSrc || 'cursor-events-v13.json';
export const captionsSrc = editPlan.captionsSrc || 'captions-v13.json';

let captions: Caption[] = [];
try {
  captions = require('./captions-v13.json') as Caption[];
} catch {
  captions = editPlan.captions || [];
}
export { captions };


