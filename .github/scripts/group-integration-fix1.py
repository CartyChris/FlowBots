from pathlib import Path

path = Path("apps/web/src/pages/GroupChat.tsx")
source = path.read_text()
before = 'if (block.kind === "text") return <ChatMarkdown content={block.text} />;'
after = 'if (block.kind === "text") return <ChatMarkdown>{block.text}</ChatMarkdown>;'
count = source.count(before)
if count != 1:
    raise RuntimeError(f"expected one ChatMarkdown content prop, found {count}")
path.write_text(source.replace(before, after, 1))
print("GROUP_MARKDOWN_FIX_APPLIED=1")
