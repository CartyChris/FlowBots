import type {
  AdapterContext,
  MemoryCommitRequest,
  MemoryExportRequest,
  MemoryReadRequest,
  MemoryRevision,
  MemorySearchRequest,
  MemorySearchResult,
  MemorySnapshot,
  MemoryStore,
  PortableFile,
} from "@rakazo/adapter-kit";
import type { MnemosyneSemanticIndex } from "./mnemosyne.js";

/**
 * Keeps the existing Markdown memory provider authoritative while augmenting
 * searches with a rebuildable local Mnemosyne semantic index.
 */
export class HybridMemoryStore implements MemoryStore {
  constructor(
    private readonly primary: MemoryStore,
    private readonly semantic: Pick<MnemosyneSemanticIndex, "search">,
  ) {}

  describe() {
    const primary = this.primary.describe();
    return {
      ...primary,
      id: `${primary.id}+mnemosyne`,
    };
  }

  read(request: MemoryReadRequest, context: AdapterContext): Promise<MemorySnapshot> {
    return this.primary.read(request, context);
  }

  commit(request: MemoryCommitRequest, context: AdapterContext): Promise<MemoryRevision> {
    return this.primary.commit(request, context);
  }

  async search(
    request: MemorySearchRequest,
    context: AdapterContext,
  ): Promise<MemorySearchResult[]> {
    const lexical = await this.primary.search(request, context);
    if (!request.query.trim()) return lexical;

    let semantic: MemorySearchResult[] = [];
    if (request.scope === "user") {
      const snapshot = await this.primary.read({ scope: "user" }, context);
      semantic = await this.semantic.search(
        {
          query: request.query,
          scope: "user",
          documents: snapshot.documents,
        },
        context,
      );
    } else if (request.scope === "bot") {
      const botId = request.botId ?? context.botId;
      if (botId) {
        const snapshot = await this.primary.read({ scope: "bot", botId }, context);
        semantic = await this.semantic.search(
          {
            query: request.query,
            scope: "bot",
            botId,
            documents: snapshot.documents,
          },
          context,
        );
      }
    } else if (request.botId) {
      // An unqualified `all` search in the Markdown provider can span every bot.
      // Without a concrete bot ID there is no safe way to reproduce that broad
      // scope in isolated semantic indexes, so semantic recall deliberately
      // stays off in that case rather than guessing or merging tenants.
      const [userSnapshot, botSnapshot] = await Promise.all([
        this.primary.read({ scope: "user" }, context),
        this.primary.read({ scope: "bot", botId: request.botId }, context),
      ]);
      const [userSemantic, botSemantic] = await Promise.all([
        this.semantic.search(
          {
            query: request.query,
            scope: "user",
            documents: userSnapshot.documents,
          },
          context,
        ),
        this.semantic.search(
          {
            query: request.query,
            scope: "bot",
            botId: request.botId,
            documents: botSnapshot.documents,
          },
          context,
        ),
      ]);
      semantic = [...userSemantic, ...botSemantic];
    }

    return mergeSearchResults(lexical, semantic);
  }

  async *exportMarkdown(
    request: MemoryExportRequest,
    context: AdapterContext,
  ): AsyncIterable<PortableFile> {
    for await (const file of this.primary.exportMarkdown(request, context)) yield file;
  }

  importMarkdown(
    files: AsyncIterable<PortableFile>,
    context: AdapterContext,
  ): Promise<MemoryRevision> {
    return this.primary.importMarkdown(files, context);
  }
}

function mergeSearchResults(
  lexical: readonly MemorySearchResult[],
  semantic: readonly MemorySearchResult[],
): MemorySearchResult[] {
  const byPath = new Map<string, MemorySearchResult>();
  for (const result of [...lexical, ...semantic]) {
    if (!result.path) continue;
    if (!Number.isFinite(result.score) || result.score < 0) continue;
    const existing = byPath.get(result.path);
    if (!existing || result.score > existing.score) byPath.set(result.path, result);
  }
  return [...byPath.values()].sort(
    (a, b) => b.score - a.score || a.path.localeCompare(b.path),
  );
}
