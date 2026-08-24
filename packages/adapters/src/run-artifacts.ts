import path from "node:path";

export const MAX_RUN_ARTIFACTS = 12;
export const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;

export interface WorkspaceFileFingerprint {
  path: string;
  size: number;
  modifiedAt: number;
}

const DELIVERABLE_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".csv",
  ".html",
  ".htm",
  ".zip",
  ".md",
  ".txt",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".gif",
]);

const IGNORED_SEGMENTS = new Set([
  "node_modules",
  ".cache",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "tmp",
  "temp",
]);

export function selectChangedRunArtifacts(
  before: ReadonlyMap<string, { size: number; modifiedAt: number }>,
  after: WorkspaceFileFingerprint[],
): WorkspaceFileFingerprint[] {
  return after
    .filter((file) => isRelevantDeliverable(file.path))
    .filter((file) => file.size >= 0 && file.size <= MAX_ARTIFACT_BYTES)
    .filter((file) => {
      const previous = before.get(normalizePath(file.path));
      return !previous || previous.size !== file.size || previous.modifiedAt !== file.modifiedAt;
    })
    .sort((a, b) => artifactPriority(a.path) - artifactPriority(b.path) || a.path.localeCompare(b.path))
    .slice(0, MAX_RUN_ARTIFACTS);
}

export function isRelevantDeliverable(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => IGNORED_SEGMENTS.has(segment.toLowerCase()))) {
    return false;
  }
  if (segments.some((segment) => segment.startsWith(".") && segment !== ".well-known")) return false;
  return DELIVERABLE_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase());
}

export function mimeTypeForArtifact(filePath: string): string {
  switch (path.posix.extname(normalizePath(filePath)).toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".csv":
      return "text/csv";
    case ".html":
    case ".htm":
      return "text/html";
    case ".zip":
      return "application/zip";
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

function artifactPriority(filePath: string): number {
  const ext = path.posix.extname(normalizePath(filePath)).toLowerCase();
  if ([".pdf", ".docx", ".pptx", ".xlsx"].includes(ext)) return 0;
  if ([".html", ".htm", ".zip", ".csv"].includes(ext)) return 1;
  if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"].includes(ext)) return 2;
  return 3;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}
