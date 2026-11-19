// "Make this a rule": the brand owner selects a phrase in a draft, gets a rule drafted from it (worded by
// the AI, with an exact pattern made in code), edits it, and adds it to the Brand Library.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from './api.js'
import { Button, ErrorNote, Field, inputCls } from './ui.jsx'

export default function MakeRule({ phrase, sentence, onClose }) {
  const [rule, setRule] = useState(null)
  const [error, setError] = useState('')
  const [added, setAdded] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api('/rules/suggest', { method: 'POST', body: { phrase, sentence } }).then(setRule).catch((e) => setError(e.message))
  }, [phrase, sentence])
  const set = (k) => (e) => setRule({ ...rule, [k]: e.target.value })
  const add = async () => {
    setBusy(true)
    setError('')
    try {
      const { by, ...body } = rule // eslint-disable-line no-unused-vars
      setAdded(await api('/rules', { method: 'POST', body }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div role="dialog" aria-label="Make this a rule" className="step-in mt-3 rounded-lg border-2 border-ink bg-white p-4 shadow-print-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-lg font-bold">Make “{phrase}” a rule</p>
        <Button kind="ghost" onClick={onClose}>Close</Button>
      </div>
      {added ? (
        <p role="status" className="mt-2 text-sm">
          <span className="font-semibold">{added.code} added to the Brand Library.</span> Every draft is checked against it from its next check.{' '}
          <Link to="/library" className="font-semibold text-primary hover:underline">See it in the library →</Link>
        </p>
      ) : !rule ? (
        error ? <ErrorNote>{error}</ErrorNote> : <p className="mt-2 flex items-center gap-2 text-sm text-muted"><span aria-hidden="true" className="spinner" /> Drafting a rule…</p>
      ) : (
        <div className="mt-3 grid gap-3">
          <p className="text-xs text-muted">{rule.by === 'ai' ? 'Worded by the AI from the phrase and its sentence; ' : ''}the exact pattern is made from the phrase, so the check catches it every time. Edit anything before adding it.</p>
          <Field label="Name"><input className={inputCls} value={rule.title} onChange={set('title')} /></Field>
          <Field label="The rule"><textarea className={inputCls} rows={2} value={rule.text} onChange={set('text')} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Category">
              <select className={inputCls} value={rule.category} onChange={set('category')}>
                {['tone', 'claims', 'messaging', 'accessibility'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Severity">
              <select className={inputCls} value={rule.severity} onChange={set('severity')}>
                {['low', 'medium', 'high'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Exact pattern"><input className={`${inputCls} font-mono`} value={rule.patterns} onChange={set('patterns')} /></Field>
          </div>
          <ErrorNote>{error}</ErrorNote>
          <div><Button kind="dark" onClick={add} disabled={busy || rule.text.trim().length < 5}>{busy ? 'Adding…' : 'Add the rule'}</Button></div>
        </div>
      )}
    </div>
  )
}
