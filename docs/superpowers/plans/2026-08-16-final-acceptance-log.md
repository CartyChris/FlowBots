# Final Acceptance Log — 2026-08-16

This file records the final integration checkpoint for the Rakazo Local AI OS / FlowBots macOS release candidate.

## Verified integration before this checkpoint

- Exact base `main`: `c51e6043931c8da46ecafb02514d90800804b2e4`.
- A synthetic merge of current `main` into the feature branch completed with the feature branch chosen for textual conflict resolution, followed by a regenerated lockfile.
- The synthetic merged tree passed the complete root TypeScript check and root test suite.
- The real merge transaction then repeated the same exact-base guard and conflict policy, regenerated the lockfile, applied Biome formatting, passed `pnpm lint`, passed `pnpm check`, and passed `pnpm test` before pushing merge commit `1d46c3758d0c6348bbf6ae976fad797d1fa0b9c0`.
- Temporary merge/probe workflows were removed by the verified merge transaction.

## Final acceptance gate

This documentation-only checkpoint intentionally triggers the normal branch workflows after the bot-authored merge commit. The release is not accepted until workflows on the resulting exact branch head prove:

1. focused Local AI OS tests, including the pinned real Mnemosyne integration, are green;
2. the universal macOS DMG builds successfully;
3. the generated DMG mounts and its `FlowBots.app` launches from the mounted image, stays alive through the startup smoke window, and emits none of the original `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` / uncaught-main-process crash signatures;
4. the final reviewed branch is merged to `main` with an exact-head guard;
5. post-merge workflows repeat those checks on the resulting exact `main` SHA.

The DMG remains unsigned/unnotarized unless Apple Developer signing credentials are separately configured; packaging and launch verification are independent of notarization.
