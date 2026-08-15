import type { PersonaConfigInput, PersonaPreset } from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

const SLIDER_META: Array<{ key: keyof PersonaConfigInput["sliders"]; label: string }> = [
  { key: "humor", label: "Humor" },
  { key: "spice", label: "Spice" },
  { key: "energy", label: "Energy" },
  { key: "verbosity", label: "Verbosity" },
];

export function PersonaPicker({
  value,
  onChange,
}: {
  value: PersonaConfigInput;
  onChange: (next: PersonaConfigInput) => void;
}) {
  const [presets, setPresets] = useState<PersonaPreset[]>([]);

  useEffect(() => {
    void rpc.personas
      .list()
      .then(setPresets)
      .catch(() => setPresets([]));
  }, []);

  function adopt(preset: PersonaPreset) {
    onChange({
      id: preset.id,
      sliders: { ...preset.sliders },
      swearing: preset.swearing,
      customVoice: preset.id === "custom" ? value.customVoice : "",
    });
  }

  return (
    <div>
      <div className="text-[14px] text-[#85858A]">Personality</div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {presets.map((preset) => {
          const active = preset.id === value.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => adopt(preset)}
              className={`rounded-[12px] border px-3 py-2.5 text-left ${
                active
                  ? "border-[#4A4A52] bg-[#1B1B1E]"
                  : "border-[#1F1F23] bg-transparent hover:bg-[#131315]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[15px]">{preset.emoji}</span>
                <span className="text-[13.5px] font-medium text-[#ECECEE]">{preset.name}</span>
              </div>
              <div className="mt-0.5 text-[11.5px] leading-[1.35] text-[#6C6C70]">
                {preset.tagline}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {SLIDER_META.map(({ key, label }) => (
          <label key={key} className="block">
            <span className="flex items-center justify-between text-[12.5px] text-[#85858A]">
              <span>{label}</span>
              <span className="text-[#6C6C70]">{value.sliders[key]}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={value.sliders[key]}
              onChange={(e) =>
                onChange({
                  ...value,
                  id: value.id === "custom" ? "custom" : value.id,
                  sliders: { ...value.sliders, [key]: Number(e.target.value) },
                })
              }
              className="rk-range mt-1 w-full"
            />
          </label>
        ))}
      </div>

      <label className="mt-4 flex items-center justify-between rounded-[11px] border border-[#1F1F23] px-3 py-2.5">
        <span className="text-[13px] text-[#C9C9CE]">Allow casual swearing</span>
        <input
          type="checkbox"
          checked={value.swearing}
          onChange={(e) => onChange({ ...value, swearing: e.target.checked })}
          className="h-4 w-4 accent-[#F1F1EF]"
        />
      </label>

      {value.id === "custom" ? (
        <label className="mt-4 block text-[13px] text-[#85858A]">
          Custom voice
          <textarea
            value={value.customVoice}
            onChange={(e) => onChange({ ...value, customVoice: e.target.value })}
            placeholder="Describe exactly how this bot talks. e.g. “A noir detective who only trusts compiled binaries.”"
            rows={3}
            className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[#ECECEE]"
          />
        </label>
      ) : null}
    </div>
  );
}
