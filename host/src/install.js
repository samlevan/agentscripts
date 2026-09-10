// Registers the native messaging host with the browsers found on this machine.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { HOST_NAME, configDir, readConfig, writeConfig, DEFAULT_PORT } from "./config.js";

export const EXTENSION_ID = "mlknbfgdblbbdoomplebifjopkoflcdg";

const here = path.dirname(fileURLToPath(import.meta.url));
const binPath = path.resolve(here, "..", "bin", "apiforanysite-host.js");

function browserDirs() {
  const h = os.homedir();
  if (process.platform === "darwin") {
    const base = path.join(h, "Library", "Application Support");
    return [
      ["Chrome", path.join(base, "Google", "Chrome", "NativeMessagingHosts")],
      ["Arc", path.join(base, "Arc", "User Data", "NativeMessagingHosts")],
      ["Chromium", path.join(base, "Chromium", "NativeMessagingHosts")],
      ["Brave", path.join(base, "BraveSoftware", "Brave-Browser", "NativeMessagingHosts")],
      ["Edge", path.join(base, "Microsoft Edge", "NativeMessagingHosts")],
    ];
  }
  if (process.platform === "linux") {
    return [
      ["Chrome", path.join(h, ".config", "google-chrome", "NativeMessagingHosts")],
      ["Chromium", path.join(h, ".config", "chromium", "NativeMessagingHosts")],
      ["Brave", path.join(h, ".config", "BraveSoftware", "Brave-Browser", "NativeMessagingHosts")],
    ];
  }
  throw new Error(`install is not implemented for ${process.platform} yet (Windows needs a registry key)`);
}

export function install({ kitsDir, extensionId = EXTENSION_ID, all = false, extraDirs = [] } = {}) {
  fs.mkdirSync(configDir, { recursive: true });
  const wrapper = path.join(configDir, "host.sh");
  fs.writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${binPath}" "$@"\n`);
  fs.chmodSync(wrapper, 0o755);

  const manifest = {
    name: HOST_NAME,
    description: "API for Any Site native messaging host",
    path: wrapper,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
  const written = [];
  const dirs = browserDirs();
  // A browser launched with --user-data-dir may look for user-level hosts under that directory as well.
  for (const extra of extraDirs) dirs.push(["custom profile", path.join(extra, "NativeMessagingHosts")]);
  for (const [name, dir] of dirs) {
    const parent = path.dirname(dir);
    if (!all && !fs.existsSync(parent) && !["Chrome", "Arc", "custom profile"].includes(name)) continue;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${HOST_NAME}.json`);
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
    written.push([name, file]);
  }
  const cfg = readConfig();
  if (kitsDir) cfg.kitsDir = path.resolve(kitsDir);
  cfg.port = cfg.port || DEFAULT_PORT;
  writeConfig(cfg);
  return { wrapper, written, cfg };
}
