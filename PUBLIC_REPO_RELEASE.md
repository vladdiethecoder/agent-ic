# Public Repo Release

This repo contains local proof artifacts and live credentials in the working tree. Do not push the raw workspace.

Use the public export gate before creating or updating the public GitHub repo:

```bash
npm run submission:preflight
npm run judge:check
npm run public:export
```

The export writes a stripped repo to `.agent-ic/public-submission-export/agent-ic` and a tarball at `.agent-ic/agent-ic-public-submission.tar.gz`.

Public repo: `https://github.com/vladdiethecoder/agent-ic`
Immutable public release tag: `hackathon-submission-2026-06-25-final-v2`
Machine-readable proof map: `SUBMISSION_MANIFEST.json`
Timestamped video guide: `VIDEO_JUDGE_GUIDE.md`

The public export intentionally excludes:

- `.env.local` and any `.env.*` secrets except `.env.example`
- `.agent-ic`, `.hermes`, `.next`, `.git`, `.venv`, and `node_modules`
- `.github/workflows/` because the publishing token may not have workflow scope
- `demo-out/` rendered videos, QA frames, browser profiles, and local generated state
- local binary/model/OCR/media artifacts

The final video should be attached to the public tweet, not committed into the public repo.

Before pushing, inspect `.agent-ic/public-submission-export-manifest.json` for the tarball hash and included file list.

## Publish Sequence

1. Create or update `https://github.com/vladdiethecoder/agent-ic` from `.agent-ic/public-submission-export/agent-ic`.
2. Attach `demo-out/agent-ic-demo-final-winning-v3.mp4` to the X post, not the repo.
3. Include the public repo link in the X post or first reply.
4. Drop the X post link in the Nous Discord submissions channel: `https://discord.gg/nousresearch/PFbQZMesC`.
5. Complete the Typeform: `https://form.typeform.com/to/hpEifIK4`.
