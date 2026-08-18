# FlowBots Language, Performance, and Animation Architecture

This document is an additive constraint on the FlowBots local-social-agent spec and plan.

## Principle

Use the strongest language at each boundary, but do not add languages merely to claim a polyglot stack. New native services/helpers must earn their complexity through measurable latency, CPU, memory, safety, portability, or integration benefits.

## Preferred split

### TypeScript / JavaScript

Primary product language for:
- React UI and Electron desktop shell
- agent orchestration, adapters, model/provider catalogs, MCP/connectors
- social collaboration, reactions, presence, personality configuration
- most browser/computer-use coordination
- lightweight animation and expressive bot state machines

Reason: this is already the dominant repo/runtime and gives the shortest path to a reliable feature without duplicated infrastructure.

### Rust

Preferred native language for new performance/security-sensitive helpers when profiling or architecture justifies crossing the process/native boundary. Good candidates include:
- high-throughput local indexing/search or file scanning
- secure host-side capability broker / process supervisor helpers
- CPU-heavy parsing/transforms
- low-overhead filesystem watching
- native macOS integrations where Node is measurably inefficient

Use a narrow JSON-RPC/stdin-stdout, local socket, or N-API boundary. Do not move ordinary application logic to Rust solely for novelty.

### Python

Preferred optional ML/research language for:
- local embedding/reranking pipelines
- model evaluation and experimentation
- local inference integrations whose strongest ecosystem is Python
- optional data-science/research workers

Python components must remain optional or bundled/configured explicitly; the core desktop boot cannot depend on a separately installed Python interpreter unless the packaged app supplies it.

### Go

Use for small standalone daemons/services only when Go materially simplifies concurrency, distribution, or a long-running local server compared with the existing TypeScript runtime. Do not duplicate the current API/local-runtime services in Go without measured justification.

### Other native/ML-efficient languages

C/C++/Metal/Swift may be used behind focused boundaries when required by an inference library, macOS API, or GPU acceleration path. Prefer existing maintained libraries over custom native code.

## Bot animation stack

1. **Default:** React + CSS transforms/opacity + SVG for faces, eyes, lids, mouths, badges, and micro-expressions.
2. **Canvas 2D:** use when many simultaneous avatars need lower React DOM overhead or richer procedural effects.
3. **WebGL / Three.js:** reserve for effects that materially benefit from GPU rendering (3D mascots, particles, depth, richer scenes). Do not require Three.js for basic sidebar avatars.
4. **State model:** avatars consume a small semantic state (`idle`, `listening`, `thinking`, `tool`, `coding`, `browser`, `success`, `needs_help`, `error`) rather than owning business logic.
5. **Performance:** pause or sharply reduce offscreen/background animation, cap random micro-expression frequency, avoid layout-triggering animation, and respect `prefers-reduced-motion`.
6. **Scalability gate:** a workspace containing many visible bots must remain responsive; animation cannot block message streaming or agent/tool execution.

## Acceptance gates

- No new language/runtime is added without a written reason tied to a measurable/product requirement.
- TypeScript remains the default path when performance is already adequate.
- Any Rust/Go/Python helper has a bounded, testable interface and failure fallback.
- Bot animation uses compositor-friendly properties by default and honors reduced motion.
- Continuous avatar animation stops or throttles when the avatar/window is not visible.
- Agent execution state can drive avatar expressions without coupling the model runtime to rendering code.
