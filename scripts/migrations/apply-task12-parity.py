from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one exact anchor, found {count}")
    return text.replace(old, new, 1)


router_path = Path("apps/api/src/router.ts")
router = router_path.read_text()

router = replace_once(
    router,
    '''      const cred = await deps.prisma.userModelCredential.findFirst({
        where: { userId: actor.userId, isDefault: true },
      });''',
    '''      const cred = await deps.prisma.userModelCredential.findFirst({
        where: {
          userId: actor.userId,
          workspaceId: actor.workspaceId,
          isDefault: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });''',
    "me default credential workspace scope",
)

router = replace_once(
    router,
    '''      setDefault: authed.models.setDefault.handler(async ({ context, input }) => {
        await deps.prisma.userModelCredential.updateMany({
          where: { userId: context.actor.userId, provider: input.provider },
          data: { defaultModel: input.modelId, isDefault: true },
        });
        return { ok: true as const };
      }),''',
    '''      setDefault: authed.models.setDefault.handler(async ({ context, input }) => {
        const selected = await deps.prisma.userModelCredential.findFirst({
          where: {
            userId: context.actor.userId,
            workspaceId: context.actor.workspaceId,
            provider: input.provider,
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        });
        if (!selected) {
          throw new ORPCError("NOT_FOUND", {
            message: `No ${input.provider} credential is connected in this workspace.`,
          });
        }
        await deps.prisma.$transaction(async (tx) => {
          await tx.userModelCredential.updateMany({
            where: {
              userId: context.actor.userId,
              workspaceId: context.actor.workspaceId,
            },
            data: { isDefault: false },
          });
          await tx.userModelCredential.update({
            where: { id: selected.id },
            data: { defaultModel: input.modelId, isDefault: true },
          });
        });
        return { ok: true as const };
      }),''',
    "setDefault workspace transaction",
)

router = replace_once(
    router,
    '''  await deps.prisma.userModelCredential.updateMany({
    where: { userId: actor.userId },
    data: { isDefault: false },
  });
  const cred = await deps.prisma.userModelCredential.create({
    data: {
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      provider: input.provider,
      label: input.label ?? input.provider,
      secretId: secret.id,
      isDefault: true,
      defaultModel: input.modelId ?? deps.env.defaultModel,
    },
  });''',
    '''  const cred = await deps.prisma.$transaction(async (tx) => {
    await tx.userModelCredential.updateMany({
      where: { userId: actor.userId, workspaceId: actor.workspaceId },
      data: { isDefault: false },
    });
    return tx.userModelCredential.create({
      data: {
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        provider: input.provider,
        label: input.label ?? input.provider,
        secretId: secret.id,
        isDefault: true,
        defaultModel: input.modelId ?? deps.env.defaultModel,
      },
    });
  });''',
    "persist credential workspace transaction",
)

router_path.write_text(router)

shell_path = Path("apps/web/src/pages/Shell.tsx")
shell = shell_path.read_text()

shell = replace_once(
    shell,
    'import { MessageReactions } from "./MessageReactions";\n',
    'import { MessageReactions } from "./MessageReactions";\nimport { ModelSettingsOverlay } from "./ModelSettingsOverlay";\n',
    "model settings import",
)

shell = replace_once(
    shell,
    '''  const [routines, setRoutines] = useState<Routine[]>([]);
  const [computer, setComputer] = useState<ComputerStatus | null>(null);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [harnessesOpen, setHarnessesOpen] = useState(false);''',
    '''  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routinesBotId, setRoutinesBotId] = useState<string | null>(null);
  const [computer, setComputer] = useState<ComputerStatus | null>(null);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [harnessesOpen, setHarnessesOpen] = useState(false);''',
    "shell routine/model states",
)

shell = replace_once(
    shell,
    '''  const [routineDraft, setRoutineDraft] = useState({
    name: "",
    prompt: "",
    schedule: defaultCronPreset(),
  });
  const [screenUrl, setScreenUrl] = useState<string | null>(null);''',
    '''  const [routineDraft, setRoutineDraft] = useState({
    name: "",
    prompt: "",
    schedule: defaultCronPreset(),
  });
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [deleteRoutineTarget, setDeleteRoutineTarget] = useState<Routine | null>(null);
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [screenUrl, setScreenUrl] = useState<string | null>(null);''',
    "routine edit state",
)

shell = replace_once(
    shell,
    '''  const active = bots.find((b) => b.id === botId) ?? bots[0];

  async function refreshBots() {''',
    '''  const active = bots.find((b) => b.id === botId) ?? bots[0];
  const activeBotIdRef = useRef<string | undefined>(active?.id);
  activeBotIdRef.current = active?.id;
  const activeRoutines = routinesBotId === active?.id ? routines : [];

  async function refreshBots() {''',
    "active bot routine fence",
)

