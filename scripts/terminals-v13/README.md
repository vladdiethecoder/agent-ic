# Agent IC v13 Terminal Capture Pipeline

Real CLI terminal capture for the three key demo beats in Plan Option B
(Hybrid Live-Cinematic):

| Session | Tape (vhs real path) | Fallback (Playwright replay) | Default mode |
|---------|----------------------|------------------------------|--------------|
| NemoClaw policy gate 403 | `nemoclaw-gate-403.tape` | `nemoclaw-gate-403.txt` | Replay |
| Stripe CLI checkout create | `stripe-cli-checkout.tape` | `stripe-cli-checkout.txt` | Replay |
| Hermes health/skills | `hermes-health.tape` | `hermes-health.txt` | Replay |

## Tool installation

Run the idempotent v13 installer:

```bash
npm run demo:install-tools-v13
# or
node scripts/install-demo-tools-v13.mjs
```

Installed binaries land in `tools/bin/` (project-local). NemoClaw and Hermes
CLIs are not publicly installable; the capture script falls back to honest
replays when those endpoints are not reachable.

## Capture

Default (safe, deterministic) run — all clips render as honest Playwright
terminal replays with no simulated watermark:

```bash
npm run demo:terminals-v13
# or
node scripts/capture-terminal-v13.mjs
```

To attempt real vhs capture, ensure the tool is installed and the target is
reachable:

```bash
# Stripe real capture (requires stripe CLI + STRIPE_SECRET_KEY)
STRIPE_SECRET_KEY=sk_test_... node scripts/capture-terminal-v13.mjs

# NemoClaw real capture (requires Agent IC dev server on localhost:3000)
npm run dev &
node scripts/capture-terminal-v13.mjs

# Hermes real capture (requires HERMES_AGENT_URL)
HERMES_AGENT_URL=http://localhost:8080 node scripts/capture-terminal-v13.mjs
```

## Output

Clips are written to `demo-out/terminals-v13/*.mp4` and copied to
`remotion/public/terminals-v13/*.mp4`.

A JSON report is written to `demo-out/terminals-v13/capture-report-v13.json`.

## Notes

- Fallback replays are honest terminal scripts and carry **no** "SIMULATED"
  watermark or badge in-frame.
- vhs records to `.webm` and the capture script transcodes to h264 `.mp4`.
- Secrets referenced via environment variables are never typed literally into
  terminal frames, and command output is redacted before persistence.
