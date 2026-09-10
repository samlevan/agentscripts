// Reads one post in full (selftext or link) plus its comment tree, via Reddit JSON, same-origin.
async function run(args) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let p = String(args.permalink || args.url || "").trim();
  if (!p) throw new Error("permalink (from list_posts or search) is required");
  // Resolve an /s/ share link (what Reddit's mobile share sheet emits) to its canonical permalink.
  if (p.includes("/s/")) {
    const sres = await fetch(p.startsWith("http") ? p : "https://www.reddit.com" + p, { credentials: "include", redirect: "follow" });
    p = sres.url || p;
  }
  p = p.replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/\/$/, "");
  const m = p.match(/\/r\/[^/]+\/comments\/[a-z0-9]+/i);
  if (!m) throw new Error("not a reddit post permalink (expected /r/<sub>/comments/<id>/...): " + p);
  p = m[0];
  const max = Math.min(Number(args.max_comments) || 40, 200);
  const r = await fetch(`${p}.json?limit=${max}&sort=${encodeURIComponent(args.sort || "top")}&raw_json=1`, { credentials: "include", headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`reddit post read failed: HTTP ${r.status}`);
  const j = await r.json();
  const post = j[0]?.data?.children?.[0]?.data;
  if (!post) throw new Error("post not found");
  const flat = [];
  const walk = (children, depth) => {
    for (const c of children || []) {
      if (c.kind !== "t1") continue;
      const d = c.data;
      flat.push({ author: "u/" + d.author, score: d.score, depth, text: (d.body || "").slice(0, Number(args.max_chars) || 600) });
      if (flat.length >= max) return;
      if (d.replies && d.replies.data) walk(d.replies.data.children, depth + 1);
      if (flat.length >= max) return;
    }
  };
  walk(j[1]?.data?.children, 0);
  return {
    title: post.title, subreddit: post.subreddit_name_prefixed, author: "u/" + post.author,
    score: post.score, comments_total: post.num_comments,
    body: post.is_self ? post.selftext : (post.url_overridden_by_dest || post.url),
    permalink: "https://www.reddit.com" + post.permalink,
    comments: flat,
  };
}
