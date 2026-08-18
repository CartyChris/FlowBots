import { createServer, type Server } from "node:http";
import type {
  AdapterContext,
  ConnectorCall,
  ConnectorEvent,
  ConnectorProvider,
  ConnectorTool,
} from "@rakazo/adapter-kit";
import { safeWebFetch } from "./web-fetch.js";

export interface DestinationRecord {
  id: string;
  collection: string;
  title: string;
  body: string;
}

export class DestinationEmulator implements ConnectorProvider {
  readonly records: DestinationRecord[] = [];
  private server: Server | undefined;
  port = 0;

  describe() {
    return {
      id: "destination-emulator",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { discover: true, oauth: true, secretsBrokered: true },
    };
  }

  async start(port = 0): Promise<number> {
    this.server = createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200).end("ok");
        return;
      }
      if (req.url === "/records" && req.method === "GET") {
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify(this.records));
        return;
      }
      if (req.url === "/records" && req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c as Buffer));
        req.on("end", () => {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as DestinationRecord;
          const record = { ...body, id: `rec-${this.records.length + 1}` };
          this.records.push(record);
          res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify(record));
        });
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => this.server?.listen(port, "127.0.0.1", () => resolve()));
    const addr = this.server.address();
    this.port = typeof addr === "object" && addr ? addr.port : port;
    return this.port;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server?.close((err) => (err ? reject(err) : resolve())),
    );
  }

  async discoverTools(_context: AdapterContext): Promise<ConnectorTool[]> {
    return [
      {
        name: "destination.write",
        description: "Write a record to the connected destination",
        inputSchema: {
          type: "object",
          properties: {
            collection: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
          },
        },
      },
      {
        name: "web_fetch",
        description:
          "Fetch a public web page or text/JSON URL directly from the internet. Use this for current public information and page reading when interactive browser control is unnecessary. Private, loopback, link-local, and credentialed URLs are blocked.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "Public http(s) URL to retrieve." },
            max_chars: {
              type: "number",
              description:
                "Optional maximum readable characters to return (default 80000, max 200000).",
            },
          },
          required: ["url"],
        },
      },
    ];
  }

  async *execute(call: ConnectorCall, context: AdapterContext): AsyncIterable<ConnectorEvent> {
    if (call.tool === "web_fetch") {
      try {
        yield {
          type: "result",
          data: await safeWebFetch(
            {
              url: String(call.args.url ?? ""),
              maxChars: typeof call.args.max_chars === "number" ? call.args.max_chars : undefined,
            },
            { signal: context.signal },
          ),
        };
      } catch (error) {
        yield {
          type: "error",
          message: error instanceof Error ? error.message : "web_fetch failed",
        };
      }
      return;
    }

    if (call.tool !== "destination.write") {
      yield { type: "error", message: `unknown tool ${call.tool}` };
      return;
    }
    const record: DestinationRecord = {
      id: `rec-${this.records.length + 1}`,
      collection: String(call.args.collection ?? "notes"),
      title: String(call.args.title ?? ""),
      body: String(call.args.body ?? ""),
    };
    if (this.port) {
      const res = await fetch(`http://127.0.0.1:${this.port}/records`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          collection: record.collection,
          title: record.title,
          body: record.body,
        }),
      });
      const written = (await res.json()) as DestinationRecord;
      yield { type: "result", data: { id: written.id, written: true } };
      return;
    }
    this.records.push(record);
    yield { type: "result", data: { id: record.id, written: true } };
  }
}
