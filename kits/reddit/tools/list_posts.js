// Lists posts from a subreddit (or your front page) via Reddit's own JSON, same-origin, from your session.
async function run(args) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sub = String(args.subreddit || "").replace(/^\/?r\//, "").trim();
  const sort = (args.sort || "hot").toLowerCase();
  const limit = Math.min(Number(args.limit) || 25, 100);
  const t = args.time ? `&t=${encodeURIComponent(args.time)}` : "";
  const base = sub ? `/r/${encodeURIComponent(sub)}/${sort}.json` : `/${sort}.json`;
  const r = await fetch(`${base}?limit=${limit}${t}&raw_json=1`, { credentials: "include", headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`reddit listing failed: HTTP ${r.status} (are you signed in to reddit.com in this tab?)`);
  const j = await r.json();
  const posts = (j.data?.children || []).filter((c) => c.kind === "t3").map((c) => {
    const d = c.data;
    return {
      id: d.id, title: d.title, subreddit: d.subreddit_name_prefixed || ("r/" + d.subreddit),
      author: "u/" + d.author, score: d.score, comments: d.num_comments,
      created: new Date(d.created_utc * 1000).toISOString(),
      permalink: "https://www.reddit.com" + d.permalink,
      link: d.is_self ? null : (d.url_overridden_by_dest || d.url),
      is_self: d.is_self, text: d.is_self ? (d.selftext || "").slice(0, Number(args.max_chars) || 500) : null,
      flair: d.link_flair_text || null, over_18: d.over_18,
    };
  });
  return { source: sub ? "r/" + sub : "front page", sort, count: posts.length, posts };
}
