# Changelog

Notable product changes in Rakazo. This is for people following the repo, not a dump of every commit. GitHub Releases still mark tagged builds.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Desktop Connection Center: if the configured Rakazo web origin is unavailable, the packaged app now opens an actionable local recovery screen instead of an empty window. It includes Retry, Reset to Local, setup guidance, app/platform diagnostics, and automatic reconnect when the web origin returns.
- Saved desktop connection profiles: switch between local and remote/self-hosted Rakazo web origins from **Connection…** (`Cmd/Ctrl+,`) without relaunching from Terminal or changing environment variables. The five most recent endpoints are retained locally; credential-bearing URLs are rejected and no API keys, cookies, or tokens are stored in connection settings.
- Desktop health diagnostics: Connection Center reports web-origin reachability and local API health independently and can copy a small secret-free diagnostics report for troubleshooting.
- Bot personalities (agent steering): eight Grok-style personas — Witty, Unhinged, Wholesome, Genius, Chill, Hype, Zen, and Custom — each with its own voice, emoji, presence tag and catchphrases, plus humor / spice / energy / verbosity sliders, a swearing toggle, and a free-text custom voice. Personalities are compiled into the bot's system prompt and can be edited any time from bot settings.
- Per-message steering: type `/funny`, `/serious`, `/unhinged`, `/wholesome`, `/chill`, `/hype`, `/zen`, `/brief`, or `/verbose` at the start of a message (or tap the chips above the composer) to steer one reply without changing the bot's personality.
- Social layer: live bot presence in the sidebar (thinking / online / away with persona status tags), message reactions (🔥 💀 😂 👀) on any message, and a "nudge" button that makes a bot post a personality-driven vibe check.
- Buzz: a workspace feed (`/buzz`) where bots post ambient nudges and lounge summaries — the social timeline for your agent roster.
- Lounge (`/lounge`): pick 2–4 bots and a topic and let them banter in a shared room, each fully in character. Transcripts post back to the first bot's thread and to Buzz.
- Instant AI sync at onboarding: Rakazo detects API keys already in your environment (Anthropic, OpenAI, Google, xAI, Groq, DeepSeek, Mistral, OpenRouter, Together, Cerebras, Fireworks — the same vars CLIs like Codex and Claude Code use) and any running local Ollama server with its installed models, and imports them with one click. `sync.scan` / `sync.importEnv` / `sync.connectLocal` RPCs back the flow; keys go through the same encrypted secret store as pasted keys.
- Ollama is a first-class provider: every model on your local Ollama server appears in the model picker (no key, no meter), and bots can run on it end to end.
- Desktop: `pnpm --filter @rakazo/desktop pack:mac` builds a universal macOS `.dmg` (Apple Silicon + Intel) with a drag-to-Applications installer window.
- Electron first-run: Docker (default) or this Mac. This Mac runs the bot shell as you, with working directories under your home folder. macOS does not show its own permission dialog; the consent is Rakazo's. The choice is owner-only and is refused when `SANDBOX_PROVIDER` is not `docker` (so E2B and test fakes cannot enable it).
- GitHub Copilot and SuperGrok / X Premium sign-in via Pi device-code OAuth (`openai-codex`, `github-copilot`, `xai`). Claude Pro is still omitted because Pi's Claude login uses a localhost callback that does not work from the web app.
- Spawn peer bots (each with its own thread and computer) and short-lived in-thread subagents.
- ChatGPT Plus or Pro sign-in for model access.
- Mobile: point the app at a self-hosted API origin, a native iOS inbox, and take control of the live desktop.
- Revoke for connected Composio plugins.
- Routines in plain language instead of raw cron.

### Fixed

- Packaged desktop launches no longer swallow a failed `BrowserWindow.loadURL()` and leave the user on a black screen. Navigation failures are converted into visible recovery state and retried safely while the window remains open.

### Removed

- Unused Grant folder picker in the desktop app. Bots never got a host folder that way.

## [0.1.0-beta] - 2026-08-13

Initial public beta: web, Electron, and Expo clients; Pi runtime; Docker and E2B computers; plugins; one thread, computer, memory, routines, and history per bot.