shell = replace_once(
    shell,
    '''    const snap = await rpc.threads.get({ botId: id });
    setSnapshot((prev) =>
      mergeThreadSnapshot(prev, snap, expandedHistoryThread.current === snap.threadId),
    );
    setComputer(snap.computer);
    const routines = await rpc.routines.list({ botId: id });
    setRoutines(routines);
    if (panel === "computer" || computerOpen) {
      const screen = await rpc.computer.screenUrl({ botId: id }).catch(() => ({ url: null }));
      setScreenUrl(screen.url);
    }''',
    '''    const [snap, nextRoutines] = await Promise.all([
      rpc.threads.get({ botId: id }),
      rpc.routines.list({ botId: id }),
    ]);
    if (activeBotIdRef.current !== id) return snap;
    setSnapshot((prev) =>
      mergeThreadSnapshot(prev, snap, expandedHistoryThread.current === snap.threadId),
    );
    setComputer(snap.computer);
    setRoutines(nextRoutines);
    setRoutinesBotId(id);
    if (panel === "computer" || computerOpen) {
      const screen = await rpc.computer.screenUrl({ botId: id }).catch(() => ({ url: null }));
      if (activeBotIdRef.current === id) setScreenUrl(screen.url);
    }''',
    "refreshThread stale bot fence",
)

shell = replace_once(
    shell,
    '''  useEffect(() => {
    setComputerOpen(false);
  }, [active?.id]);''',
    '''  useEffect(() => {
    setComputerOpen(false);
    setEditingRoutine(null);
    setDeleteRoutineTarget(null);
    setPanel((current) => (current === "routine" ? null : current));
  }, [active?.id]);''',
    "active bot routine reset",
)

shell = replace_once(
    shell,
    '''              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[#232327]"
                onClick={async () => {
                  setUsage(await rpc.usage.summary());
                }}
              >
                <span className="text-[#9A9AA0]">◔</span>
                <span className="flex-1 text-left text-[14.5px] text-[#ECECEE]">Weekly usage</span>
              </button>''',
    '''              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[#232327]"
                onClick={() => {
                  setMenuOpen(false);
                  setModelsOpen(true);
                }}
              >
                <span className="text-[#9A9AA0]">◉</span>
                <span className="flex-1 text-left text-[14.5px] text-[#ECECEE]">Models</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[#232327]"
                onClick={async () => {
                  setUsage(await rpc.usage.summary());
                }}
              >
                <span className="text-[#9A9AA0]">◔</span>
                <span className="flex-1 text-left text-[14.5px] text-[#ECECEE]">Weekly usage</span>
              </button>''',
    "account model settings action",
)

shell = replace_once(
    shell,
    '''                {routines.map((routine) => (
                  <button
                    key={routine.id}
                    type="button"
                    onClick={() => {
                      setRoutineDraft({
                        name: routine.name,
                        prompt: routine.prompt,
                        schedule: presetFromCron(routine.cron),
                      });
                      setPanel("routine");
                    }}''',
    '''                {activeRoutines.map((routine) => (
                  <button
                    key={routine.id}
                    type="button"
                    onClick={() => {
                      setRoutineDraft({
                        name: routine.name,
                        prompt: routine.prompt,
                        schedule: presetFromCron(routine.cron),
                      });
                      setEditingRoutine(routine);
                      setDeleteRoutineTarget(null);
                      setPanel("routine");
                    }}''',
    "routine list edit selection",
)

shell = replace_once(
    shell,
    '''                    const first = routines[0];
                    if (first) {
                      await rpc.routines.testRun({ routineId: first.id });
                      await refreshThread(active.id);
                    } else {
                      setRoutineDraft({ name: "", prompt: "", schedule: defaultCronPreset() });
                      setPanel("routine");
                    }''',
    '''                    const first = activeRoutines[0];
                    if (first) {
                      await rpc.routines.testRun({ routineId: first.id });
                      await refreshThread(active.id);
                    } else {
                      setRoutineDraft({ name: "", prompt: "", schedule: defaultCronPreset() });
                      setEditingRoutine(null);
                      setDeleteRoutineTarget(null);
                      setPanel("routine");
                    }''',
    "routine run now active list",
)

shell = replace_once(
    shell,
    '''                  onClick={() => {
                    setRoutineDraft({ name: "", prompt: "", schedule: defaultCronPreset() });
                    setPanel("routine");
                  }}''',
    '''                  onClick={() => {
                    setRoutineDraft({ name: "", prompt: "", schedule: defaultCronPreset() });
                    setEditingRoutine(null);
                    setDeleteRoutineTarget(null);
                    setPanel("routine");
                  }}''',
    "new routine reset edit state",
)

