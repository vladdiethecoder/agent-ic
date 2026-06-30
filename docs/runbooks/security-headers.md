# Agent IC Security Headers and CSP Runbook

Agent IC middleware emits baseline browser security headers and a conservative Content-Security-Policy-Report-Only policy.

## Current mode

CSP is intentionally report-only. This avoids breaking the Next.js runtime before deployed CSP telemetry is reviewed.

Headers include:

- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `referrer-policy: strict-origin-when-cross-origin`
- cross-origin opener/resource policies
- `content-security-policy-report-only`
- `x-agent-ic-csp-mode: report-only`
- `strict-transport-security` in production/HTTPS contexts

## Production boundary

Before enforcing CSP, review deployed report-only telemetry, remove or nonce inline/eval allowances where possible, add `report-to`/`report-uri` destinations, and run browser smoke against the deployed environment.
