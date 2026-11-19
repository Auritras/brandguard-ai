import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Card, CountUp, ErrorNote, PageLoading, SEVERITY, plural } from '../ui.jsx'
import GuidelineGaps from '../GuidelineGaps.jsx'

const OUTCOME_LABEL = {
  open: 'Still open', accepted: 'Fix accepted', edited: 'Own fix written', disputed: 'Disputed, waiting',
  dismissed: 'Dismissed', waived: 'Waived with a reason',
}

export default function Insights({ user }) {
  const [s, setS] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api('/insights').then(setS).catch((e) => setError(e.message))
  }, [])
  if (!s) return error ? <ErrorNote>{error}</ErrorNote> : <PageLoading kind="grid" />

  const fixed = s.outcomes.accepted + s.outcomes.edited
  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Brand health</h1>
      <p className="mt-1 text-muted">What the review record says about {s.scope}: where content goes wrong, and how it gets fixed.</p>

      {s.drafts === 0 ? (
        <Card className="mt-6 p-8 text-center text-muted">No drafts yet. Numbers appear once content has been checked.</Card>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Drafts" value={s.drafts} note={`${s.approved} approved · ${s.in_review} in review`} />
            <Tile label="Findings raised" value={s.findings} note={`${s.high} high-risk · ${s.from_ai} found by AI`} />
            <Tile label="Fixed by the creator" value={s.findings ? `${Math.round((fixed / s.findings) * 100)}%` : '–'}
              note={`${fixed} of ${s.findings} findings`} />
            <Tile label="Average time to approval" value={s.avg_hours_to_approval === null ? '–' : hoursText(s.avg_hours_to_approval)}
              note={s.avg_hours_to_approval === null ? 'Nothing approved yet' : `From first draft to approved, across ${s.approved}`} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card className="p-5">
              <h2 className="font-display text-lg font-bold">Most broken rules</h2>
              <p className="mt-1 text-sm text-muted">Findings per rule, fact or term. A rule at the top may need clearer guidance for writers.</p>
              <Bars rows={s.top_refs.map((r) => ({ key: r.code, label: r.code, sub: r.name, value: r.count }))} unit="finding" />
            </Card>
            <Card className="p-5">
              <h2 className="font-display text-lg font-bold">Findings per draft, by channel</h2>
              <p className="mt-1 text-sm text-muted">Average number of findings in one draft for each channel.</p>
              <Bars rows={s.channels.map((c) => ({ key: c.channel, label: c.channel, sub: `${plural(c.drafts, 'draft')}, ${plural(c.findings, 'finding')}`, value: c.per_draft }))}
                unit="per draft" />
            </Card>
            <Card className="p-5">
              <h2 className="font-display text-lg font-bold">Findings by risk</h2>
              <Split total={s.findings} parts={['high', 'medium', 'low'].map((k) => ({ key: k, label: `${SEVERITY[k].label} risk`, value: s.severity[k], cls: SEVERITY[k].dot }))} />
            </Card>
            <Card className="p-5">
              <h2 className="font-display text-lg font-bold">What happened to each finding</h2>
              <ul className="mt-3 grid gap-1.5 text-sm">
                {Object.entries(s.outcomes).map(([k, n]) => (
                  <li key={k} className="flex justify-between border-b border-line pb-1.5 last:border-0">
                    <span>{OUTCOME_LABEL[k]}</span>
                    <span className="font-semibold tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
      {s.drafts > 0 && <GuidelineGaps user={user} />}
    </div>
  )
}

const hoursText = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h} h` : `${Math.round(h / 24)} days`)

function Tile({ label, value, note }) {
  return (
    <Card className="deal-in p-5">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-1 font-display text-4xl font-bold tabular-nums"><CountUp value={value} /></p>
      <p className="mt-1 text-sm text-muted">{note}</p>
    </Card>
  )
}

// One ranked list of thin bars, single colour; the number sits at the end of each bar.
function Bars({ rows, unit }) {
  if (rows.length === 0) return <p className="mt-4 text-sm text-muted">Nothing yet.</p>
  const max = Math.max(...rows.map((r) => r.value)) || 1
  return (
    <ol className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
      {rows.map((r, i) => (
        <li key={r.key} className="min-w-0" title={`${r.label}: ${r.value} ${unit}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate"><span className="font-semibold">{r.label}</span> <span className="text-muted">{r.sub}</span></span>
            <span className="shrink-0 font-semibold tabular-nums">{r.value}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-black/5">
            <div className="bar-grow h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%`, '--i': i }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

// A single stacked bar split by severity, with a labelled legend so colour is never the only cue.
function Split({ total, parts }) {
  if (!total) return <p className="mt-4 text-sm text-muted">Nothing yet.</p>
  return (
    <>
      <div className="mt-4 flex h-5 gap-0.5 overflow-hidden rounded-md" role="img"
        aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
        {parts.filter((p) => p.value).map((p) => (
          <div key={p.key} className={`${p.cls} h-full`} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <ul className="mt-3 grid gap-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className={`${p.cls} h-3 w-3 rounded-sm border border-black/10`} aria-hidden="true" />
            <span className="flex-1">{p.label}</span>
            <span className="font-semibold tabular-nums">{p.value}</span>
            <span className="w-10 text-right text-muted tabular-nums">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </>
  )
}
