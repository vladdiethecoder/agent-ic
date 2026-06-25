# Agent IC Container Release Runbook

Agent IC includes a container release preflight foundation. It validates Dockerfile hardening and records the command plan for image build, scan, SBOM generation, signing, and verification.

## Preflight

```bash
npm run container:check
```

This writes `.agent-ic/container-release-preflight.json`. The preflight is release-gated, but it does **not** prove a real image has been built, scanned, signed, published, or deployed.

## Required production sequence

1. Build the image in CI:
   ```bash
   docker build -t <registry>/agent-ic:<version> .
   ```
2. Scan the image:
   ```bash
   trivy image --exit-code 1 --severity HIGH,CRITICAL <registry>/agent-ic:<version>
   ```
3. Generate an SBOM:
   ```bash
   syft <registry>/agent-ic:<version> -o spdx-json > container-sbom.spdx.json
   ```
4. Sign the immutable digest:
   ```bash
   cosign sign --yes <registry>/agent-ic@sha256:<digest>
   ```
5. Verify the signature:
   ```bash
   cosign verify <registry>/agent-ic@sha256:<digest>
   ```
6. Deploy the signed digest and run production smoke.

## Production boundary

Do not claim container production readiness until the image digest, scan report, SBOM, signature verification, deployment manifest, and deployed smoke evidence are attached to the release package.
