import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const dir = path.join(os.homedir(), "Library", "Logs", "agentscripts");
let stream = null;
export function log(...a) {
  try {
    if (!stream) { fs.mkdirSync(dir, { recursive: true }); stream = fs.createWriteStream(path.join(dir, "host.log"), { flags: "a" }); }
    stream.write(`${new Date().toISOString()} ${a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")}\n`);
  } catch {}
  // never stdout: that is the native messaging channel
  process.stderr.write(a.join(" ") + "\n");
}
export const logDir = dir;