shell = replace_once(
    shell,
    '''                <button
                  type="button"
                  onClick={async () => {
                    await rpc.routines.create({
                      botId: active.id,
                      name: routineDraft.name || "Routine",
                      prompt: routineDraft.prompt || "Check in.",
                      cron: cronFromPreset(routineDraft.schedule),
                      timezone: "UTC",
                      active: true,
                      notify: true,
                    });
                    await refreshThread(active.id);
                    setPanel("computer");
                  }}
                  className="mt-5 rounded-[11px] bg-[#F1F1EF] px-4 py-2 text-[#17171A]"
                >
                  Save
                </button>''',
    '''                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={savingRoutine}
                    onClick={async () => {
                      const activeId = active.id;
                      const editing = editingRoutine;
                      if (editing && editing.botId !== activeId) return;
                      setSavingRoutine(true);
                      try {
                        if (editing) {
                          await rpc.routines.update({
                            routineId: editing.id,
                            name: routineDraft.name || "Routine",
                            prompt: routineDraft.prompt || "Check in.",
                            cron: cronFromPreset(routineDraft.schedule),
                            timezone: editing.timezone,
                            active: editing.active,
                            notify: editing.notify,
                          });
                        } else {
                          await rpc.routines.create({
                            botId: activeId,
                            name: routineDraft.name || "Routine",
                            prompt: routineDraft.prompt || "Check in.",
                            cron: cronFromPreset(routineDraft.schedule),
                            timezone: "UTC",
                            active: true,
                            notify: true,
                          });
                        }
                        if (activeBotIdRef.current !== activeId) return;
                        await refreshThread(activeId);
                        setEditingRoutine(null);
                        setDeleteRoutineTarget(null);
                        setPanel("computer");
                      } finally {
                        setSavingRoutine(false);
                      }
                    }}
                    className="rounded-[11px] bg-[#F1F1EF] px-4 py-2 text-[#17171A] disabled:opacity-50"
                  >
                    {savingRoutine ? "Saving…" : "Save"}
                  </button>
                  {editingRoutine ? (
                    <button
                      type="button"
                      disabled={savingRoutine}
                      onClick={() => setDeleteRoutineTarget(editingRoutine)}
                      className="text-[14px] text-[#E65707] disabled:opacity-50"
                    >
                      Delete routine
                    </button>
                  ) : null}
                </div>
                {deleteRoutineTarget ? (
                  <div
                    role="alertdialog"
                    aria-label={`Delete ${deleteRoutineTarget.name}?`}
                    className="mt-4 rounded-[12px] border border-[#3A1F14] bg-[#1A100C] p-4"
                  >
                    <p className="text-[13.5px] text-[#C9C9CE]">
                      Delete {deleteRoutineTarget.name}? This removes the schedule permanently.
                    </p>
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        onClick={() => setDeleteRoutineTarget(null)}
                        className="text-[14px] text-[#85858A]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const target = deleteRoutineTarget;
                          const activeId = active.id;
                          if (!target || target.botId !== activeId) return;
                          await rpc.routines.remove({ routineId: target.id });
                          if (activeBotIdRef.current !== activeId) return;
                          await refreshThread(activeId);
                          setEditingRoutine(null);
                          setDeleteRoutineTarget(null);
                          setPanel("computer");
                        }}
                        className="rounded-[9px] bg-[#E65707] px-3 py-1.5 text-[14px] text-white"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : null}''',
    "routine update delete controls",
)

shell = replace_once(
    shell,
    '''      {pluginsOpen ? <PluginsOverlay onClose={() => setPluginsOpen(false)} /> : null}
      {mcpOpen ? <McpOverlay onClose={() => setMcpOpen(false)} /> : null}''',
    '''      {pluginsOpen ? <PluginsOverlay onClose={() => setPluginsOpen(false)} /> : null}
      {modelsOpen ? <ModelSettingsOverlay onClose={() => setModelsOpen(false)} /> : null}
      {mcpOpen ? <McpOverlay onClose={() => setMcpOpen(false)} /> : null}''',
    "model settings overlay render",
)

shell_path.write_text(shell)

playwright_path = Path("apps/web/playwright.config.ts")
playwright = playwright_path.read_text()
playwright = replace_once(
    playwright,
    '''  fullyParallel: false,
  timeout: 120_000,''',
    '''  fullyParallel: false,
  workers: 1,
  timeout: 120_000,''',
    "shared database E2E worker isolation",
)
playwright_path.write_text(playwright)
