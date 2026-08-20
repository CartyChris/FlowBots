# FlowBots Local Social Agent Spec

## Product goal

Turn FlowBots into a genuinely local-first, independent macOS agent workspace that feels like a small social team rather than a set of chatbot tabs. The desktop app must work without a Rakazo account or Rakazo-hosted service, discover and use local models/agent CLIs, gain useful internet/browser/computer capabilities when the user enables them, and make bots expressive, collaborative, and visibly alive while they work.

The product gate is intentionally simple:

> Is this fun to use, useful across research/work/development workflows, and does it behave like a personable collaborative team/social product rather than merely a chatbot?

## Non-negotiable requirements

1. **Local-first identity**
   - The packaged desktop app creates/uses a single local user/workspace automatically.
   - No Rakazo sign-up, sign-in, or Rakazo cloud dependency is required to reach the main app.
   - Internal package names may remain `@rakazo/*` when renaming would add risk without changing product behavior.

2. **Internet and web capability**
   - A local bot must not incorrectly claim that internet access is categorically unavailable when a capability is enabled.
   - Bots receive an explicit capability manifest in their runtime instructions.
   - Provide a provider-independent `web_fetch` tool for public HTTP(S) pages with SSRF/private-network blocking, bounded response size, timeout, redirect checks, and text extraction.
   - Browser/computer-use remains the preferred path for interactive sites when a graphical computer is available.
   - The app makes the difference between direct web fetch, browser control, and connector/MCP access understandable to the user.

3. **Model discovery**
   - Ollama models are discovered from the local Ollama API and appear without manual entry.
   - The model UI has an explicit Refresh action.
   - Remote provider catalogs are refreshable rather than permanently frozen in a module-level cache.
   - xAI/Grok model IDs must be read from provider-supported discovery when possible; never invent a future model slug.
   - Manual provider/model ID entry remains available as a fallback.

4. **CLI / harness integration**
   - Detect Claude Code, Codex, Kimi Code, OpenCode, Prime Agent, Gemini CLI, and custom CLIs.
   - Reuse each CLI's own authentication when appropriate; do not copy OAuth tokens unnecessarily.
   - Prime Agent keeps first-class RPC support.
   - CLI processes are bounded by timeout/output limits and never run through a shell string interpolation path.

5. **Local connectors and MCP**
   - Composio can be configured from the local desktop experience with credentials stored in the local encrypted secret system.
   - Support stdio and HTTP/SSE MCP definitions and a connection test.
   - Starter workflows prioritize browser/computer, shell/files, email, and common work connectors.

6. **Agent computer / build-my-cloud flow**
   - The product can explain and prepare a local Docker-backed agent computer when Docker is available.
   - A bot may propose/setup the environment only after explicit user approval for host-level changes.
   - Team vs Private computer choices are exposed when supported.
   - The result is verified by a real probe, not assumed from command success alone.

7. **Bot collaboration / social behavior**
   - Bots can delegate to short-lived helpers and create lasting peer bots as today.
   - Add durable peer-to-peer messages between bots with loop/depth/concurrency safeguards.
   - Messages can receive lightweight reactions such as heart/like/eyes from the user and bots.
   - The UI exposes useful activity/state so the workspace feels like a team feed, not disconnected threads.

8. **Personality and expressiveness**
   - Each bot has a selectable relationship/personality preset (for example Developer, Researcher, Employee, Friend, Coach) plus a custom option.
   - Runtime instructions preserve the user's chosen role and bias bots toward initiative/eagerness without falsely claiming completed work.
   - Personality affects response style, not permission boundaries.

9. **Animated bot faces**
   - Replace static-dot faces with selectable cute bot face styles.
   - Eyes blink/look around; expressions change over time.
   - Working/thinking/tool-use states are visually distinct and may use faster micro-expression sequences.
   - Respect `prefers-reduced-motion`.

10. **Composer `+` menu**
    - The dead `+` control becomes an actual button.
    - It exposes at least file attachment, folder/workspace context, screenshot/computer context, and tools/connections entry points where supported.
    - Renderer file access goes through the existing Electron preload/IPC boundary; no Node integration in the renderer.

11. **Upstream parity**
    - Selectively bring across relevant current Rakazo desktop/web behavior rather than blind-merging the diverged histories.
    - Priority parity: model management, Team/Private Computer, routine edit/delete, Composio UX, startup/reliability fixes.

## Trust and safety boundaries

- Local-first does not mean unrestricted by default. Host-destructive or privilege-changing actions require explicit approval.
- URL fetching rejects loopback, link-local, private RFC1918/ULA targets, embedded credentials, non-HTTP(S), and redirects into blocked targets.
- CLI/MCP command configuration is explicit user configuration; do not execute arbitrary downloaded command text automatically.
- Secrets remain encrypted at rest and are never rendered back into chat.
- Bot-to-bot messaging is bounded and cannot recursively self-trigger without limits.

## UX direction

Take inspiration from the density, responsiveness, visible activity, expressive avatars, connector cards, and social feeling shown in the provided Grok Bots screenshots, but do not make a pixel-for-pixel copy. FlowBots should feel native to its existing dark visual language while being more alive: animated faces, hover reactions, working badges, compact activity pulses, richer tool/connection cards, and direct peer collaboration.

## Acceptance gates

A release candidate passes only if all applicable checks are green:

- Desktop launches directly into a usable local workspace without a Rakazo login.
- Local runtime boot succeeds with Rakazo endpoints unreachable.
- A test proves `web_fetch` can fetch a public page and rejects private/loopback targets and a redirect to one.
- Ollama discovery test lists all returned local tags and refresh invalidates the prior model result.
- CLI registry detects representative installed/uninstalled probes and keeps command invocation shell-free.
- MCP stdio + HTTP parser/invocation tests pass.
- Composio local configuration path is reachable when a key is supplied.
- Bot collaboration test sends a peer message and prevents an unbounded recursive handoff.
- Reaction CRUD/reducer behavior is covered.
- Avatar reduced-motion test disables continuous animation while preserving status semantics.
- Composer `+` is keyboard-accessible and opens the action menu.
- Full lint/typecheck/unit/integration/web E2E pass.
- Universal macOS DMG builds, mounts, contains both arm64/x86_64 app + node-pty assets, launches, remains alive through the smoke window, and emits no fatal startup error.
- Final product review answers all three gate questions positively with concrete evidence from the implemented flows.
