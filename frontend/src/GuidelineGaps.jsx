// Guideline gaps: rules people keep arguing with. Shows the real disagreements, lets the brand owner ask
// the AI for a clearer wording, compare it word by word, edit it and accept it; the rule keeps its history
// and the numbers are shown before and after the change.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from './api.js'
import { diffWords } from './diff.js'
import { Button, Card, ErrorNote, Field, inputCls, timeAgo, plural } from './ui.jsx'

export default function GuidelineGaps({ user }) {
  const [g, setG] = useState(null)
  const [error, setError] = useState('')
  const [found, setFound] = useState(null)
  const [looking, setLooking] = useState(false)
  const owner = user.role === 'reviewer'
  const load = () => api('/insights/gaps').then(setG).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])
  if (!g) return error ? <div className="mt-8"><ErrorNote>{error}</ErrorNote></div> : null

  const unclear = g.rules.filter((r) => r.unclear)
  const changed = g.rules.filter((r) => !r.unclear && r.changed_at)
  const findMissing = async () => {
    setLooking(true)
    setError('')
    try {
      setFound(await api('/insights/gaps/missing', { method: 'POST' }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLooking(false)
    }
  }

  return (
    <section className="mt-10" aria-labelledby="gaps-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="gaps-title" className="font-display text-2xl font-bold">Guideline gaps</h2>
          <p className="mt-1 max-w-3xl text-muted">
            When what a rule flags keeps being waived, dismissed or disputed instead of fixed, the rule is usually unclear.
            These are the rules worth rewriting, with the real cases behind them.
          </p>
        </div>
        {owner && (
          <Button onClick={findMissing} disabled={looking || g.notes < 3}
            title={g.notes < 3 ? 'Needs at least 3 review notes' : `Reads ${g.notes} review notes`}>
            {looking ? <><span aria-hidden="true" className="spinner" /> Reading {g.notes} notes…</> : 'Look for missing rules'}
          </Button>
        )}
      </div>
      <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
      {found && (
        <Card className="mt-3 border-primary/40 bg-primary-soft p-4 text-sm">
          {found.rules.length === 0 ? (
            <p>Read {found.notes} review notes: every recurring problem is already covered by a rule.</p>
          ) : (
            <>
              <p className="font-semibold">From {found.notes} review notes, {plural(found.rules.length, 'rule')} {found.rules.length === 1 ? 'seems' : 'seem'} to be missing. {found.rules.length === 1 ? 'It is' : 'They are'} now proposed in the Brand Library, waiting for your approval.</p>
              <ul className="mt-2 grid gap-1.5">
                {found.rules.map((r) => <li key={r.code}><span className="font-semibold">{r.code} {r.title}:</span> {r.text} <span className="text-muted">{r.because}</span></li>)}
              </ul>
              <Link to="/library" className="mt-2 inline-block font-semibold text-primary hover:underline">Review them in the Brand Library →</Link>
            </>
          )}
        </Card>
      )}

      {unclear.length === 0 && changed.length === 0 && (
        <Card className="mt-4 p-6 text-center text-muted">No rule stands out yet: what the rules flag is mostly fixed, not argued with.</Card>
      )}
      <div className="mt-4 grid gap-4">
        {unclear.map((r, i) => <GapCard key={r.id} r={r} i={i} owner={owner} onSaved={load} />)}
      </div>
      {changed.length > 0 && (
        <>
          <h3 className="mt-6 font-display text-lg font-bold">Rules rewritten after a gap review</h3>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {changed.map((r, i) => <Card key={r.id} className="deal-in p-4" style={{ '--i': i }}><p className="font-semibold">{r.code} · {r.title}</p><p className="mt-1 text-sm">{r.text}</p><BeforeAfter r={r} /></Card>)}
          </div>
        </>
      )}
    </section>
  )
}

function GapCard({ r, i, owner, onSaved }) {
  const [proposal, setProposal] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const ask = async () => {
    setBusy('ask')
    setError('')
    try {
      setProposal(await api(`/rules/${r.id}/suggest-rewrite`, { method: 'POST' }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }
  const accept = async () => {
    setBusy('save')
    setError('')
    try {
      await api(`/rules/${r.id}`, { method: 'PUT', body: {
        category: r.category, severity: r.severity, title: proposal.title, text: proposal.text,
        patterns: r.checked_by === 'code' ? (proposal.patterns || r.patterns) : r.patterns,
        note: `Rewritten after guideline-gap review${proposal.why ? `: ${proposal.why}` : ''}`,
      } })
      setProposal(null)
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }
  const c = r.counts
  return (
    <Card className="deal-in p-5" style={{ '--i': i }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <p className="font-display text-lg font-bold">{r.code} · {r.title}</p>
          <p className="mt-1 text-sm">{r.text}</p>
          <p className="mt-1 text-xs text-muted">Checked by {r.checked_by === 'code' ? 'exact code' : 'AI, then verified'}</p>
        </div>
        <div className="w-56 shrink-0 text-sm">
          <p className="font-semibold"><span className="text-2xl tabular-nums">{r.rate}%</span> argued with</p>
          <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-black/5" role="img"
            aria-label={`${r.friction} of ${r.total} findings waived, dismissed or disputed`}>
            <span className="bar-grow h-full bg-accent" style={{ width: `${r.rate}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {r.friction} of {r.total} findings: {c.waived} waived, {c.dismissed} dismissed, {c.disputed + c.upheld} disputed · {c.accepted + c.edited} fixed
          </p>
        </div>
      </div>
      <h3 className="mt-4 text-sm font-semibold">What people disagreed with</h3>
      <ul className="mt-2 grid gap-2 text-sm">
        {r.examples.map((e, j) => (
          <li key={j} className="rounded-md border border-line bg-white p-2.5">
            <p>“{e.quote}” <span className="text-muted">· {e.outcome} · </span>
              <Link to={`/drafts/${e.draft_id}`} className="font-semibold text-primary hover:underline">{e.draft_title}</Link></p>
            {e.note && <p className="mt-1 text-muted">{e.note}</p>}
          </li>
        ))}
      </ul>
      {r.changed_at && <BeforeAfter r={r} />}
      <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
      {owner && !proposal && (
        <Button className="mt-3" kind="primary" onClick={ask} disabled={!!busy}>
          {busy === 'ask' ? <><span aria-hidden="true" className="spinner" /> Writing a clearer rule…</> : 'Suggest a clearer rule'}
        </Button>
      )}
      {proposal && (
        <div className="step-in mt-4 rounded-lg border-2 border-ink bg-white p-4">
          <p className="text-sm font-semibold">Suggested rewrite</p>
          {proposal.why && <p className="mt-1 text-sm text-muted">{proposal.why}</p>}
          <p className="mt-3 rounded-md bg-paper p-2.5 text-sm leading-6" aria-label="Changes from the current wording">
            {diffWords(r.text, proposal.text).map((p, k) =>
              p.type === 'same' ? <span key={k}>{p.text}</span>
                : p.type === 'added' ? <ins key={k} className="diff-added">{p.text}</ins>
                  : <del key={k} className="diff-removed">{p.text}</del>)}
          </p>
          <div className="mt-3 grid gap-3">
            <Field label="Name"><input className={inputCls} value={proposal.title} onChange={(e) => setProposal({ ...proposal, title: e.target.value })} /></Field>
            <Field label="Rule"><textarea className={inputCls} rows={3} value={proposal.text} onChange={(e) => setProposal({ ...proposal, text: e.target.value })} /></Field>
            {r.checked_by === 'code' && (
              <Field label="Exact patterns" hint="One per line. Leave as is to keep the current patterns.">
                <textarea className={`${inputCls} font-mono`} rows={2} value={proposal.patterns || r.patterns}
                  onChange={(e) => setProposal({ ...proposal, patterns: e.target.value })} />
              </Field>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button kind="dark" onClick={accept} disabled={!!busy || proposal.text.trim().length < 5}>
              {busy === 'save' ? 'Saving…' : 'Use this wording'}
            </Button>
            <Button kind="ghost" onClick={() => setProposal(null)}>Keep the current rule</Button>
          </div>
          <p className="mt-2 text-xs text-muted">The old wording is kept in the rule's history. New checks use the new wording.</p>
        </div>
      )}
    </Card>
  )
}

function BeforeAfter({ r }) {
  const row = (label, x) => (
    <div className="flex-1 rounded-md border border-line bg-white p-2.5">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="font-display text-xl font-bold tabular-nums">{x.rate === null ? '–' : `${x.rate}%`}</p>
      <p className="text-xs text-muted">{x.total ? `${x.friction} of ${x.total} argued with` : 'No findings yet'}</p>
    </div>
  )
  return (
    <div className="mt-3 text-sm">
      <p className="text-xs text-muted">Rewritten {timeAgo(r.changed_at)}.</p>
      <div className="mt-1 flex gap-2">{row('Before the rewrite', r.before)}{row('Since', r.after)}</div>
    </div>
  )
}
