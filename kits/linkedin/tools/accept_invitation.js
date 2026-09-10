// Accepts one pending invitation on the invitation manager page by clicking its Accept control.
// args.id is the profile slug (from list_invitations); args.dry_run reports what would be clicked without clicking.
async function run(args, ctx) {
  const id = String(args.id || "").trim().replace(/^https?:\/\/[^/]+\/in\//, "").replace(/\/.*$/, "");
  if (!id) throw new Error("id is required: the profile slug from list_invitations");
  const link = [...document.querySelectorAll('a[href*="/in/"]')].find((a) => (a.getAttribute("href") || "").includes("/in/" + id + "/") || (a.getAttribute("href") || "").endsWith("/in/" + id));
  if (!link) throw new Error("no pending invitation found for " + id + " (already handled, or not on this page)");
  // Climb to the largest ancestor that still holds exactly one Ignore button: that is the whole card, note included.
  let card = link.parentElement;
  while (card && card.parentElement && card.parentElement !== document.body && [...card.parentElement.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Ignore").length === 1) card = card.parentElement;
  if (!card || ![...card.querySelectorAll("button")].some((b) => b.textContent.trim() === "Ignore")) throw new Error("could not locate the invitation card for " + id);
  const name = (card.querySelector("strong") || link).textContent.replace(/\s+/g, " ").trim();
  let target = [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "Accept");
  let via = "button";
  if (!target) {
    const more = [...card.querySelectorAll("button")].find((b) => (b.textContent.trim() || b.getAttribute("aria-label") || "") === "Show more actions");
    if (!more) throw new Error("no Accept control on the card for " + id);
    if (args.dry_run) return { dry_run: true, id, name, would_click: "Accept (inside the card's Show more actions menu)" };
    more.click();
    await ctx.sleep(600);
    target = [...document.querySelectorAll('[role="menuitem"], [role="menu"] button, [role="menu"] div')].find((e) => e.textContent.replace(/\s+/g, " ").trim() === "Accept");
    via = "menu";
    if (!target) throw new Error("Show more actions menu opened but no Accept item was found");
  }
  if (args.dry_run) return { dry_run: true, id, name, would_click: "Accept " + via };
  target.click();
  await ctx.sleep(1500);
  const still = [...document.querySelectorAll('a[href*="/in/"]')].some((a) => (a.getAttribute("href") || "").includes("/in/" + id + "/") && [...(a.closest("div") || a).parentElement.querySelectorAll("button")].some((b) => b.textContent.trim() === "Ignore"));
  return { id, name, action: "accept", clicked: via, card_gone: !still };
}
