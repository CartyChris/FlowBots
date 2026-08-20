from pathlib import Path

path = Path("apps/web/src/pages/Shell.tsx")
text = path.read_text()
old = '''          <span className="text-[14.5px] text-[#C9C9CE]">Plugins</span>
        </button>
        <button
          type="button"
          onClick={() => setHarnessesOpen(true)}'''
new = '''          <span className="text-[14.5px] text-[#C9C9CE]">Plugins</span>
        </button>
        <button
          type="button"
          aria-label="Models"
          onClick={() => setModelsOpen(true)}
          className="mx-3 mb-1 flex items-center gap-3 rounded-[11px] px-2.5 py-2 hover:bg-[#131315]"
        >
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#17171A] text-[14px] text-[#9A9AA0]">
            ◉
          </span>
          <span className="text-[14.5px] text-[#C9C9CE]">Models</span>
        </button>
        <button
          type="button"
          onClick={() => setHarnessesOpen(true)}'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"models sidebar anchor: expected one exact anchor, found {count}")
path.write_text(text.replace(old, new, 1))
