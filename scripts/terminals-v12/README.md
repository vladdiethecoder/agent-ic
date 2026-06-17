# Agent IC v12 Terminal Capture Pipeline

This directory contains vhs `.tape` files and fallback `.txt` scripts for the six
demo terminal sessions.

## Files

| Session | Tape (vhs real path) | Fallback (Playwright) | Default mode |
|---------|----------------------|-----------------------|--------------|
| NemoClaw/Hermes onboard | `nemoclaw-onboard.tape` | `nemoclaw-onboard.txt` | SIMULATED |
| Hermes dispatch | `hermes-dispatch.tape` | `hermes-dispatch.txt` | SIMULATED |
| Stripe Link CLI spend request | `stripe-link-spend.tape` | `stripe-link-spend.txt` | SIMULATED |
| MPP 402 payment | `mpp-payment.tape` | `mpp-payment.txt` | SIMULATED |
| Stripe Projects provisioning | `stripe-projects-provision.tape` | `stripe-projects-provision.txt` | SIMULATED |
| Blocked tool 403 | `blocked-tool-403.tape` | `blocked-tool-403.txt` | SIMULATED |

## Tool installation

Run the idempotent installer:

```bash
npm run demo:install-tools-v12
# or
node scripts/install-demo-tools-v12.mjs
```

Installed binaries land in `tools/bin/` (project-local). The script also installs
`mppx` to `tools/npm/` and symlinks it into `tools/bin/`.

## Capture

Default (safe, deterministic) run — all clips are rendered as simulated Playwright
terminal sessions:

```bash
npm run demo:terminals-v12
# or
node scripts/capture-terminal-v12.mjs
```

To attempt real vhs capture for the installed tools, set the enablement env vars:

```bash
CAPTURE_REAL_STRIPE=1 CAPTURE_REAL_MPP=1 node scripts/capture-terminal-v12.mjs
```

Additional optional env vars (require manual CLI installation):

```bash
CAPTURE_REAL_NEMOCLAW=1
CAPTURE_REAL_HERMES=1
CAPTURE_REAL_BLOCKED=1
```

## Output

Clips are written to `demo-out/terminals-v12/*.mp4` and copied to
`remotion/public/terminals-v12/*.mp4`.

A JSON report is written to `demo-out/terminals-v12/capture-report-v12.json`.

## Notes

- `@stripe/link-cli` is intentionally **not** installed per the v12 update. The
  `stripe-link-spend` session is always simulated.
- NemoClaw/Hermes CLIs are not publicly installable by this script. Those sessions
  remain simulated unless you install them manually and set the capture flags.
- vhs records to `.webm` and the capture script transcodes to h264 `.mp4` using
  the best available encoder (`libx264` → `h264_nvenc` → `libopenh264`).
- Secrets referenced via environment variables are never typed literally into the
  terminal frames.
