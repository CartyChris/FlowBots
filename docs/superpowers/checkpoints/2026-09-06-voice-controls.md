# Voice controls checkpoint

- Voice input requires an explicit disclosure confirmation and inserts final transcripts into the current composer draft only; it never sends a message.
- Read aloud is separately user-invoked and is mutually exclusive with capture. Starting one safely stops the other.
- Group-chat route scope is keyed by the immediate `groupChatId`, so route changes dispose the prior controller before stale room state can accept a final transcript.
- The controller handles synchronous recognition/utterance failures and abort failures without leaking callbacks or throwing from stop/dispose.
- Verified locally: `./node_modules/.bin/biome check --write` on voice-owned files, the focused VoiceControls/controller Vitest suite (12 tests), `node /workspace/scratch/cb27cf9f0bbf/voice-controller-check.mts`, and `git diff --check` pass.
- Deferred: TypeScript check and Playwright E2E have not been run for this slice; no broader CI result is claimed.
