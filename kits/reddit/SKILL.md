---
name: reddit
description: Read Reddit from the user's own logged-in session via API for Any Site. Use when the user asks what's on a subreddit, to search Reddit, or to read a thread and its comments. Read-only; never posts or votes.
---

# reddit kit

Runs inside the user's own reddit.com session. Read-only: it lists, searches, and reads. Every call is counted against the kit's daily read cap.

## Typical flow

1. `reddit.list_posts` for a subreddit (or the front page) to see what's active, or `reddit.search` to find posts by query. Both return permalinks.
2. `reddit.read_post` with a permalink to get the post body and its comment tree (flattened, each comment tagged with a `depth`).

## Notes

- `sort: "top"` takes an optional `time` window (day/week/month/year/all).
- Site-wide search omits `subreddit`; add it to search within one.
- Scores and comment counts are live at read time.

## Tools

<!-- tools:begin (generated from manifest.json by scripts/gen-skill.js) -->
- `reddit.list_posts` (subreddit?: string, sort?: string (hot|new|top|best|rising), time?: string (hour|day|week|month|year|all), limit?: integer, max_chars?: integer): List posts from a subreddit, or your front page if none given: title, subreddit, author, score, comment count, permalink, and self-text.
- `reddit.search` (query: string, subreddit?: string, sort?: string (relevance|hot|top|new|comments), time?: string (hour|day|week|month|year|all), limit?: integer): Search Reddit site-wide, or within one subreddit if given. Returns matching posts with a short snippet.
- `reddit.read_post` (permalink: string, sort?: string (top|best|new|controversial), max_comments?: integer, max_chars?: integer): Read one post in full plus its comment tree, by permalink (from list_posts or search). Comments are flattened with a depth number.
<!-- tools:end -->
