# agentscripts

Typed, installable per-site tools that an AI agent on your machine can call inside your own logged-in browser. Think Tampermonkey, but the scripts are tools for an agent to call, and they come in per-site kits.

Working name. Decisions live in `design.md`, the technical breakdown in `plan.md`.

## Parts

- `extension/`: Chrome MV3 extension. Installs kits, runs a tool in a background tab on the kit's site through the userScripts API, keeps the audit log.
- `host/`: native messaging host the browser starts. Serves MCP on `http://127.0.0.1:4890/mcp` so any agent (Claude Code, Grok Bot in its VM) calls the kits' tools.
- `kits/<name>/`: `manifest.json` (origins, tools, schemas), `tools/<tool>.js` (one file per tool, defines `async function run(args, ctx)`), `SKILL.md` (agent-facing guide; its tool list is generated).
- `index/kits.json`: the curated marketplace index.

## Setup (developer)

```bash
cd host && npm install
node bin/agentscripts-host.js install --kits-dir "$(pwd)/../kits"   # registers the host with Chrome and Arc, writes ~/.config/agentscripts
```

Then in the browser: `chrome://extensions` (Arc: `arc://extensions`), Developer mode, Load unpacked, pick `extension/`. On the extension's details page turn on **Allow User Scripts**. The popup shows "host connected" once the browser has started the host.

Install a kit from the popup. Developer mode in the popup allows `http://127.0.0.1:4890/kits/linkedin/` (served from your checkout); otherwise sources must be commit-pinned GitHub tree URLs.

Point the agent at it:

```bash
claude mcp add --transport http agentscripts http://127.0.0.1:4890/mcp
```

## Writing a kit

`manifest.json`:

```json
{ "name": "example", "version": "0.1.0", "description": "...",
  "origins": ["https://example.com/*"], "home": "https://example.com/",
  "tools": [ { "name": "page_title", "description": "...", "inputSchema": { "type": "object", "properties": {} },
               "page": "https://example.com/some/path", "destructive": false } ] }
```

`tools/page_title.js`:

```js
async function run(args, ctx) {          // ctx: origin, url, log(), sleep(ms)
  return { title: document.title };      // any JSON value; it becomes the MCP result
}
```

Rules the runtime enforces: a tool runs only in a tab on the kit's origins; `page` (fixed in the manifest, or passed per call when the manifest leaves it out) must stay inside those origins; a `destructive` tool needs the kit's switch in the popup and `confirm: true` in the call; every call is logged. Regenerate the SKILL.md tool list with `node scripts/gen-skill.js`.

## Tests

`node host/test/harness.mjs` drives the host exactly as the browser would (native messaging on stdio) with a fake kit list, then calls it over MCP.
