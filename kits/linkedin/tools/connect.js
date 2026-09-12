// Sends a connection request through LinkedIn's own invitation request, the same internal API the kit
// already uses to read the inbox (list_conversations). Runs on the person's profile page: the page
// tells us the state (pending / connected / they invited you) and carries their profile URN.
// Why not click the page's Connect button: LinkedIn's button ignores presses coming from an extension
// (verified 2026-09-12, only the page's own scripts can open its dialog).
// Destructive: it reaches out on the user's behalf, so the runtime only runs it with the kit's
// destructive switch on and confirm: true in the call. Reversible: withdraw it on LinkedIn under
// My network > Manage > Sent, or it expires. args.dry_run stops before anything is sent.
async function run(args) {
  const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
  // Compare decoded: LinkedIn keeps accented slugs percent-encoded in the URL (laïla -> la%C3%AFla).
  const norm = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
  const here = norm((location.pathname.match(/\/in\/([^/?#]+)/) || [])[1] || "");
  const wantSlug = norm(String(args.id || args.profile_url || "").trim().replace(/^https?:\/\/[^/]+\/in\//, "").replace(/\/.*$/, ""));
  if (!wantSlug) throw new Error("id (profile slug) or profile_url is required");
  if (here !== wantSlug) throw new Error(`this tab is on /in/${here}, not /in/${wantSlug}; pass the profile URL as page`);
  const note = typeof args.note === "string" ? args.note.trim() : "";
  if (note.length > 300) throw new Error("note is over LinkedIn's 300-character limit");
  const name = (document.title || "").replace(/\s*[|(].*$/, "").trim() || wantSlug;
  const csrf = (document.cookie.match(/JSESSIONID="?([^";]+)/) || [])[1];
  if (!csrf) throw new Error("not signed in to LinkedIn in this tab (no session cookie)");

  // The top card is the block that holds "Contact info"; climb until the card's action row (More) is inside.
  const anchor = [...document.querySelectorAll("button, a")].find((b) => txt(b) === "Contact info");
  if (!anchor) throw new Error("profile top card not found (no Contact info control)");
  const controls = (el) => [...el.querySelectorAll("button, a")];
  const labelOf = (b) => b.getAttribute("aria-label") || txt(b);
  const has = (el, re) => controls(el).some((b) => re.test(labelOf(b)));
  let card = anchor.parentElement;
  while (card && card.parentElement && card.parentElement !== document.body && !has(card, /^More$/)) card = card.parentElement;
  const offersConnect = has(card, /^Invite .* to connect$/) || controls(card).some((b) => txt(b) === "Connect");
  const state = has(card, /^Pending$|^Pending,|withdraw/i) ? "pending"
    : has(card, /^Accept .* request to connect$/) ? "they_invited_you"
    : (!offersConnect && has(card, /^Message$/) && !has(card, /^Follow$/)) ? "connected"
    : "not_connected";
  if (state === "pending") return { id: wantSlug, name, sent: false, state, reason: "an invitation to this person is already pending" };
  if (state === "they_invited_you") return { id: wantSlug, name, sent: false, state, reason: "they already invited you; use accept_invitation instead" };
  if (state === "connected") return { id: wantSlug, name, sent: false, state, reason: "already a 1st-degree connection" };

  // Their profile URN rides on the top card's Message link (recipient=...).
  const msg = controls(card).find((b) => /\/messaging\/compose\//.test(b.getAttribute("href") || ""));
  const member = msg && (msg.getAttribute("href").match(/recipient=([A-Za-z0-9_-]+)/) || [])[1];
  if (!member) throw new Error("could not read this profile's id from the top card (no Message link); nothing was sent");
  const profileUrn = `urn:li:fsd_profile:${member}`;
  if (args.dry_run) return { dry_run: true, id: wantSlug, name, state, profile_urn: profileUrn, would_send: note ? "invitation with note" : "invitation without a note", note: note || null };

  const body = { invitee: { inviteeUnion: { memberProfile: profileUrn } } };
  if (note) body.customMessage = note;
  const url = "/voyager/api/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2";
  const r = await fetch(url, {
    method: "POST", credentials: "include",
    headers: { "csrf-token": csrf, "x-restli-protocol-version": "2.0.0", "content-type": "application/json", accept: "application/vnd.linkedin.normalized+json+2.1" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch (e) {}
  if (!r.ok) {
    const detail = (data && (data.message || data.code || (data.data && data.data.message))) || text.slice(0, 200);
    if (/quota|limit|custom/i.test(detail) && note) return { id: wantSlug, name, sent: false, state, reason: `LinkedIn refused the note (${detail}); call again without a note to send anyway` };
    throw new Error(`LinkedIn refused the invitation (HTTP ${r.status}): ${detail}`);
  }
  const invitation = data && data.data && (data.data.invitationUrn || (data.data.value && data.data.value.invitationUrn)) || null;
  return { id: wantSlug, name, sent: true, state: "pending", with_note: !!note, invitation_urn: invitation };
}
