import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const transformPath = ".github/scripts/flow-awareness-v2-green.mjs";
const source = readFileSync(transformPath, "utf8");
const ambiguous = `replaceOnce(
  "apps/web/src/pages/Shell.tsx",
  '                state={avatarStateFor(bot.status)}',
  '                state={bot.id === active?.id && activeWorkState ? activeWorkState : avatarStateFor(bot.status)}',
);
replaceOnce(
  "apps/web/src/pages/Shell.tsx",
  '                state={avatarStateFor(snapshot?.run?.status ?? active.status)}',
  '                state={activeWorkState ?? avatarStateFor(snapshot?.run?.status ?? active.status)}',
);
replaceOnce(
  "apps/web/src/pages/Shell.tsx",
  '                working…',
  '                {activeWorkState ? \`${activeWorkState}…\` : "working…"}',
);
// The full-screen computer avatar has the same source expression; replace its remaining occurrence.
replaceOnce(
  "apps/web/src/pages/Shell.tsx",
  '                state={avatarStateFor(snapshot?.run?.status ?? active.status)}',
  '                state={activeWorkState ?? avatarStateFor(snapshot?.run?.status ?? active.status)}',
);`;
const precise = `replaceOnce(
  "apps/web/src/pages/Shell.tsx",
  '                color={bot.color}\\n                size={38}\\n                state={avatarStateFor(bot.status)}',
  '                color={bot.color}\\n                size={38}\\n                state={bot.id === active?.id && activeWorkState ? activeWorkState : avatarStateFor(bot.status)}',
);
replaceOnce(
  "apps/web/src/pages/Shell.tsx",
  '                color={active.color}\\n                size={26}\\n                state={avatarStateFor(snapshot?.run?.status ?? active.status)}',
  '                color={active.color}\\n                size={26}\\n                state={activeWorkState ?? avatarStateFor(snapshot?.run?.status ?? active.status)}',
);
replaceOnce(
  "apps/web/src/pages/Shell.tsx",
  '                working…',
  '                {activeWorkState ? \`${activeWorkState}…\` : "working…"}',
);
replaceOnce(
  "apps/web/src/pages/Shell.tsx",
  '                color={active.color}\\n                size={28}\\n                state={avatarStateFor(snapshot?.run?.status ?? active.status)}',
  '                color={active.color}\\n                size={28}\\n                state={activeWorkState ?? avatarStateFor(snapshot?.run?.status ?? active.status)}',
);`;
if (!source.includes(ambiguous)) throw new Error("guarded avatar patch source block not found exactly once");
if (source.indexOf(ambiguous) !== source.lastIndexOf(ambiguous)) {
  throw new Error("guarded avatar patch source block is not unique");
}
writeFileSync(transformPath, source.replace(ambiguous, precise));
await import(`./flow-awareness-v2-green.mjs?run=${Date.now()}`);
unlinkSync(".github/scripts/run-flow-awareness-v2-green.mjs");
unlinkSync(".github/workflows/run-flow-awareness-v2-green.yml");
