// apiforanysite service worker: native port to the host, tool execution, audit log.
import { getKits, describeKits, getSettings, effectiveLimits, toolCategory, catalogRun } from "./kits.js";

const HOST = "com.apiforanysite.host";
const AUDIT_MAX = 500;
let port = null;
let hostInfo = null; // {port, version} reported by the host

// ---------- native port ----------
function connect() {
  if (port) return; // one port, one host process per browser profile
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch (e) {
    console.warn("connectNative failed", e);
    port = null;
    scheduleReconnect();
    return;
  }
  port.onMessage.addListener(onHostMessage);
  port.onDisconnect.addListener(() => {
    console.warn("host disconnected", chrome.runtime.lastError?.message);
    port = null;
    hostInfo = null;
    scheduleReconnect();
  });
  publishKits();
}

function scheduleReconnect() {
  chrome.alarms.create("reconnect", { delayInMinutes: 0.25 });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "reconnect" && !port) connect();
});

function send(msg) {
  if (!port) return false;
  try { port.postMessage(msg); return true; } catch (e) { console.warn("post failed", e); return false; }
}

async function publishKits() {
  const kits = await getKits();
  send({ type: "kits", kits: describeKits(kits) });
}

async function onHostMessage(msg) {
  if (msg.type === "hello") {
    hostInfo = { port: msg.port, version: msg.version };
    await chrome.storage.local.set({ hostInfo });
    return;
  }
  if (msg.type === "call") {
    const started = Date.now();
    let outcome;
    try {
      const result = await runTool(msg.kit, msg.tool, msg.args || {});
      outcome = { ok: true, result };
    } catch (e) {
      outcome = { ok: false, error: String(e && e.message || e), limited: !!(e && e.limited) };
    }
    send({ type: "result", id: msg.id, ...outcome });
    await audit({ at: started, ms: Date.now() - started, kit: msg.kit, tool: msg.tool, args: msg.args || {}, ok: outcome.ok, error: outcome.error || null, limited: !!outcome.limited });
  }
}

// ---------- audit ----------
async function audit(rec) {
  const { auditLog = [] } = await chrome.storage.local.get("auditLog");
  auditLog.unshift(rec);
  if (auditLog.length > AUDIT_MAX) auditLog.length = AUDIT_MAX;
  await chrome.storage.local.set({ auditLog });
}


// ---------- rate limits ----------
const DAY_MS = 24 * 60 * 60 * 1000;

async function usageForKit(kit) {
  const { auditLog = [] } = await chrome.storage.local.get("auditLog");
  const since = Date.now() - DAY_MS;
  const recent = auditLog.filter((r) => r.kit === kit.name && r.ok && r.at >= since && !r.limited);
  const lim = effectiveLimits(kit);
  const byCat = {};
  for (const k of Object.keys(lim.categories)) byCat[k] = 0;
  let total = 0;
  for (const r of recent) {
    const c = toolCategory(kit, r.tool);
    if (c && byCat[c] != null) byCat[c]++;
    total++;
  }
  const categories = {};
  for (const [k, c] of Object.entries(lim.categories)) categories[k] = { label: c.label, help: c.help, used: byCat[k] || 0, limit: c.dailyLimit };
  return { categories, overall: { used: total, limit: lim.overall }, windowHours: 24 };
}

// Throws a clear, agent-actionable error if this call would cross a cap.
async function enforceLimits(kit, toolName) {
  const cat = toolCategory(kit, toolName);
  const u = await usageForKit(kit);
  if (u.overall.limit != null && u.overall.used >= u.overall.limit)
    throw new Error(`daily cap reached: ${u.overall.used}/${u.overall.limit} total ${kit.name} actions in the last 24h. It resets as older calls age out. Raise it in the extension's Daily limits, or wait.`);
  if (cat && u.categories[cat] && u.categories[cat].used >= u.categories[cat].limit)
    throw new Error(`daily cap reached: ${u.categories[cat].used}/${u.categories[cat].limit} ${u.categories[cat].label} calls in the last 24h. It resets as older calls age out. Raise it in the extension's Daily limits, or wait.`);
}

// ---------- tabs ----------
function matchesOrigins(url, origins) {
  if (!url) return false;
  return origins.some((pat) => {
    const m = pat.match(/^(https?):\/\/([^/]+)\/\*$/);
    if (!m) return false;
    try {
      const u = new URL(url);
      if (u.protocol !== m[1] + ":") return false;
      const host = m[2];
      if (host.startsWith("*.")) return u.hostname === host.slice(2) || u.hostname.endsWith(host.slice(1));
      return u.hostname === host;
    } catch { return false; }
  });
}

function waitForLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("page did not finish loading")); }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 500); // let the SPA settle
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => { if (t.status === "complete") { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); setTimeout(resolve, 500); } }).catch(reject);
  });
}

// The kit owns its tab: the extension creates it in the background and remembers it across worker restarts.
// It never borrows a tab the user opened, so the user's own LinkedIn tab is never navigated away.
async function kitTab(kit, page) {
  const origins = kit.manifest.origins;
  const wanted = page || kit.manifest.home;
  const { kitTabIds = {} } = await chrome.storage.session.get("kitTabIds");
  let tab = null;
  const knownId = kitTabIds[kit.name];
  if (knownId) {
    try { const t = await chrome.tabs.get(knownId); if (matchesOrigins(t.url, origins)) tab = t; } catch {}
  }
  if (!tab) {
    tab = await chrome.tabs.create({ url: wanted, active: false });
    kitTabIds[kit.name] = tab.id;
    await chrome.storage.session.set({ kitTabIds });
    await waitForLoad(tab.id);
    return tab.id;
  }
  if (page && normalize(tab.url) !== normalize(page)) {
    await chrome.tabs.update(tab.id, { url: page });
    await waitForLoad(tab.id);
  }
  return tab.id;
}

