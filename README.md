# API for Any Site

An API for the web, even for the sites that never built one. Your AI agent gets direct, typed tools for a site, run in your own logged-in browser, instead of improvising against the page with screenshots and clicks. A browser extension exposes those tools over a local MCP endpoint that an agent on your machine (Claude Code, Grok Bot in its VM) connects to.

Decisions live in `design.md`, the technical breakdown in `plan.md`.

## Parts

- `extension/`: Chrome MV3 extension. Installs website kits, runs a tool in a background tab on the kit's site, enforces per-call limits and a destructive-tool gate, keeps an audit log. Bundles the reviewed catalog (`catalog/registry.js`, generated), the wordmark font (`fonts/`), and the icon (`icons/`).
- `host/`: native messaging host the browser launches. Serves MCP on `http://127.0.0.1:4890/mcp` so a local agent can call the kits' tools. CLI: `apiforanysite-host`.
- `kits/<name>/`: the source of a website kit, `manifest.json` (origins, tools, schemas, categories) + `tools/<tool>.js` (`async function run(args)`) + `SKILL.md` (agent-facing guide, its tool list generated). The reviewed kits here are bundled into the extension by `scripts/build-catalog.js`.
- `scripts/build-catalog.js`: compiles `kits/` into `extension/catalog/registry.js` so catalog kit code ships INSIDE the extension package (no runtime fetch).

## Two sources for a kit, nothing else

- **Catalog kits** are the reviewed kits in `kits/`, bundled into the extension and shipped through store review. They run via `chrome.scripting` in an isolated world, so installing one needs no "Allow User Scripts" toggle. Contributing a kit is a pull request to `kits/`, reviewed, then it rides out in a new extension version.
- **Personal kits** are kits you write yourself, served from your own machine (`http://localhost/...` or `http://127.0.0.1/...`) and installed under developer mode. They are user-provided code, so they run via the User Scripts API in a per-kit world whose network egress is fenced by CSP to the kit's own declared origins. Only personal-kit authors flip "Allow User Scripts".
- There is no third-party remote install (no arbitrary GitHub or remote URLs).

## Security model, split by source

- Catalog kits are reviewed code shipped in the package; trust comes from review (a no-cors request can leave an isolated world, so this path is not runtime-fenced).
- Personal kits you write run under a browser fence that can only reach their own site (verified: a foreign fetch is blocked).
- Both: a tool runs only in a tab on its declared origins; destructive tools are gated per call (switch + `confirm: true`); every call is audit-logged.

## Install

- **Inside an agent VM (Grok Bot, a cloud desktop):** see [docs/grok-bot.md](docs/grok-bot.md). Verified end to end. The one gotcha is pointing the host at the agent's Chrome profile with `--user-data-dir`.
- **Locally, to develop kits:** the developer setup below.

## Setup (developer)

```bash
cd host && npm install
node scripts/build-catalog.js                                        # bundle kits/ into extension/catalog/
node host/bin/apiforanysite-host.js install --kits-dir "$(pwd)/kits" # register the host, write ~/.config/apiforanysite
```

Then in the browser: `chrome://extensions` (Arc: `arc://extensions`), Developer mode, Load unpacked, pick `extension/`. The options page shows "ready for your agent" once the browser has launched the host.

Install a catalog kit from the options page (grants the site's permission, no download). To load a personal kit, turn on developer mode in the options page and point it at `http://127.0.0.1:4890/kits/<name>/` (served from your checkout by the host); that path needs "Allow User Scripts" on the extension's details page.

Point the agent at it (local agents only, the endpoint is your machine):

```bash
claude mcp add --transport http apiforanysite http://127.0.0.1:4890/mcp
```

## Writing a kit

`manifest.json`:

```json
{ "name": "example", "version": "0.1.0", "description": "...",
  "origins": ["https://example.com/*"], "home": "https://example.com/",
  "categories": { "reads": { "label": "Reads", "dailyLimit": 120 } },
  "dailyLimit": 150,
  "tools": [ { "name": "page_title", "category": "reads", "description": "...",
               "inputSchema": { "type": "object", "properties": {} },
               "page": "https://example.com/some/path", "destructive": false } ] }
```

`tools/page_title.js` (self-contained, so the same code runs on both the catalog and personal paths):

```js
async function run(args) {                 // no ctx; inline your own sleep if needed
  return { title: document.title };        // any JSON value becomes the MCP result
}
```

Rules the runtime enforces: a tool runs only in a tab on the kit's origins; `page` (fixed in the manifest, or passed per call) must stay inside those origins; a `destructive` tool needs the kit's switch and `confirm: true`; category and overall daily limits are counted over a rolling 24 hours; every call is logged. Regenerate the SKILL.md tool list with `node scripts/gen-skill.js`, and rebuild the bundled catalog with `node scripts/build-catalog.js`.

## Tests

`node host/test/harness.mjs` drives the host exactly as the browser would (native messaging on stdio) with a fake kit list, then calls it over MCP.
