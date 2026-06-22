import { spawnSync } from 'node:child_process';

export const MCP_VIDEO_OBSERVED_COMMIT = 'e871769ab996a6d8c5f4eb5e5049f96af7cdd650';
export const MCP_VIDEO_VERSION = '1.5.1';
export const MCP_VIDEO_DIRECT_COMMAND = ['uvx', '--from', 'mcp-video', 'mcp-video'];

export const MCP_VIDEO_ALLOWED_CLI_COMMANDS = Object.freeze([
  'doctor',
  'info',
  'extract-frame',
  'trim',
  'merge',
  'edit',
  'blur',
  'color-grade',
  'templates',
  'template',
  'repurpose-plan',
  'repurpose',
  'video-extract-frame',
  'resize',
  'speed',
  'convert',
  'thumbnail',
  'preview',
  'storyboard',
  'subtitles',
  'crop',
  'rotate',
  'fade',
  'export',
  'extract-audio',
  'add-text',
  'add-audio',
  'watermark',
  'filter',
  'reverse',
  'chroma-key',
  'overlay-video',
  'split-screen',
  'effect-vignette',
  'effect-glow',
  'effect-noise',
  'effect-scanlines',
  'effect-chromatic-aberration',
  'transition-glitch',
  'transition-morph',
  'transition-pixelate',
  'batch',
  'detect-scenes',
  'create-from-images',
  'export-frames',
  'compare-quality',
  'read-metadata',
  'write-metadata',
  'stabilize',
  'apply-mask',
  'audio-waveform',
  'generate-subtitles',
  'normalize-audio',
  'audio-synthesize',
  'audio-compose',
  'audio-preset',
  'audio-sequence',
  'audio-effects',
  'video-add-generated-audio',
  'video-audio-spatial',
  'video-ai-transcribe',
  'video-analyze',
  'video-ai-upscale',
  'video-ai-stem-separation',
  'video-ai-scene-detect',
  'video-ai-color-grade',
  'video-ai-remove-silence',
  'hyperframes-render',
  'hyperframes-compositions',
  'hyperframes-preview',
  'hyperframes-still',
  'hyperframes-snapshot',
  'hyperframes-inspect',
  'hyperframes-catalog',
  'hyperframes-info',
  'hyperframes-capture',
  'hyperframes-tts',
  'hyperframes-transcribe',
  'hyperframes-remove-background',
  'hyperframes-doctor',
  'hyperframes-benchmark',
  'hyperframes-init',
  'hyperframes-add-block',
  'hyperframes-validate',
  'hyperframes-pipeline',
  'video-text-animated',
  'video-mograph-count',
  'video-mograph-progress',
  'video-layout-grid',
  'video-layout-pip',
  'image-extract-colors',
  'image-generate-palette',
  'image-analyze-product',
  'video-auto-chapters',
  'video-info-detailed',
  'video-quality-check',
  'video-design-quality-check',
  'video-fix-design-issues',
]);

export const MCP_VIDEO_REPRESENTATIVE_MCP_TOOLS = Object.freeze([
  { name: 'search_tools', category: 'discovery', purpose: 'Search the 119-tool registry by keyword.' },
  { name: 'video_info', category: 'analysis', purpose: 'Read duration, resolution, codec, fps, and file size.' },
  { name: 'video_info_detailed', category: 'analysis', purpose: 'Extended metadata with scene detection and dominant colors.' },
  { name: 'video_trim', category: 'core-editing', purpose: 'Trim by start time plus duration or end time.' },
  { name: 'video_merge', category: 'core-editing', purpose: 'Concatenate clips with mismatch and transition guardrails.' },
  { name: 'video_edit', category: 'core-editing', purpose: 'Execute a timeline JSON DSL edit.' },
  { name: 'video_add_texts', category: 'graphics', purpose: 'Overlay multiple text elements in one FFmpeg pass.' },
  { name: 'video_subtitles_styled', category: 'captions', purpose: 'Burn SRT/VTT subtitles with custom styling.' },
  { name: 'video_repurpose_plan', category: 'repurposing', purpose: 'Dry-run platform package manifests before rendering.' },
  { name: 'video_repurpose', category: 'repurposing', purpose: 'Render Shorts/Reels/TikTok/YouTube local packages.' },
  { name: 'video_preview', category: 'verification', purpose: 'Generate low-resolution previews for quick visual review.' },
  { name: 'video_extract_frame', category: 'verification', purpose: 'Extract exact frames for visual validation.' },
  { name: 'video_quality_check', category: 'verification', purpose: 'Run brightness, contrast, resolution, and export checks.' },
  { name: 'video_release_checkpoint', category: 'verification', purpose: 'Create preview artifacts only after quality gates pass.' },
  { name: 'hyperframes_render', category: 'code-video', purpose: 'Render Hyperframes compositions to video.' },
  { name: 'hyperframes_snapshot', category: 'code-video', purpose: 'Capture key frames from Hyperframes renders.' },
]);

