// Lists recent LinkedIn conversations from the messaging inbox (Voyager messaging GraphQL, same-origin).
async function run(args, ctx) {
  const count = Math.min(Number(args.count) || 20, 100);
  const category = (args.category || "PRIMARY_INBOX").toUpperCase(); // PRIMARY_INBOX = Focused, SECONDARY_INBOX = Other
  const since = args.since ? (typeof args.since === "number" ? args.since : Date.parse(args.since)) : 0;

  const csrf = (document.cookie.match(/JSESSIONID="?([^";]+)/) || [])[1];
  if (!csrf) throw new Error("not signed in to LinkedIn in this tab (no session cookie)");
  const headers = { "csrf-token": csrf, "x-restli-protocol-version": "2.0.0", accept: "application/graphql" };

  // The page's own requests carry the current query ids and the viewer's mailbox URN; fall back to known values.
  const seen = performance.getEntriesByType("resource").map((e) => e.name);
  const pick = (prefix, fallback) => { for (const n of seen) { const m = n.match(new RegExp(prefix + "\\.([0-9a-f]{20,})")); if (m) return prefix + "." + m[1]; } return fallback; };
  const listQ = pick("messengerConversations", "messengerConversations.0d5e6781bbee71c3e51c8843c6519f48");
  const catQ = "messengerConversations.9501074288a12f3ae9e3c7ea243bccbf";
  let mailbox = null;
  for (const n of seen) { const m = n.match(/mailboxUrn:(urn:li:fsd_profile:[A-Za-z0-9_-]+)/); if (m) { mailbox = m[1]; break; } }
  if (!mailbox) {
    const me = await fetch("/voyager/api/me", { headers, credentials: "include" });
    if (!me.ok) throw new Error("could not determine the viewer's profile URN (voyager/me " + me.status + ")");
    const j = await me.json();
    mailbox = "urn:li:fsd_profile:" + (j.miniProfile && j.miniProfile.entityUrn || "").split(":").pop();
  }
  const myId = mailbox.split(":").pop();

  // Category query paginates one inbox tab at a time, exactly like the UI.
  const out = [];
  let cursor = null;
  for (let page = 0; page < 10 && out.length < count; page++) {
    const vars = `(query:(predicateUnions:List((conversationCategoryPredicate:(category:${category})))),count:20,mailboxUrn:${encodeURIComponent(mailbox)}${cursor ? ",nextCursor:" + encodeURIComponent(cursor) : ""})`;
    const url = `/voyager/api/voyagerMessagingGraphQL/graphql?queryId=${catQ}&variables=${vars}`;
    const r = await fetch(url, { headers, credentials: "include" });
    if (!r.ok) throw new Error(`conversation list failed: HTTP ${r.status} (query ids may have rotated; open the LinkedIn messaging page once and retry)`);
    const j = await r.json();
    const data = j.data && (j.data.messengerConversationsByCategoryQuery || j.data.messengerConversationsBySyncToken) || {};
    const elements = data.elements || [];
    for (const c of elements) {
      const last = (c.messages && c.messages.elements && c.messages.elements[0]) || null;
      const at = c.lastActivityAt || (last && last.deliveredAt) || 0;
      if (since && at < since) { cursor = null; break; }
      const others = (c.conversationParticipants || []).filter((p) => !(p.hostIdentityUrn || "").includes(myId)).map((p) => {
        const m = (p.participantType && p.participantType.member) || {};
        const nm = (x) => (x && x.text) || "";
        return { name: `${nm(m.firstName)} ${nm(m.lastName)}`.trim(), headline: nm(m.headline), distance: m.distance || null, profile_url: m.profileUrl || null };
      });
      out.push({
        conversation_id: (c.entityUrn || "").split(",").pop().replace(/\)$/, ""),
        conversation_urn: c.entityUrn,
        participants: others,
        last_message: last ? { text: (last.body && last.body.text) || "", at: new Date(last.deliveredAt).toISOString(), from_me: JSON.stringify(last.sender || {}).includes(myId) } : null,
        last_activity: new Date(at).toISOString(),
        unread: c.unreadCount || 0,
        categories: c.categories || [],
      });
      if (out.length >= count) break;
    }
    cursor = (data.metadata && data.metadata.nextCursor) || null;
    if (!cursor) break;
    await ctx.sleep(800);
  }
  return { mailbox: category, count: out.length, conversations: out };
}
