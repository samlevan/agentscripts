// Reads one LinkedIn conversation in full (Voyager messaging GraphQL, same-origin).
async function run(args, ctx) {
  const id = String(args.conversation_id || "").trim();
  if (!id) throw new Error("conversation_id is required (from list_conversations)");
  const csrf = (document.cookie.match(/JSESSIONID="?([^";]+)/) || [])[1];
  if (!csrf) throw new Error("not signed in to LinkedIn in this tab (no session cookie)");
  const headers = { "csrf-token": csrf, "x-restli-protocol-version": "2.0.0", accept: "application/graphql" };
  const seen = performance.getEntriesByType("resource").map((e) => e.name);
  let q = "messengerMessages.5846eeb71c981f11e0134cb6626cc314";
  for (const n of seen) { const m = n.match(/messengerMessages\.([0-9a-f]{20,})/); if (m) { q = "messengerMessages." + m[1]; break; } }
  let mailbox = null;
  for (const n of seen) { const m = n.match(/mailboxUrn:(urn:li:fsd_profile:[A-Za-z0-9_-]+)/); if (m) { mailbox = m[1]; break; } }
  if (!mailbox) {
    const me = await fetch("/voyager/api/me", { headers, credentials: "include" });
    if (!me.ok) throw new Error("could not determine the viewer's profile URN");
    const j = await me.json();
    mailbox = "urn:li:fsd_profile:" + (j.miniProfile && j.miniProfile.entityUrn || "").split(":").pop();
  }
  const myId = mailbox.split(":").pop();
  const urn = id.startsWith("urn:") ? id : `urn:li:msg_conversation:(${mailbox},${id})`;
  // restli: the URN VALUE must have its parens escaped (encodeURIComponent leaves them), the outer structural parens stay literal.
  const enc = encodeURIComponent(urn).replace(/\(/g, "%28").replace(/\)/g, "%29");
  const url = `/voyager/api/voyagerMessagingGraphQL/graphql?queryId=${q}&variables=(conversationUrn:${enc})`;
  const r = await fetch(url, { headers, credentials: "include" });
  if (!r.ok) throw new Error(`thread read failed: HTTP ${r.status}`);
  const j = await r.json();
  const data = j.data && (j.data.messengerMessagesBySyncToken || j.data.messengerMessagesByConversation || j.data.messengerMessagesByAnchorTimestamp) || {};
  const els = (data.elements || []).slice().sort((a, b) => a.deliveredAt - b.deliveredAt);
  const messages = els.map((m) => {
    const s = m.sender && m.sender.participantType && m.sender.participantType.member || {};
    const nm = (x) => (x && x.text) || "";
    return { at: new Date(m.deliveredAt).toISOString(), from: `${nm(s.firstName)} ${nm(s.lastName)}`.trim() || "(unknown)", from_me: JSON.stringify(m.sender || {}).includes(myId), text: (m.body && m.body.text) || "" };
  });
  return { conversation_id: id, count: messages.length, sent_by_me: messages.filter((m) => m.from_me).length, messages: messages.slice(-Math.min(Number(args.max_messages) || 50, 200)) };
}
