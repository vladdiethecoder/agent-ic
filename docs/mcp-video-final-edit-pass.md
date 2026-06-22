# mcp-video Final Edit Pass

mcp-video is now the primary open-source edit and verification surface for `demo-out/agent-ic-demo-final.mp4`. It runs in this Linux environment through `uvx --from mcp-video mcp-video`, uses local FFmpeg/ffprobe, and exposes direct Hermes MCP tools plus a local wrapper for catalog/planning/doctor/ffprobe checks.

Use this as the deterministic editorial pass:

1. Run `node tools/mcp-video-client.mjs doctor --json` and fail if core mcp-video, FFmpeg, or ffprobe checks fail.
2. Inspect the final MP4 with direct MCP `mcp_video.video_info` or CLI `node tools/mcp-video-client.mjs run info --json -- demo-out/agent-ic-demo-final.mp4`.
3. Extract verification frames with `mcp_video.video_extract_frame` or CLI `video-extract-frame` at proof moments around `1s`, `7s`, `15s`, `28s`, `42s`, `60s`, and the final QR frame.
4. Run `mcp_video.video_quality_check` or CLI `video-quality-check` on the final MP4.
5. If captions or overlays need edits, use structured mcp-video tools (`video_subtitles_styled`, `video_add_texts`, `video_edit`) and write to a new output path.
6. Re-run `ffprobe` on the output to verify duration, fps, resolution, audio stream, codec, and container.
7. Fail the pass if any frame shows local URLs, stale repo labels, unmasked provider secrets, misleading live/test wording, caption overlap, or audio claims that do not match the visible stage.

The machine-readable handoff is in `demo-out/mcp-video-final-edit-pass.json`.
