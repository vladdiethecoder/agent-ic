#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildOpenApiSpec, validateOpenApiSpec } from '../lib/openapiSpec.js';

const out = process.env.AGENT_IC_OPENAPI_OUT || '.agent-ic/openapi.json';
const spec = buildOpenApiSpec({ publicUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://agent-ic.example.com' });
const validation = validateOpenApiSpec(spec);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(spec, null, 2)}\n`);
console.log(JSON.stringify({ ...validation, out }, null, 2));
if (!validation.ok) process.exit(1);
