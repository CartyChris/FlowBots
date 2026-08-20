from pathlib import Path

source_path = Path("scripts/migrations/apply-task13-judge.py")
source = source_path.read_text()
old = "credential: { secretId: string; provider: string } | null | undefined,"
new = "credential: { secretId: string; provider: string } | null,"
old_target = "credential: { secretId: string | null; provider: string } | null | undefined,"
new_target = "credential: { secretId: string | null; provider: string } | null,"
if source.count(old) != 1 or source.count(old_target) != 1:
    raise SystemExit("executor signature migration anchors changed")
source = source.replace(old, new, 1).replace(old_target, new_target, 1)
exec(compile(source, str(source_path), "exec"), {"__name__": "__main__"})
