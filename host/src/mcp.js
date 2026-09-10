// Local MCP server (streamable HTTP, stateless) whose tools mirror the kits installed in the extension.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { log } from "./log.js";

export class McpBridge {
  constructor({ version, callTool, kitsDir }) {
    this.version = version;
    this.callTool = callTool; // (kit, tool, args) => Promise<any>
    this.kitsDir = kitsDir || null;
    this.kits = [];
    this.tools = [];
  }

  setKits(kits) {
    this.kits = kits;
    this.tools = [];
    for (const k of kits) {
      for (const t of k.tools) {
        const schema = JSON.parse(JSON.stringify(t.inputSchema || { type: "object", properties: {} }));
        if (t.destructive) {
          schema.properties = schema.properties || {};
          schema.properties.confirm = { type: "boolean", description: "Must be true. Only pass it after the user approved this specific call." };
        }
        this.tools.push({
          name: `${k.name}.${t.name}`,
          description: `${t.description}${t.destructive ? " [destructive: needs user approval and confirm: true]" : ""} (kit ${k.name} v${k.version}, runs on ${k.origins.join(", ")})`,
          inputSchema: schema,
          kit: k.name,
          tool: t.name,
        });
      }
    }
    log("tools published", this.tools.map((t) => t.name).join(", ") || "(none)");
  }

  buildServer() {
    const server = new Server({ name: "apiforanysite", version: this.version }, { capabilities: { tools: { listChanged: true } } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const t = this.tools.find((x) => x.name === req.params.name);
      if (!t) return { content: [{ type: "text", text: `unknown tool ${req.params.name}` }], isError: true };
      try {
        const result = await this.callTool(t.kit, t.tool, req.params.arguments || {});
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return { content: [{ type: "text", text }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e.message || e) }], isError: true };
      }
    });
    return server;
  }

  listen(port) {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => this.handle(req, res).catch((e) => { log("http error", e.message); if (!res.headersSent) { res.writeHead(500); res.end(e.message); } }));
      srv.on("error", reject);
      srv.listen(port, "127.0.0.1", () => resolve(srv));
    });
  }

  async handle(req, res) {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/mcp") {
      let body;
      if (req.method === "POST") {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks).toString("utf8");
        try { body = raw ? JSON.parse(raw) : undefined; } catch { res.writeHead(400); res.end("bad json"); return; }
      }
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = this.buildServer();
      res.on("close", () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }
    if (url.pathname === "/status") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ version: this.version, kits: this.kits.map((k) => ({ name: k.name, version: k.version, pin: k.pin, tools: k.tools.map((t) => t.name) })), kitsDir: this.kitsDir }));
      return;
    }
    if (url.pathname === "/index/kits.json" && this.kitsDir) {
      // Developer index: every kit in the checkout, served from this host. Never the public index.
      const kits = fs.readdirSync(this.kitsDir).filter((n) => fs.existsSync(path.join(this.kitsDir, n, "manifest.json"))).map((n) => {
        const m = JSON.parse(fs.readFileSync(path.join(this.kitsDir, n, "manifest.json"), "utf8"));
        return { name: m.name, description: m.description, source: `http://127.0.0.1:${req.socket.localPort}/kits/${n}/`, pin: "dev" };
      });
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" });
      res.end(JSON.stringify({ dev: true, kits }));
      return;
    }
    if (url.pathname.startsWith("/kits/") && this.kitsDir) {
      const rel = path.normalize(decodeURIComponent(url.pathname.slice("/kits/".length)));
      if (rel.startsWith("..")) { res.writeHead(403); res.end(); return; }
      const file = path.join(this.kitsDir, rel);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
      const type = file.endsWith(".json") ? "application/json" : file.endsWith(".md") ? "text/markdown" : "text/javascript";
      res.writeHead(200, { "content-type": type + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" });
      res.end(fs.readFileSync(file));
      return;
    }
    res.writeHead(404); res.end("apiforanysite host: try /mcp or /status");
  }
}
