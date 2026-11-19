// The pitch, shown rather than told: the same text through both demo brands' rules, side by side.
// Exact checks only (instant, no AI, nothing stored), re-run a moment after you stop typing.
import { useEffect, useState } from 'react'
import { api } from './api.js'
import { SEVERITY } from './ui.jsx'

// Ready-made sentences, so nobody has to type to see the difference.
const PRESETS = [
  ['Drink ad', 'BUY NOW!! Our healthy new mango fizz is the best drink in town. Click here to grab yours.'],
  ['Payroll ad', "Lumio Pay is India's #1 payroll app, trusted by 10,000 companies. Guaranteed accuracy. Click here!"],
  ['Neutral', 'Something new is coming this summer. Sign up on our website to hear about it first.'],
]
const SAMPLE = PRESETS[0][1]
const STYLE = { lumio: 'Calm and careful', fizzbox: 'Loud and playful' }
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function marked(text, findings, lit) {
  const marks = []
  for (const f of findings) for (const [start, end] of f.spans) marks.push({ start, end, f })
  marks.sort((a, b) => a.start - b.start || b.end - a.end)
  // Touching marks of the same finding ("!" and "!" in "!!") become one mark.
  for (let i = marks.length - 1; i > 0; i--) {
    if (marks[i].start === marks[i - 1].end && marks[i].f === marks[i - 1].f) {
      marks[i - 1].end = marks[i].end
      marks.splice(i, 1)
    }
  }
  const out = []
  let pos = 0
  for (const m of marks) {
    if (m.start < pos) continue
    if (m.start > pos) out.push(<span key={`t${pos}`}>{text.slice(pos, m.start)}</span>)
    // Short marks (a "!") are padded and underlined, so they cannot be missed.
    out.push(<mark key={`m${m.start}`} className={`${SEVERITY[m.f.severity].mark} sweep rounded-sm ${m.end - m.start <= 3 ? 'border-b-[3px] border-current px-1' : ''} ${lit === m.f ? 'mark-hover' : ''}`} title={m.f.reason}>{text.slice(m.start, m.end)}</mark>)
    pos = m.end
  }
  if (pos < text.length) out.push(<span key={`t${pos}`}>{text.slice(pos)}</span>)
  return out
}

// A short name for each finding: the rule it breaks, or the term to use instead.
function label(f) {
  const rule = f.reason.match(/breaks the rule "([^"]+)"/)
  if (rule) return `"${f.quote}" · ${rule[1]}`
  if (f.ref_code === 'TERM') return `"${f.quote}" → ${f.suggestion || 'another word'}`
  if (f.ref_code.startsWith('F-')) return 'Wrong figure'
  return f.ref_code
}

export default function CompareBrands() {
  const [text, setText] = useState(SAMPLE)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [lit, setLit] = useState(null) // the finding whose chip is hovered: its passage lights up
  useEffect(() => {
    if (!text.trim()) return setResult(null)
    let stale = false
    const t = setTimeout(() => {
      api('/demo/compare', { method: 'POST', body: { text }, token: 'none' })
        .then((r) => { if (!stale) { setResult(r); setError('') } })
        .catch((e) => { if (!stale) setError(e.message) })
    }, 450)
    return () => { stale = true; clearTimeout(t) }
  }, [text])

  return (
    <section aria-labelledby="compare-title">
      <div className="rounded-xl border-2 border-ink bg-card p-5 shadow-print">
        <h2 id="compare-title" className="font-display text-2xl font-bold">Same words. Two brands. Different verdicts.</h2>
        <p id="compare-help" className="mt-1 text-muted">Edit the sentence: each brand checks it against its own rules as you type.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Example sentences">
          <span className="text-sm text-muted">Try:</span>
          {PRESETS.map(([name, t]) => (
            <button key={name} type="button" onClick={() => setText(t)} aria-pressed={text === t}
              className={`min-h-9 rounded-full border-2 px-3 text-sm font-semibold transition ${text === t ? 'border-ink bg-ink text-paper' : 'border-line bg-white hover:border-ink'}`}>
              {name}
            </button>
          ))}
        </div>
        <label htmlFor="compare-text" className="sr-only">Text to compare</label>
        <div className="mt-4">
          <textarea id="compare-text" aria-describedby="compare-help" value={text} maxLength={1000} rows={2} onChange={(e) => setText(e.target.value)}
            className="w-full resize-y rounded-md border-2 border-line bg-white px-3 py-2 text-base leading-7 focus:border-primary focus:outline-none" />
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
        <div className="mt-4 grid gap-3 md:grid-cols-2" aria-live="polite">
          {(result || [{ key: 'lumio', name: 'Lumio Payroll', findings: [] }, { key: 'fizzbox', name: 'Fizzbox', findings: [] }]).map((b) => (
            <div key={b.key} className="rounded-lg border-2 border-line bg-white p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0"><span className="font-display text-lg font-bold">{b.name}</span> <span className="text-sm text-muted">· {STYLE[b.key]}</span></p>
                <span key={b.findings.length} className={`roll-in shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${b.findings.length ? 'bg-red-50 text-red-800' : 'bg-primary-soft text-primary-deep'}`}>
                  {result ? (b.findings.length ? plural(b.findings.length, 'problem', 'problems') : 'Fine as it is') : '…'}
                </span>
              </div>
              <p key={JSON.stringify(b.findings.map((f) => f.quote))} className="mt-3 text-[15px] leading-7">{result ? marked(text, b.findings, lit) : text}</p>
              {b.findings.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {b.findings.slice(0, 5).map((f, i) => (
                    <li key={i} title={f.reason} tabIndex={0} onMouseEnter={() => setLit(f)} onMouseLeave={() => setLit(null)} onFocus={() => setLit(f)} onBlur={() => setLit(null)}
                      className={`cursor-default rounded-full border px-2 py-0.5 text-xs font-semibold ${SEVERITY[f.severity].chip}`}>{label(f)}</li>
                  ))}
                  {b.findings.length > 5 && <li className="px-1 text-xs text-muted">+{b.findings.length - 5} more</li>}
                </ul>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Instant exact checks only here. Inside the demo, the AI also judges tone, claims and images.</p>
      </div>
    </section>
  )
}
