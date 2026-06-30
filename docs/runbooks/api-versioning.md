# Agent IC API Versioning Runbook

Agent IC exposes an API contract version and runtime version headers.

## Current version

`2026-06-23.foundation-v1`

Every API response includes:

- `x-agent-ic-api-version`
- `x-agent-ic-api-deprecation-policy`

Clients may send `x-agent-ic-api-version`. Unsupported explicit versions fail closed with `400 unsupported_api_version`.

## Deprecation policy foundation

Current policy header: `no-removal-without-documented-successor`.

Production API governance still requires formal compatibility rules, deprecation windows, consumer notification, generated-client checks, and deployed contract tests.
