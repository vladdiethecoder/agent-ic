import {
  AbsoluteFill,
  Audio,
  Sequence,
  Video,
  staticFile,
  useCurrentFrame,
  interpolate,
} from 'remotion';
import { runPayload, editPlan, captions } from './data-v8';

const { introFrames, mainFrames, outroFrames, callouts } = editPlan;

export const DemoVideoV8 = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: '#050608', fontFamily: 'Inter, sans-serif' }}>
      <Sequence from={0} durationInFrames={introFrames}>
        <IntroScene />
      </Sequence>

      <Sequence from={introFrames} durationInFrames={mainFrames}>
        <Video
          src={staticFile('ui-v8.webm')}
          startFrom={0}
          endAt={mainFrames}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        <Audio src={staticFile('voiceover-v8.wav')} startFrom={0} endAt={mainFrames} />
        <Overlay layer={frame - introFrames} />
      </Sequence>

      <Sequence from={introFrames + mainFrames} durationInFrames={outroFrames}>
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};

function Overlay({ layer }: { layer: number }) {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Subtle top/bottom vignette for caption readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)',
        }}
      />
      {callouts.map((c, i) => (
        <Callout key={i} layer={layer} {...c} />
      ))}
      <Captions layer={layer} />
    </AbsoluteFill>
  );
}

function Callout({
  layer,
  startFrame,
  endFrame,
  x,
  y,
  text,
  width,
}: {
  layer: number;
  startFrame: number;
  endFrame: number;
  x: number;
  y: number;
  text: string;
  width: number;
}) {
  const start = startFrame;
  const end = endFrame;
  const duration = end - start;
  const fadeIn = Math.min(12, Math.max(1, Math.floor(duration / 3)));
  const fadeOut = Math.min(12, Math.max(1, Math.floor(duration / 3)));
  const opacity = interpolate(
    layer,
    [start, start + fadeIn, Math.max(start + fadeIn, end - fadeOut), end],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const translateY = interpolate(layer, [start, start + fadeIn], [18, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (layer < start - fadeIn || layer > end) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y + translateY,
        width,
        padding: '22px 26px',
        borderRadius: 18,
        background: 'rgba(10,12,16,0.94)',
        border: '1px solid rgba(118,185,0,0.6)',
        boxShadow: '0 28px 90px rgba(0,0,0,0.55)',
        color: '#f7f8f8',
        fontSize: 30,
        lineHeight: 1.35,
        fontWeight: 700,
        opacity,
        textShadow: '0 2px 8px rgba(0,0,0,0.6)',
      }}
    >
      {text}
    </div>
  );
}

function Captions({ layer }: { layer: number }) {
  const active = captions.find((c) => layer >= c.startFrame && layer <= c.endFrame);
  if (!active) return null;

  const duration = active.endFrame - active.startFrame;
  const fade = Math.min(6, Math.max(1, Math.floor(duration / 3)));
  const opacity = interpolate(
    layer,
    [active.startFrame, active.startFrame + fade, Math.max(active.startFrame + fade, active.endFrame - fade), active.endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 72,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        opacity,
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          padding: '18px 36px',
          borderRadius: 16,
          background: 'rgba(0,0,0,0.82)',
          color: '#fff',
          fontSize: 38,
          fontWeight: 700,
          textAlign: 'center',
          lineHeight: 1.4,
          textShadow: '0 2px 10px rgba(0,0,0,0.9)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        {active.text}
      </div>
    </div>
  );
}

function IntroScene() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 24, introFrames - 24, introFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(frame, [0, introFrames / 2], [0.92, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#050608',
        opacity,
      }}
    >
      <div
        style={{
          width: 104,
          height: 104,
          borderRadius: 26,
          border: '2px solid #76b900',
          display: 'grid',
          placeItems: 'center',
          color: '#76b900',
          fontSize: 46,
          fontWeight: 800,
          marginBottom: 36,
          transform: `scale(${scale})`,
        }}
      >
        IC
      </div>
      <h1
        style={{
          color: '#f7f8f8',
          fontSize: 78,
          fontWeight: 700,
          letterSpacing: '-0.04em',
          margin: 0,
          textAlign: 'center',
        }}
      >
        Agent IC
      </h1>
      <p
        style={{
          color: '#aeb5c2',
          fontSize: 34,
          marginTop: 18,
          textAlign: 'center',
          maxWidth: 960,
        }}
      >
        Governed capital account for autonomous agents
      </p>
    </AbsoluteFill>
  );
}

function OutroScene() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 24, outroFrames - 24, outroFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#050608',
        opacity,
      }}
    >
      <h2 style={{ color: '#f7f8f8', fontSize: 60, fontWeight: 700, margin: 0 }}>
        Agents operate with money. You keep control.
      </h2>
      <p style={{ color: '#76b900', fontSize: 30, marginTop: 22 }}>
        Agent IC — Hermes × Nemotron × Stripe
      </p>
    </AbsoluteFill>
  );
}
