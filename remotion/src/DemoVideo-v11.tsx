import {
  AbsoluteFill,
  Audio,
  Sequence,
  Video,
  staticFile,
  useCurrentFrame,
  interpolate,
} from 'remotion';
import { editPlan, captions, type TerminalOverlay, type Callout, type Caption } from './data-v11';

const { introFrames, mainFrames, outroFrames, callouts, terminalOverlays } = editPlan;

export const DemoVideoV11 = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: '#050608', fontFamily: 'Inter, sans-serif' }}>
      <Sequence from={0} durationInFrames={introFrames}>
        <IntroScene />
      </Sequence>

      <Sequence from={introFrames} durationInFrames={mainFrames}>
        <Video
          src={staticFile('ui-v11.webm')}
          startFrom={0}
          endAt={mainFrames}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        <Audio src={staticFile('voiceover-v11.wav')} startFrom={0} endAt={mainFrames} />
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
      {/* Subtle vignette to keep captions readable */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)',
        }}
      />
      {terminalOverlays.map((t, i) => (
        <TerminalOverlayClip key={i} layer={layer} {...t} />
      ))}
      {callouts.map((c, i) => (
        <Callout key={i} layer={layer} {...c} />
      ))}
      <Captions layer={layer} />
    </AbsoluteFill>
  );
}

function TerminalOverlayClip({
  layer,
  name,
  src,
  startFrame,
  endFrame,
  x,
  y,
  width,
  height,
  label,
}: TerminalOverlay & { layer: number }) {
  const start = startFrame;
  const end = endFrame;
  const duration = end - start;
  const fadeIn = Math.min(12, Math.max(1, Math.floor(duration / 5)));
  const fadeOut = Math.min(12, Math.max(1, Math.floor(duration / 5)));

  const opacity = interpolate(
    layer,
    [start, start + fadeIn, Math.max(start + fadeIn, end - fadeOut), end],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const scale = interpolate(layer, [start, start + fadeIn], [0.96, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (layer < start - fadeIn || layer > end) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid rgba(118,185,0,0.55)',
        boxShadow: '0 28px 90px rgba(0,0,0,0.6)',
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: 'bottom right',
        background: '#0a0c10',
      }}
    >
      {/* Terminal title bar */}
      <div
        style={{
          height: 42,
          background: 'rgba(16,20,26,0.98)',
          borderBottom: '1px solid rgba(118,185,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 18px',
          gap: 10,
        }}
      >
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56' }} />
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f' }} />
        <span
          style={{
            marginLeft: 'auto',
            color: '#aeb5c2',
            fontSize: 15,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ position: 'absolute', top: 42, left: 0, right: 0, bottom: 0 }}>
        <Video
          src={staticFile(src)}
          startFrom={0}
          endAt={end - start}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          name={name}
        />
      </div>
    </div>
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
}: Callout & { layer: number }) {
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
  const active: Caption | undefined = captions.find((c) => layer >= c.startFrame && layer <= c.endFrame);
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
          maxWidth: 1100,
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
          maxWidth: 1100,
        }}
      >
        Governed capital account for autonomous agents
      </p>
      <p
        style={{
          color: '#f7f8f8',
          fontSize: 28,
          marginTop: 42,
          textAlign: 'center',
          maxWidth: 1200,
          lineHeight: 1.45,
        }}
      >
        Ungoverned AI pilots burn budget before anyone asks whether the ROI is real.
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
      <h2
        style={{
          color: '#f7f8f8',
          fontSize: 60,
          fontWeight: 700,
          margin: 0,
          textAlign: 'center',
          maxWidth: 1400,
        }}
      >
        Agents that earn, spend, and run real operations — under your rules.
      </h2>
      <p style={{ color: '#76b900', fontSize: 32, marginTop: 28 }}>
        Agent IC — Hermes × Nemotron × Stripe
      </p>
      <div
        style={{
          display: 'flex',
          gap: 32,
          marginTop: 56,
        }}
      >
        <div
          style={{
            padding: '18px 32px',
            borderRadius: 14,
            background: '#76b900',
            color: '#050608',
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          Open live demo → /submit
        </div>
        <div
          style={{
            padding: '18px 32px',
            borderRadius: 14,
            border: '2px solid #76b900',
            color: '#76b900',
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          View source → repo
        </div>
      </div>
    </AbsoluteFill>
  );
}
