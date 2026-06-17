import { Composition } from 'remotion';
import { DemoVideo } from './DemoVideo';
import { DemoVideoV8 } from './DemoVideo-v8';
import { DemoVideoFinal } from './DemoVideo-final';
import { DemoVideoV11 } from './DemoVideo-v11';
import { DemoVideoV12 } from './DemoVideo-v12';
import { editPlan } from './data';
import { editPlan as editPlanV8 } from './data-v8';
import { editPlan as editPlanFinal } from './data-final';
import { editPlan as editPlanV11 } from './data-v11';
import { editPlan as editPlanV12 } from './data-v12';
import { DemoVideoV13 } from './DemoVideo-v13';
import { editPlan as editPlanV13 } from './data-v13';
import { DemoVideoV14 } from './DemoVideo-v14';
import { editPlan as editPlanV14 } from './data-v14';
import { DemoVideoV15 } from './DemoVideo-v15';
import { editPlan as editPlanV15 } from './data-v15';

export const RemotionVideo = () => (
  <>
    <Composition
      id="DemoVideo"
      component={DemoVideo}
      durationInFrames={editPlan.totalFrames}
      fps={editPlan.fps}
      width={1920}
      height={1080}
    />
    <Composition
      id="DemoVideoV8"
      component={DemoVideoV8}
      durationInFrames={editPlanV8.totalFrames}
      fps={editPlanV8.fps}
      width={1920}
      height={1080}
    />
    <Composition
      id="DemoVideoFinal"
      component={DemoVideoFinal}
      durationInFrames={editPlanFinal.totalFrames}
      fps={editPlanFinal.fps}
      width={1920}
      height={1080}
    />
    <Composition
      id="DemoVideoV11"
      component={DemoVideoV11}
      durationInFrames={editPlanV11.totalFrames}
      fps={editPlanV11.fps}
      width={1920}
      height={1080}
    />
    <Composition
      id="DemoVideoV12"
      component={DemoVideoV12}
      durationInFrames={editPlanV12.totalFrames}
      fps={editPlanV12.fps}
      width={1920}
      height={1080}
    />
    <Composition
      id="DemoVideoV13"
      component={DemoVideoV13}
      durationInFrames={editPlanV13.totalFrames}
      fps={editPlanV13.fps}
      width={1920}
      height={1080}
    />
    <Composition
      id="DemoVideoV14"
      component={DemoVideoV14}
      durationInFrames={editPlanV14.totalFrames}
      fps={editPlanV14.fps}
      width={1920}
      height={1080}
    />
    <Composition
      id="DemoVideoV15"
      component={DemoVideoV15}
      durationInFrames={editPlanV15.totalFrames}
      fps={editPlanV15.fps}
      width={1920}
      height={1080}
    />
  </>
);
