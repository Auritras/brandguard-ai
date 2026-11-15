import { useState } from 'react'
import { api } from '../api.js'
import { Button, Card, ErrorNote, Field, inputCls } from '../ui.jsx'

const ROLES = { creator: 'Creator', manager: 'Manager', reviewer: 'Brand owner' }

export default function Account({ user }) {
  const [form, setForm] = useState({ current: '', new: '', again: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setError('')
    setDone(false)
    if (form.new !== form.again) return setError('The two new passwords do not match.')
    setBusy(true)
    try {
      await api('/me/password', { method: 'PUT', body: { current: form.current, new: form.new } })
      setDone(true)
      setForm({ current: '', new: '', again: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-3xl font-bold">Your account</h1>
      <Card className="mt-6 p-5">
        <dl className="grid gap-2 text-sm">
          <div className="flex gap-2"><dt className="w-20 font-semibold">Name</dt><dd>{user.name}</dd></div>
          <div className="flex gap-2"><dt className="w-20 font-semibold">Email</dt><dd className="break-all">{user.email}</dd></div>
          <div className="flex gap-2"><dt className="w-20 font-semibold">Role</dt><dd>{ROLES[user.role]}</dd></div>
          <div className="flex gap-2"><dt className="w-20 font-semibold">Brand</dt><dd>{user.brand || 'Lumio Payroll'}</dd></div>
        </dl>
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-xl font-bold">Change password</h2>
        {user.demo_brand ? (
          <p className="mt-2 text-sm text-muted">
            Demo people have no password: you reach them from the demo, and switch between them with "Act as" at the
            top. Create your own brand from the sign-in page to have an account of your own.
          </p>
        ) : (
          <form className="mt-4 grid gap-3" onSubmit={save}>
            <Field label="Current password">
              <input className={inputCls} type="password" autoComplete="current-password" required value={form.current} onChange={set('current')} />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <input className={inputCls} type="password" autoComplete="new-password" required minLength={8} value={form.new} onChange={set('new')} />
            </Field>
            <Field label="New password again">
              <input className={inputCls} type="password" autoComplete="new-password" required minLength={8} value={form.again} onChange={set('again')} />
            </Field>
            <ErrorNote>{error}</ErrorNote>
            {done && <p role="status" className="text-sm font-semibold text-primary-deep">Password changed. Use the new one next time you sign in.</p>}
            <div><Button kind="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button></div>
          </form>
        )}
      </Card>
    </div>
  )
}
