#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  FRONTIER_VIDEO_CATALOG,
  MCP_VIDEO_ALLOWED_CLI_COMMANDS,
  buildVideoWorkflowPlan,
  runMcpVideoCli,
} from '../lib/mcpVideoEditingCatalog.js';

const SERVER_INFO = { name: 'frontier-video-editing', version: '2.0.0' };
const PROTOCOL_VERSION = '2025-06-18';

const tools = [
  {
    name: 'frontier_video_tool_catalog',
    description: 'Return the mcp-video-first open-source video-editing catalog with source provenance, replacement rationale, and peer frontier surfaces.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'primary', 'frontier', 'replaced'], description: 'Optional catalog slice. Default all.' },
      },
    },
  },
  {
    name: 'video_editing_workflow_plan',
    description: 'Build a deterministic video-editing workflow plan. Palmier requests are routed to mcp-video unless a macOS Palmier handoff is explicitly requested.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'The user-visible editing/generation goal.' },
        targetSurface: { type: 'string', description: 'Optional desired surface: mcp-video, premiere, resolve, fcpxml, video-use, comfy, palmier-replacement.' },
        requireLocal: { type: 'boolean', description: 'Prefer local-only tools over hosted/cloud tools.' },
      },
      required: ['goal'],
    },
  },
  {
    name: 'mcp_video_doctor',
    description: 'Run `uvx --from mcp-video mcp-video doctor` and return local FFmpeg/mcp-video readiness output.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mcp_video_cli',
    description: 'Run an allowlisted mcp-video CLI command through uvx. Use direct mcp_video MCP tools for ordinary edits; this wrapper is for diagnostics and CI-style command execution.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: MCP_VIDEO_ALLOWED_CLI_COMMANDS, description: 'mcp-video CLI subcommand.' },
        args: { type: 'array', items: { type: 'string' }, description: 'Arguments passed without a shell.' },
        format: { type: 'string', enum: ['text', 'json'], description: 'mcp-video output format flag.' },
      },
      required: ['command'],
    },
  },
  {
    name: 'ffprobe_media',
    description: 'Inspect a local media file with ffprobe JSON. Use as a lightweight verification gate for rendered exports.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local video/audio/image path to inspect.' },
      },
      required: ['path'],
    },
  },
];

let inputBuffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  drainInput().catch((error) => {
    sendError(null, -32603, error.message || String(error));
  });
});

process.stdin.on('end', () => process.exit(0));

async function drainInput() {
  while (true) {
    if (inputBuffer.length === 0) return;
    const prefix = inputBuffer.slice(0, Math.min(inputBuffer.length, 32)).toString('utf8');
    if (/^Content-Length:/i.test(prefix)) {
      const headerEnd = inputBuffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = inputBuffer.slice(0, headerEnd).toString('utf8');
      const match = /Content-Length: *(\d+)/i.exec(header);
      if (!match) {
        inputBuffer = Buffer.alloc(0);
        sendError(null, -32700, 'Missing Content-Length header', 'framed');
        return;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (inputBuffer.length < bodyEnd) return;
      const payload = inputBuffer.slice(bodyStart, bodyEnd).toString('utf8');
      inputBuffer = inputBuffer.slice(bodyEnd);
      await handlePayload(payload, 'framed');
      continue;
    }

    const lineEnd = inputBuffer.indexOf('\n');
    if (lineEnd < 0) return;
    const line = inputBuffer.slice(0, lineEnd).toString('utf8').trim();
    inputBuffer = inputBuffer.slice(lineEnd + 1);
    if (!line) continue;
    await handlePayload(line, 'jsonl');
  }
}

async function handlePayload(payload, transport) {
  let message;
  try {
    message = JSON.parse(payload);
  } catch (error) {
    sendError(null, -32700, `Invalid JSON: ${error.message}`, transport);
    return;
  }
  await handleMessage(message, transport);
}

async function handleMessage(message, transport) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    sendError(message?.id ?? null, -32600, 'Invalid JSON-RPC request', transport);
    return;
  }
  const id = Object.hasOwn(message, 'id') ? message.id : undefined;
  try {
    if (message.method === 'initialize') {
      sendResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: 'Use mcp-video as the primary open-source local video-editing MCP. Prefer direct mcp_video MCP tools for edits; use wrapper tools for catalog, planning, doctor diagnostics, and ffprobe verification.',
      }, transport);
      return;
    }
    if (message.method === 'notifications/initialized') return;
    if (message.method === 'ping') {
      sendResult(id, {}, transport);
      return;
    }
    if (message.method === 'tools/list') {
      sendResult(id, { tools }, transport);
      return;
    }
    if (message.method === 'tools/call') {
      const result = await callTool(message.params || {});
      sendResult(id, result, transport);
      return;
    }
    sendError(id, -32601, `Unknown method: ${message.method}`, transport);
  } catch (error) {
    if (message.method === 'tools/call') {
      sendResult(id, toolError(error.message || String(error)), transport);
    } else {
      sendError(id, -32603, error.message || String(error), transport);
    }
  }
}

async function callTool(params) {
  const name = params.name;
  const args = params.arguments || {};
  if (name === 'frontier_video_tool_catalog') {
    const scope = args.scope || 'all';
    if (scope === 'primary') return toolJson(FRONTIER_VIDEO_CATALOG.primary);
    if (scope === 'frontier') return toolJson(FRONTIER_VIDEO_CATALOG.frontierSurfaces);
    if (scope === 'replaced') return toolJson(FRONTIER_VIDEO_CATALOG.replaced);
    return toolJson(FRONTIER_VIDEO_CATALOG);
  }
  if (name === 'video_editing_workflow_plan') {
    return toolJson(buildVideoWorkflowPlan({
      goal: args.goal || '',
      targetSurface: args.targetSurface || '',
      requireLocal: args.requireLocal === true,
    }));
  }
  if (name === 'mcp_video_doctor') {
    return toolJson(runMcpVideoCli({ command: 'doctor', args: [], format: 'text' }));
  }
  if (name === 'mcp_video_cli') {
    try {
      const result = runMcpVideoCli({
        command: args.command,
        args: args.args || [],
        format: args.format === 'json' ? 'json' : 'text',
      });
      if (result.exitCode !== 0 || result.error) return toolError(JSON.stringify(result, null, 2));
      return toolJson(result);
    } catch (error) {
      return toolError(error.message || String(error));
    }
  }
  if (name === 'ffprobe_media') {
    return toolJson(ffprobeMedia(args.path));
  }
  return toolError(`Unknown tool: ${name}`);
}

function ffprobeMedia(path) {
  if (!path || typeof path !== 'string') throw new Error('path is required');
  if (!existsSync(path)) throw new Error(`file not found: ${path}`);
  const result = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw new Error(`ffprobe failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffprobe exited ${result.status}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function toolJson(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], isError: false };
}

function toolError(message) {
  return { content: [{ type: 'text', text: String(message) }], isError: true };
}

function sendResult(id, result, transport) {
  if (id === undefined) return;
  send({ jsonrpc: '2.0', id, result }, transport);
}

function sendError(id, code, message, transport = 'jsonl') {
  send({ jsonrpc: '2.0', id, error: { code, message } }, transport);
}

function send(message, transport = 'jsonl') {
  const body = JSON.stringify(message);
  if (transport === 'framed') {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    return;
  }
  process.stdout.write(`${body}\n`);
}
