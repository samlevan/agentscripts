// Calls one tool on the running host over MCP: node test/call.mjs <tool> '<json args>'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const [tool, argsJson] = process.argv.slice(2);
const port = process.env.AGENTSCRIPTS_PORT || 4890;
const client = new Client({ name: "call", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
if (!tool) { const t = await client.listTools(); console.log(t.tools.map((x) => x.name).join("\n")); }
else { const r = await client.callTool({ name: tool, arguments: argsJson ? JSON.parse(argsJson) : {} }); console.log(r.isError ? "ERROR" : "OK"); console.log(r.content.map((c) => c.text).join("\n")); }
await client.close();
