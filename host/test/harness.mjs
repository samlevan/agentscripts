// Simulates the browser side: launches the host as Chrome would, speaks native messaging on its stdio,
// publishes a fake kit list, answers calls, and then drives the MCP endpoint as a client.
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const host = spawn(process.execPath, [new URL("../bin/agentscripts-host.js", import.meta.url).pathname, "chrome-extension://test/"], { stdio: ["pipe", "pipe", "inherit"] });
function send(msg) { const b = Buffer.from(JSON.stringify(msg)); const h = Buffer.alloc(4); h.writeUInt32LE(b.length); host.stdin.write(Buffer.concat([h, b])); }
let buf = Buffer.alloc(0); let hello;
host.stdout.on("data", (c) => {
  buf = Buffer.concat([buf, c]);
  while (buf.length >= 4) { const n = buf.readUInt32LE(0); if (buf.length < 4 + n) break; const m = JSON.parse(buf.subarray(4, 4 + n)); buf = buf.subarray(4 + n); onMsg(m); }
});
function onMsg(m) {
  if (m.type === "hello") { hello = m; }
  if (m.type === "call") {
    if (m.tool === "boom") send({ type: "result", id: m.id, ok: false, error: "simulated failure" });
    else send({ type: "result", id: m.id, ok: true, result: { echo: m.args, kit: m.kit, tool: m.tool } });
  }
}
await new Promise((r) => { const t = setInterval(() => { if (hello) { clearInterval(t); r(); } }, 50); });
send({ type: "kits", kits: [{ name: "fake", version: "0.0.1", origins: ["https://example.com/*"], pin: "dev", tools: [
  { name: "echo", description: "echo args", inputSchema: { type: "object", properties: { x: { type: "string" } } }, destructive: false },
  { name: "boom", description: "always fails", inputSchema: { type: "object", properties: {} }, destructive: true } ] }] });
await new Promise((r) => setTimeout(r, 200));

const client = new Client({ name: "harness", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${hello.port}/mcp`)));
const tools = await client.listTools();
console.log("TOOLS", tools.tools.map((t) => `${t.name} ${JSON.stringify(Object.keys(t.inputSchema.properties || {}))}`));
console.log("CALL echo", JSON.stringify(await client.callTool({ name: "fake.echo", arguments: { x: "hi" } })));
console.log("CALL boom", JSON.stringify(await client.callTool({ name: "fake.boom", arguments: { confirm: true } })));
console.log("STATUS", await (await fetch(`http://127.0.0.1:${hello.port}/status`)).text());
await client.close();
host.stdin.end();
setTimeout(() => process.exit(0), 300);
