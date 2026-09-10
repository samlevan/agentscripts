// Removes a 1st-degree connection from their profile page: More menu, "Remove connection", confirm.
// Destructive: the runtime only runs it with the kit's destructive switch on and confirm: true in the call.
// args.dry_run stops before the confirmation and reports what it found.
async function run(args) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wantSlug = String(args.id || args.profile_url || "").trim().replace(/^https?:\/\/[^/]+\/in\//, "").replace(/\/.*$/, "");
  const here = (location.pathname.match(/\/in\/([^/?#]+)/) || [])[1] || "";
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
  if (args.dry_run) { document.body.click(); return { dry_run: true, id: wantSlug, name: name.trim(), would_click: "More > Remove connection > confirm" }; }
  item.click();
  await sleep(900);
  const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]');
  const confirm = dialog && [...dialog.querySelectorAll("button")].find((b) => /^remove$/i.test(b.textContent.trim()));
  if (!confirm) throw new Error("confirmation dialog did not appear or has no Remove button; nothing was removed");
  confirm.click();
  await sleep(1500);
  const after = [...main.querySelectorAll("button")].map((b) => b.textContent.trim());
  return { id: wantSlug, name: name.trim(), removed: after.includes("Connect") || !after.includes("Message"), buttons_after: after.filter((t) => ["Connect", "Message", "Pending", "Follow"].includes(t)) };
}
