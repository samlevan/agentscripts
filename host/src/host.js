// Runs as the native messaging host: the browser starts it, it bridges MCP calls to the extension.
import { NativePort } from "./native.js";
import { McpBridge } from "./mcp.js";
import { readConfig, DEFAULT_PORT } from "./config.js";
import { log } from "./log.js";

export async function runHost({ version }) {
  const cfg = readConfig();
  const port = new NativePort();
  const pending = new Map(); // id -> {resolve, reject, timer}
  let seq = 0;

  const bridge = new McpBridge({
    version,
    kitsDir: cfg.kitsDir || null,
    callTool: (kit, tool, args) => new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`timeout after ${cfg.callTimeoutMs || 120000}ms`)); }, cfg.callTimeoutMs || 120000);
      pending.set(id, { resolve, reject, timer });
      try { port.send({ type: "call", id, kit, tool, args }); } catch (e) { clearTimeout(timer); pending.delete(id); reject(e); }
    }),
  });

  port.on("message", (msg) => {
    if (msg.type === "kits") bridge.setKits(msg.kits || []);
    else if (msg.type === "result") {
      const p = pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer); pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result); else p.reject(new Error(msg.error || "tool failed"));
    }
  });
  port.on("close", () => { log("browser closed the port, exiting"); process.exit(0); });
  port.on("error", (e) => log("port error", e.message));

  let listenPort = cfg.port || DEFAULT_PORT;
  let server = null;
  for (let i = 0; i < 10 && !server; i++) {
    try { server = await bridge.listen(listenPort); }
    catch (e) { if (e.code === "EADDRINUSE") { log(`port ${listenPort} busy`); listenPort++; } else throw e; }
  }
  if (!server) throw new Error("no free port");
  log(`host v${version} up, MCP on http://127.0.0.1:${listenPort}/mcp, kitsDir=${cfg.kitsDir || "-"}`);
  port.send({ type: "hello", port: listenPort, version });
}
