import { getKits, getSettings, saveSettings, fetchKit, fetchIndex, installKit, removeKit, setKitFlag } from "./kits.js";

const $ = (s) => document.querySelector(s);
const send = (m) => new Promise((r) => chrome.runtime.sendMessage(m, r));

async function render() {
  $("#extid").textContent = chrome.runtime.id;
  const status = await send({ type: "status" });
  $("#userscripts-warn").hidden = !!status?.userScripts;
  const host = $("#host");
  if (status?.connected) { host.textContent = "host connected"; host.className = "pill on"; }
  else { host.textContent = "host not connected"; host.className = "pill off"; }
  if (status?.hostInfo?.port) {
    $("#mcp").innerHTML = `MCP endpoint: <code>http://127.0.0.1:${status.hostInfo.port}/mcp</code><br><span class="muted">Claude Code: <code>claude mcp add --transport http agentscripts http://127.0.0.1:${status.hostInfo.port}/mcp</code></span>`;
  }
  const settings = await getSettings();
  $("#dev").checked = !!settings.developerMode;
  $("#devbox").hidden = !settings.developerMode;
  renderIndex();

  const kits = await getKits();
  const box = $("#kits");
  box.innerHTML = "";
  const list = Object.values(kits);
  if (!list.length) box.innerHTML = '<span class="muted">No kits installed.</span>';
  for (const k of list) {
    const el = document.createElement("div");
    el.className = "kit";
    el.innerHTML = `<div class="name">${k.name} <span class="meta">v${k.manifest.version} · ${k.pin.slice(0, 7)}</span></div>
      <div class="meta">${k.manifest.origins.join(", ")}</div>
      <ul class="tools">${k.manifest.tools.map((t) => `<li class="${t.destructive ? "destructive" : ""}">${t.name}</li>`).join("")}</ul>
      <div class="row"><label class="sw"><input type="checkbox" class="allow" ${k.allowDestructive ? "checked" : ""}> allow destructive tools</label>
      <button class="rm" style="margin-left:auto">Remove</button></div>`;
    el.querySelector(".allow").addEventListener("change", async (e) => { await setKitFlag(k.name, "allowDestructive", e.target.checked); });
    el.querySelector(".rm").addEventListener("click", async () => { await removeKit(k.name); await send({ type: "kits.changed" }); render(); });
    box.appendChild(el);
  }

  const { auditLog = [] } = await chrome.storage.local.get("auditLog");
  const log = $("#log");
  log.innerHTML = auditLog.length ? "" : '<span class="muted">No calls yet.</span>';
  for (const r of auditLog.slice(0, 50)) {
    const d = document.createElement("div");
    d.className = r.ok ? "" : "err";
    d.textContent = `${new Date(r.at).toLocaleTimeString()} ${r.kit}.${r.tool} ${JSON.stringify(r.args)} ${r.ok ? "ok" : "ERR " + r.error} ${r.ms}ms`;
    log.appendChild(d);
  }
}

let pending = null; // fetched kit awaiting the permission grant

function showPreview(kit) {
  pending = kit;
  $("#preview").hidden = false;
  $("#preview").innerHTML = `<b>${kit.name}</b> v${kit.manifest.version} · ${kit.kind === "github" ? "pinned " + kit.pin.slice(0, 7) : kit.kind}${kit.fromIndex ? " · reviewed" : " · <span style=\"color:#a33\">unreviewed source</span>"}<br>
    <span class="meta">runs on: ${kit.manifest.origins.join(", ")}</span>
    <ul class="tools">${kit.manifest.tools.map((t) => `<li class="${t.destructive ? "destructive" : ""}">${t.name}: ${t.description}</li>`).join("")}</ul>
    <button id="install" class="primary">Install and grant access to these sites</button>`;
  // the permission request runs directly inside this click, so the gesture is fresh
  $("#install").addEventListener("click", async () => {
    try {
      const ok = await chrome.permissions.request({ origins: pending.manifest.origins });
      if (!ok) throw new Error("origin permission declined");
      await installKit(pending);
      await send({ type: "kits.changed" });
      $("#preview").hidden = true;
      pending = null;
      render();
    } catch (e) { $("#msg").textContent = e.message || String(e); }
  });
}

async function renderIndex() {
  const box = $("#index");
  try {
    const idx = await fetchIndex();
    const installed = await getKits();
    box.innerHTML = idx.kits.length ? "" : '<span class="muted">The index lists no kits yet.</span>';
    if (idx.dev) box.innerHTML += '<div class="muted">Developer index (local checkout).</div>';
    for (const k of idx.kits) {
      const el = document.createElement("div");
      el.className = "kit";
      el.innerHTML = `<div class="name">${k.name} ${installed[k.name] ? '<span class="pill on">installed</span>' : ""}</div><div class="meta">${k.description || ""}</div>
        <div class="row"><button class="get">${installed[k.name] ? "Reinstall" : "Install"}</button></div>`;
      el.querySelector(".get").addEventListener("click", async () => {
        $("#msg").textContent = "";
        try { showPreview(await fetchKit(k.source, { fromIndex: true })); } catch (e) { $("#msg").textContent = e.message || String(e); }
      });
      box.appendChild(el);
    }
  } catch (e) {
    box.innerHTML = `<span class="muted">${e.message}</span>`;
  }
}

$("#fetch").addEventListener("click", async () => {
  const src = $("#src").value.trim();
  $("#msg").textContent = "";
  $("#preview").hidden = true;
  pending = null;
  if (!src) return;
  try { showPreview(await fetchKit(src)); } catch (e) { $("#msg").textContent = e.message || String(e); }
});

$("#dev").addEventListener("change", async (e) => {
  const s = await getSettings();
  s.developerMode = e.target.checked;
  await saveSettings(s);
  $("#devbox").hidden = !s.developerMode;
  renderIndex();
});

render();
