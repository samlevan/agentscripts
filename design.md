# agentscripts, design

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
- Install surface (built + verified 2026-09-10): the popup installs from the curated index by default, one button per reviewed kit; arbitrary sources are developer-mode-only and labelled unreviewed. A kit reaches other users only through a pull request to the index that the maintainer reviews. Nobody can share a kit with another user unreviewed.
- Security lives in the runtime, not in review. Review at scale fails (Greasy Fork has no pre-moderation; an agent skills marketplace was poisoned with over a thousand malicious skills in one month in 2026; npm provenance detects tampering, it does not prevent it). So the runtime enforces: a tool runs only on the origins its manifest declares; tool code cannot make requests to any other origin, so the only exit for data is the return value handed to the local agent; tools marked destructive in the manifest are gated per call; every call is audit-logged. A malicious kit on a logged-in session then cannot exfiltrate cookies or data, which is the attack that matters.

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
- Guardrails on destructive actions (delete, submit payment, send): confirm, rate-limit, or refuse by policy.
- Signed toolkit bundles so kits can be shared and verified.

## Open questions

1. The per-call approval surface for destructive tools (to be mocked, it is a UI decision).
2. Onboarding: the userScripts toggle walk-through and the native host install (to be mocked).
