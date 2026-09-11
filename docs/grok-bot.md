# Install on Grok Bot (or any agent VM)

Use this when your agent runs inside its own VM with its own Chrome (Grok Bot, a cloud desktop, etc.). The extension talks to a native messaging host on the same machine, and the host serves MCP at `http://127.0.0.1:4890/mcp`, so the agent can call typed tools (for example `linkedin.list_invitations`) inside the browser session that is logged in on that VM.

Verified end to end on Grok Bot (2026-09-10): the agent listed real LinkedIn invitations. Catalog kits (LinkedIn, Reddit) run via `chrome.scripting` and need **no** "Allow User Scripts" toggle; that toggle is only for personal kits you author yourself.

## What you need

- Node.js 20+
- Google Chrome (Grok Bot already ships one)
- A LinkedIn login in **that** Chrome profile (the agent's browser, not your laptop's)

## 1. Clone, build the catalog, install the host

Run on the agent's machine (or ask the agent to):

```bash
git clone https://github.com/apiforanysite/apiforanysite.git ~/apiforanysite
cd ~/apiforanysite
(cd host && npm install)
node scripts/build-catalog.js
```

Register the native messaging host. **Grok Bot's Chrome does not use the default profile** — it launches with `--user-data-dir=/home/box/chrome-profile-<N>`. Pass that path or the host will never connect:

```bash
# Find the live profile (pick the one for THIS agent's desktop)
ps aux | grep -oE 'user-data-dir=/home/box/chrome-profile-[0-9]+' | sort -u
# e.g. this agent uses chrome-profile-3:
node host/bin/apiforanysite-host.js install \
  --kits-dir "$(pwd)/kits" \
  --user-data-dir /home/box/chrome-profile-3
```

Pass `--user-data-dir` more than once if several profiles exist. The installer also writes the default location under `~/.config/google-chrome/NativeMessagingHosts`.

## 2. Load the extension

In the VM's Chrome:

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** and pick `~/apiforanysite/extension`.
3. Confirm the extension id is `mlknbfgdblbbdoomplebifjopkoflcdg`.
4. Open the extension's options page. It should say **ready for your agent**. If it says the host is not connected, re-run the install with the correct `--user-data-dir`, reload the extension, and refresh the options page.

## 3. Install the LinkedIn kit

On the options page: **add a website kit → LinkedIn → install**, approve `www.linkedin.com` when prompted, and sign in to LinkedIn in that same Chrome if you are not already.

## 4. Point the agent at MCP

The endpoint (live only while the extension is connected) is `http://127.0.0.1:4890/mcp`.

Smoke test from the host directory (it has the MCP SDK):

```bash
cd ~/apiforanysite/host && node <<'JS'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:4890/mcp"));
const client = new Client({ name: "grok-bot", version: "0.1" });
await client.connect(transport);
console.log((await client.listTools()).tools.map(t => t.name));
console.log(JSON.stringify(await client.callTool({ name: "linkedin.list_invitations", arguments: {} }), null, 2));
await client.close();
JS
```

Or just tell the agent: "list my LinkedIn invites via API for Any Site MCP."

LinkedIn tools: `list_invitations`, `accept_invitation`, `ignore_invitation` (destructive), `list_conversations`, `read_thread`, `remove_connection` (destructive). No send-message in v1.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Host not connected | Wrong `--user-data-dir`; re-run install with the agent's profile, reload the extension |
| `connection refused` on :4890 | Open the options page until it says ready; the host does not stay up without Chrome |
| No LinkedIn tools | Install the kit and grant the site permission |
| Wrong or empty data | Not logged in to LinkedIn in the agent's Chrome |
| "needs Allow User Scripts" | That is only for personal kits; catalog LinkedIn does not need it |
