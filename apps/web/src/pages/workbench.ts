export type SandboxTemplate = "prototype" | "test-fix" | "research" | "transform";
export type SandboxIsolation = "auto" | "container" | "desktop" | "e2b";
export type ArtifactFormat = "pdf" | "docx" | "pptx" | "html" | "md" | "csv";

export interface SandboxTaskInput {
  botName: string;
  template: SandboxTemplate;
  task: string;
  isolation: SandboxIsolation;
  workingDirectory?: string;
  extensionInstructions: string[];
}

export interface ArtifactTaskInput {
  botName: string;
  brief: string;
  formats: ArtifactFormat[];
  extensionInstructions: string[];
}

const FORMAT_EXTENSION: Record<ArtifactFormat, string> = {
  pdf: ".pdf",
  docx: ".docx",
  pptx: ".pptx",
  html: ".html",
  md: ".md",
  csv: ".csv",
};

const TEMPLATE_LABEL: Record<SandboxTemplate, string> = {
  prototype: "Prototype / build",
  "test-fix": "Test, diagnose, and fix",
  research: "Research with evidence",
  transform: "Transform existing files",
};

export function buildSandboxTask(input: SandboxTaskInput): string {
  const task = input.task.trim();
  if (!task) throw new Error("Sandbox task is required.");
  const workingDirectory =
    input.workingDirectory?.trim() || "Choose the safest relevant workspace directory.";
  const extensions = extensionSection(input.extensionInstructions);

  return [
    "[FlowBots Workbench · Sandbox Lab]",
    `Worker: ${input.botName}`,
    `Job type: ${TEMPLATE_LABEL[input.template]}`,
    `Requested isolation: ${input.isolation}`,
    `Working directory: ${workingDirectory}`,
    "",
    "Task",
    task,
    "",
    "Runtime boundary",
    "Use your actual FlowBots computer/sandbox tools for execution. The Workbench UI is a simulation/control surface, not a security sandbox. If the runtime provides a different isolation boundary than requested, state the actual boundary before making changes and stay inside it.",
    "",
    "Execution contract",
    "1. Inspect the relevant workspace and inputs before editing.",
    "2. Keep changes scoped to this task and preserve unrelated work.",
    "3. Run the strongest available verification that can fail (tests, build, lint, file inspection, or source validation).",
    "4. Do not claim the task is complete until verification has actually run and you have read its result.",
    "5. Report the exact files changed/created, verification performed, and any confirmed remaining limitation.",
    extensions,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildArtifactTask(input: ArtifactTaskInput): string {
  const brief = input.brief.trim();
  if (!brief) throw new Error("Artifact brief is required.");
  const formats = [...new Set(input.formats)];
  if (formats.length === 0) throw new Error("Choose at least one artifact format.");
  const outputs = formats
    .map((format) => `${format.toUpperCase()} (${FORMAT_EXTENSION[format]})`)
    .join(", ");
  const extensions = extensionSection(input.extensionInstructions);

  return [
    "[FlowBots Workbench · Artifact Studio]",
    `Creator: ${input.botName}`,
    "",
    "Brief",
    brief,
    "",
    `Required output formats: ${outputs}`,
    "Save every real deliverable under flowbots-exports/ using clear, stable filenames.",
    "",
    "Artifact contract",
    "1. Create the actual requested files using the tools available in your runtime; do not merely paste approximations into chat.",
    "2. For HTML apps or games, make the result launchable and self-contained when practical, with responsive behavior and no knowingly broken controls.",
    "3. For document/slide/PDF outputs, generate valid files rather than renaming plain text with a different extension.",
    "4. Before reporting success, verify that each reported file exists and, when tooling permits, inspect or validate the generated format.",
    "5. Never fabricate a generated file, download link, validation result, or capability that the runtime does not actually have.",
    "6. Finish with a concise manifest of exact output paths and the verification performed for each.",
    extensions,
  ]
    .filter(Boolean)
    .join("\n");
}

function extensionSection(instructions: string[]): string {
  let remaining = 4_000;
  const bounded: string[] = [];
  for (const raw of instructions) {
    if (remaining <= 0) break;
    const cleaned = raw.trim();
    if (!cleaned) continue;
    const chunk = cleaned.slice(0, Math.min(1_500, remaining));
    bounded.push(chunk);
    remaining -= chunk.length;
  }
  if (bounded.length === 0) return "";
  return [
    "",
    "Registered extension guidance (declarative; it does not grant new host permissions)",
    ...bounded.map((value, index) => `${index + 1}. ${value}`),
  ].join("\n");
}