function normalize(u) { try { const x = new URL(u); return x.origin + x.pathname.replace(/\/$/, ""); } catch { return u; } }

// ---------- execution ----------
async function runTool(kitName, toolName, args) {
  const kits = await getKits();
  const kit = kits[kitName];
  if (!kit) throw new Error(`kit not installed: ${kitName}`);
  const spec = kit.manifest.tools.find((t) => t.name === toolName);
  if (!spec) throw new Error(`tool not found: ${kitName}.${toolName}`);
  if (spec.destructive) {
    if (!kit.allowDestructive) throw new Error(`refused: ${kitName}.${toolName} is destructive and the kit's "allow destructive tools" switch is off (extension popup).`);
    if (args.confirm !== true) throw new Error(`refused: ${kitName}.${toolName} is destructive; pass confirm: true after the user has approved this specific call.`);
  }
  try { await enforceLimits(kit, toolName); }
  catch (e) { const err = new Error(e.message); err.limited = true; throw err; }
  const granted = await chrome.permissions.contains({ origins: kit.manifest.origins });
  if (!granted) throw new Error(`origin permission not granted for ${kit.manifest.origins.join(", ")}; reinstall the kit.`);

  // A tool without a fixed page may ask for one per call, as long as it stays inside the kit's origins.
  let page = spec.page || null;
  if (!page && typeof args.page === "string") {
    if (!matchesOrigins(args.page, kit.manifest.origins)) throw new Error(`page ${args.page} is outside the kit's origins`);
    page = args.page;
  }
  const tabId = await kitTab(kit, page);
  const tab = await chrome.tabs.get(tabId);
  if (!matchesOrigins(tab.url, kit.manifest.origins)) throw new Error(`tab left the kit's origins (${tab.url})`);

  if (kit.source === "catalog") {
    // Catalog kit: reviewed code bundled in this package, run via the extension's own injection (no user-scripts
    // toggle). Egress is bounded by the extension's host permissions; trust comes from review.
    const fn = catalogRun(kit.name, toolName);
    if (!fn) throw new Error(`catalog tool missing: ${kitName}.${toolName}`);
    let res;
    try { [res] = await chrome.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: fn, args: [args] }); }
    catch (e) { throw new Error((e && e.message) || String(e)); }
    const out = res && res.result;
    if (out && out.__ok === false) throw new Error(out.error);
    return out ? out.value : null;
  }

  // Personal kit: the user's own code, run via the User Scripts API in an isolated per-kit world whose
  // egress is fenced by CSP to the kit's own declared origins (the exfiltration fence for unreviewed code).
  if (!chrome.userScripts) throw new Error('user scripts are not enabled: open the extension details page and turn on "Allow User Scripts".');
  const code = kit.tools[toolName];
  if (!code) throw new Error(`tool source missing: ${kitName}.${toolName}`);
  const worldId = "kit_" + kit.name.replace(/[^A-Za-z0-9_-]/g, "_");
  const cspSrc = kit.manifest.origins.map((o) => o.replace(/\/\*$/, "")).join(" ");
  try { await chrome.userScripts.configureWorld({ worldId, csp: `default-src 'self'; connect-src ${cspSrc}; script-src 'self'`, messaging: false }); } catch (e) { console.warn("configureWorld failed", e); }
  const wrapped = `(async () => {
    try {
      const args = ${JSON.stringify(args)};
      const ctx = { origin: location.origin, url: location.href, log: (...a) => console.log("[apiforanysite:${kitName}.${toolName}]", ...a),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
      ${code}
      if (typeof run !== "function") throw new Error("tool defines no run(args)");
      const out = await run(args, ctx);
      return { __ok: true, value: out === undefined ? null : out };
    } catch (e) { return { __ok: false, error: (e && e.message) || String(e) }; }
  })()`;
  const results = await chrome.userScripts.execute({ target: { tabId }, js: [{ code: wrapped }], world: "USER_SCRIPT", worldId, injectImmediately: true });
  const r = results && results[0];
  if (!r) throw new Error("no result from tab");
  if (r.error) throw new Error(typeof r.error === "string" ? r.error : (r.error.message || JSON.stringify(r.error)));
  const out = r.result;
  if (out && out.__ok === false) throw new Error(out.error);
  return out ? out.value : null;
}

// ---------- world config ----------
async function configureWorld() {
  if (!chrome.userScripts) return;
  try {
    await chrome.userScripts.configureWorld({ csp: "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-eval'", messaging: false });
  } catch (e) { console.warn("configureWorld failed", e); }
}

// ---------- popup messages ----------
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === "status") {
      reply({ connected: !!port, hostInfo, userScripts: !!chrome.userScripts });
    } else if (msg.type === "kits.changed") {
      await publishKits();
      reply({ ok: true });
    } else if (msg.type === "usage") {
      const kits = await getKits();
      const kit = kits[msg.kit];
      reply(kit ? { ok: true, usage: await usageForKit(kit) } : { ok: false, error: "kit not installed" });
    } else if (msg.type === "run") {
      try { reply({ ok: true, result: await runTool(msg.kit, msg.tool, msg.args || {}) }); }
      catch (e) { reply({ ok: false, error: String(e.message || e) }); }
    } else {
      reply({ ok: false, error: "unknown message" });
    }
  })();
  return true;
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.runtime.onInstalled.addListener(() => { configureWorld(); connect(); });
chrome.runtime.onStartup.addListener(() => { configureWorld(); connect(); });
configureWorld();
connect();
