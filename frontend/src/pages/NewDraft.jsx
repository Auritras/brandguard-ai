import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { Button, Card, ErrorNote, Field, inputCls } from '../ui.jsx'
import LiveText from '../LiveText.jsx'

const SAMPLE = {
  title: 'LinkedIn post: new onboarding',
  channel: 'LinkedIn',
  audience: 'Owners of small businesses in India',
  purpose: 'Announce the faster onboarding and get sign-ups for a demo',
  body:
    "Big news!! Lumio Pay is now India's #1 payroll app, trusted by 10,000 companies.\n\n" +
    'Our clients run payroll in 5 minutes, guaranteed. Customers rated us 4.6 out of 5, and unlike slow legacy tools, ' +
    'we never make you wait.\n\n' +
    'Hurry, prices go up soon and you will regret missing out. Click here to book a demo.',
}

export default function NewDraft() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', channel: 'LinkedIn', audience: '', purpose: '', body: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const upload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const { text } = await api('/extract', { method: 'POST', file })
      setForm((f) => ({ ...f, body: text, title: f.title || file.name.replace(/\.[^.]+$/, '') }))
    } catch (err) {
      setError(err.message)
    }
    e.target.value = ''
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const d = await api('/drafts', { method: 'POST', body: form })
      const checked = await api(`/drafts/${d.id}/check`, { method: 'POST' })
      navigate(`/drafts/${checked.id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">New draft</h1>
          <p className="mt-1 text-muted">Paste your content or upload a file. Problems are flagged as you type; the full check runs when you save.</p>
        </div>
        <Button onClick={() => setForm(SAMPLE)}>Load a sample post</Button>
      </div>

      <Card className="mt-6 p-6">
        <form className="grid gap-4" onSubmit={save}>
          <Field label="Title">
            <input className={inputCls} required minLength={2} value={form.title} onChange={set('title')} placeholder="What is this piece?" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Channel">
              <select className={inputCls} value={form.channel} onChange={set('channel')}>
                {['LinkedIn', 'Instagram', 'Email', 'Advertisement', 'Blog', 'Website', 'Document'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Audience">
              <input className={inputCls} value={form.audience} onChange={set('audience')} placeholder="Who will read it?" />
            </Field>
          </div>
          <Field label="Purpose" hint="Suggested fixes are written to keep this purpose.">
            <input className={inputCls} value={form.purpose} onChange={set('purpose')} placeholder="What should this piece achieve?" />
          </Field>
          <Field label="Content">
            <LiveText id="body" required value={form.body} onChange={set('body')} placeholder="Paste the text here…" />
          </Field>
          <Field label="Or upload a file" hint="Text, Markdown, Word (.docx) or PDF, up to 5 MB.">
            <input type="file" accept=".txt,.md,.docx,.pdf" onChange={upload} className="block text-sm" />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex gap-2">
            <Button kind="primary" type="submit" disabled={busy}>
              {busy ? 'Checking…' : 'Save and run check'}
            </Button>
            <Button kind="ghost" type="button" onClick={() => navigate('/')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
