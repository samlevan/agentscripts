# agentscripts, build plan

Technical breakdown of design.md. Written 2026-09-10 after design sign-off.

## Repo layout

```
extension/     MV3 Chrome extension, plain JS, no bundler (service worker as an ES module)
host/          Node native messaging host + MCP server (@modelcontextprotocol/sdk, streamable HTTP)
kits/          toolkits: one folder each (manifest.json, SKILL.md, tools/*.js)
index/         kits.json, the curated marketplace index
scripts/       gen-skill.js (tool list in SKILL.md from the manifest)
```

## How a call flows

1. Agent calls MCP tool `linkedin.list_invitations` on `http://127.0.0.1:4890/mcp`.
2. Host forwards `{id, kit, tool, args}` over the native messaging port (stdio, 4-byte length prefix) to the extension.
3. Service worker checks the kit is installed, the tool exists, the call is allowed (destructive gate), then finds or opens a background tab on the kit's `home` URL within the kit's origins.
4. `chrome.userScripts.execute` runs the tool's code in the USER_SCRIPT world of that tab with `args`; the tool's returned value (JSON) comes back as the result.
5. Service worker appends an audit record and replies; the host returns the MCP result.

## Extension

- `manifest.json`: permissions `userScripts`, `nativeMessaging`, `tabs`, `storage`, `alarms`; `optional_host_permissions: ["https://*/*", "http://*/*"]`. Origins are granted per kit at install time (`chrome.permissions.request` from the popup, a user gesture).
- `background.js`: native port with reconnect on disconnect (an open port keeps the worker alive, Chrome 105+); message router; tab finder (`chrome.tabs.query` on the kit's origins, else `chrome.tabs.create({active:false})` and wait for `status === "complete"`); executor; audit log in `chrome.storage.local` (capped at 500 records).
- `kits.js`: install from a source URL pinned to a commit (`https://raw.githubusercontent.com/<owner>/<repo>/<sha>/kits/<name>/`), or from the host's dev server (`http://127.0.0.1:4890/kits/<name>/`) when developer mode is on. Stores manifest + tool sources + the pin. No auto-update.
- `popup.html/js`: installed kits with their origins and tools, install by URL, developer-mode toggle, per-kit "allow destructive tools" switch (interim gate until the approval surface is designed), the audit log, the userScripts-toggle walk-through when the API is unavailable.
- Tool code convention: the file defines `async function run(args, ctx)`; the runtime wraps it and calls it. `ctx` carries `origin` and `log(msg)`.

## Host

- `bin/agentscripts-host`: the native messaging host. Started by the browser on `connectNative`. Opens the MCP server on `127.0.0.1:4890` (next free port if taken, reported to the extension). One process per browser profile.
- MCP tools are rebuilt from the extension's installed kits each time the extension reports a change (`kits.changed`). Tool name `<kit>.<tool>`, schema from the manifest.
- `agentscripts-host install`: writes the native messaging manifest (`com.agentscripts.host.json`) into Chrome and Arc's `NativeMessagingHosts` directories with the extension id, and prints the `claude mcp add --transport http agentscripts http://127.0.0.1:4890/mcp` line.
- Dev server: serves `kits/` from the repo for local installs.

## Security enforcement in M1

- Origin scope: a tool only runs in a tab whose URL matches the kit's declared origins; the runtime never runs kit code elsewhere.
- Destructive gate: tools with `destructive: true` require both the kit's "allow destructive" switch and `confirm: true` in the call, else the call is refused with a message the agent can act on.
- Hash pinning: a kit runs the files fetched at install; a new version is a new install.
- Audit log: every call, with tool, args, tab URL, duration, outcome.
- Egress: `chrome.userScripts.configureWorld({csp})` with `connect-src 'self'` is set for the USER_SCRIPT world; whether the world's CSP governs `fetch` is verified empirically in M1 and the result recorded below, not assumed.

## Milestones

- M1 runtime: extension + host + `example` kit (`page_title`, `page_text`) callable from Claude Code end to end. Egress test recorded.
- M2 LinkedIn kit v1: `list_invitations`, `accept_invitation`, `ignore_invitation` (DOM on the server-rendered invitation manager, structure-based selectors, hashed class names ignored); `list_conversations`, `read_thread` (Voyager messaging GraphQL, query ids read from the page's own requests with the known hashes as fallback); `remove_connection` (DOM on the profile page, destructive).
- M3 marketplace: `index/kits.json`, `scripts/gen-skill.js`, README, LICENSE (MIT).

## Findings log

(appended as the build verifies things)
- 2026-09-10 M1: host + MCP verified with `host/test/harness.mjs` (tools listed, call round-trips, errors come back as MCP errors). Host registered for Chrome, Arc and the Arc debug profile; extension id is fixed by the key in the manifest (`mlknbfgdblbbdoomplebifjopkoflcdg`).
- 2026-09-10 M2: all six LinkedIn tools verified by running their source directly in Arc tabs (read tools for real, act tools in `dry_run`). LinkedIn's invitation manager is a server-rendered app with hashed class names and no list API call; cards are found by structure (an Ignore button, a `/in/` link), and a card that carries a note hides Accept behind a "Show more actions" menu (aria-label, no text). Messaging query ids from the July spike still work and the tools read the current ids off the page's own requests. The restli rule holds: escape parens only inside URN values.
- Open: the egress CSP on the USER_SCRIPT world is set but untested until the extension is loaded (`example.egress_probe` reports it).

## Install security (2026-09-10, after review)
The popup was built looser than design.md. Corrected: the default install surface is the curated index (`index/kits.json` in the repo, fetched from `raw.githubusercontent.com/samlevan/agentscripts/main`), one Install button per reviewed kit. Arbitrary sources (a commit-pinned GitHub URL, or a local dev server) are only reachable with the developer-mode box ticked, and the preview labels them "unreviewed source". `fetchKit(source, {fromIndex})` refuses a non-index source unless developer mode is on. Getting a kit to other users = a pull request adding an entry to `index/kits.json`, which the maintainer reviews before merging. Nobody can hand another user a kit the maintainer has not reviewed. The host serves a `dev: true` index of the local checkout at `/index/kits.json` for local work only.

## Egress finding (2026-09-10)
`example.egress_probe` through the loaded extension: cross-origin `fetch` to httpbin.org is BLOCKED ("Failed to fetch"), which is the claim that mattered: a kit cannot ship page data to a third party. Same-origin `fetch` on example.com also came back blocked, yet `linkedin.list_conversations` (a same-origin `fetch` to the Voyager API) works through the same USER_SCRIPT-world CSP. I do not yet understand why same-origin behaves differently on the two sites; it is recorded as an open question, not explained. It is not a security hole (stricter, not looser), and it does not block the LinkedIn kit, whose same-origin calls succeed.
