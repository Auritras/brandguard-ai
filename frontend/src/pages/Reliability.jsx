import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Card, CountUp, ErrorNote, PageLoading, timeAgo } from '../ui.jsx'

const BRAND = { lumio: 'Lumio Payroll', fizzbox: 'Fizzbox' }
const MODE = {
  exact: ['Exact checks', 'Code only, no AI. Run on every change to the code, and a change that misses a planted problem is blocked.'],
  ai: ['Full check with AI', 'Exact checks plus the AI judgement checks (tone, positioning, competitors, claims). Run when the AI part changes.'],
}
const REPO = 'https://github.com/Auritras/brandguard-ai/tree/main/backend/evals/cases'

export default function Reliability({ user }) {
  const [r, setR] = useState(null)
  const [error, setError] = useState('')
  const [brand, setBrand] = useState(user.demo_key || 'lumio')
  useEffect(() => {
    api('/reliability').then(setR).catch((e) => setError(e.message))
  }, [])
  if (!r) return error ? <ErrorNote>{error}</ErrorNote> : <PageLoading kind="grid" />

  const runs = Object.entries(r.runs).filter(([, run]) => run)
  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Reliability</h1>
      <p className="mt-1 max-w-3xl text-muted">
        How often the check catches what it should. We wrote {r.cases - r.clean} test drafts with problems planted on purpose,
        and {r.clean} with none, then ran each through the same check you use. Missed problems and false alarms are listed below.
      </p>

      <div role="tablist" aria-label="Demo brand" className="mt-5 inline-flex gap-1 rounded-lg border-2 border-line bg-card p-1">
        {Object.entries(BRAND).map(([k, name]) => (
          <button key={k} role="tab" aria-selected={brand === k} onClick={() => setBrand(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${brand === k ? 'bg-ink text-paper' : 'hover:bg-black/5'}`}>
            {name}
          </button>
        ))}
      </div>

      {runs.length === 0 && <Card className="mt-6 p-8 text-center text-muted">No results yet. Run <code>python -m evals.run --save</code> in the backend folder.</Card>}

      <div className="mt-5 grid gap-4 lg:grid-cols-2" key={brand}>
        {runs.map(([mode, run]) => {
          const b = run.brands.find((x) => x.brand === brand)
          if (!b) return null
          const trend = r.history.filter((h) => h.mode === mode && h.brand === brand)
          return (
            <Card key={mode} className="deal-in p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-bold">{MODE[mode][0]}</h2>
                <span className="text-xs text-muted" title={new Date(run.date).toLocaleString()}>
                  Last run {timeAgo(run.date)}{run.commit ? ` · code ${run.commit}` : ''}{run.model ? ` · ${run.model}` : ''}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{MODE[mode][1]}</p>
              <div className="mt-4 flex flex-wrap items-center gap-5">
                <Gauge value={b.catch_rate} label="caught" />
                <dl className="grid flex-1 gap-2 text-sm">
                  <Stat label="Planted problems caught" value={`${b.caught} of ${b.planted}`} />
                  <Stat label="Findings that were real" value={b.precision === null ? '–' : `${b.precision}%`}
                    hint="Of everything it flagged, how much was a planted problem. The rest are false alarms." />
                  <Stat label="Clean drafts left alone" value={`${b.clean_passed} of ${b.clean_drafts}`} />
                  {b.ai_skipped > 0 && <Stat label="Drafts where AI did not run" value={b.ai_skipped} />}
                </dl>
              </div>
              {trend.length > 1 && <Trend points={trend} />}
              <PerRule rows={b.per_rule} />
              <Problems misses={b.misses} extras={b.false_alarm_list} />
            </Card>
          )
        })}
      </div>

      <Card className="mt-6 p-5 text-sm">
        <h2 className="font-display text-lg font-bold">How this is measured</h2>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-muted">
          <li>Each test draft lists the problems planted in it and which rule should catch each one. A catch counts when the check cites that rule on that passage.</li>
          <li>Anything else it flags is counted as a false alarm, even when it might be a fair point. That keeps the score honest.</li>
          <li>The drafts include Hindi, emoji and mixed text, and on-brand hype for Fizzbox that must not be flagged.</li>
          <li>
            The test drafts are public, so anyone can check them:{' '}
            <a className="font-semibold text-primary hover:underline" href={REPO} target="_blank" rel="noreferrer">backend/evals/cases</a>.
          </li>
        </ul>
      </Card>
    </div>
  )
}

function Stat({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 last:border-0" title={hint}>
      <dt className="text-muted">{label}</dt>
      <dd className="whitespace-nowrap font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

// A half-circle meter that sweeps up to the score.
function Gauge({ value, label }) {
  const v = value ?? 0
  const len = Math.PI * 40
  return (
    <div className="relative h-24 w-40 shrink-0" role="img" aria-label={`${v}% ${label}`}>
      <svg viewBox="0 0 100 56" className="h-full w-full" aria-hidden="true">
        <path d="M10 50a40 40 0 0 1 80 0" fill="none" stroke="var(--color-line)" strokeWidth="9" strokeLinecap="round" />
        <path d="M10 50a40 40 0 0 1 80 0" fill="none" stroke={v >= 90 ? 'var(--color-primary)' : 'var(--color-accent)'} strokeWidth="9"
          strokeLinecap="round" className="gauge-sweep" style={{ '--len': len, '--to': len * (1 - v / 100) }} strokeDasharray={len} />
      </svg>
      <p className="absolute inset-x-0 bottom-0 text-center font-display text-3xl font-bold tabular-nums">
        <CountUp value={`${v}%`} />
      </p>
    </div>
  )
}

// The catch rate over past runs, oldest on the left.
function Trend({ points }) {
  const last = points.slice(-20)
  const w = 260, h = 48
  const x = (i) => (last.length === 1 ? w / 2 : (i / (last.length - 1)) * (w - 8) + 4)
  const y = (v) => h - 4 - ((v ?? 0) / 100) * (h - 8)
  const d = last.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.catch_rate).toFixed(1)}`).join(' ')
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-muted">Catch rate over the last {last.length} runs</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-12 w-full max-w-sm" role="img"
        aria-label={`Catch rate per run: ${last.map((p) => `${p.catch_rate}%`).join(', ')}`}>
        <path d={d} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" className="line-draw" pathLength="1" />
        {last.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.catch_rate)} r="2.5" fill="var(--color-primary)"><title>{`${p.catch_rate}% · ${p.commit || ''} · ${new Date(p.date).toLocaleDateString()}`}</title></circle>)}
      </svg>
    </div>
  )
}

