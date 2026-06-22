#!/usr/bin/env node
import {
  FRONTIER_VIDEO_CATALOG,
  MCP_VIDEO_ALLOWED_CLI_COMMANDS,
  buildVideoWorkflowPlan,
  runMcpVideoCli,
} from '../lib/mcpVideoEditingCatalog.js';

function usage(exitCode = 0) {
  const text = `mcp-video / frontier video editing tool

Usage:
  node tools/mcp-video-client.mjs catalog [--json]
  node tools/mcp-video-client.mjs commands [--json]
  node tools/mcp-video-client.mjs doctor [--json]
  node tools/mcp-video-client.mjs plan "GOAL" [--target SURFACE] [--local] [--json]
  node tools/mcp-video-client.mjs run COMMAND [--format text|json] [--json] [-- ARGS...]

Direct Hermes MCP:
  uvx --from mcp-video mcp-video
`;
  const out = exitCode === 0 ? console.log : console.error;
  out(text.trimEnd());
  process.exit(exitCode);
}

function parseFlags(argv) {
  const positional = [];
  const passthrough = [];
  const flags = { json: false, local: false, format: 'text' };
  let afterDoubleDash = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (afterDoubleDash) {
      passthrough.push(arg);
      continue;
    }
    if (arg === '--') afterDoubleDash = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--local') flags.local = true;
    else if (arg === '--target') flags.target = argv[++i];
    else if (arg === '--format') flags.format = argv[++i];
    else if (arg === '-h' || arg === '--help') flags.help = true;
    else positional.push(arg);
  }
  return { positional, passthrough, flags };
}

function printResult(result, json) {
  if (json || typeof result !== 'string') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '-h' || command === '--help') usage(0);
  const { positional, passthrough, flags } = parseFlags(rest);
  if (flags.help) usage(0);

  if (command === 'catalog') {
    printResult(FRONTIER_VIDEO_CATALOG, flags.json);
    return;
  }
  if (command === 'commands') {
    printResult({ commands: MCP_VIDEO_ALLOWED_CLI_COMMANDS }, flags.json);
    return;
  }
  if (command === 'doctor') {
    const result = runMcpVideoCli({ command: 'doctor', args: [], format: 'text' });
    if (flags.json) {
      printResult(result, true);
    } else {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
    }
    process.exit(result.exitCode);
  }
  if (command === 'plan') {
    const goal = positional.join(' ').trim();
    if (!goal) throw new Error('plan requires a GOAL string');
    printResult(buildVideoWorkflowPlan({ goal, targetSurface: flags.target || '', requireLocal: flags.local }), flags.json);
    return;
  }
  if (command === 'run') {
    const [mcpVideoCommand, ...inlineArgs] = positional;
    if (!mcpVideoCommand) throw new Error('run requires a mcp-video command');
    const result = runMcpVideoCli({
      command: mcpVideoCommand,
      args: [...inlineArgs, ...passthrough],
      format: flags.format === 'json' ? 'json' : 'text',
    });
    if (flags.json) printResult(result, true);
    else {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
    }
    process.exit(result.exitCode);
  }

  usage(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
