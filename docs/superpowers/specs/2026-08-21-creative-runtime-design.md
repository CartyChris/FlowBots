# FlowBots Creative Runtime Design

## Goal

Turn FlowBots into a visibly alive multi-agent workspace where user-created bots can work from a virtual office, launch structured sandbox/artifact jobs, use arbitrary model IDs, and gain declarative capabilities from GitHub repositories without introducing unsafe arbitrary host-code execution.

## Product pillars

### 1. Living bot presence

The existing shared `BotAvatar` remains the canonical identity component across web and desktop. It gains state-specific micro-animation layers instead of a small corner activity dot: eye/gaze behavior, working particles, rotating status emotes, thought bubbles, success bursts, and error shake. The animation is CSS-driven so a running bot continuously changes expression without timers or extra network state. `prefers-reduced-motion` remains a hard accessibility boundary.

### 2. Virtual Office

Add a full-screen `VirtualOfficeOverlay` fed directly from the current bot list. Every user-created bot is an employee. Deterministic placement maps active states into zones: Focus Desks, Build Lab, Collaboration Lounge, Artifact Studio, and Sandbox Pods. Each employee card shows the same animated shared avatar and current work state; selecting an employee switches to that bot. Office metrics summarize working, thinking, idle, completed, and error states.

The design is inspired by the supplied AI Office pixel-agent application's ideas—roster-driven employees, activity zones, visible status, project/work areas, and an office that feels alive—but adapts those ideas to FlowBots' existing contracts and dark UI instead of embedding a separate simulation engine.

### 3. Workbench: simulated sandbox + artifact studio

Add `WorkbenchOverlay` for the active bot. It has two coordinated workflows:

- **Sandbox Lab**: a user chooses a job template (prototype, test/fix, research, transform files), optional working-directory hint, isolation level, and task. The UI visualizes a staged sandbox with terminal/files/preview steps, then sends a structured task to the bot. The task explicitly uses the bot's existing computer/sandbox boundary rather than claiming the browser itself is a security sandbox.
- **Artifact Studio**: a user chooses one or more output formats (`pdf`, `docx`, `pptx`, `html`, `md`, `csv`) plus a brief. The generated task requires real files, saved under a stable `flowbots-exports/` directory, verification of file existence, and a concise final list of paths. HTML app/game jobs require a self-contained launchable artifact when practical.

This makes every bot capable of receiving the same file-generation workflow while preserving the runtime's actual tool availability. The UI never fabricates a successful file; completion is reported by the bot/run.

### 4. Custom models

`ModelSettingsOverlay` gains a Custom Model form independent of the discovered catalog. Users type provider ID, model ID, display label, and API key. Saving uses the existing `models.connect` contract, which already accepts arbitrary strings and persists credentials. The selected arbitrary model becomes the workspace default through `models.setDefault`. The discovered catalog remains the fast path; custom models are the escape hatch.

Credentialless behavior stays limited to providers explicitly supported by the runtime (currently Ollama). A custom provider never silently stores an empty secret.

### 5. GitHub Extensions

Extend the Connections/Plugins surface with a GitHub Extensions tab. A user registers:

- a public `https://github.com/<owner>/<repo>` URL,
- a display name,
- a permission scope (`bot-instructions`, `workflow-prompts`, or `workspace-feature`),
- optional bounded instruction text,
- optional target bot IDs.

Registration uses the existing persisted `capabilities.install` API with `kind: "plugin"`, `source` set to the normalized GitHub URL, and declarative config. The app does **not** execute arbitrary JavaScript, shell commands, install scripts, or repository binaries just because a repository was registered. Removing an extension uses `capabilities.remove`.

For this pass, extension effects are intentionally declarative: the UI can inject the registered instruction/prompt text into Workbench tasks for targeted bots, and workspace-feature entries are surfaced as installed feature descriptors. This is a safe foundation for later signed/verified extension manifests or MCP-backed executable extensions.

## Architecture and boundaries

- `packages/ui-web`: shared avatar behavior and CSS only.
- `apps/web/src/pages/VirtualOfficeOverlay.tsx`: pure presentation + selection callback, no persistence.
- `apps/web/src/pages/WorkbenchOverlay.tsx`: task composer that emits a finalized prompt through an `onRun` callback; no direct sandbox execution.
- `apps/web/src/pages/GitHubExtensions.tsx`: persisted capability registration/removal and extension-to-prompt helper.
- `apps/web/src/pages/ModelSettingsOverlay.tsx`: catalog path plus custom model path.
- `apps/web/src/pages/Shell.tsx`: owns overlay state, active bot, and dispatch to existing `threads.send`.

No database migration is required because the generic capability table and model credential schema already cover these features.

## Error handling

- Custom model: reject blank provider/model and API keys shorter than the existing contract minimum before RPC; show RPC error verbatim when safe.
- GitHub extension: only accept canonical public GitHub repository URLs; reject paths such as issues/pulls and non-GitHub hosts; cap instruction size in UI and config.
- Workbench: disable run until a non-empty task/brief exists; sending failures remain in Shell's existing RPC error boundary behavior.
- Virtual office: empty bot list renders an explicit empty state rather than inventing employees.

## Verification

- Unit tests prove the avatar exposes rotating emote layers and still honors reduced motion.
- Unit tests cover GitHub repository URL normalization/validation and extension prompt selection by bot.
- Unit tests cover Workbench task construction for sandbox and multi-format artifact jobs.
- Model settings parity/E2E asserts typed custom provider/model controls exist.
- Web golden/E2E asserts Office and Workbench entry points exist and can open.
- Full repository lint, typecheck/check, unit tests, web E2E, and production build run in CI before merge.

## Explicit non-goals

- No arbitrary remote code execution from GitHub repos.
- No fake claim that a PDF/DOCX/PPTX was generated before the bot actually creates it.
- No replacement of the existing Docker/E2B/desktop sandbox providers.
- No separate game engine or canvas simulation that duplicates FlowBots state.