function PerRule({ rows }) {
  return (
    <details className="mt-4 rounded-lg border border-line bg-white p-3 text-sm">
      <summary className="cursor-pointer font-semibold">By rule ({rows.length})</summary>
      <ol className="mt-3 grid gap-2">
        {rows.map((r, i) => (
          <li key={r.ref} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2">
            <span className="font-semibold">{r.ref === 'TERM' ? 'Terms' : r.ref}</span>
            <span className="h-2.5 rounded-full bg-black/5">
              <span className={`bar-grow block h-full rounded-full ${r.caught === r.planted ? 'bg-primary' : 'bg-accent'}`}
                style={{ width: `${(r.caught / r.planted) * 100}%`, '--i': i }} />
            </span>
            <span className="text-right tabular-nums">{r.caught}/{r.planted}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

function Problems({ misses, extras }) {
  if (!misses.length && !extras.length) {
    return <p className="mt-4 rounded-lg bg-primary-soft p-3 text-sm font-semibold text-primary-deep">Nothing missed and no false alarms in this run.</p>
  }
  return (
    <div className="mt-4 grid gap-2 text-sm">
      {misses.length > 0 && (
        <details className="rounded-lg border border-accent/40 bg-accent-soft p-3" open>
          <summary className="cursor-pointer font-semibold text-accent-deep">Missed ({misses.length})</summary>
          <ul className="mt-2 grid gap-2">
            {misses.map((m, i) => (
              <li key={i}>
                <span className="font-semibold">{m.case} · {m.ref}</span> should have flagged “{m.quote}”
                {m.body && <span className="mt-0.5 block text-muted">{m.body}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {extras.length > 0 && (
        <details className="rounded-lg border border-line bg-white p-3">
          <summary className="cursor-pointer font-semibold">False alarms ({extras.length})</summary>
          <ul className="mt-2 grid gap-2">
            {extras.map((f, i) => (
              <li key={i}>
                <span className="font-semibold">{f.case} · {f.ref}</span> ({f.source === 'ai' ? 'AI' : 'exact'}) flagged “{f.quote}”
                {f.body && <span className="mt-0.5 block text-muted">{f.body}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
