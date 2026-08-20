from pathlib import Path
import re

source_path = Path("scripts/migrations/apply-task13-judge.py")
source = source_path.read_text()

old = "credential: { secretId: string; provider: string } | null | undefined,"
new = "credential: { secretId: string; provider: string } | null,"
old_target = "credential: { secretId: string | null; provider: string } | null | undefined,"
new_target = "credential: { secretId: string | null; provider: string } | null,"
if source.count(old) != 1 or source.count(old_target) != 1:
    raise SystemExit("executor signature migration anchors changed")
source = source.replace(old, new, 1).replace(old_target, new_target, 1)

stale_body = re.compile(
    r'executor = replace_once\(\n'
    r'    executor,\n'
    r'    \'\'\'  if \(credential\) \{.*?'
    r'    "credentialless Ollama runtime key",\n'
    r'\)\n',
    re.S,
)
source, removed = stale_body.subn("", source, count=1)
if removed != 1:
    raise SystemExit(f"stale model-key body migration anchor count={removed}")

peer_path = Path("packages/adapters/src/peer-connector.ts")
peer = peer_path.read_text()
current_peer_import = (
    'import { createThreadMessage, type PrismaClient, type ThreadEvents } from "@rakazo/db";'
)
normalized_peer_import = '''import {
  createThreadMessage,
  type PrismaClient,
  type ThreadEvents,
} from "@rakazo/db";'''
if peer.count(current_peer_import) != 1:
    raise SystemExit(f"current peer import anchor count={peer.count(current_peer_import)}")
peer_path.write_text(peer.replace(current_peer_import, normalized_peer_import, 1))

exec(compile(source, str(source_path), "exec"), {"__name__": "__main__"})

executor_path = Path("packages/adapters/src/executor.ts")
executor = executor_path.read_text()
current = '''  if (credential && deps.secretStore) {
    return withModelCredentialLock(credential.secretId, async () => {
      const row = await deps.prisma.secret.findUnique({ where: { id: credential.secretId } });'''
updated = '''  if (credential?.provider === "ollama" && !credential.secretId) {
    return { apiKey: undefined, redact: [] };
  }
  if (credential && !credential.secretId) {
    throw new Error(`Missing encrypted credential for ${credential.provider}.`);
  }
  if (credential && deps.secretStore) {
    return withModelCredentialLock(credential.secretId, async () => {
      const row = await deps.prisma.secret.findUnique({ where: { id: credential.secretId } });'''
if executor.count(current) != 1:
    raise SystemExit(f"current model-key body anchor count={executor.count(current)}")
executor_path.write_text(executor.replace(current, updated, 1))
