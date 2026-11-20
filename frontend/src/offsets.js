// The server counts characters as Python does (one per code point); JavaScript strings count UTF-16 units,
// so an emoji is 1 there and 2 here. Convert the server's spans before slicing text in the browser.
export function jsSpans(text, findings) {
  if (!/[\uD800-\uDFFF]/.test(text)) return findings // no emoji or other astral characters: same counts
  const at = [0] // at[n] = the UTF-16 position of code point n
  for (const ch of text) at.push(at[at.length - 1] + ch.length)
  const js = (n) => at[Math.min(n, at.length - 1)]
  return findings.map((f) => ({ ...f, spans: f.spans.map(([s, e]) => [js(s), js(e)]) }))
}
