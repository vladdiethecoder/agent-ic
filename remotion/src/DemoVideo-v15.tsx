import {
  AbsoluteFill,
  Audio,
  Sequence,
  Video,
  staticFile,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  delayRender,
  continueRender,
} from 'remotion';
import { useEffect, useState } from 'react';
import {
  editPlan,
  captions,
  uiSrc,
  audioSrc,
  cursorEventsSrc,
  type Caption,
  type Callout,
  type Highlight,
  type StageLabel,
  type CursorEvent,
  type TerminalOverlay,
} from './data-v15';

const {
  introFrames,
  mainFrames,
  outroFrames,
  callouts = [],
  highlights = [],
  stageLabels = [],
  terminalOverlays = [],
  captionRegion,
} = editPlan;

// Stages where the in-UI terminal drawer is open; captions are lifted to avoid overlap.
const TERMINAL_STAGES = new Set(['onboard', 'proposal', 'fund', 'govern']);

export const DemoVideoV15 = () => {
  const frame = useCurrentFrame();

  const showIntro = introFrames > 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#050608', fontFamily: 'Inter, sans-serif' }}>
      {showIntro && (
        <Sequence from={0} durationInFrames={introFrames}>
          <IntroScene />
        </Sequence>
      )}

      <Sequence from={introFrames} durationInFrames={mainFrames}>
        <Video
          src={staticFile(uiSrc)}
          startFrom={0}
          endAt={mainFrames}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        <Audio src={staticFile(audioSrc)} startFrom={0} endAt={mainFrames} />
        <Overlay layer={frame - introFrames} />
      </Sequence>

      <Sequence from={introFrames + mainFrames} durationInFrames={outroFrames}>
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};

function Overlay({ layer }: { layer: number }) {
  const activeStage = stageLabels.find((s) => layer >= s.startFrame && layer <= s.endFrame);
  const activeStageId = activeStage?.id || activeStage?.stageId;
  const captionsUp = activeStageId ? TERMINAL_STAGES.has(activeStageId) : false;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.35) 100%)',
        }}
      />

      {stageLabels.map((s, i) => (
        <StageLabelPill key={i} layer={layer} {...s} />
      ))}

      {callouts.map((c, i) => (
        <CalloutBox key={i} layer={layer} {...c} />
      ))}

      {highlights.map((h, i) => (
        <HighlightRing key={i} layer={layer} {...h} />
      ))}

      {terminalOverlays.map((t, i) => (
        <TerminalOverlayClip key={i} layer={layer} {...t} />
      ))}

      <CursorOverlay layer={layer} />
      <Captions layer={layer} up={captionsUp} />
    </AbsoluteFill>
  );
}

function StageLabelPill({
  layer,
  startFrame,
  endFrame,
  label,
  text,
}: StageLabel & { layer: number }) {
  const start = startFrame;
  const end = endFrame;
  const fade = Math.min(8, Math.max(1, Math.floor((end - start) / 5)));

  if (layer < start - fade || layer > end) return null;

  const display = text || label || '';
  const opacity = interpolate(
    layer,
    [start - fade, start, end - fade, end],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        top: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderRadius: 999,
        background: 'rgba(10,12,16,0.82)',
        border: '1px solid rgba(118,185,0,0.45)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        opacity,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#76b900',
          boxShadow: '0 0 10px #76b900',
        }}
      />
      <span
        style={{
          color: '#f7f8f8',
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {display}
      </span>
    </div>
  );
}

