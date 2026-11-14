import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Button, Card, Chip, ErrorNote, Field, SEVERITY, inputCls, PageLoading } from '../ui.jsx'

const EMPTY_RULE = { category: 'tone', title: '', text: '', severity: 'medium', patterns: '' }
const EMPTY_FACT = { statement: '', keywords: '', value: '', source: '', valid_until: '' }
const EMPTY_TERM = { banned: '', preferred: '', note: '' }

export default function Library({ user }) {
  const owner = user.role === 'reviewer'
  const [lib, setLib] = useState(null)
  const [tab, setTab] = useState('rules')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [rule, setRule] = useState(null) // rule being added or edited
  const [fact, setFact] = useState(null)
  const [term, setTerm] = useState(null)
  const [importText, setImportText] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => api('/library').then(setLib).catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])

  const run = async (fn) => {
    setBusy(true)
    setError('')
    try {
      const out = await fn()
      await load()
      return out
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  if (!lib) return error ? <ErrorNote>{error}</ErrorNote> : <PageLoading kind="grid" />
  const proposed = lib.rules.filter((r) => r.status === 'proposed')
  const approved = lib.rules.filter((r) => r.status === 'approved')

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Brand Library</h1>
      <p className="mt-1 text-muted">
        The approved sources every draft is checked against.{' '}
        {owner ? 'You own this library.' : 'Only the brand owner can change it.'}
      </p>

      <div role="tablist" aria-label="Library sections" className="mt-5 flex flex-wrap gap-1">
        {[['rules', `Rules (${approved.length})`], ['facts', `Approved facts (${lib.facts.length})`], ['terms', `Terms (${lib.terms.length})`]].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === k ? 'bg-ink text-paper' : 'hover:bg-black/5'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        <ErrorNote>{error}</ErrorNote>
        {note && <p className="rounded-lg border border-line bg-card px-3 py-2 text-sm">{note}</p>}
      </div>

      {tab === 'rules' && (
        <div className="mt-4 grid gap-3">
          {owner && (
            <div className="flex flex-wrap gap-2">
              <Button kind="primary" onClick={() => setRule(EMPTY_RULE)}>Add a rule</Button>
              <Button onClick={() => setImportText('')}>Import from guidelines</Button>
            </div>
          )}

          {importText !== null && (
            <Card className="p-4">
              <Field label="Paste your brand guidelines" hint="Each instruction becomes a proposed rule. Nothing is used in a check until you approve it.">
                <textarea className={`${inputCls} min-h-40`} value={importText} onChange={(e) => setImportText(e.target.value)} />
              </Field>
              <div className="mt-3 flex gap-2">
                <Button kind="dark" disabled={busy || importText.trim().length < 20}
                  onClick={async () => {
                    const out = await run(() => api('/library/import', { method: 'POST', body: { text: importText } }))
                    if (out) { setNote(`${out.rules.length} rule(s) proposed. ${out.note}`); setImportText(null) }
                  }}>
                  {busy ? 'Reading…' : 'Propose rules'}
                </Button>
                <Button kind="ghost" onClick={() => setImportText(null)}>Cancel</Button>
              </div>
            </Card>
          )}

          {rule && (
            <Card className="p-4">
              <h2 className="font-semibold">{rule.id ? `Edit ${rule.code}` : 'New rule'}</h2>
              <div className="mt-3 grid gap-3">
                <Field label="Name"><input className={inputCls} value={rule.title} onChange={(e) => setRule({ ...rule, title: e.target.value })} /></Field>
                <Field label="The rule"><textarea className={inputCls} rows={2} value={rule.text} onChange={(e) => setRule({ ...rule, text: e.target.value })} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Category">
                    <select className={inputCls} value={rule.category} onChange={(e) => setRule({ ...rule, category: e.target.value })}>
                      {['tone', 'claims', 'messaging', 'accessibility'].map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Severity" hint="An open high finding must go to the authorised reviewer.">
                    <select className={inputCls} value={rule.severity} onChange={(e) => setRule({ ...rule, severity: e.target.value })}>
                      {['low', 'medium', 'high'].map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Exact patterns (optional)" hint="One per line. If set, code checks this rule exactly. If empty, AI judges it.">
                  <textarea className={`${inputCls} font-mono`} rows={2} value={rule.patterns} onChange={(e) => setRule({ ...rule, patterns: e.target.value })} />
                </Field>
                <div className="flex gap-2">
                  <Button kind="dark" disabled={busy}
                    onClick={async () => {
                      const { id, code, status, checked_by, ...body } = rule
                      const out = await run(() => api(id ? `/rules/${id}` : '/rules', { method: id ? 'PUT' : 'POST', body }))
                      if (out) setRule(null)
                    }}>
                    Save rule
                  </Button>
                  <Button kind="ghost" onClick={() => setRule(null)}>Cancel</Button>
                </div>
              </div>
            </Card>
          )}

          {proposed.length > 0 && (
            <Card className="!border-accent/50 bg-accent-soft p-4">
              <h2 className="font-semibold">Proposed rules waiting for approval ({proposed.length})</h2>
              <p className="text-sm text-muted">These are not used in any check yet.</p>
              <div className="mt-3 grid gap-2">
                {proposed.map((r) => (
                  <RuleRow key={r.id} r={r} owner={owner} busy={busy} onEdit={() => setRule(r)}
                    onApprove={() => run(() => api(`/rules/${r.id}/approve`, { method: 'POST' }))}
                    onDelete={() => run(() => api(`/rules/${r.id}`, { method: 'DELETE' }))} />
                ))}
              </div>
            </Card>
          )}

          {approved.map((r) => (
            <RuleRow key={r.id} r={r} owner={owner} busy={busy} onEdit={() => setRule(r)}
              onDelete={() => run(() => api(`/rules/${r.id}`, { method: 'DELETE' }))} />
          ))}
        </div>
      )}

      {tab === 'facts' && (
        <div className="mt-4 grid gap-3">
          {owner && <div><Button kind="primary" onClick={() => setFact(EMPTY_FACT)}>Add a fact</Button></div>}
          {fact && (
            <Card className="p-4">
              <h2 className="font-semibold">{fact.id ? `Edit ${fact.code}` : 'New approved fact'}</h2>
              <div className="mt-3 grid gap-3">
                <Field label="The fact"><input className={inputCls} value={fact.statement} onChange={(e) => setFact({ ...fact, statement: e.target.value })} placeholder="Lumio Payroll is used by 8,200 companies." /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Approved number" hint="The figure drafts must match."><input className={inputCls} value={fact.value} onChange={(e) => setFact({ ...fact, value: e.target.value })} placeholder="8,200" /></Field>
                  <Field label="Keywords" hint="Comma separated. A number next to one of these is checked."><input className={inputCls} value={fact.keywords} onChange={(e) => setFact({ ...fact, keywords: e.target.value })} placeholder="companies, customers" /></Field>
                  <Field label="Source"><input className={inputCls} value={fact.source} onChange={(e) => setFact({ ...fact, source: e.target.value })} /></Field>
                  <Field label="Valid until" hint="After this date, drafts using the fact are flagged."><input type="date" className={inputCls} value={fact.valid_until || ''} onChange={(e) => setFact({ ...fact, valid_until: e.target.value })} /></Field>
                </div>
                <div className="flex gap-2">
                  <Button kind="dark" disabled={busy}
                    onClick={async () => {
                      const { id, code, expired, ...body } = fact
                      body.valid_until = body.valid_until || null
                      const out = await run(() => api(id ? `/facts/${id}` : '/facts', { method: id ? 'PUT' : 'POST', body }))
                      if (out) setFact(null)
                    }}>
                    Save fact
                  </Button>
                  <Button kind="ghost" onClick={() => setFact(null)}>Cancel</Button>
                </div>
              </div>
            </Card>
          )}
          {lib.facts.map((f) => (
            <Card key={f.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1 basis-64">
                <p className="font-semibold">{f.code} · {f.statement}</p>
                <p className="mt-1 text-sm text-muted">Source: {f.source || 'not given'} · Valid until {f.valid_until || 'no end date'}</p>
              </div>
              {f.expired && <Chip className="border-red-200 bg-red-50 text-red-800">Expired</Chip>}
              {owner && (
                <div className="flex gap-2">
                  <Button onClick={() => setFact(f)}>Edit</Button>
                  <Button disabled={busy} onClick={() => run(() => api(`/facts/${f.id}`, { method: 'DELETE' }))} aria-label={`Delete ${f.code}`}>Delete</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === 'terms' && (
        <div className="mt-4 grid gap-3">
          {owner && <div><Button kind="primary" onClick={() => setTerm(EMPTY_TERM)}>Add a term</Button></div>}
          {term && (
            <Card className="p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Do not say"><input className={inputCls} value={term.banned} onChange={(e) => setTerm({ ...term, banned: e.target.value })} /></Field>
                <Field label="Say instead"><input className={inputCls} value={term.preferred} onChange={(e) => setTerm({ ...term, preferred: e.target.value })} /></Field>
                <Field label="Note (optional)"><input className={inputCls} value={term.note} onChange={(e) => setTerm({ ...term, note: e.target.value })} /></Field>
              </div>
              <div className="mt-3 flex gap-2">
                <Button kind="dark" disabled={busy}
                  onClick={async () => { const out = await run(() => api('/terms', { method: 'POST', body: term })); if (out) setTerm(null) }}>
                  Save term
                </Button>
                <Button kind="ghost" onClick={() => setTerm(null)}>Cancel</Button>
              </div>
            </Card>
          )}
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr><th className="px-4 py-2.5 font-semibold">Do not say</th><th className="px-4 py-2.5 font-semibold">Say instead</th><th className="px-4 py-2.5 font-semibold">Note</th>{owner && <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}</tr>
              </thead>
              <tbody>
                {lib.terms.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="px-4 py-2.5">{t.banned}</td>
                    <td className="px-4 py-2.5 font-semibold">{t.preferred}</td>
                    <td className="px-4 py-2.5 text-muted">{t.note}</td>
                    {owner && <td className="px-4 py-2.5 text-right"><Button disabled={busy} onClick={() => run(() => api(`/terms/${t.id}`, { method: 'DELETE' }))} aria-label={`Delete term ${t.banned}`}>Delete</Button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  )
}

function RuleRow({ r, owner, busy, onEdit, onApprove, onDelete }) {
  return (
    <Card className="flex flex-wrap items-start gap-3 p-4">
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-semibold">{r.code} · {r.title}</p>
        <p className="mt-1 text-sm">{r.text}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip className={SEVERITY[r.severity].chip}>{SEVERITY[r.severity].label} risk</Chip>
          <Chip className="border-line bg-white capitalize text-ink">{r.category}</Chip>
          <span className="text-xs text-muted">Checked by {r.checked_by === 'code' ? 'exact code' : 'AI, then verified'}</span>
        </div>
      </div>
      {owner && (
        <div className="flex gap-2">
          {onApprove && <Button kind="primary" disabled={busy} onClick={onApprove}>Approve</Button>}
          <Button onClick={onEdit}>Edit</Button>
          <Button disabled={busy} onClick={onDelete} aria-label={`Delete ${r.code}`}>Delete</Button>
        </div>
      )}
    </Card>
  )
}
