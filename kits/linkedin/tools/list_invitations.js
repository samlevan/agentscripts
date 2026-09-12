// Lists pending received invitations from the invitation manager page (server-rendered; selectors are structural,
// never class-based, because LinkedIn's class names are hashed).
async function run(args) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const max = Math.min(Number(args.count) || 50, 200);
  // Expand truncated notes so the full message is captured.
  for (const b of [...document.querySelectorAll("button")].filter((b) => /show more/i.test(b.textContent))) { try { b.click(); } catch {} }
  // Load more pages if the page offers it and we still want more.
  for (let i = 0; i < 10; i++) {
    const have = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Ignore").length;
    if (have >= max) break;
    const more = [...document.querySelectorAll("button")].find((b) => /^(load more|show more results|see more)/i.test(b.textContent.trim()));
    if (!more) break;
    more.click();
    await sleep(1500);
  }
  // "colt_technology_services" -> "Colt Technology Services"; legal suffixes stay upper-case.
  const companyName = (slug) => slug ? slug.split(/[_-]+/).filter(Boolean).map((w) => /^(llc|ltd|inc|plc|gmbh|pvt|sas|srl|ag|bv|sa|co)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "";
  const cardOf = (btn) => { let c = btn.parentElement; while (c && c.parentElement && c.parentElement !== document.body && [...c.parentElement.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Ignore").length === 1) c = c.parentElement; return c && c.querySelector('a[href*="/in/"]') ? c : null; };
  const items = [];
  // Every pending card has an Ignore button; cards that carry a note hide Accept behind "Show more actions".
  for (const btn of [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Ignore")) {
    const card = cardOf(btn);
    if (!card) continue;
    const link = card.querySelector('a[href*="/in/"]');
    const href = link ? link.getAttribute("href") : "";
    const slug = (href.match(/\/in\/([^/?#]+)/) || [])[1] || "";
    const lines = [...card.querySelectorAll("p, span, div, time, strong")]
      .filter((e) => e.children.length === 0 || e.tagName === "P")
      .map((e) => e.textContent.replace(/\s+/g, " ").trim())
      .filter((t) => t && t.length < 1500)
      .filter((t, i, a) => a.indexOf(t) === i);
    const name = (card.querySelector("strong") && card.querySelector("strong").textContent.replace(/\s+/g, " ").trim()) || (lines.find((l) => / wants to connect$/.test(l)) || "").replace(/ wants to connect$/, "");
    const skip = new Set([name, "Accept", "Ignore", "… show more", "show more", "Show more actions", "Premium", "Verified"]);
    const rest = lines.filter((l) => !skip.has(l) && !/ wants to connect$/.test(l) && !/^Reply to /.test(l) && l !== name);
    const mutual = rest.find((l) => /mutual connection/.test(l)) || "";
    const when = rest.find((l) => /^\d+\s*(minute|hour|day|week|month)s?( ago)?$|^(yesterday|today)$/i.test(l)) || "";
    const others = rest.filter((l) => l !== mutual && l !== when && !skip.has(l));
    const headline = others[0] || "";
    const note = others.slice(1).filter((l) => l.length > 15).join(" ") || "";
    const mutualCount = mutual ? (Number((mutual.match(/(\d+) other/) || [])[1]) || 0) + 1 : 0;
    const hasNote = !![...card.querySelectorAll("button")].find((b) => (b.textContent.trim() || b.getAttribute("aria-label") || "") === "Show more actions");
    // The card's small company logo (empty alt, no link) carries the company's LinkedIn slug in
    // its filename (".../martlenz_logo"), so the current company comes for free, even when the
    // headline names none (verified 2026-09-12, 10 of 10 cards). No logo: no current company.
    // The filename writes the company's vanity name with underscores ("hg_insights_logo"); the
    // company page wants the hyphenated form (linkedin.com/company/hg-insights; the underscore
    // form lands on /company/unavailable/, verified 2026-09-12).
    const logo = card.querySelector('img[src*="company-logo"]');
    const companySlug = (logo ? (logo.getAttribute("src").match(/\/\d+\/([^/?]+?)_logo\b/) || [])[1] || "" : "").replace(/_/g, "-");
    const company = companyName(companySlug);
    items.push({ id: slug, name, headline, company, company_slug: companySlug, company_url: companySlug ? `https://www.linkedin.com/company/${companySlug}/` : "", note, has_note: hasNote, mutual_connections: mutualCount, mutual_text: mutual, when, profile_url: href.split("?")[0] });
    if (items.length >= max) break;
  }
  return { count: items.length, invitations: items };
}
