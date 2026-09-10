// Two sources only: the reviewed CATALOG bundled in this package, or PERSONAL kits from the user's machine.
import { CATALOG } from "./catalog/registry.js";

const CATALOG_MAP = Object.fromEntries(CATALOG.map((k) => [k.manifest.name, k]));
export function catalogRun(name, tool) { return CATALOG_MAP[name]?.tools?.[tool] || null; }
export function isCatalog(name) { return !!CATALOG_MAP[name]; }
export function listCatalog() { return CATALOG.map((k) => k.manifest); }

async function get(key, dflt) { const o = await chrome.storage.local.get(key); return o[key] ?? dflt; }

export async function getSettings() { return get("settings", { developerMode: false }); }
export async function saveSettings(s) { await chrome.storage.local.set({ settings: s }); }

// Per-catalog-kit user state: { <name>: { enabled, allowDestructive, limits } }
async function getCatalogState() { return get("catalogState", {}); }
async function saveCatalogState(s) { await chrome.storage.local.set({ catalogState: s }); }
// Personal kits (fetched from the user's machine): { <name>: {manifest, tools:{name:code}, source, pin, allowDestructive, limits} }
async function getPersonal() { return get("personal", {}); }
async function savePersonal(p) { await chrome.storage.local.set({ personal: p }); }

// The installed kits the runtime and UI act on: enabled catalog kits + all personal kits.
export async function getKits() {
  const cat = await getCatalogState();
  const per = await getPersonal();
  const out = {};
  for (const k of CATALOG) {
    const st = cat[k.manifest.name];
    if (st?.enabled) out[k.manifest.name] = { name: k.manifest.name, manifest: k.manifest, source: "catalog", pin: "catalog", allowDestructive: !!st.allowDestructive, limits: st.limits || null };
  }
  for (const [name, p] of Object.entries(per)) {
    out[name] = { name, manifest: p.manifest, source: "personal", pin: p.pin || "personal", tools: p.tools, allowDestructive: !!p.allowDestructive, limits: p.limits || null };
  }
  return out;
}

export function effectiveLimits(kit) {
  const cats = (kit.manifest && kit.manifest.categories) || {};
  const ov = kit.limits || {};
  const categories = {};
  for (const [k, c] of Object.entries(cats)) categories[k] = { label: c.label || k, help: c.help || "", dailyLimit: ov.categories && ov.categories[k] != null ? ov.categories[k] : c.dailyLimit };
  const overall = ov.overall != null ? ov.overall : (kit.manifest && kit.manifest.dailyLimit) || null;
  return { categories, overall };
}
export function toolCategory(kit, toolName) {
  const t = (kit.manifest.tools || []).find((x) => x.name === toolName);
  return t ? t.category || null : null;
}

// ---- catalog install / remove (no download; the code is already in the package) ----
export async function installCatalog(name, { allowDestructive } = {}) {
  if (!CATALOG_MAP[name]) throw new Error("not a catalog kit: " + name);
  const cat = await getCatalogState();
  cat[name] = { ...(cat[name] || {}), enabled: true };
  if (allowDestructive != null) cat[name].allowDestructive = allowDestructive;
  await saveCatalogState(cat);
}
export async function removeKit(name) {
  const cat = await getCatalogState();
  if (cat[name]) { delete cat[name]; await saveCatalogState(cat); return; }
  const per = await getPersonal();
  if (per[name]) { delete per[name]; await savePersonal(per); }
}

// ---- personal kits: from the user's own machine ONLY (localhost / dev server). No third-party remote. ----
export function resolveSource(source) {
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(source)) {
    return { base: source.endsWith("/") ? source : source + "/", pin: "local", kind: "local" };
  }
  throw new Error("Personal kits load from your own machine only (http://localhost/... or http://127.0.0.1/...). Third-party remote sources are not allowed.");
}
export function validateManifest(m) {
  const problems = [];
  if (!m || typeof m !== "object") return ["manifest is not an object"];
  if (!/^[a-z][a-z0-9_-]{1,40}$/.test(m.name || "")) problems.push("name must be lowercase letters, digits, - or _");
  if (CATALOG_MAP[m.name]) problems.push(`"${m.name}" is a catalog kit name; personal kits need a different name`);
  if (!m.version) problems.push("version missing");
  if (!Array.isArray(m.origins) || !m.origins.length) problems.push("origins must be a non-empty array");
  for (const o of m.origins || []) if (!/^https?:\/\/[^/]+\/\*$/.test(o)) problems.push(`origin ${o} must look like https://host/*`);
  if (!m.home) problems.push("home URL missing");
  if (!Array.isArray(m.tools) || !m.tools.length) problems.push("tools must be a non-empty array");
  for (const t of m.tools || []) {
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(t.name || "")) problems.push(`tool name ${t.name} invalid`);
    if (!t.description) problems.push(`tool ${t.name} has no description`);
    if (t.category && !(m.categories || {})[t.category]) problems.push(`tool ${t.name} names category ${t.category} not in categories`);
  }
  for (const [k, c] of Object.entries(m.categories || {})) if (typeof c.dailyLimit !== "number") problems.push(`category ${k} has no numeric dailyLimit`);
  return problems;
}
export async function fetchKit(source) {
  const settings = await getSettings();
  if (!settings.developerMode) throw new Error("Turn on developer mode to load a personal kit from your machine.");
  const { base, pin, kind } = resolveSource(source);
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
  return { name: manifest.name, source, base, pin, kind, manifest, tools, source_kind: "personal" };
}
export async function installPersonal(kit) {
  const per = await getPersonal();
  const prev = per[kit.name];
  per[kit.name] = { manifest: kit.manifest, tools: kit.tools, source: kit.source, pin: kit.pin, allowDestructive: prev?.allowDestructive || false, limits: prev?.limits || null, installedAt: Date.now() };
  await savePersonal(per);
}

// ---- shared flag / limit writes (route to the right store) ----
export async function setKitFlag(name, key, value) {
  if (CATALOG_MAP[name]) { const c = await getCatalogState(); if (!c[name]) throw new Error("catalog kit not installed"); c[name][key] = value; await saveCatalogState(c); return; }
  const p = await getPersonal(); if (!p[name]) throw new Error("kit not installed"); p[name][key] = value; await savePersonal(p);
}
export async function setKitLimits(name, limits) {
  if (CATALOG_MAP[name]) { const c = await getCatalogState(); if (!c[name]) throw new Error("catalog kit not installed"); c[name].limits = limits; await saveCatalogState(c); return; }
  const p = await getPersonal(); if (!p[name]) throw new Error("kit not installed"); p[name].limits = limits; await savePersonal(p);
}

export function describeKits(kits) {
  return Object.values(kits).map((k) => ({
    name: k.name, version: k.manifest.version, description: k.manifest.description || "", origins: k.manifest.origins, pin: k.pin, source: k.source,
    tools: k.manifest.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema || { type: "object", properties: {} }, destructive: !!t.destructive, page: t.page || null })),
  }));
}
