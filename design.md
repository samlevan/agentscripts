# API for Any Site, design

Working label. The public name goes through a naming pass before anything ships.

## What it is

A browser extension that turns userscripts into typed tools an AI agent can call. Each tool is a small JavaScript function bound to a URL pattern, with a name, a description and an input schema. Tools ship in toolkits, one per site (LinkedIn first). An agent running on the same machine as the browser (Claude Code on a laptop, or an agent inside a cloud VM with its own browser, such as Grok Bot) calls the tools through a local MCP endpoint, and the code runs inside the user's own logged-in session.

Think Tampermonkey, but the scripts are for an agent to call rather than for a page to run on load, and they come in installable per-site kits.

## Decided (2026-09-10)

- Standalone, free, open source. Its own brand, separate from any product that consumes it. A consumer product may ship a toolkit for it and rely on it; the extension does not know or care which agent is on the other end.
- Positioned as a marketplace of toolkits, not a single-site automation tool. LinkedIn is the first toolkit, not the identity.
- Runs where the browser runs. No vendor cloud in the loop; the agent and the extension meet on localhost.
- Transport: a native messaging host. A small local binary the extension launches, which serves MCP on localhost so any agent connects with one URL. One-time install. Chosen over the extension dialing out to an agent-run server, which only works while that server is up and needs a broker for two agents.

- Toolkit format: a folder per kit. `manifest.json` (name, version, origins, the tool list with input schemas) plus one JavaScript file per tool. The marketplace can list a kit's tools and permissions without executing code, and diffs review cleanly. Rejected: a single userscript-style file (a listing would have to run it to know what is inside) and a skill-style folder as the primary format.
- Each kit also carries a `SKILL.md` for the agent: when to use the kit and how its tools combine (which tool first, what a site's own words mean, how to page). Borrowed from agent-browser, whose per-site skills (Slack, Electron) are prose in the same SKILL.md format every major agent reads, served from the installed CLI so they never go stale. The manifest stays the source of truth: the tool list inside SKILL.md is generated from it at build time so the two cannot drift. Open standard adopted, kit's own manifest kept.

- Marketplace and install: GitHub-native with a locked front door. A kit is a folder in a public repo. The only default source is the curated index in this repo, rendered as a static listing of each kit's tools and origins from its manifest; every listed kit is reviewed and pinned to a commit hash. Adding any other source is a developer-mode toggle, the same posture as Chrome's own userScripts switch. Rejected: npm as registry (author needs an npm account, listing is npm search) and a hosted registry (a service to run from day one).
- No silent updates: a kit runs at the hash it was installed at; a new version is a new review and a visible prompt to the user.
- Kit UI (decided + built 2026-09-10): kit declares, extension draws (not kit-shipped HTML, so no kit code runs in the settings screen). The options page is an app-store shape: "Your kits" gallery, click a kit to open its own settings screen (overview, its panels, tools, settings, remove). A panel like the daily-limits dashboard is data the kit declares (categories) and the extension renders inside that kit's screen, not app-wide. Limits live with the kit they belong to.
- Install surface (built + verified 2026-09-10): the popup installs from the curated index by default, one button per reviewed kit; arbitrary sources are developer-mode-only and labelled unreviewed. A kit reaches other users only through a pull request to the index that the maintainer reviews. Nobody can share a kit with another user unreviewed.
- Security model, split by source (revised 2026-09-10 after the catalog-fence verification; do NOT claim a universal runtime fence). Trust comes from a DIFFERENT place for each source:
  - **Catalog kits are reviewed code shipped in the package.** They run via chrome.scripting and are NOT runtime-fenced from exfiltration (a no-cors request always leaves the isolated world, verified). Their safety is review: a PR to `kits/`, reviewed, then store review of the whole extension. This is why review-at-scale of arbitrary third-party sources was rejected (Greasy Fork has no pre-moderation; an agent skills marketplace was poisoned with 1000+ malicious skills in a month in 2026), the catalog is small, ours, and store-gated, not an open feed.
  - **Personal kits you write yourself run under a browser fence that can only reach their own site.** userScripts world + per-kit connect-src, verified: a foreign fetch is BLOCKED. This is the runtime guarantee for unreviewed user code.
  - Shared across both, enforced by the runtime regardless of source: a tool runs only in a tab on the origins its manifest declares; destructive tools are gated per call (switch + confirm); every call is audit-logged.
  - Trust-copy wording: "catalog kits are reviewed code shipped in the package; kits you write yourself run under a browser fence that can only reach their own site." Never a universal-fence claim.

- Where a call runs: in a background tab. The kit's site opens or reuses a tab that stays behind whatever the user is doing; the extension badge shows activity and a click brings the tab forward to watch. Unattended by default, watchable on demand, identical in a cloud VM. Rejected: bringing the tab forward on every call (steals focus from the user's work) and a separate agent window (one more thing to manage, and a second session on sites that dislike that).

