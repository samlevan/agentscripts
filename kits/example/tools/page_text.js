async function run(args, ctx) {
  const max = Number(args.max_chars) || 2000;
  const text = (document.body && document.body.innerText || "").replace(/\s+\n/g, "\n").trim();
  return { url: location.href, chars: text.length, text: text.slice(0, max) };
}
