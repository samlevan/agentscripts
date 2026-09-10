#!/usr/bin/env node
// Regenerates the tool list inside each kit's SKILL.md from its manifest.json, so the two cannot drift.
import fs from "node:fs";
import path from "node:path";

const kitsDir = path.resolve(process.argv[2] || "kits");
for (const name of fs.readdirSync(kitsDir)) {
  const dir = path.join(kitsDir, name);
  const mf = path.join(dir, "manifest.json");
  const sk = path.join(dir, "SKILL.md");
  if (!fs.existsSync(mf) || !fs.existsSync(sk)) continue;
  const m = JSON.parse(fs.readFileSync(mf, "utf8"));
  const lines = m.tools.map((t) => {
    const props = (t.inputSchema && t.inputSchema.properties) || {};
    const req = new Set((t.inputSchema && t.inputSchema.required) || []);
    const argsTxt = Object.entries(props).map(([k, v]) => `${k}${req.has(k) ? "" : "?"}: ${v.type || "any"}${v.enum ? " (" + v.enum.join("|") + ")" : ""}`).join(", ");
    return `- \`${m.name}.${t.name}\`${t.destructive ? " **destructive**" : ""}${argsTxt ? ` (${argsTxt})` : ""}: ${t.description}`;
  });
  const block = `<!-- tools:begin (generated from manifest.json by scripts/gen-skill.js) -->\n${lines.join("\n")}\n<!-- tools:end -->`;
  const src = fs.readFileSync(sk, "utf8");
  const out = src.replace(/<!-- tools:begin[^]*?<!-- tools:end -->/, block);
  if (!out.includes("tools:begin")) { console.error(`${name}: SKILL.md has no tools:begin/tools:end markers`); process.exitCode = 1; continue; }
  fs.writeFileSync(sk, out);
  console.log(`${name}: ${lines.length} tools written`);
}