- LinkedIn kit, version 1: invitations plus the follow-through. List pending invitations (name, headline, note, mutual connections), accept one, ignore one; list recent conversations since a date, read a thread; remove a connection. Every tool reads, or removes something the user already owns, and none sends on the user's behalf. Send message and withdraw sent invitation are deferred to a later version, once the per-call approval surface exists. The kit is the "accepted, then they pitched me" triage end to end.

## Prior art (surveyed 2026-09-10)

- Two hobby projects have this exact shape and stalled: a Violentmonkey fork with MCP (Firefox only, two built-in tools, last commit early 2025) and a Chrome extension where tools are defined in a popup form and reached over a local WebSocket (single author, no packaging or sharing).
- Generic "agent drives your logged-in browser" tools are mature (mcp-chrome, agent-browser) but expose click/navigate/screenshot primitives, not site-level tools a user can install.
- WebMCP (Chrome origin trial) lets a site publish its own tools. Users and extensions cannot inject tools into a site, so it does not cover sites that will never publish them.
- Nobody has shipped the middle: installable per-site toolkits on a maintained runtime.

## Constraints known up front

- Chrome requires the userScripts API for extensions that run user-supplied code, and the user must flip a per-extension "Allow User Scripts" toggle once (Chrome 138 and later). Tampermonkey lives with the same toggle. Onboarding must walk the user through it.
- Extensions cannot listen on a port. Reaching the extension from a local process needs a native messaging host, or the extension dialing out to a local server the agent runs.
- Sites like LinkedIn forbid automation in their terms. The tool runs at human pace on the user's own session and never shares a session with a third party; the toolkit design, not the runtime, decides what is safe to expose.

## Safety features (from the field, to be designed in)

- Per-origin permissioning: a tool is callable only on the origins its toolkit declares.
- Dry run: show the DOM actions and network requests a call would make before executing.
- Audit log: tool, arguments, time, page URL, result, per call.
- Guardrails on destructive actions (delete, submit payment, send): confirm, rate-limit, or refuse by policy. BUILT 2026-09-10 for rate-limiting: per-category daily caps + an overall ceiling, declared in the kit manifest, counted over a rolling 24h from the audit log, enforced before each call, shown as an editable dashboard on the options page. Model chosen (per-category + overall) because the flag LinkedIn watches is aggregate velocity, which pure per-tool caps miss.
- Signed toolkit bundles so kits can be shared and verified.

## Open questions

1. The per-call approval surface for destructive tools (to be mocked, it is a UI decision).
2. Onboarding: the userScripts toggle walk-through and the native host install (to be mocked).

## Settings UI direction (2026-09-10)
Options page restyled to the Terminal direction (of A/B/C mocked in design/mocks/settings-directions-r1.html): dark ground, bundled JetBrains Mono, one signal-green accent, hairline rules, dense rows, audit log reads as a CLI log. Chosen because it is honest to what the product is (agent tools on localhost) and the least generic. Fixed the refresh bug at the same time: a kit screen now has an address (#kit=<name>) so reload and back-button keep your place.

## Reddit kit + first-run onboarding (2026-09-10)
Replaced the example kit with a **reddit** kit: three read-only tools (list_posts, search, read_post) over Reddit's own JSON, same-origin from the user's logged-in session, verified live in Arc. read_post resolves /s/ share links to the canonical permalink (pattern borrowed from reddit-cli). One reads category, 200/day.
Implemented the **first-run onboarding** in the options page (mocked in design/mocks/first-run-r1.html, Terminal aesthetic): the gallery shows the onboarding (hero: 'an API for the web'; how-it-works; a live get-started checklist: user scripts / connect agent / install first kit; why-not-just-use-the-page) until user scripts are on AND at least one kit is installed, then gives way to the console. Positioning per Sam: API for Any Site is the API a site never built; page-driving is slow, brittle, and expensive (every screenshot burns tokens) vs. one direct tool call.

## Exfiltration fence enforced (2026-09-10, Sam's decision)
The runtime now enforces: a kit's tool code may fetch ONLY the kit's own declared origins, nothing else on the internet. Implementation: one isolated USER_SCRIPT world PER KIT (chrome.userScripts.configureWorld with a per-kit worldId, Chrome 133+), its CSP fixed to connect-src = that kit's manifest origins (path stripped). execute() runs in that worldId. This replaced the earlier single shared world (whose connect-src 'self' both leaked as connect-src * during a debug session AND unreliably blocked a kit's own same-origin fetch). script-src is 'self' only: 'unsafe-eval' was tested and is NOT needed (tools still run without it), so it is dropped. Verified empirically with a temporary probe tool inside the reddit world: a fetch to reddit's own JSON returned 200, a fetch to https://example.com/ was BLOCKED ("Failed to fetch"). The probe was removed after. This is the guarantee the Chrome Web Store listing and the site's trust section will state.