function CalloutBox({
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
  const fadeIn = Math.min(12, Math.max(1, Math.floor((end - start) / 4)));
  const fadeOut = Math.min(12, Math.max(1, Math.floor((end - start) / 4)));

  if (layer < start - fadeIn || layer > end) return null;

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

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y + translateY,
        width,
        padding: '18px 24px',
        borderRadius: 16,
        background: 'rgba(10,12,16,0.94)',
        border: '1px solid rgba(118,185,0,0.6)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
        color: '#f7f8f8',
        fontSize: 26,
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

function HighlightRing({
  layer,
  startFrame,
  endFrame,
  x,
  y,
  label,
  text,
}: Highlight & { layer: number }) {
  const start = startFrame;
  const end = endFrame;
  const fade = Math.min(12, Math.max(1, Math.floor((end - start) / 5)));

  if (layer < start - fade || layer > end) return null;

  const opacity = interpolate(
    layer,
    [start - fade, start, end - fade, end],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  // Smooth repeating pulse (sine-based) instead of modulo to avoid frame-to-frame snaps.
  const progress = (layer - start) / Math.max(1, end - start);
  const cycle = Math.sin(progress * Math.PI * 4);
  const ringScale = 1 + (cycle * 0.5 + 0.5) * 0.35;
  const ringOpacity = 0.55 + (cycle * 0.5 + 0.5) * 0.45;
  const display = label || text || '';

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 0,
        height: 0,
        opacity,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -6,
          top: -6,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: '#76b900',
          boxShadow: '0 0 20px #76b900',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -34,
          top: -34,
          width: 68,
          height: 68,
          borderRadius: '50%',
          border: '2px solid #76b900',
          opacity: ringOpacity,
          transform: `scale(${ringScale})`,
          transformOrigin: 'center',
        }}
      />
      {display && (
        <div
          style={{
            position: 'absolute',
            left: 42,
            top: -14,
            padding: '6px 12px',
            borderRadius: 8,
            background: 'rgba(10,12,16,0.92)',
            border: '1px solid rgba(118,185,0,0.5)',
            color: '#f7f8f8',
            fontSize: 18,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {display}
        </div>
      )}
    </div>
  );
}

function useCursorEvents() {
  const { fps } = useVideoConfig();
  const [events, setEvents] = useState<CursorEvent[]>([]);

  useEffect(() => {
    const handle = delayRender('cursor-events');
    fetch(staticFile(cursorEventsSrc))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) {
          setEvents([]);
          return;
        }
        const raw = Array.isArray(data) ? data : data.events || [];
        const normalized = raw.map((e: any) => {
          const frame =
            typeof e.frame === 'number'
              ? e.frame
              : Math.max(0, Math.round((e.t / 1000) * fps));
          return {
            frame,
            x: e.x,
            y: e.y,
            click: e.click === true || e.type === 'click',
          };
        });
        setEvents(normalized);
      })
      .catch(() => setEvents([]))
      .finally(() => continueRender(handle));
  }, [fps]);

  return events;
}

function CursorOverlay({ layer }: { layer: number }) {
  const cursorEvents = useCursorEvents();
  if (!cursorEvents || cursorEvents.length === 0) return null;

  const pos = getCursorPosition(layer, cursorEvents);

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: 0,
        height: 0,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -18,
          top: -18,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(118,185,0,0.55) 0%, rgba(118,185,0,0) 70%)',
          transform: 'translate(-50%, -50%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -8,
          top: -8,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#76b900',
          boxShadow: '0 0 18px #76b900, inset 0 0 4px rgba(255,255,255,0.4)',
          transform: 'translate(-50%, -50%)',
        }}
      />
      {cursorEvents
        .filter((e) => e.click && layer >= e.frame && layer <= e.frame + 15)
        .map((e) => (
          <ClickRing key={e.frame} layer={layer} event={e} />
        ))}
    </div>
  );
}

function ClickRing({ layer, event }: { layer: number; event: CursorEvent }) {
  const progress = (layer - event.frame) / 15;
  const opacity = interpolate(progress, [0, 0.2, 1], [0, 0.9, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(progress, [0, 1], [0.5, 2.2], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: event.x,
        top: event.y,
        width: 0,
        height: 0,
        opacity,
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -20,
          top: -20,
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '3px solid #76b900',
        }}
      />
    </div>
  );
}

