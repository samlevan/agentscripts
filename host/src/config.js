import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const configDir = path.join(os.homedir(), ".config", "apiforanysite");
export const configPath = path.join(configDir, "config.json");
export const HOST_NAME = "com.apiforanysite.host";
export const DEFAULT_PORT = 4890;

export function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, "utf8")); } catch { return {}; }
}
export function writeConfig(cfg) {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
}