## Two-source kit model (2026-09-10, Sam's decision), IMPLEMENTED
Rule: a kit comes from the reviewed catalog, or from the user's own machine. Nothing else. Reason: the Chrome Web Store allows the userScripts API only for USER-provided code; fetching our own kit code from GitHub at runtime reads as developer remote code, which the store bans.

1. **Catalog kits ship INSIDE the extension package.** No GitHub fetch at runtime. The index repo stays the contribution path (PR -> review -> merge -> new extension version -> store review). Store "remote code" answer becomes "No". Catalog users NEVER flip "Allow User Scripts".
2. **Personal kits** are user-provided code, written locally (typically by the user's own agent) and installed from the user's machine (localhost / dev server, or a local folder if the browser allows). This is the sanctioned userScripts case, so userScripts stays but is justified by, and used only for, personal kits. Only kit-makers flip "Allow User Scripts".
3. **Third-party remote sources removed** entirely: no arbitrary GitHub tree URL or remote URL, developer mode or not. That was the poisoning vector.

Open technical questions (being planned): catalog kits must run WITHOUT userScripts (so no toggle) -> chrome.scripting into an isolated world; the userScripts per-kit world + connect-src fence does NOT carry to chrome.scripting, so the egress fence for catalog kits needs a different mechanism (candidate: route all kit network calls through a service-worker `ctx.fetch` checked against the kit's declared origins, uniform across both paths; DOM-only tools need no network). Do NOT build until Sam approves the plan.

### How it was built (2026-09-10)
- **Catalog kits ship bundled.** `scripts/build-catalog.js` compiles `kits/` into `extension/catalog/registry.js` (each tool's run function, wrapped to report errors as {__ok,...}). No runtime fetch. Contribution stays a PR to `kits/`; shipping is a new extension version.
- **Two execution paths in `runTool`.** Catalog: `chrome.scripting.executeScript({world:'ISOLATED', func, args})`, verified an isolated-world injected func returns async values and fetches same-origin. No "Allow User Scripts" toggle. Personal: `chrome.userScripts.execute` in a per-kit world with the connect-src fence (unchanged). Destructive gate + rate limits run before both paths.
- **Fences by source (Sam's choice a).** Catalog = reviewed + bundled, bounded by host permissions. Personal = unreviewed user code, bounded by the runtime connect-src fence. Both verified working (linkedin + reddit via catalog path; reddit foreign-fetch blocked on the personal path earlier).
- **Third-party remote install removed.** `fetchKit` accepts only localhost/127.0.0.1 (personal kits from the user's machine), and only in developer mode. No GitHub-URL install.
- **UI:** "Your kits" console + "+ add a website kit" -> Browse lists the bundled catalog (install = grant site permission, no download); developer mode adds a localhost personal-kit field. Catalog users never flip "Allow User Scripts"; the onboarding no longer asks them to.
- Tools are now self-contained (`run(args)`, inline sleep) so the same code runs on both paths.
- Gotcha: `node --check <file>` did NOT catch a duplicate top-level `let` in these ES-module files (it slipped to the browser as a blank page twice). Verify with `node --input-type=module --check < file` or the browser's exceptions, not `node --check`.

### Catalog fence verification (2026-09-10), the runtime fence does NOT hold for catalog kits
Ran the egress probe on the CATALOG path (chrome.scripting, ISOLATED world). Result: own-site fetch ok 200; a cross-origin `fetch("https://example.com/", {mode:"no-cors"})` and a `POST .../collect {mode:"no-cors", body:"stolen-data"}` BOTH went through ("SENT, opaque response"), the requests left the browser. So chrome.scripting's isolated world does NOT enforce a per-kit egress fence (a no-cors request always leaves; content-script fetches follow CORS, not a hard block). Therefore the runtime exfiltration fence holds ONLY for PERSONAL kits (userScripts world + connect-src). CATALOG kits are bounded by REVIEW, not a runtime block, which is Sam's chosen model (option a). Store/trust-section wording must be split accordingly: "personal kits you write run under a runtime fence that can only talk to their own site; catalog kits are reviewed code." Do NOT claim a universal runtime fence.

## Agent connect flow, per agent (2026-09-10)
The options page AGENT section is now tabbed: Claude Code, Grok Bot, Other agent. Claude Code shows the `claude mcp add` command; Other agent shows the raw endpoint; Grok Bot (an autonomous agent in its own VM) shows a single COPYABLE PROMPT that tells it to follow the setup guide, install the host against its own Chrome profile (`--user-data-dir`), load the extension and the LinkedIn kit, connect to the MCP endpoint, and run the task. The endpoint is localhost, so only agents ON the machine can reach it (Claude Code, Grok Bot in its VM); cloud agents (claude.ai, ChatGPT web) cannot without a public tunnel, verified against their connector docs. The per-agent install is documented in `docs/grok-bot.md` (the Grok Bot flow, verified end to end 2026-09-10: the agent listed real LinkedIn invitations), linked from the README and from the Grok Bot tab.
