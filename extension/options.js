import { getKits, getSettings, saveSettings, fetchKit, listCatalog, installCatalog, installPersonal, removeKit, setKitFlag, setKitLimits } from "./kits.js";

const $ = (s) => document.querySelector(s);
const send = (m) => new Promise((r) => chrome.runtime.sendMessage(m, r));
let view = "gallery"; // gallery | browse | kit
let currentKit = null;

function syncFromHash() {
  const h = location.hash;
  if (h === "#browse") { view = "browse"; currentKit = null; return; }
  const m = h.match(/^#kit=(.+)$/);
  if (m) { view = "kit"; currentKit = decodeURIComponent(m[1]); return; }
  view = "gallery"; currentKit = null;
}
function go(hash) { location.hash = hash; }
window.addEventListener("hashchange", () => { syncFromHash(); window.scrollTo(0, 0); render(); });

async function renderHeader() {
  $("#extid").textContent = chrome.runtime.id;
  const status = await send({ type: "status" });
  $("#userscripts-warn").hidden = true;
  const host = $("#host");
  if (status?.connected) { host.textContent = "ready for your agent"; host.className = "pill on"; }
  else { host.textContent = "not ready"; host.className = "pill off"; }
  return status;
}

async function render() {
  const status = await renderHeader();
  const kits = await getKits();
  if (view === "kit" && !kits[currentKit]) { view = "gallery"; currentKit = null; }
  $("#gallery-view").hidden = view !== "gallery";
  $("#browse-view").hidden = view !== "browse";
  $("#kit-view").hidden = view !== "kit";
  if (view === "kit") renderKit(kits[currentKit]);
  else if (view === "browse") renderBrowse(kits);
  else renderGallery(kits, status);
}

// ---------- gallery ----------
async function renderGallery(kits, status) {
  const list = Object.values(kits);
  const setUp = list.length > 0;
  $("#onboarding").hidden = setUp;
  $("#console").hidden = !setUp;
  if (!setUp) { renderOnboarding(status, kits); return; }

  if (status?.hostInfo?.port) renderAgent(status.hostInfo.port);
  else $("#mcp").textContent = "Host not connected. Run apiforanysite-host install, then reload the extension.";

  const box = $("#installed");
  box.innerHTML = "";
  if (!list.length) box.innerHTML = '<span class="muted">No kits installed yet. Add one to get started.</span>';
  for (const k of list) {
    const el = document.createElement("div");
    el.className = "krow";
    el.innerHTML = `<span class="kn">${k.name}</span><span class="kv">v${k.manifest.version}</span><span class="kd">${k.manifest.description || ""}</span>`;
    const rm = document.createElement("button");
    rm.className = "rm"; rm.textContent = "remove";
    rm.addEventListener("click", async (e) => { e.stopPropagation(); await removeKit(k.name); await send({ type: "kits.changed" }); render(); });
    el.appendChild(rm);
    el.addEventListener("click", () => go("kit=" + encodeURIComponent(k.name)));
    box.appendChild(el);
  }

  const { auditLog = [] } = await chrome.storage.local.get("auditLog");
  const log = $("#log");
  log.innerHTML = auditLog.length ? "" : '<span class="muted">No calls yet.</span>';
  for (const r of auditLog.slice(0, 50)) {
    const d = document.createElement("div");
    if (!r.ok) d.className = "err";
    d.textContent = `${new Date(r.at).toLocaleTimeString()}  ${r.kit}.${r.tool} ${JSON.stringify(r.args)}  ${r.ok ? "ok" : "ERR " + r.error} ${r.ms}ms`;
    log.appendChild(d);
  }
}


// The AGENT section, one connect flow per agent.
const AGENT_GUIDE = "https://github.com/apiforanysite/apiforanysite/blob/main/docs/grok-bot.md";
function renderAgent(port) {
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  const cmd = `claude mcp add --transport http apiforanysite ${endpoint}`;
  const copyrow = (v) => `<div class="copyrow"><code>${v}</code><button data-copy="${v}">copy</button></div>`;
  const tabs = {
    "Claude Code": `<div class="muted" style="margin-bottom:6px">Run this in Claude Code, on the same machine as this browser:</div>${copyrow(cmd)}`,
    "Grok Bot": (() => {
      const prompt = `Set up the API for Any Site browser extension by following this guide: ${AGENT_GUIDE}. Clone the repo, build the catalog, install the native messaging host pointed at your own Chrome profile with --user-data-dir, load the unpacked extension, and install the LinkedIn kit. Then connect to its MCP endpoint ${endpoint} and list my LinkedIn invitations.`;
      return `<div class="muted" style="margin-bottom:6px">Grok Bot is an autonomous agent in its own VM. Copy this and paste it into Grok Bot, it will read the guide, install the extension, connect, and run the task:</div>
        <div class="promptbox"><div class="p">${prompt}</div><button data-copy="${prompt}">copy prompt</button></div>
        <div class="muted" style="margin-top:8px">The guide it follows: <a href="${AGENT_GUIDE}" target="_blank">docs/grok-bot.md &#8599;</a></div>`;
    })(),
    "Other agent": `<div class="muted" style="margin-bottom:6px">Add this MCP endpoint in your agent. It must run on this machine, the address is your own computer:</div>${copyrow(endpoint)}`,
  };
  const names = Object.keys(tabs);
  const active = names.includes(window.__agentTab) ? window.__agentTab : names[0];
  $("#mcp").innerHTML = `<div class="muted" style="margin-bottom:12px">Your AI agent connects to this extension to use your installed kits. The extension is the bridge, not the agent.</div>
    <div class="tabs">${names.map((n) => `<button class="tab" data-tab="${n}">${n}</button>`).join("")}</div><div id="agent-body"></div>`;
  const setActive = (name) => {
    window.__agentTab = name;
    $("#mcp").querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    const body = $("#agent-body");
    body.innerHTML = tabs[name];
    body.querySelectorAll("button[data-copy]").forEach((b) => b.addEventListener("click", () => {
      navigator.clipboard.writeText(b.dataset.copy).then(() => { b.textContent = "copied"; setTimeout(() => (b.textContent = "copy"), 1200); });
    }));
  };
  $("#mcp").querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setActive(b.dataset.tab)));
  setActive(active);
}