export const FRONTIER_VIDEO_CATALOG = {
  generatedAt: '2026-06-19',
  primary: {
    name: 'mcp-video',
    repo: 'https://github.com/KyaniteLabs/mcp-video',
    observedCommit: MCP_VIDEO_OBSERVED_COMMIT,
    version: MCP_VIDEO_VERSION,
    license: 'Apache-2.0',
    language: 'Python',
    directMcpCommand: MCP_VIDEO_DIRECT_COMMAND,
    cliCommand: MCP_VIDEO_DIRECT_COMMAND,
    toolCount: 119,
    platform: 'Cross-platform where Python 3.11+ and FFmpeg are available; verified here on Linux.',
    install: [
      'Prerequisite: ffmpeg and ffprobe on PATH.',
      'No global install required: uvx --from mcp-video mcp-video doctor.',
      'Hermes native MCP: command=uvx args=["--from", "mcp-video", "mcp-video"].',
    ],
    representativeTools: MCP_VIDEO_REPRESENTATIVE_MCP_TOOLS,
    performanceReasons: [
      'Runs locally through FFmpeg instead of requiring a macOS-only GUI app or remote hosted editor.',
      '119 typed MCP tools versus the previously integrated static 29-tool Palmier surface.',
      'No paid generation-credit confirmation path for core editing; deterministic local renders are immediately inspectable.',
      'Preflight guardrails fail early on risky filters, transitions, overlays, subtitles, audio, and repurposing settings before FFmpeg silently produces broken media.',
      'Direct Hermes MCP connection was verified on this host with all 119 tools discovered.',
    ],
    sources: [
      'KyaniteLabs/mcp-video README.md: free open-source MCP server, Python library, CLI; local, fast, free; FFmpeg prerequisite; 119 MCP tools badge; accessed 2026-06-19.',
      'KyaniteLabs/mcp-video docs/TOOLS.md: 119 registered MCP tools, structured JSON results, auto-fix suggestions, high-risk preflight guardrails; accessed 2026-06-19.',
      'KyaniteLabs/mcp-video skills/mcp-video/SKILL.md: inspect-first workflow, MCP/CLI/Python surfaces, quality checkpoint guidance; accessed 2026-06-19.',
      'KyaniteLabs/mcp-video pyproject.toml: version 1.5.1, Apache-2.0, Python >=3.11, mcp-video console script; accessed 2026-06-19.',
      'GitHub API: repo pushed_at 2026-06-15T19:34:05Z, default branch master, observed tree commit e871769ab996a6d8c5f4eb5e5049f96af7cdd650.',
    ],
  },
  replaced: {
    name: 'Palmier Pro',
    reason: 'Removed as the primary integration because it is macOS 26 Apple Silicon app-hosted, unavailable on this Linux host, includes closed-source generative processing per upstream FAQ, and previously left the workflow at a static/offline proxy layer.',
  },
  frontierSurfaces: [
    {
      name: 'mcp-video',
      type: 'guardrailed local FFmpeg/Hyperframes MCP + Python CLI',
      bestFor: ['Local deterministic renders', 'agent-safe FFmpeg operations', 'platform repurposing packages', 'quality-gated release artifacts'],
      integration: 'Hermes native stdio MCP: uvx --from mcp-video mcp-video',
      strengths: ['119 MCP tools', 'Apache-2.0', 'local/free core editing', 'preflight guardrails', 'CLI + MCP + Python client'],
      constraints: ['Requires FFmpeg; optional AI/audio/image/Hyperframes extras are separate installs'],
      source: 'KyaniteLabs/mcp-video README/docs/TOOLS/pyproject, accessed 2026-06-19',
    },
    {
      name: 'video-use',
      type: 'transcript-first open-source coding-agent workflow',
      bestFor: ['Talking-head/interview/tutorial edits', 'filler-word removal', 'subtitle burn-in', 'final.mp4 generation from raw takes'],
      integration: 'Clone/symlink SKILL.md; helpers use ffmpeg, transcript cache, and timeline_view images',
      strengths: ['MIT', '9.9k GitHub stars by API/browser snapshot', '100% open-source repo claim', 'sparse visual composites for agent context efficiency'],
      constraints: ['Not an MCP server; narrower than mcp-video for general media automation'],
      source: 'browser-use/video-use README/GitHub API, accessed 2026-06-19',
    },
    {
      name: 'AdobePremiereProMCP',
      type: 'Adobe Premiere Pro MCP via ExtendScript/QE DOM',
      bestFor: ['Existing Premiere timelines', 'NLE-specific effects/color/audio/export automation'],
      integration: 'Repo install plus Premiere bridge/plugin process',
      strengths: ['Large professional NLE surface area'],
      constraints: ['Requires licensed Premiere Pro and local bridge'],
      source: 'ayushozha/AdobePremiereProMCP README, accessed 2026-06-19',
    },
    {
      name: 'DaVinci Resolve MCP',
      type: 'DaVinci Resolve Studio official scripting API MCP',
      bestFor: ['Resolve Studio timelines', 'render setup', 'markers/review metadata', 'grading/Fusion/Fairlight tasks'],
      integration: 'npx davinci-resolve-mcp setup or source install; Resolve external scripting set to Local',
      strengths: ['Professional NLE scripting through official API'],
      constraints: ['Requires DaVinci Resolve Studio and local scripting configuration'],
      source: 'samuelgursky/davinci-resolve-mcp README, accessed 2026-06-19',
    },
    {
      name: 'FCPXML MCP',
      type: 'Final Cut Pro XML/live-mode MCP',
      bestFor: ['Offline structured FCP timeline surgery', 'markers/chapters', 'non-destructive XML round trips'],
      integration: 'Export FCPXML; MCP parses/modifies/writes or pushes to FCP via live mode on macOS',
      strengths: ['Interchange-file workflow avoids brittle GUI automation'],
      constraints: ['Visual/color decisions still need review in Final Cut Pro'],
      source: 'DareDev256/fcpxml-mcp-server README, accessed 2026-06-19',
    },
    {
      name: 'ComfyUI MCP',
      type: 'ComfyUI generation/workflow authoring MCP',
      bestFor: ['Image/video generation workflows', 'live ComfyUI graph edits', 'model/custom-node management'],
      integration: 'npx -y comfyui-mcp with local/remote/Comfy Cloud modes',
      strengths: ['Generation graph surface for creating shots before mcp-video edits them'],
      constraints: ['Generation surface, not a general NLE or FFmpeg render/repurposing stack'],
      source: 'artokun/comfyui-mcp README, accessed 2026-06-19',
    },
  ],
};

