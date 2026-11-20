// Check many posts at once: paste a content calendar (posts separated by a blank line) or upload a CSV,
// and see a verdict for every post from the instant exact checks. Any post can become a draft, which then
// gets the full check with AI.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { parseCsv } from '../csv.js'
import { Button, Card, ErrorNote, SEVERITY, inputCls, plural } from '../ui.jsx'

const CHANNELS = ['LinkedIn', 'Instagram', 'Email', 'Advertisement', 'Blog', 'Website', 'Document']
const EXAMPLE = `Payday sorted. Lumio Payroll works out salaries and payslips, so you can get back to your customers.

Lumio Pay is India's #1 payroll app, trusted by 10,000 companies. Click here!

Hurry! Prices go up tomorrow and you will regret waiting!

Your payslips for April are ready. Reply to this email if anything looks wrong.`

// Posts from pasted text (a blank line between posts) or a CSV with a "text" column (and optional "channel").
function postsFrom(text, channel) {
  const rows = parseCsv(text)
  const head = rows[0]?.map((h) => h.trim().toLowerCase())
  if (head && head.includes('text') && rows.length > 1) {
    const at = (k) => head.indexOf(k)
    return rows.slice(1).map((r) => ({ text: (r[at('text')] || '').trim(), channel: CHANNELS.find((c) => c.toLowerCase() === (r[at('channel')] || '').trim().toLowerCase()) || channel }))
      .filter((p) => p.text)
  }
  return text.split(/\n\s*\n/).map((t) => ({ text: t.trim(), channel })).filter((p) => p.text)
}

export default function Bulk() {
  const [text, setText] = useState('')
  const [channel, setChannel] = useState('LinkedIn')
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const [skipped, setSkipped] = useState(0) // posts past the first 50, not checked
  const check = async () => {
    const all = postsFrom(text, channel)
    const posts = all.slice(0, 50)
    if (!posts.length) return setError('Paste some posts first: one post per paragraph, with a blank line between posts.')
    setError('')
    setBusy(true)
    setSkipped(all.length - posts.length)
    setRows(posts.map((p) => ({ ...p, found: null })))
    try {
      // One request for the whole calendar.
      const found = await api('/check-many', { method: 'POST', body: { posts: posts.map((p) => ({ body: p.text.slice(0, 20000), channel: p.channel })) } })
      setRows(posts.map((p, i) => ({ ...p, found: found[i] })))
    } catch (e) {
      setError(e.message)
      setRows(null)
    }
    setBusy(false)
  }
  const toDraft = async (row, i) => {
    try {
      const d = await api('/drafts', { method: 'POST', body: { title: `Calendar post ${i + 1}`, channel: row.channel, body: row.text } })
      navigate(`/drafts/${d.id}`, { state: { autoCheck: true } })
    } catch (e) {
      setError(e.message)
    }
  }

  const done = (rows || []).filter((r) => r.found)
  const clean = done.filter((r) => !r.found.length).length
  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline sm:min-h-0">← All drafts</Link>
      <h1 className="mt-2 font-display text-3xl font-bold">Check many posts at once</h1>
      <p className="mt-1 max-w-3xl text-muted">
        Paste a content calendar, one post per paragraph with a blank line between posts, or upload a spreadsheet (CSV) with a
        “text” column. Every post gets the instant exact checks; turn any of them into a draft for the full check with AI.
      </p>

      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold">
            Channel for these posts
            <select className={`${inputCls} mt-1 w-48`} value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border-2 border-ink bg-card px-3.5 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-ink)] hover:bg-primary-soft sm:min-h-9">
            Upload a CSV
            <input type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) setText(await file.text())
            }} />
          </label>
          <Button kind="ghost" onClick={() => setText(EXAMPLE)}>Load an example calendar</Button>
        </div>
        <label className="mt-3 block">
          <span className="sr-only">Posts</span>
          <textarea className={`${inputCls} min-h-40 font-normal`} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'First post…\n\nSecond post…'} />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button kind="primary" onClick={check} disabled={busy}>{busy ? 'Checking…' : 'Check every post'}</Button>
          <span className={`text-sm ${postsFrom(text, channel).length > 50 ? 'font-semibold text-red-800' : 'text-muted'}`}>
            {postsFrom(text, channel).length > 50 ? `${postsFrom(text, channel).length} posts: only the first 50 will be checked` : <>{postsFrom(text, channel).length > 0 && plural(postsFrom(text, channel).length, 'post')} (up to 50)</>}
          </span>
        </div>
        <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
      </Card>

      {rows && (
        <Card className="mt-5 overflow-hidden p-0">
          <p className="border-b-2 border-line px-5 py-3 text-sm" aria-live="polite">
            <span className="font-semibold">{done.length} of {rows.length} checked</span>
            {done.length > 0 && <> · <span className="text-good font-semibold">{clean} fine as written</span> · {done.length - clean} to fix</>}
            {skipped > 0 && <span className="mt-1 block font-semibold text-red-800">Only the first 50 posts were checked; {skipped} more were left out. Check them in a second batch.</span>}
          </p>
          <ol className="divide-y divide-line">
            {rows.map((r, i) => {
              const high = r.found?.filter((f) => f.severity === 'high').length || 0
              return (
                <li key={i} className="deal-in flex flex-wrap items-start gap-4 px-5 py-3" style={{ '--i': i }}>
                  <span className="w-8 shrink-0 font-display text-lg font-bold text-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="text-xs font-semibold text-muted">{r.channel}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm">{r.text}</p>
                    {r.found?.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1">
                        {r.found.slice(0, 6).map((f, k) => (
                          <li key={k} title={f.reason} className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${SEVERITY[f.severity].chip}`}>“{(f.focus || f.quote).length > 30 ? (f.focus || f.quote).slice(0, 30) + '…' : (f.focus || f.quote)}”</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!r.found ? <span aria-hidden="true" className="spinner text-primary" />
                      : r.found.length === 0 ? <span className="pop-in rounded-full border-2 border-good bg-good px-2.5 py-0.5 text-xs font-bold text-white">✓ Fine</span>
                        : <span className="pop-in rounded-full border border-line bg-white px-2.5 py-0.5 text-xs font-bold">{plural(r.found.length, 'problem')}{high ? ` · ${high} high-risk` : ''}</span>}
                    {r.found && <Button kind="ghost" onClick={() => toDraft(r, i)}>Make a draft →</Button>}
                  </div>
                </li>
              )
            })}
          </ol>
        </Card>
      )}
    </div>
  )
}