function getCursorPosition(layer: number, events: CursorEvent[]) {
  if (events.length === 0) return { x: 0, y: 0 };
  if (layer <= events[0].frame) return { x: events[0].x, y: events[0].y };
  if (layer >= events[events.length - 1].frame) {
    return { x: events[events.length - 1].x, y: events[events.length - 1].y };
  }

  let i = 0;
  for (let j = 0; j < events.length - 1; j++) {
    if (layer >= events[j].frame && layer < events[j + 1].frame) {
      i = j;
      break;
    }
  }

  const prev = events[i];
  const next = events[i + 1];
  const progress = (layer - prev.frame) / (next.frame - prev.frame);
  return {
    x: interpolate(progress, [0, 1], [prev.x, next.x], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    y: interpolate(progress, [0, 1], [prev.y, next.y], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  };
}

function Captions({ layer, up }: { layer: number; up: boolean }) {
  const active: Caption | undefined = captions.find((c) => layer >= c.startFrame && layer <= c.endFrame);
  if (!active) return null;

  const duration = active.endFrame - active.startFrame;
  const fade = Math.min(6, Math.max(1, Math.floor(duration / 4)));
  const opacity = interpolate(
    layer,
    [active.startFrame, active.startFrame + fade, Math.max(active.startFrame + fade, active.endFrame - fade), active.endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Prefer the captionRegion from the edit plan; lift above the terminal drawer when it is open.
  const region = captionRegion;
  const left = region ? region.x : 60;
  const right = region ? 1920 - (region.x + region.width) : 60;
  const bottom = up ? 520 : region ? 1080 - (region.y + region.height) : 80;

  return (
    <div
      style={{
        position: 'absolute',
        bottom,
        left,
        right,
        display: 'flex',
        justifyContent: 'flex-start',
        opacity,
      }}
    >
      <div
        style={{
          maxWidth: region ? region.width : 1100,
          padding: '12px 22px',
          borderRadius: 10,
          borderLeft: '3px solid #76b900',
          background: 'rgba(5,6,8,0.88)',
          color: '#fff',
          fontSize: 28,
          fontWeight: 600,
          textAlign: 'left',
          lineHeight: 1.45,
          textShadow: '0 2px 8px rgba(0,0,0,0.9)',
          boxShadow: '0 16px 50px rgba(0,0,0,0.35)',
        }}
      >
        {active.text}
      </div>
    </div>
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

function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });
  const logoTranslate = interpolate(frame, [0, 18], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const logoOpacity = 1;

  const titleOpacity = 1;
  const titleTranslate = interpolate(frame, [0, 14], [18, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const outroFade = interpolate(frame, [introFrames - 18, introFrames], [1, 0], {
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
        background:
          'radial-gradient(circle at 20% 20%, rgba(118,185,0,0.18) 0%, transparent 35%), radial-gradient(circle at 80% 80%, rgba(122,92,255,0.16) 0%, transparent 40%), #050608',
        opacity: outroFade,
      }}
    >
      <div
        style={{
          width: 112,
          height: 112,
          borderRadius: 28,
          border: '2px solid #76b900',
          display: 'grid',
          placeItems: 'center',
          color: '#76b900',
          fontSize: 50,
          fontWeight: 800,
          marginBottom: 36,
          opacity: logoOpacity,
          transform: `translateY(${logoTranslate}px) scale(${0.75 + logoScale * 0.25})`,
        }}
      >
        IC
      </div>
      <h1
        style={{
          color: '#f7f8f8',
          fontSize: 84,
          fontWeight: 700,
          letterSpacing: '-0.04em',
          margin: 0,
          textAlign: 'center',
          opacity: titleOpacity,
          transform: `translateY(${titleTranslate}px)`,
        }}
      >
        Agent IC
      </h1>
      <p
        style={{
          color: '#aeb5c2',
          fontSize: 32,
          marginTop: 18,
          textAlign: 'center',
          maxWidth: 1000,
          opacity: titleOpacity,
          transform: `translateY(${titleTranslate}px)`,
        }}
      >
        Governed capital account for autonomous agents
      </p>
      <p
        style={{
          color: '#f7f8f8',
          fontSize: 26,
          marginTop: 40,
          textAlign: 'center',
          maxWidth: 1200,
          lineHeight: 1.45,
          opacity: titleOpacity,
          transform: `translateY(${titleTranslate}px)`,
        }}
      >
        Ungoverned AI pilots burn budget before anyone asks whether the ROI is real.
      </p>
    </AbsoluteFill>
  );
}

function OutroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = 1;
  const scale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.9 },
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 50% 40%, rgba(118,185,0,0.14) 0%, transparent 40%), #050608',
        opacity,
        transform: `scale(${0.96 + scale * 0.04})`,
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 24,
          border: '2px solid #76b900',
          display: 'grid',
          placeItems: 'center',
          color: '#76b900',
          fontSize: 42,
          fontWeight: 800,
          marginBottom: 32,
        }}
      >
        IC
      </div>
      <h2
        style={{
          color: '#f7f8f8',
          fontSize: 62,
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
