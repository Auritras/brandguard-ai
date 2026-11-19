import { useEffect, useState } from 'react'
import { api, BASE } from '../api.js'
import { csvToRules, download, rulesToCsv } from '../csv.js'
import { Button, Card, Chip, ErrorNote, Field, SEVERITY, inputCls, PageLoading, timeAgo, plural } from '../ui.jsx'

const EMPTY_RULE = { category: 'tone', title: '', text: '', severity: 'medium', patterns: '' }
const EMPTY_FACT = { statement: '', keywords: '', value: '', source: '', valid_until: '' }
const EMPTY_TERM = { banned: '', preferred: '', note: '' }

export default function Library({ user }) {
  useEffect(() => {
    try {
      localStorage.setItem(`bg_library_seen_${user.brand || 'demo'}`, '1')
    } catch {
      /* private window: the checklist just keeps this step open */
    }
  }, [user.brand])
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
        {[['rules', `Rules (${approved.length})`], ['facts', `Approved facts (${lib.facts.length})`], ['terms', `Terms (${lib.terms.length})`], ['visuals', 'Colours and logo']].map(([k, label]) => (
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
              <label className="inline-flex cursor-pointer items-center rounded-md border-2 border-ink bg-card px-3.5 py-1.5 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-ink)] hover:bg-primary-soft">
                Import a spreadsheet (CSV)
                <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  const { rules, problems } = csvToRules(await file.text())
                  if (problems.length && !rules.length) return setError(problems.join(' '))
                  const out = await run(() => api('/rules/bulk', { method: 'POST', body: { rules } }))
                  if (out) setNote(`${plural(out.rules.length, 'rule')} from ${file.name} ${out.rules.length === 1 ? 'is' : 'are'} proposed below, waiting for your approval.${problems.length ? ` Skipped: ${problems.join(' ')}` : ''}`)
                }} />
              </label>
            </div>
          )}
          <div>
            <Button kind="ghost" onClick={() => download(`${(user.brand || 'brand').replace(/[^\w\- ]+/g, '')} rules.csv`, rulesToCsv(lib.rules))}>
              Download the rules as a spreadsheet (CSV)
            </Button>
          </div>

          {importText !== null && (
            <Card className="p-4">
              <Field label="Paste your brand guidelines" hint="Each instruction becomes a proposed rule. Nothing is used in a check until you approve it.">
                <textarea className={`${inputCls} min-h-40`} value={importText} onChange={(e) => setImportText(e.target.value)} />
              </Field>
              <label className="mt-2 block text-sm">
                <span className="font-semibold">Or read them from a file</span> <span className="text-muted">(PDF, Word, text or Markdown, up to 5 MB)</span>
                <input type="file" accept=".pdf,.docx,.txt,.md" className="mt-1 block text-sm" disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    const out = await run(() => api('/extract', { method: 'POST', file }))
                    if (out) setImportText(out.text)
                  }} />
              </label>
              <div className="mt-3 flex gap-2">
                <Button kind="dark" disabled={busy || importText.trim().length < 20}
                  onClick={async () => {
                    const out = await run(() => api('/library/import', { method: 'POST', body: { text: importText } }))
                    if (out) { setNote(`${plural(out.rules.length, 'rule')} proposed. ${out.note}`); setImportText(null) }
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
                      const { id, code, status, checked_by, versions, ...body } = rule
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
            <Card className="border-l-[6px] !border-l-accent p-4">
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

      {tab === 'visuals' && <Visuals visuals={lib.visuals} owner={owner} run={run} setNote={setNote} />}

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

// Brand colours and the official logo, used by image review.
function Visuals({ visuals, owner, run, setNote }) {
  const [colours, setColours] = useState(visuals.palette)
  const valid = (h) => /^#[0-9a-f]{6}$/i.test(h)
  const changed = colours.join() !== visuals.palette.join()
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="font-display text-lg font-bold">Brand colours</h2>
        <p className="mt-1 text-sm text-muted">The main colours of every image are compared with these. White, black and greys always pass.</p>
        <ul className="mt-4 grid gap-2">
          {colours.map((c, i) => (
            <li key={i} className="swatch-in flex items-center gap-2" style={{ '--i': i }}>
              {owner ? (
                <>
                  <input type="color" aria-label={`Colour ${i + 1}`} value={valid(c) ? c : '#000000'} className="h-9 w-12 cursor-pointer rounded border-2 border-line bg-white"
                    onChange={(e) => setColours(colours.map((x, j) => (j === i ? e.target.value : x)))} />
                  <input aria-label={`Colour ${i + 1} as a hex code`} className={`${inputCls} w-32 font-mono`} value={c}
                    onChange={(e) => setColours(colours.map((x, j) => (j === i ? e.target.value.trim() : x)))} />
                  <Button kind="ghost" onClick={() => setColours(colours.filter((_, j) => j !== i))} aria-label={`Remove colour ${c}`}>Remove</Button>
                </>
              ) : (
                <>
                  <span className="h-8 w-12 rounded border border-black/15" style={{ background: c }} />
                  <span className="font-mono text-sm">{c}</span>
                </>
              )}
            </li>
          ))}
          {colours.length === 0 && <li className="text-sm text-muted">No brand colours yet, so image colours are not checked.</li>}
        </ul>
        {owner && (
          <div className="mt-4 flex flex-wrap gap-2">
            {colours.length < 12 && <Button onClick={() => setColours([...colours, '#000000'])}>Add a colour</Button>}
            <Button kind="dark" disabled={!changed || !colours.every(valid)}
              onClick={async () => {
                const out = await run(() => api('/brand/palette', { method: 'PUT', body: { palette: colours } }))
                if (out) setNote('Brand colours saved. Images are checked against them from the next check.')
              }}>Save colours</Button>
          </div>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="font-display text-lg font-bold">Logo</h2>
        <p className="mt-1 text-sm text-muted">When a logo is in an image, its shape and colours are measured against this file.</p>
        {visuals.has_logo ? (
          <img src={BASE + visuals.logo_url} alt="The brand's official logo" className="mt-4 max-h-28 rounded border border-line bg-white p-2" />
        ) : (
          <p className="mt-4 text-sm text-muted">No logo yet.</p>
        )}
        {owner && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-md border-2 border-ink bg-card px-3.5 py-1.5 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-ink)] hover:bg-primary-soft">
              {visuals.has_logo ? 'Replace logo' : 'Upload logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file && await run(() => api('/brand/logo', { method: 'POST', file }))) setNote('Logo saved.')
              }} />
            </label>
            {visuals.has_logo && <Button kind="ghost" onClick={() => run(() => api('/brand/logo', { method: 'DELETE' }))}>Remove logo</Button>}
          </div>
        )}
      </Card>
    </div>
  )
}

// Earlier wordings of a rule, newest first, with why each was changed.
function RuleHistory({ r }) {
  const [rows, setRows] = useState(null)
  return (
    <details className="mt-2 text-sm" onToggle={(e) => { if (e.currentTarget.open && !rows) api(`/rules/${r.id}/history`).then(setRows).catch(() => setRows([])) }}>
      <summary className="cursor-pointer font-semibold text-primary">Earlier wordings ({r.versions})</summary>
      <ol className="mt-2 grid gap-2">
        {(rows || []).map((v) => (
          <li key={v.number} className="border-l-2 border-line pl-3">
            <p className="text-muted line-through decoration-black/30">{v.text}</p>
            <p className="text-xs text-muted">Replaced by {v.by || 'someone'} {timeAgo(v.replaced_at)}{v.note ? ` · ${v.note}` : ''}</p>
          </li>
        ))}
        {rows === null && <li className="text-muted">Loading…</li>}
      </ol>
    </details>
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
        {r.versions > 0 && <RuleHistory r={r} />}
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
