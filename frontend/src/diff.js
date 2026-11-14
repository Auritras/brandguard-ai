// Word-level difference between two texts, for comparing draft versions.
// Returns pieces: { text, type: 'same' | 'added' | 'removed' }.
export function diffWords(a, b) {
  const x = a.split(/(\s+)/).filter(Boolean)
  const y = b.split(/(\s+)/).filter(Boolean)
  // Drafts are short; past this size, show the whole change rather than freeze the page.
  if (x.length * y.length > 4_000_000) return [{ text: a, type: 'removed' }, { text: b, type: 'added' }]

  // Longest common subsequence, filled from the end so we can walk forwards.
  const n = x.length, m = y.length
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])

  const out = []
  const push = (text, type) => {
    const last = out[out.length - 1]
    if (last && last.type === type) last.text += text
    else out.push({ text, type })
  }
  let i = 0, j = 0
  while (i < n && j < m) {
    if (x[i] === y[j]) { push(x[i], 'same'); i++; j++ }
    else if (L[i + 1][j] >= L[i][j + 1]) push(x[i++], 'removed')
    else push(y[j++], 'added')
  }
  while (i < n) push(x[i++], 'removed')
  while (j < m) push(y[j++], 'added')
  return out
}
