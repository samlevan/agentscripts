// Kit storage and install. A kit is {name, source, pin, manifest, tools:{name: code}, installedAt, allowDestructive}.

export async function getKits() {
  const { kits = {} } = await chrome.storage.local.get("kits");
  return kits;
}

export async function saveKits(kits) {
  await chrome.storage.local.set({ kits });
}

export async function getSettings() {
  const { settings = { developerMode: false } } = await chrome.storage.local.get("settings");
  return settings;
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

// Turn a source into the base URL its files are fetched from.
// Accepted: a GitHub tree URL pinned to a commit (https://github.com/o/r/tree/<sha>/kits/<name>),
// a raw base URL ending in /, or (developer mode) a local dev server URL.
export function resolveSource(source) {
  const gh = source.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([0-9a-f]{7,40})\/(.+?)\/?$/);
  if (gh) {
    const [, owner, repo, sha, path] = gh;
    return { base: `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path}/`, pin: sha, kind: "github" };
  }
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(source)) {
    return { base: source.endsWith("/") ? source : source + "/", pin: "dev", kind: "dev" };
  }
  if (/^https:\/\/.+\/$/.test(source)) {
    return { base: source, pin: "url", kind: "url" };
  }
  throw new Error("Unrecognized kit source. Use a GitHub tree URL pinned to a commit, or a dev server URL in developer mode.");
}

export function validateManifest(m) {
  const problems = [];
  if (!m || typeof m !== "object") return ["manifest is not an object"];
  if (!/^[a-z][a-z0-9_-]{1,40}$/.test(m.name || "")) problems.push("name must be lowercase letters, digits, - or _");
  if (!m.version) problems.push("version missing");
  if (!Array.isArray(m.origins) || !m.origins.length) problems.push("origins must be a non-empty array of match patterns");
  for (const o of m.origins || []) if (!/^https?:\/\/[^/]+\/\*$/.test(o)) problems.push(`origin ${o} must look like https://host/*`);
  if (!m.home) problems.push("home URL missing");
  if (!Array.isArray(m.tools) || !m.tools.length) problems.push("tools must be a non-empty array");
  for (const t of m.tools || []) {
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(t.name || "")) problems.push(`tool name ${t.name} invalid`);
    if (!t.description) problems.push(`tool ${t.name} has no description`);
  }
  return problems;
}

// The curated index: the only source the extension installs from unless developer mode is on.
export const INDEX_URL = "https://raw.githubusercontent.com/samlevan/agentscripts/main/index/kits.json";
export const DEV_INDEX_URL = "http://127.0.0.1:4890/index/kits.json";

export async function fetchIndex() {
  const settings = await getSettings();
  const urls = settings.developerMode ? [DEV_INDEX_URL, INDEX_URL] : [INDEX_URL];
  const errors = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return { url, kits: (j.kits || []).filter((k) => k.source), dev: url === DEV_INDEX_URL };
    } catch (e) { errors.push(`${url}: ${e.message}`); }
  }
  throw new Error("index unavailable: " + errors.join("; "));
}

// fromIndex: the source came from the curated index (always allowed). Anything else needs developer mode.
export async function fetchKit(source, { fromIndex = false } = {}) {
  const { base, pin, kind } = resolveSource(source);
  const settings = await getSettings();
  if (!fromIndex && !settings.developerMode) {
    throw new Error("Only kits from the curated index can be installed. Developer mode allows any source.");
  }
  const mres = await fetch(base + "manifest.json", { cache: "no-store" });
  if (!mres.ok) throw new Error(`manifest.json: HTTP ${mres.status}`);
  const manifest = await mres.json();
  const problems = validateManifest(manifest);
  if (problems.length) throw new Error("Invalid manifest: " + problems.join("; "));
  const tools = {};
  for (const t of manifest.tools) {
    const file = t.file || `tools/${t.name}.js`;
    const r = await fetch(base + file, { cache: "no-store" });
    if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
    tools[t.name] = await r.text();
  }
  let skill = "";
  try { const s = await fetch(base + "SKILL.md", { cache: "no-store" }); if (s.ok) skill = await s.text(); } catch {}
  return { name: manifest.name, source, base, pin, kind, fromIndex, manifest, tools, skill, installedAt: Date.now(), allowDestructive: false };
}

export async function installKit(kit) {
  const kits = await getKits();
  const prev = kits[kit.name];
  if (prev) kit.allowDestructive = prev.allowDestructive;
  kits[kit.name] = kit;
  await saveKits(kits);
  return kit;
}

export async function removeKit(name) {
  const kits = await getKits();
  delete kits[name];
  await saveKits(kits);
}

export async function setKitFlag(name, key, value) {
  const kits = await getKits();
  if (!kits[name]) throw new Error("kit not installed: " + name);
  kits[name][key] = value;
  await saveKits(kits);
}

// The tool descriptions the host publishes over MCP.
export function describeKits(kits) {
  return Object.values(kits).map((k) => ({
    name: k.name,
    version: k.manifest.version,
    description: k.manifest.description || "",
    origins: k.manifest.origins,
    pin: k.pin,
    tools: k.manifest.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema || { type: "object", properties: {} },
      destructive: !!t.destructive,
      page: t.page || null,
    })),
  }));
}