$("#addkit").addEventListener("click", () => go("browse"));
$("#back-browse").addEventListener("click", () => go(""));


function renderOnboarding(status, kits) {
  const hasKit = Object.keys(kits).length > 0;
  const agent = !!status?.connected;
  const mark = (id, done) => { const el = $(id); el.classList.toggle("done", done); el.querySelector(".box").textContent = done ? "✓" : ""; };
  mark("#ob-agent", agent);
  mark("#ob-kit", hasKit);
  if (status?.hostInfo?.port) $("#ob-cmd").textContent = `claude mcp add --transport http apiforanysite http://127.0.0.1:${status.hostInfo.port}/mcp`;
}

$("#ob-copy").addEventListener("click", () => { navigator.clipboard.writeText($("#ob-cmd").textContent).then(() => { $("#ob-copy").textContent = "copied"; setTimeout(() => ($("#ob-copy").textContent = "copy"), 1200); }); });
$("#ob-browse").addEventListener("click", () => go("browse"));

// ---------- add a website kit ----------
async function renderBrowse(kits) {
  const settings = await getSettings();
  $("#dev").checked = !!settings.developerMode;
  $("#devbox").hidden = !settings.developerMode;
  const box = $("#index");
  box.innerHTML = "";
  const rest = listCatalog().filter((m) => !kits[m.name]);
  if (!rest.length) { const d = document.createElement("div"); d.className = "muted"; d.textContent = "Every catalog website kit is installed."; box.appendChild(d); }
  for (const m of rest) {
    const el = document.createElement("div");
    el.className = "krow";
    el.innerHTML = `<span class="kn">${m.name}</span><span class="kv">reviewed</span><span class="kd">${m.description || ""}</span>`;
    const btn = document.createElement("button");
    btn.textContent = "install";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      $("#msg").textContent = "";
      try {
        const ok = await chrome.permissions.request({ origins: m.origins });
        if (!ok) throw new Error("site access declined");
        await installCatalog(m.name);
        await send({ type: "kits.changed" });
        go("kit=" + encodeURIComponent(m.name));
      } catch (err) { $("#msg").textContent = err.message || String(err); }
    });
    el.appendChild(btn);
    box.appendChild(el);
  }
}

let pending = null;
function showPreview(kit) {
  pending = kit;
  const p = $("#preview");
  p.hidden = false;
  const src = kit.kind === "github" ? "pinned " + kit.pin.slice(0, 7) : kit.kind;
  p.innerHTML = `<div style="border-top:1px solid var(--line2);padding-top:10px">
    <span class="kn">${kit.name}</span> <span class="kv">v${kit.manifest.version} · ${src}</span> <span class="pill off">personal · unreviewed</span>
    <div class="muted" style="margin:4px 0">runs on: ${kit.manifest.origins.join(", ")}</div>
    <ul class="tools">${kit.manifest.tools.map((t) => `<li class="${t.destructive ? "destructive" : ""}">${t.name}${t.destructive ? ' <span class="x">×</span>' : ""} <span class="d">${t.description}</span></li>`).join("")}</ul>
    <button id="install" class="primary" style="margin-top:8px">install & grant access to these sites</button></div>`;
  $("#install").addEventListener("click", async () => {
    try {
      const ok = await chrome.permissions.request({ origins: pending.manifest.origins });
      if (!ok) throw new Error("origin permission declined");
      await installPersonal(pending);
      await send({ type: "kits.changed" });
      pending = null;
      go("kit=" + encodeURIComponent(kit.name));
    } catch (e) { $("#msg").textContent = e.message || String(e); }
  });
}

