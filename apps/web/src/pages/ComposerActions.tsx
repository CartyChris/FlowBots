import { useEffect, useRef, useState } from "react";
import { desktopBridge } from "../lib/desktop";

export interface ComposerActionsProps {
  onSelectedPaths: (input: { kind: "file" | "workspace"; paths: Array<{ name: string; path: string }> }) => void;
  onWebFiles: (files: FileList) => void;
  onComputer: () => void;
  onConnections: () => void;
  onHarnesses: () => void;
  onTeammate: () => void;
}

export function ComposerActions({
  onSelectedPaths,
  onWebFiles,
  onComputer,
  onConnections,
  onHarnesses,
  onTeammate,
}: ComposerActionsProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const webFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeForOutsideClick = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeForEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeForOutsideClick);
    window.addEventListener("keydown", closeForEscape);
    return () => {
      document.removeEventListener("mousedown", closeForOutsideClick);
      window.removeEventListener("keydown", closeForEscape);
    };
  }, [open]);

  async function chooseFiles() {
    const desktop = desktopBridge();
    if (desktop?.dialog) {
      const selected = await desktop.dialog.chooseFiles();
      if (selected.length) onSelectedPaths({ kind: "file", paths: selected });
    } else {
      webFileInput.current?.click();
    }
    setOpen(false);
  }

  async function chooseWorkspace() {
    const desktop = desktopBridge();
    if (!desktop?.dialog) return;
    const selected = await desktop.dialog.chooseWorkspace();
    if (selected) onSelectedPaths({ kind: "workspace", paths: [selected] });
    setOpen(false);
  }

  return (
    <div ref={root} className="relative shrink-0">
      <input
        ref={webFileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.currentTarget.files;
          if (files?.length) onWebFiles(files);
          event.currentTarget.value = "";
        }}
      />
      {open ? (
        <div
          role="menu"
          aria-label="Add context"
          className="absolute bottom-12 left-0 z-30 w-[238px] rounded-2xl border border-[#2A2A2F] bg-[#1A1A1D] p-2 shadow-[0_20px_55px_rgba(0,0,0,.6)]"
        >
          <Action label="Attach files" icon="＋" onClick={() => void chooseFiles()} />
          <Action
            label="Attach workspace"
            icon="▤"
            disabled={!desktopBridge()?.dialog}
            onClick={() => void chooseWorkspace()}
          />
          <Action label="Computer" icon="▣" onClick={() => { setOpen(false); onComputer(); }} />
          <Action label="Connections" icon="◫" onClick={() => { setOpen(false); onConnections(); }} />
          <Action label="Coding harnesses" icon="⌘" onClick={() => { setOpen(false); onHarnesses(); }} />
          <Action label="Ask a teammate" icon="☺" onClick={() => { setOpen(false); onTeammate(); }} />
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Add"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid h-[34px] w-[34px] place-items-center rounded-full border border-[#26262A] text-[18px] text-[#9A9AA0] hover:bg-[#202023] hover:text-[#ECECEE]"
      >
        +
      </button>
    </div>
  );
}

function Action({
  label,
  icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] text-[#D2D2D6] hover:bg-[#242428] disabled:cursor-not-allowed disabled:opacity-35"
    >
      <span className="w-5 text-center text-[#929298]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
