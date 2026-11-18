import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, BASE, getAuth } from '../api.js'
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

// Fizzbox's sample: hype and capitals are on-brand there; the health claim, the children and the
// calorie number are what its rules catch.
const FIZZ_SAMPLE = {
  title: 'Instagram: mango fizz launch',
  channel: 'Instagram',
  audience: 'Teens and young adults',
  purpose: 'Launch the mango flavour and send fans to stores',
  body:
    "Big news, fizz fam!! Our healthy new mango fizz is HERE and it's the tastiest drink in India. Grab yours NOW.\n\n" +
    "Only 30 calories a can, so it's basically guilt-free. It boosts immunity too, and it's perfect for kids after school. " +
    'Sugar-free fans, we have you covered.\n\n' +
    'Way better than SodaCo, and loved by consumers everywhere. Please be advised that stock is limited. ' +
    'Click here to find a store.',
}

export default function NewDraft({ user }) {
  const sample = user?.demo_key === 'fizzbox' ? FIZZ_SAMPLE : SAMPLE
  const navigate = useNavigate()
  // What is being written is kept in this browser as you type, so a refresh, a closed tab or a crash
  // does not lose it. The last channel and audience are remembered for next time.
  const key = `bg_new_draft_${user?.id || 'x'}`
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
  const blank = { title: '', channel: 'LinkedIn', audience: '', purpose: '', body: '', ...(read('bg_last_channel') || {}) }
  const saved = read(key)
  const [form, setForm] = useState(saved?.body || saved?.title ? { ...blank, ...saved } : blank)
  const [restored, setRestored] = useState(!!(saved?.body || saved?.title))
  const dirty = !!(form.body.trim() || form.title.trim())
  useEffect(() => {
    const t = setTimeout(() => {
      try { if (dirty) localStorage.setItem(key, JSON.stringify(form)); else localStorage.removeItem(key) } catch { /* private window */ }
    }, 400)
    return () => clearTimeout(t)
  }, [form, dirty, key])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Leaving with unsaved images or text: the browser asks first (the text itself is kept anyway).
  useEffect(() => {
    if (!dirty || busy) return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [dirty, busy])
  const [images, setImages] = useState([]) // { file, alt, url } to upload after the draft is saved
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const addImages = (files) => {
    const room = 4 - images.length
    const picked = [...files].filter((f) => f.type.startsWith('image/')).slice(0, room)
    if (files.length > picked.length) setError(room <= 0 ? 'A draft can have up to 4 images.' : 'Only images can be added here (PNG, JPEG, WebP or GIF), up to 4.')
    setImages((list) => [...list, ...picked.map((file) => ({ file, alt: '', url: URL.createObjectURL(file) }))])
  }
  const loadSampleImage = async () => {
    setError('')
    try {
      const res = await fetch(BASE + '/api/sample-image', { headers: { Authorization: `Bearer ${getAuth()?.token}` } })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      addImages([new File([blob], user?.demo_key === 'fizzbox' ? 'mango-fizz-post.png' : 'payroll-banner.png', { type: 'image/png' })])
    } catch {
      setError('The sample image could not be loaded. Try again in a moment.')
    }
  }

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
      try {
        localStorage.removeItem(key)
        localStorage.setItem('bg_last_channel', JSON.stringify({ channel: form.channel, audience: form.audience }))
      } catch { /* private window */ }
      // The draft is saved from here on, so any problem with an image is reported on the draft's page.
      const failed = []
      for (const img of images) {
        await api(`/drafts/${d.id}/images`, { method: 'POST', file: img.file, fields: { alt_text: img.alt } })
          .catch((err) => failed.push(`${img.file.name}: ${err.message}`))
      }
      await api(`/drafts/${d.id}/check`, { method: 'POST' }).catch(() => {})
      navigate(`/drafts/${d.id}`, { state: failed.length ? { note: `The draft was saved, but some images were not added. ${failed.join(' ')}` } : null })
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
        <Button onClick={() => setForm(sample)}>Load a sample post</Button>
      </div>

      {restored && (
        <p role="status" className="step-in mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-3 py-2 text-sm">
          <span>Restored what you were writing before. It is kept in this browser until you save it.</span>
          <button type="button" className="font-semibold text-primary hover:underline"
            onClick={() => { setForm({ ...blank, title: '', body: '', purpose: '' }); setRestored(false) }}>Start blank instead</button>
        </p>
      )}
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
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold">Images <span className="font-normal text-muted">(optional, up to 4)</span></legend>
            <p className="text-xs text-muted">The check reviews each image's colours against your brand palette, the contrast of any text in it, the logo, the text itself, and its description.</p>
            {images.map((img, i) => (
              <div key={img.url} className="flex items-start gap-3 rounded-md border-2 border-line bg-white p-2">
                <img src={img.url} alt="" className="h-16 w-24 shrink-0 rounded object-cover" />
                <label className="min-w-0 flex-1 text-xs font-semibold">
                  Description for screen readers <span className="font-normal text-muted">(leave empty and the check will suggest one)</span>
                  <input className={`${inputCls} mt-1 font-normal`} value={img.alt} maxLength={1000}
                    onChange={(e) => setImages(images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
                    placeholder={img.file.name} />
                </label>
                <Button kind="ghost" type="button" aria-label={`Remove ${img.file.name}`}
                  onClick={() => { URL.revokeObjectURL(img.url); setImages(images.filter((_, j) => j !== i)) }}>Remove</Button>
              </div>
            ))}
            {images.length < 4 && (
              <div className="flex flex-wrap items-center gap-3">
                <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" className="block text-sm"
                  aria-label="Add images" onChange={(e) => { addImages(e.target.files || []); e.target.value = '' }} />
                {user?.demo_brand && <Button type="button" onClick={loadSampleImage}>Add the sample image</Button>}
              </div>
            )}
          </fieldset>
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
