#!/usr/bin/env node
import { createRequire } from "node:module";
import { runHost } from "../src/host.js";
import { install, EXTENSION_ID } from "../src/install.js";
import { readConfig, configPath, DEFAULT_PORT } from "../src/config.js";
import { log, logDir } from "../src/log.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");
const [cmd, ...rest] = process.argv.slice(2);

function flag(name) { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; }

if (cmd === "install") {
  const out = install({ kitsDir: flag("--kits-dir"), extensionId: flag("--extension-id") || EXTENSION_ID, all: rest.includes("--all-browsers"), extraDirs: rest.filter((a, i) => rest[i - 1] === "--user-data-dir") });
  console.log(`wrapper: ${out.wrapper}`);
  for (const [b, f] of out.written) console.log(`${b}: ${f}`);
  console.log(`config: ${configPath} ${JSON.stringify(out.cfg)}`);
  console.log(`\nNext: load the extension (chrome://extensions, Load unpacked, then turn on "Allow User Scripts" on its details page), then:\n  claude mcp add --transport http agentscripts http://127.0.0.1:${out.cfg.port || DEFAULT_PORT}/mcp`);
} else if (cmd === "status") {
  const cfg = readConfig();
  const port = cfg.port || DEFAULT_PORT;
  fetch(`http://127.0.0.1:${port}/status`).then((r) => r.json()).then((j) => console.log(JSON.stringify(j, null, 2)))
    .catch(() => { console.log(`host not running on port ${port} (the browser starts it when the extension connects). Log: ${logDir}/host.log`); process.exitCode = 1; });
} else if (cmd === "--version" || cmd === "-v") {
  console.log(version);
} else if (cmd && !cmd.startsWith("chrome-extension://")) {
  console.log("usage: agentscripts-host [install [--kits-dir DIR] [--extension-id ID] [--user-data-dir DIR] [--all-browsers] | status | --version]\n(no command: run as the native messaging host; the browser does this)");
} else {
  // Chrome passes the extension origin as argv[2] when it launches the host.
  runHost({ version }).catch((e) => { log("fatal", e.stack || e.message); process.exit(1); });
}
