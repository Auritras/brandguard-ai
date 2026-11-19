// The pitch, shown rather than told: the same text through both demo brands' rules, side by side.
// Exact checks only (instant, no AI, nothing stored), re-run a moment after you stop typing.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { SEVERITY } from './ui.jsx'

// Ready-made sentences, so nobody has to type to see the difference.
const PRESETS = [
  ['Hype post', "OMG!! Our new mango fizz is the most fun you'll have all week. Grab yours today!"],
  ['Drink ad', 'BUY NOW!! Our healthy new mango fizz is the best drink in town. Click here to grab yours.'],
  ['Payroll ad', "Lumio Pay is India's #1 payroll app, trusted by 10,000 companies. Guaranteed accuracy. Click here!"],
  ['Neutral', 'Something new is coming this summer. Sign up on our website to hear about it first.'],
]
const SAMPLE = PRESETS[0][1]
const STYLE = { lumio: 'Calm and careful', fizzbox: 'Loud and playful' }
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function marked(text, findings, lit) {
  const marks = []
  for (const f of findings) for (const [start, end] of f.spans) {
    // A wrong or expired figure: only the number is highlighted, not the whole sentence.
    const inner = f.focus ? text.slice(start, end).indexOf(f.focus) : -1
    marks.push(inner === -1 ? { start, end, f } : { start: start + inner, end: start + inner + f.focus.length, f })
  }
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
  if (f.ref_code.startsWith('F-')) {
    const approved = f.reason.match(/approved figure is ([\d,]+(?:\.\d+)?)/)
    return `"${f.focus || f.quote}" · Wrong figure${approved ? ` (approved: ${approved[1]})` : ''}`
  }
  return f.ref_code
}

export default function CompareBrands({ onTryDemo }) {
  const [text, setText] = useState(SAMPLE)
  const [checked, setChecked] = useState('') // the text the verdicts below belong to
  const [quick, setQuick] = useState(true) // a preset was picked: check at once, without waiting for typing to pause
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  const pending = text !== checked
  const [error, setError] = useState('')
  const [lit, setLit] = useState(null) // the finding whose chip is hovered: its passage lights up
  useEffect(() => {
    if (!text.trim()) return setResult(null)
    let stale = false
    const t = setTimeout(() => {
      api('/demo/compare', { method: 'POST', body: { text }, token: 'none' })
        .then((r) => { if (!stale) { setResult(r); setChecked(text); setError(''); setRetry(0) } })
        .catch((e) => {
          if (stale) return
          setError(e.status === 429 ? e.message : 'Waking the server… the verdicts will appear in a moment.')
          if (e.status !== 429) setRetry((n) => n + 1) // try again shortly while the server starts
        })
    }, retry ? 3000 : quick ? 0 : 350)
    return () => { stale = true; clearTimeout(t) }
  }, [text, quick, retry])
  const pick = (t) => { setQuick(true); setText(t) }
  const type = (t) => { setQuick(false); setText(t) }
  // The box grows with the text, so a long sentence is never cut off behind a scrollbar.
  const box = useRef(null)
  useLayoutEffect(() => {
    const fit = () => {
      const el = box.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + 4}px`
    }
    fit()
    addEventListener('resize', fit) // a narrower screen wraps the text onto more lines
    return () => removeEventListener('resize', fit)
  }, [text])

  return (
    <section aria-labelledby="compare-title">
      <div className="rounded-xl border-2 border-ink bg-card p-5 shadow-print">
        <h2 id="compare-title" className="font-display text-2xl font-bold">Same words. Two brands. Different verdicts.</h2>
        <p id="compare-help" className="mt-1 text-muted">Edit the sentence: each brand checks it against its own rules as you type.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Example sentences">
          <span className="text-sm text-muted">Try:</span>
          {PRESETS.map(([name, t]) => (
            <button key={name} type="button" onClick={() => pick(t)} aria-pressed={text === t}
              className={`min-h-9 rounded-full border-2 px-3 text-sm font-semibold transition ${text === t ? 'border-olive-deep bg-olive-deep text-paper' : 'border-line bg-white text-muted hover:border-ink hover:text-ink'}`}>
              {name}
            </button>
          ))}
        </div>
        <label htmlFor="compare-text" className="sr-only">Text to compare</label>
        <div className="mt-4">
          <textarea id="compare-text" aria-describedby="compare-help" ref={box} value={text} maxLength={1000} rows={2} onChange={(e) => type(e.target.value)}
            className="w-full resize-none overflow-hidden rounded-md border-2 border-line bg-white px-3 py-2 text-base leading-7 focus:border-primary focus:outline-none" />
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
        <div className={`mt-4 grid gap-3 transition-opacity duration-150 md:grid-cols-2 ${pending ? 'opacity-40' : ''}`} aria-live="polite" aria-busy={pending}>
          {(result || [{ key: 'lumio', name: 'Lumio Payroll', findings: [] }, { key: 'fizzbox', name: 'Fizzbox', findings: [] }]).map((b) => (
            <div key={b.key} className="rounded-lg border-2 border-line bg-white p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0"><span className="font-display text-lg font-bold">{b.name}</span> <span className="text-sm text-muted">· {STYLE[b.key]}</span></p>
                <span key={b.findings.length} className={`roll-in flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${!result || b.findings.length ? 'border-line bg-white text-ink' : 'border-good bg-good text-white'}`}>
                  {b.findings.some((f) => f.severity === 'high') && <span aria-hidden="true" className="sev-high h-2 w-2 rounded-full" />}
                  {result ? (b.findings.length ? plural(b.findings.length, 'problem', 'problems') : '✓ Passes') : '…'}
                </span>
              </div>
              <p key={JSON.stringify(b.findings.map((f) => f.quote))} className="mt-3 text-[15px] leading-7">{result ? marked(checked, b.findings, lit) : text}</p>
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">Instant exact checks only here. Inside the demo, the AI also judges tone, claims and images.</p>
          {onTryDemo && (
            <button type="button" onClick={onTryDemo}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-ink bg-primary px-3.5 text-sm font-semibold text-white shadow-print-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none md:hidden">
              Try the full demo →
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
