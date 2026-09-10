async function run(args, ctx) {
  const out = { same_origin: null, cross_origin: null };
  try { const r = await fetch(location.origin + "/", { cache: "no-store" }); out.same_origin = "status " + r.status; } catch (e) { out.same_origin = "blocked: " + e.message; }
  try { const r = await fetch("https://httpbin.org/get", { mode: "no-cors", cache: "no-store" }); out.cross_origin = "went through (type " + r.type + ")"; } catch (e) { out.cross_origin = "blocked: " + e.message; }
  return out;
}