$("#fetch").addEventListener("click", async () => {
  const s = $("#src").value.trim();
  $("#msg").textContent = ""; $("#preview").hidden = true; pending = null;
  if (!s) return;
  try { showPreview(await fetchKit(s)); } catch (e) { $("#msg").textContent = e.message || String(e); }
});

$("#dev").addEventListener("change", async (e) => {
  const s = await getSettings();
  s.developerMode = e.target.checked;
  await saveSettings(s);
  $("#devbox").hidden = !s.developerMode;
  renderBrowse(await getKits());
});

// ---------- kit detail ----------
$("#back").addEventListener("click", () => go(""));

function renderKit(kit) {
  $("#k-name").innerHTML = `${kit.name}<span class="v">v${kit.manifest.version}</span>`;
  $("#k-desc").textContent = kit.manifest.description || "";
  $("#k-origins").textContent = kit.manifest.origins.join(", ");
  $("#k-pin").textContent = `v${kit.manifest.version} · ${kit.pin.slice(0, 7)}`;
  $("#k-tools").innerHTML = kit.manifest.tools.map((t) => `<li class="${t.destructive ? "destructive" : ""}">${t.name}${t.destructive ? ' <span class="x">× destructive</span>' : ""} <span class="d">${t.description}</span></li>`).join("");
  const destructiveTools = kit.manifest.tools.filter((t) => t.destructive).map((t) => t.name);
  const destRow = $("#k-destructive-row");
  destRow.hidden = destructiveTools.length === 0;
  $("#k-destructive-list").textContent = destructiveTools.length ? `(${destructiveTools.join(", ")})` : "";
  const dest = $("#k-destructive");
  dest.checked = !!kit.allowDestructive;
  dest.onchange = async () => { await setKitFlag(kit.name, "allowDestructive", dest.checked); };
  $("#k-remove").onclick = async () => { await removeKit(kit.name); await send({ type: "kits.changed" }); go(""); };
  renderLimits(kit);
}

function bar(used, limit) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = limit != null && used >= limit;
  return `<div class="bar ${over ? "over" : ""}"><span style="width:${pct}%"></span></div>`;
}

async function renderLimits(kit) {
  const hasCats = kit.manifest.categories && Object.keys(kit.manifest.categories).length;
  $("#k-limits-sec").hidden = !hasCats;
  if (!hasCats) return;
  const st = await send({ type: "usage", kit: kit.name });
  if (!st?.ok) return;
  const u = st.usage;
  const box = $("#k-limits");
  box.innerHTML = "";
  const rows = Object.entries(u.categories).map(([key, c]) => ({ key, ...c, overall: false }));
  if (u.overall.limit != null) rows.push({ key: "__overall", label: "all actions", help: "", used: u.overall.used, limit: u.overall.limit, overall: true });
  for (const c of rows) {
    const row = document.createElement("div");
    row.className = "lim" + (c.overall ? " overall" : "");
    row.innerHTML = `<div class="top"><div><span class="lbl">${c.label}</span>${c.help ? `<div class="help">${c.help}</div>` : ""}</div>
      <div class="count"><b>${c.used}</b> / <input type="number" min="0" data-cat="${c.key}" value="${c.limit}"></div></div>${bar(c.used, c.limit)}`;
    const inp = row.querySelector("input");
    inp.addEventListener("change", async () => {
      const val = Math.max(0, parseInt(inp.value, 10) || 0);
      const cur = kit.limits || {};
      const next = { categories: { ...(cur.categories || {}) }, overall: cur.overall };
      if (inp.dataset.cat === "__overall") next.overall = val; else next.categories[inp.dataset.cat] = val;
      await setKitLimits(kit.name, next);
      renderLimits((await getKits())[kit.name]);
    });
    box.appendChild(row);
  }
}

if (window.__timer) clearInterval(window.__timer);
window.__timer = setInterval(async () => { if (view === "kit" && currentKit) { const k = (await getKits())[currentKit]; if (k) renderLimits(k); } }, 4000);

syncFromHash();
render();
