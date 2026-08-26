# Interactive Group Chats + Stable Bot Selection Design

## Goal

Fix the critical sidebar-selection regression and add first-class, persistent FlowBots group chats with true multi-bot authorship, bounded agentic routing, mentions, and visible per-bot activity.

## Selection bug root cause

`ShellPage` mounts at `/app` with no `botId`. Its 4-second `refreshBots()` interval captures that initial `botId = undefined`. Even after the user navigates to `/app/<other-bot>`, the stale interval continues deciding there is no valid selected bot and repeatedly replaces the route with the first bot in the refreshed list.

### Required behavior

- A click on any bot becomes the durable route source of truth.
- Background bot-list refreshes may redirect only when the *current* route has no bot id or references a bot that no longer exists.
- Selecting the second/third/etc. bot must remain selected across at least two 4-second refresh cycles.
- Thread refreshes from the previously selected bot must never overwrite the newly selected bot's visible state.

## Group-chat architecture

Approach A is implemented as a separate persistent conversation domain. It does not mirror group messages into 1:1 histories.

### Data model

Add:

- `GroupChat`: workspace/user scoped room, name, message sequence, timestamps.
- `GroupChatMember`: ordered many-to-many membership between a room and existing bots.
- `GroupMessage`: chronological room message with `authorKind` (`user`, `bot`, `system`), optional `botId`, blocks, optional `runId`, and stable sequence.
- Optional `groupChatId`/`groupPromptSeq` on `Task` and `Run` so existing workers can execute real bot runs without writing their final answer into private 1:1 history.

All group entities are hard-scoped to the authenticated user's workspace. A bot marked `Separated from Flow` cannot be added to a room and is ignored by automatic routing if its membership changes later.

## Message routing

A user send creates one optimistic room message and then resolves responders deterministically:

1. Explicit `@BotName` mentions target those connected room members.
2. `@all`, `@team`, or clear whole-team phrasing targets all available members, bounded to four responders per turn.
3. Without mentions, smart routing scores member name/title/description against the prompt and selects up to three relevant bots; fallback selects the first two available room members.
4. Bots with another active run are reported as busy rather than started concurrently on the same bot computer.

Each selected responder receives the shared room history (with author labels), its own normal bot instructions/memory/tools, and a group-chat system instruction naming the room and current participants. Runs remain bounded by the existing lease/effect/tool controls.

## Runtime persistence

For a group run, executor setup reads recent `GroupMessage` history instead of private `Message` history. Tool usage, memory, sandbox, artifacts, research verification, Flow awareness, and model selection remain unchanged.

Completion uses a group-specific finalization transaction:

- lease/fence guard must still match;
- Run, Attempt, and Task become terminal atomically;
- completed output is inserted as a `GroupMessage` with the responding `botId` and `runId`;
- private `Message` history is untouched;
- bot `updatedAt` is advanced;
- failures terminate the run/task/attempt and remain visible in group activity state without fabricating a bot answer.

## Group-chat API

Add `groupChats` RPC methods:

- `list()` -> room summaries and member avatars.
- `get({ groupChatId })` -> room details, chronological messages, member metadata, active responder runs.
- `create({ name, botIds })` -> validates at least two connected Flow bots.
- `update({ groupChatId, name?, botIds? })` -> revalidates membership.
- `remove({ groupChatId })`.
- `send({ groupChatId, text, clientNonce? })` -> stores user message, resolves responders, queues bounded group runs, returns responder/busy ids.
- `stop({ groupChatId })` -> cancels active group runs only.

## UI

### Sidebar

- Keep existing individual bot list behavior.
- Add a clear `New group chat` control near New Bot.
- Show persistent group rooms in a dedicated `Group chats` section above or below individual bots.
- Room rows show a compact member-avatar stack, room name, and active/unread-like status copy.

### Group page

A dedicated route `/groups/:groupChatId` renders:

- room name and member avatar strip;
- editable membership/name control;
- chronological messages with bot avatar/name/color on every bot-authored message;
- `@BotName` mention chips / autocomplete assistance;
- quick `@all` action;
- visible parallel activity chips such as `Randy researching`, `Susie building`, `Bottie collaborating` based on active run/tool state where available;
- composer, stop control, files rendered using the existing artifact download contract;
- deterministic polling fallback (sub-second to ~1 second while active, slower when idle) so rooms remain interactive without introducing a second realtime transport in this pass.

## Agentic teamwork behavior

Group instruction tells responders to:

- answer as themselves, never impersonate another bot;
- read the room before responding;
- avoid repeating a teammate unless correcting/adding material value;
- use `consult_teammate` for private context where relevant;
- explicitly hand off with `@BotName` in prose when another specialist should take the next turn;
- keep external actions inside the same permission/effect boundaries as 1:1 runs.

Automatic bot-to-bot infinite loops are forbidden. Only a user send queues responders in this pass; bot mentions are visible handoff suggestions for the user/next turn, not self-triggering recursive runs.

## Error handling and limits

- Minimum room size: 2 connected Flow bots.
- Maximum room size: 12 bots.
- Maximum automatic responders per user turn: 4.
- A bot already running is returned as busy and not double-run.
- Deleting a bot cascades membership removal; a room that falls below two members remains readable but cannot send until membership is repaired.
- Deleting a room cancels its active runs before deleting room records.
- Group files remain owned by the producing bot/run but are downloadable from the shared room using the existing workspace/user authorization route.

## Testing

### Selection regression

Playwright must:

1. create at least three bots;
2. click a non-first bot;
3. verify header/composer/url show that bot;
4. wait > 8 seconds (two list polls);
5. verify the same bot is still selected;
6. switch to a third bot and verify again.

### Group contracts

- mention parser and smart responder routing unit tests;
- Flow-isolated membership rejection;
- group message sequence atomicity/integration tests;
- executor test proving group completion writes `GroupMessage` and not private `Message`;
- API integration for create/get/update/send/stop/remove;
- Playwright: create a room with 2+ scripted bots, send `@all` message, observe distinct named bot responses, refresh/reopen and verify persistence.

## Release gate

Before any merge to `main` or release publication:

- full lint;
- full typecheck;
- full unit suite;
- Postgres journeys including migration;
- Web E2E including >8s selection regression and group chat flow;
- production builds;
- universal macOS DMG build, mount, architecture inspection, launch smoke;
- download the exact branch artifact and independently verify SHA-256;
- deliver that DMG to the user first.
