---
name: linkedin
description: Triage LinkedIn invitations and conversations from the user's own logged-in browser via API for Any Site. Use when the user asks who is waiting to connect, whether to accept or ignore someone, who pitched them after connecting, to connect with someone, or to clean up connections. Never sends a message.
---

# linkedin kit

Runs inside the user's own LinkedIn session in their browser. Every call is human-paced and audit-logged; keep call counts modest (a triage pass is tens of calls, not hundreds).

## Invitation triage

1. `linkedin.list_invitations` returns pending invitations with `id` (profile slug), name, headline, `note` (their attached message, if any) and mutual-connection count.
2. Apply the user's stated policy. If they have none, use the common rule: a real profile that is relevant (same field, community, alumni, local, or content they would want) gets in; a sales or business-development profile with no note gets ignored; a note changes a maybe into a yes.
3. Present the decision per person and act only on what the user approves. `accept_invitation` is reversible later; `ignore_invitation` is not, so it is a destructive tool: the extension's switch for this kit must be on and the call must carry `confirm: true`.
4. `dry_run: true` on accept or ignore reports what would be clicked without clicking. Use it when unsure the right card is targeted.

## "Accepted, then they pitched me"

1. `linkedin.list_conversations` with `category: "PRIMARY_INBOX"` (Focused) and, separately, `"SECONDARY_INBOX"` (Other). Each row has the other participant, the last message and whether the user sent it.
2. A thread where the last message is from them, arrived soon after connecting, and `read_thread` shows the user never replied is the pattern. `read_thread` returns every message with `from_me`, so "N messages, you sent 0" is the signal.
3. Offer `remove_connection` for the ones the user wants gone. It needs `id` (slug) and `page` (their profile URL), is destructive (switch on + `confirm: true`), and is silent for the other person. `dry_run: true` opens the confirmation, reports the button it would press, and cancels it.

## Connecting with someone, and undoing it

1. `connect` sends a connection request from the person's profile. It needs `id` (slug) and `page` (their profile URL), is destructive (switch on + `confirm: true`), and takes an optional `note` (300 characters). Free accounts get a few notes a month: when LinkedIn refuses the note, the tool reports it and sends nothing; call again without a note if the user wants it sent anyway. `dry_run: true` reports what would be sent.
2. When nothing is sent, the result says why: `pending` (already invited), `connected` (already 1st degree), or `they_invited_you` (use `accept_invitation`).
3. `remove_connection` is the undo for an accepted connection: same `id` + `page` shape, destructive, silent for them. A sent invitation is withdrawn on LinkedIn under My network > Manage > Sent; this kit does not expose that yet.

## What the words mean on LinkedIn

- Ignore: the invitation disappears, the sender is not notified, and it cannot be undone. Never click "I don't know this person"; this kit does not expose it.
- Remove connection: silent, reversible only by a new invitation.
- Connection request: they get a notification; it can be withdrawn, and LinkedIn caps sends at about 100 a week (the kit's own cap is lower).
- Focused vs Other: LinkedIn's own sort; cold pitches mostly land in Other.

## Tools

<!-- tools:begin (generated from manifest.json by scripts/gen-skill.js) -->
- `linkedin.list_invitations` (count?: integer): List pending received connection invitations: id (profile slug), name, headline, note (the message they attached, if any), mutual connection count, profile URL.
- `linkedin.accept_invitation` (id: string, dry_run?: boolean): Accept one pending invitation by id (profile slug from list_invitations). Reversible later with remove_connection. dry_run reports what would be clicked.
- `linkedin.ignore_invitation` **destructive** (id: string, dry_run?: boolean): Ignore one pending invitation by id. Not reversible: the sender is not told, but the invitation is gone. dry_run reports what would be clicked.
- `linkedin.list_conversations` (count?: integer, category?: string (PRIMARY_INBOX|SECONDARY_INBOX), since?: string): List recent conversations from the messaging inbox: other participant (name, headline, distance, profile URL), last message (text, time, whether you sent it), unread count. category PRIMARY_INBOX is the Focused tab, SECONDARY_INBOX is Other.
- `linkedin.read_thread` (conversation_id: string, max_messages?: integer): Read one conversation in full by conversation_id (from list_conversations): every message with sender, time, and whether you sent it. Use it to tell a pitch from a conversation.
- `linkedin.connect` **destructive** (id: string, page: string, note?: string, dry_run?: boolean): Send a connection request to a profile. The call must pass page: the person's profile URL (https://www.linkedin.com/in/<slug>/) and id: <slug>. Optional note (max 300 chars; free accounts get a few notes a month, and the tool reports when LinkedIn refuses one instead of sending without it). Reports the state if nothing is sent: pending, connected, or they_invited_you (use accept_invitation). dry_run reports what would be sent without sending.
- `linkedin.remove_connection` **destructive** (id: string, page: string, dry_run?: boolean): Remove a 1st-degree connection. The call must pass page: the person's profile URL (https://www.linkedin.com/in/<slug>/) and id: <slug>. Silent for them. dry_run opens the confirmation, reports the button it would press, and cancels it.
<!-- tools:end -->