export function buildVideoWorkflowPlan({ goal = '', targetSurface = '', requireLocal = false } = {}) {
  const normalizedGoal = goal.toLowerCase();
  const target = targetSurface.toLowerCase();
  let primarySurface = 'mcp-video';
  if (target.includes('premiere') || normalizedGoal.includes('premiere')) primarySurface = 'AdobePremiereProMCP';
  else if (target.includes('resolve') || normalizedGoal.includes('resolve')) primarySurface = 'DaVinci Resolve MCP';
  else if (target.includes('final cut') || target.includes('fcpxml') || normalizedGoal.includes('final cut')) primarySurface = 'FCPXML MCP';
  else if (target.includes('comfy') || normalizedGoal.includes('comfy')) primarySurface = 'ComfyUI MCP';
  else if (target.includes('video-use') || normalizedGoal.includes('video-use')) primarySurface = 'video-use';
  else if (target.includes('palmier') || normalizedGoal.includes('palmier') || requireLocal) primarySurface = 'mcp-video';

  const needsGeneration = /generate|ai|b-roll|broll|image|video model|comfy|upscale|hyperframes/.test(normalizedGoal);
  const needsCaptions = /caption|subtitle|transcript|filler|um\b|uh\b|dead air|talking head/.test(normalizedGoal);
  const needsSearch = /find|search|moment|where|quote|b-roll|broll|scene/.test(normalizedGoal);
  const needsRepurpose = /shorts|reels|tiktok|youtube|repurpose|vertical|square|platform/.test(normalizedGoal);

  if (primarySurface !== 'mcp-video') {
    return {
      goal,
      primarySurface,
      steps: [
        { tool: `${primarySurface}:project_state`, action: 'Read/import current project or source media before editing.' },
        { tool: `${primarySurface}:analysis`, action: 'Extract timeline/media/transcript facts rather than guessing from filenames.' },
        { tool: `${primarySurface}:edit`, action: 'Apply one batch of semantically-related edits through typed tools.' },
        { tool: `${primarySurface}:export_or_roundtrip`, action: 'Render, export, or write the NLE interchange file.' },
      ],
      verification: [
        'Inspect rendered frames or NLE preview at edit boundaries.',
        'Check audio transitions/cut boundaries for pops or clipped words.',
        'Verify duration, resolution, fps, subtitle timing, and export path with ffprobe or NLE state.',
      ],
      riskControls: ['Keep source files immutable.', 'Prefer typed MCP/NLE tools over ad-hoc shell commands.', 'Record tool responses and export paths.'],
    };
  }

  const steps = [
    { tool: 'mcp-video:video_info', action: 'Read duration, fps, resolution, codec, streams, and size before any edit.' },
  ];
  if (needsSearch) steps.push({ tool: 'mcp-video:video_info_detailed/video_detect_scenes', action: 'Find scenes, chapters, and visual checkpoints before cutting.' });
  if (needsCaptions) {
    steps.push({ tool: 'mcp-video:video_ai_transcribe or video_generate_subtitles', action: 'Create or import transcript/subtitle timing before caption burn-in.' });
    steps.push({ tool: 'mcp-video:video_subtitles_styled', action: 'Burn styled captions after checking transcript boundaries.' });
  }
  steps.push({ tool: 'mcp-video:video_preview/video_extract_frame', action: 'Create cheap visual review artifacts before full render.' });
  steps.push({ tool: 'mcp-video:video_trim/video_edit/video_merge/video_resize/video_add_texts', action: 'Apply structured edit operations; avoid hand-written FFmpeg filters unless no MCP tool exists.' });
  if (needsGeneration) {
    steps.push({ tool: 'mcp-video:video_project_create/style_pack_read/storyboard_read/shot_prompt_render', action: 'Plan generated shots locally, then render/import with Hyperframes or a separate generation surface.' });
    steps.push({ tool: 'mcp-video:hyperframes_snapshot/hyperframes_render', action: 'Verify Hyperframes stills/snapshots before full code-video render.' });
  }
  if (needsRepurpose) {
    steps.push({ tool: 'mcp-video:video_repurpose_plan', action: 'Create a dry-run manifest for platform crops, captions, and package layout.' });
    steps.push({ tool: 'mcp-video:video_repurpose', action: 'Render local Shorts/Reels/TikTok/YouTube packages only after manifest review.' });
  }
  steps.push({ tool: 'mcp-video:video_quality_check/video_release_checkpoint', action: 'Run quality and release checkpoints before claiming the export is usable.' });

  return {
    goal,
    primarySurface,
    steps,
    verification: [
      'Run ffprobe on the rendered file for duration, fps, resolution, audio streams, codec, and container.',
      'Extract frames at start, edit boundaries, caption/title placements, and final frame.',
      'Run mcp-video video_quality_check or video_release_checkpoint before handoff.',
      'For transcript edits, inspect the generated SRT/VTT or transcript and spot-check cut boundaries by audio playback.',
    ],
    riskControls: [
      'Palmier requests are routed to mcp-video unless the user explicitly asks for a macOS Palmier handoff.',
      'Keep source media immutable; write outputs to explicit new paths.',
      'Prefer mcp-video structured MCP/CLI tools over raw FFmpeg shell commands.',
      'Do not claim direct frame-perfect success without extracted-frame or preview artifacts.',
      'Optional AI features require extras; core FFmpeg editing must remain usable without hosted credentials.',
    ],
  };
}

export function runMcpVideoCli({ command = 'doctor', args = [], format = 'text', timeoutMs = 120000 } = {}) {
  if (!MCP_VIDEO_ALLOWED_CLI_COMMANDS.includes(command)) {
    throw new Error(`mcp-video CLI command '${command}' is not allowed`);
  }
  if (!Array.isArray(args)) throw new Error('args must be an array of strings');
  const sanitizedArgs = args.map((arg) => {
    if (typeof arg !== 'string') throw new Error('args must be strings');
    if (arg.includes('\0')) throw new Error('args must not contain NUL bytes');
    return arg;
  });
  const formatArgs = format === 'json' ? ['--format', 'json'] : [];
  const result = spawnSync(MCP_VIDEO_DIRECT_COMMAND[0], [...MCP_VIDEO_DIRECT_COMMAND.slice(1), ...formatArgs, command, ...sanitizedArgs], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    command,
    args: sanitizedArgs,
    format,
    exitCode: typeof result.status === 'number' ? result.status : result.error ? 1 : 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : null,
  };
}
