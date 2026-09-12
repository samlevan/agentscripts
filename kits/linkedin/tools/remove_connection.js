// Removes a 1st-degree connection from their profile page: More menu, "Remove connection", confirm.
// Destructive: the runtime only runs it with the kit's destructive switch on and confirm: true in the call.
// args.dry_run opens the confirmation, reports the button it would press, and cancels it.
async function run(args) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Compare decoded: LinkedIn keeps accented slugs percent-encoded in the URL (laïla -> la%C3%AFla).
  const norm = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
  const here = norm((location.pathname.match(/\/in\/([^/?#]+)/) || [])[1] || "");
  const wantSlug = norm(String(args.id || args.profile_url || "").trim().replace(/^https?:\/\/[^/]+\/in\//, "").replace(/\/.*$/, ""));
  if (!wantSlug) throw new Error("id (profile slug) or profile_url is required");
  if (here !== wantSlug) throw new Error(`this tab is on /in/${here}, not /in/${wantSlug}; the runtime navigates when the tool declares page: it needs the profile URL passed as page`);
  // The top card is the block that holds the "Contact info" button; climb from it until a More button is inside.
  const anchor = [...document.querySelectorAll("button, a")].find((b) => b.textContent.trim() === "Contact info");
  if (!anchor) throw new Error("profile top card not found (no Contact info control)");
  const labels = (el) => [...el.querySelectorAll("button, a")].map((b) => b.textContent.trim());
  let main = anchor.parentElement;
  while (main && main.parentElement && !(labels(main).includes("More") && (labels(main).includes("Message") || labels(main).includes("Connect")))) main = main.parentElement;
  const topButtons = labels(main);
  if (!topButtons.includes("Message") || topButtons.includes("Connect")) {
    return { id: wantSlug, removed: false, reason: "this profile is not a 1st-degree connection (no Message button, or Connect is offered)" };
  }
  const name = (document.title || "").replace(/\s*[|(].*$/, "").trim() || wantSlug;
  const more = [...main.querySelectorAll("button")].find((b) => b.textContent.trim() === "More");
  if (!more) throw new Error("no More button on the profile top card");
  const findItem = () => [...document.querySelectorAll('[role="menuitem"]')].find((e) => /^Remove connection$/i.test(e.textContent.replace(/\s+/g, " ").trim()));
  let item = findItem();
  if (!item) {
    more.click();
    for (let i = 0; i < 10 && !item; i++) { await sleep(250); item = findItem(); }
  }
  if (!item) { document.body.click(); throw new Error("More menu has no Remove connection item"); }
  item.click();
  // LinkedIn's confirmation is a native <dialog> with no role (verified 2026-09-12): heading
  // "Remove Connection", buttons "Cancel" and "Remove connection". Look in every visible
  // dialog-like container, match the button loosely, and poll: it can take over a second.
  const text = (el) => el.textContent.replace(/\s+/g, " ").trim();
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const containers = () => [...document.querySelectorAll('dialog, [role="dialog"], [role="alertdialog"], .artdeco-modal')].filter(visible);
  const isConfirm = (b) => /^(yes,?\s*)?remove(\s+connection)?$/i.test(text(b));
  const findConfirm = () => { for (const d of containers()) { const b = [...d.querySelectorAll("button")].find(isConfirm); if (b) return { d, b }; } return null; };
  let found = null;
  for (let i = 0; i < 16 && !found; i++) { await sleep(250); found = findConfirm(); }
  const describe = (d) => ({ tag: d.tagName.toLowerCase(), role: d.getAttribute("role"), heading: text(d.querySelector("h1, h2, h3") || d).slice(0, 80), buttons: [...d.querySelectorAll("button")].map(text).filter(Boolean) });
  if (!found) {
    const seen = containers().map(describe);
    document.body.click();
    throw new Error(`confirmation dialog not found; nothing was removed. Dialog-like elements seen: ${JSON.stringify(seen)}`);
  }
  const label = text(found.b);
  if (args.dry_run) {
    const cancel = [...found.d.querySelectorAll("button")].find((b) => /^cancel$/i.test(text(b)));
    if (cancel) cancel.click(); else if (typeof found.d.close === "function") found.d.close();
    await sleep(300);
    return { dry_run: true, id: wantSlug, name: name.trim(), would_click: `More > Remove connection > ${label}`, dialog: describe(found.d), cancelled: containers().length === 0 };
  }
  found.b.click();
  await sleep(1500);
  const after = [...main.querySelectorAll("button")].map((b) => b.textContent.trim());
  return { id: wantSlug, name: name.trim(), removed: after.includes("Connect") || !after.includes("Message"), buttons_after: after.filter((t) => ["Connect", "Message", "Pending", "Follow"].includes(t)) };
}
