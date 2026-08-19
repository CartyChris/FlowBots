from pathlib import Path


def read_lines(path: str) -> list[str]:
    return Path(path).read_text().splitlines()


def write_lines(path: str, lines: list[str]) -> None:
    Path(path).write_text("\n".join(lines) + "\n")


def insert_after(lines: list[str], exact: str, block: list[str]) -> None:
    if block and all(line in lines for line in block if line):
        return
    matches = [i for i, line in enumerate(lines) if line == exact]
    if len(matches) != 1:
        raise SystemExit(f"expected one exact line {exact!r}, found {len(matches)}")
    i = matches[0]
    lines[i + 1 : i + 1] = block


def replace_exact_line(lines: list[str], exact: str, block: list[str]) -> None:
    if block and block[0] in lines:
        return
    matches = [i for i, line in enumerate(lines) if line == exact]
    if len(matches) != 1:
        raise SystemExit(f"expected one exact line {exact!r}, found {len(matches)}")
    i = matches[0]
    lines[i : i + 1] = block


router_path = "apps/api/src/router.ts"
router = read_lines(router_path)
insert_after(router, '  listPiCatalog,', ['  resolveModelApiKey,'])
insert_after(router, '    openRouterKey?: string;', ['    ollamaBaseUrl: string;'])
replace_exact_line(
    router,
    '      list: authed.models.list.handler(async () => [...listPiCatalog(), scriptedCatalogEntry]),',
    [
        '      list: authed.models.list.handler(async ({ context, input }) => {',
        '        const xaiCredential = await deps.prisma.userModelCredential.findFirst({',
        '          where: {',
        '            userId: context.actor.userId,',
        '            workspaceId: context.actor.workspaceId,',
        '            provider: "xai",',
        '          },',
        '          orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],',
        '        });',
        '        let xaiApiKey: string | undefined;',
        '        if (xaiCredential) {',
        '          const secret = await deps.prisma.secret.findFirst({',
        '            where: {',
        '              id: xaiCredential.secretId,',
        '              userId: context.actor.userId,',
        '              workspaceId: context.actor.workspaceId,',
        '            },',
        '          });',
        '          if (secret) {',
        '            const plaintext = deps.secrets.load(secret.ciphertext);',
        '            xaiApiKey = await resolveModelApiKey(plaintext, "xai", {',
        '              persist: async (next) => {',
        '                const encrypted = await deps.secrets.put(next, {',
        '                  operationId: `models:list:${context.actor.userId}`,',
        '                  traceId: `models:list:${context.actor.userId}`,',
        '                  workspaceId: context.actor.workspaceId,',
        '                  userId: context.actor.userId,',
        '                  signal: new AbortController().signal,',
        '                });',
        '                await deps.prisma.secret.update({',
        '                  where: { id: secret.id },',
        '                  data: { ciphertext: encrypted.ciphertext },',
        '                });',
        '              },',
        '            }).catch(() => undefined);',
        '          }',
        '        }',
        '        return listPiCatalog({',
        '          refresh: input?.refresh ?? true,',
        '          staticCatalog: [...listPiCatalog(), scriptedCatalogEntry],',
        '          ollamaBaseUrl: deps.env.ollamaBaseUrl,',
        '          xaiApiKey,',
        '        });',
        '      }),',
    ],
)
write_lines(router_path, router)

onboarding_path = "apps/web/src/pages/Onboarding.tsx"
onboarding = read_lines(onboarding_path)
insert_after(
    onboarding,
    '  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);',
    ['  const [refreshingModels, setRefreshingModels] = useState(false);'],
)
insert_after(
    onboarding,
    '  const signInLabel = selected?.oauthLabel ?? "Sign in";',
    [
        '',
        '  async function refreshModelCatalog() {',
        '    setRefreshingModels(true);',
        '    setError(null);',
        '    try {',
        '      const models = await rpc.models.list({ refresh: true });',
        '      setCatalog(models);',
        '      if (!models.some((entry) => entry.provider === provider && entry.id === modelId)) {',
        '        const first = models.find((entry) => entry.provider === provider) ?? models[0];',
        '        if (first) {',
        '          setProvider(first.provider);',
        '          setModelId(first.id);',
        '        }',
        '      }',
        '    } catch (err) {',
        '      setError(err instanceof Error ? err.message : "Could not refresh models");',
        '    } finally {',
        '      setRefreshingModels(false);',
        '    }',
        '  }',
    ],
)

old_initial = '    void Promise.all([rpc.me(), rpc.models.list().catch(() => [])])'
new_initial = '    void Promise.all([rpc.me(), rpc.models.list({ refresh: true }).catch(() => [])])'
if old_initial in onboarding:
    onboarding[onboarding.index(old_initial)] = new_initial
elif new_initial not in onboarding:
    raise SystemExit("could not find onboarding initial model-list call")

placeholder = '              placeholder="Search providers and models"'
matches = [i for i, line in enumerate(onboarding) if line == placeholder]
if len(matches) != 1:
    raise SystemExit(f"expected one model search placeholder, found {len(matches)}")
start = matches[0]
end = next(
    (i for i in range(start, min(start + 8, len(onboarding))) if onboarding[i].strip() == "/>"),
    None,
)
if end is None:
    raise SystemExit("could not locate end of model search input")
refresh_marker = '              {refreshingModels ? "Refreshing…" : "Refresh models"}'
if refresh_marker not in onboarding:
    onboarding[end + 1 : end + 1] = [
        '            <button',
        '              type="button"',
        '              onClick={() => void refreshModelCatalog()}',
        '              disabled={refreshingModels}',
        '              className="mt-2 rounded-[10px] border border-[#343438] px-3.5 py-2 text-sm text-[#D8D8DB] hover:bg-[#19191C] disabled:opacity-40"',
        '            >',
        refresh_marker,
        '            </button>',
    ]

billing_line = '            <p className="mt-2 text-[13px] text-[#85858A]">{selected?.billing}</p>'
manual_marker = '                placeholder="Type any provider-supported model ID"'
if manual_marker not in onboarding:
    insert_after(
        onboarding,
        billing_line,
        [
            '            <label className="mt-4 block text-sm text-[#85858A]">',
            '              Model ID override',
            '              <input',
            '                value={modelId}',
            '                onChange={(e) => setModelId(e.target.value)}',
            '                placeholder="Type any provider-supported model ID"',
            '                className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 font-mono text-[13px] text-[#ECECEE]"',
            '              />',
            '              <span className="mt-1.5 block text-[12px] text-[#66666C]">',
            '                Preview or newly released model IDs work even before a static catalog update.',
            '              </span>',
            '            </label>',
        ],
    )

old_copy_1 = '              Rakazo does not pay for model usage. Paste an API key, sign in with ChatGPT, Copilot,'
old_copy_2 = '              or SuperGrok, or skip if this deployment already has a key.'
new_copy_1 = '              FlowBots can use local Ollama models, your API keys, or supported provider sign-ins.'
new_copy_2 = '              Refresh the catalog whenever you install or gain access to a new model.'
if old_copy_1 in onboarding:
    i = onboarding.index(old_copy_1)
    onboarding[i] = new_copy_1
    if i + 1 >= len(onboarding) or onboarding[i + 1] != old_copy_2:
        raise SystemExit("model onboarding copy changed unexpectedly")
    onboarding[i + 1] = new_copy_2
elif new_copy_1 not in onboarding:
    raise SystemExit("could not find model onboarding copy")

write_lines(onboarding_path, onboarding)
