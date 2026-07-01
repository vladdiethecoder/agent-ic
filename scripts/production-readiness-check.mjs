#!/usr/bin/env node
import { validateProductionConfig } from '../lib/productionConfig.js';

const result = validateProductionConfig(process.env);
const summary = {
  ok: result.ok,
  status: result.status,
  readinessScope: result.production ? 'production' : 'development',
  productionReady: result.production === true && result.ok === true,
  truthModel: result.production
    ? 'Production readiness requires every required production control to pass in this deployment environment.'
    : 'Development readiness means local runtime checks pass; it is not a production-readiness claim.',
  mode: result.mode,
  blockers: result.blockers,
  passedChecks: result.checks.filter((check) => check.ok).length,
  totalChecks: result.checks.length,
};

console.log(JSON.stringify(summary, null, 2));

if (!result.ok) {
  console.error('\nProduction readiness blockers:');
  for (const blocker of result.blockers) {
    console.error(`- ${blocker.id}: ${blocker.message}`);
  }
  process.exit(1);
}
