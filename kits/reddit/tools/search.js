// Searches Reddit (site-wide, or one subreddit) via Reddit JSON, same-origin, from your session.
async function run(args) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = String(args.query || "").trim();
  if (!q) throw new Error("query is required");
  const sub = String(args.subreddit || "").replace(/^\/?r\//, "").trim();
  const sort = (args.sort || "relevance").toLowerCase();
  const limit = Math.min(Number(args.limit) || 25, 100);
  const t = args.time ? `&t=${encodeURIComponent(args.time)}` : "";
  const restrict = sub ? "&restrict_sr=1" : "";
  const base = sub ? `/r/${encodeURIComponent(sub)}/search.json` : `/search.json`;
  const r = await fetch(`${base}?q=${encodeURIComponent(q)}&sort=${sort}${t}${restrict}&limit=${limit}&raw_json=1`, { credentials: "include", headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`reddit search failed: HTTP ${r.status}`);
  const j = await r.json();
  const posts = (j.data?.children || []).filter((c) => c.kind === "t3").map((c) => {
    const d = c.data;
    return {
      id: d.id, title: d.title, subreddit: d.subreddit_name_prefixed || ("r/" + d.subreddit), author: "u/" + d.author,
      score: d.score, comments: d.num_comments, created: new Date(d.created_utc * 1000).toISOString(),
      permalink: "https://www.reddit.com" + d.permalink, snippet: (d.selftext || "").slice(0, 200),
    };
  });
  return { query: q, scope: sub ? "r/" + sub : "all of reddit", sort, count: posts.length, posts };
}
