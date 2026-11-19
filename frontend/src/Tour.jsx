// A short guided tour, different for each role, shown once per person and brand. It points at the
// real parts of the page (outlined in blue) so a first-time visitor can find their way without help.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const STEPS = {
  creator: [
    { path: '/', target: 'drafts', title: 'You are the writer', text: 'Your drafts are here. An orange bar means one is waiting for you, such as a draft sent back with changes requested.' },
    { path: '/', target: 'new-draft', title: 'Write and check a draft', text: 'Start a new draft: paste text or load the sample post. Problems are underlined as you type; the full check runs when you save.' },
    { path: '/', target: 'drafts', title: 'Images are checked too', text: 'Add an image to a draft and the check measures its colours against the brand palette, the contrast of any text in it, and the logo, reads the text inside it, and suggests a description. Drafts with an image show it on their card.' },
    { path: '/', target: 'drafts', title: 'Handle what it finds', text: 'Open a draft. For each finding, accept the suggested fix, write your own, or dispute it with a reason. Then send it for review.' },
    { path: '/', target: 'act-as', title: 'See the other side', text: 'Use "Act as" to become the manager and review what you sent. Your work stays in this private copy.' },
  ],
  manager: [
    { path: '/', target: 'drafts', title: 'You are the manager', text: 'Drafts waiting for your review come first. Open one to read it with its findings.' },
    { path: '/', target: 'drafts', title: 'Approve, or send back', text: 'Press and hold to approve. If high-risk findings are still open, approving sends the draft to the brand owner to decide. Or request changes with a note.' },
    { path: '/insights', target: 'nav-insights', title: 'Brand health', text: 'What the review record says: which rules are broken most, on which channels, and which rules people keep arguing with.' },
    { path: '/reliability', target: 'nav-reliability', title: 'How reliable is the check?', text: 'Scores from 80 test drafts with problems planted on purpose: what the check catches, and what it misses.' },
  ],
  reviewer: [
    { path: '/', target: 'drafts', title: 'You are the brand owner', text: 'Escalated drafts come first: only you can waive a high-risk finding (with a written reason) or decide a high-risk dispute.' },
    { path: '/library', target: 'nav-library', title: 'You own the Brand Library', text: 'The rules, approved facts, terms, colours and logo every draft is checked against. Import rules from a guideline PDF or a spreadsheet.' },
    { path: '/insights', target: 'nav-insights', title: 'Fix unclear rules', text: 'Under Guideline gaps, rules people keep arguing with are listed with the real cases. Ask for a clearer wording and accept it.' },
    { path: '/reliability', target: 'nav-reliability', title: 'Check the checker', text: 'How often the check catches planted problems, and every miss and false alarm, measured on every change.' },
  ],
}

const keyFor = (user) => `bg_tour_${user.role}_${user.demo_key || user.brand || 'brand'}`

export function tourDone(user) {
  // bg_tours_off: someone who never wants the tour to open by itself (also used by the browser tests).
  try { return localStorage.getItem('bg_tours_off') === '1' || localStorage.getItem(keyFor(user)) === '1' } catch { return true }
}

export function resetTours() {
  try { Object.keys(localStorage).filter((k) => k.startsWith('bg_tour_')).forEach((k) => localStorage.removeItem(k)) } catch { /* private window */ }
}

export default function Tour({ user, open, onClose }) {
  const steps = STEPS[user.role] || []
  const [i, setI] = useState(0)
  const [spot, setSpot] = useState(null) // where the step's target is: everything else is dimmed
  const navigate = useNavigate()
  const location = useLocation()
  const step = steps[i]

  useEffect(() => { if (open) setI(0) }, [open])
  // Go to the step's page, then outline its target once the page has drawn it.
  useEffect(() => {
    if (!open || !step) return
    if (location.pathname !== step.path) navigate(step.path)
    let el = null
    // The spotlight follows the target as the page scrolls or resizes.
    const follow = () => {
      if (!el) return
      const r = el.getBoundingClientRect()
      setSpot({ left: r.left - 8, top: r.top - 8, width: r.width + 16, height: r.height + 16 })
    }
    // Wait for the page to draw the target (and for the drafts to load), up to a few seconds.
    let tries = 0
    let t = setTimeout(function find() {
      el = document.querySelector(`[data-tour="${step.target}"]`)
      if ((!el || el.dataset.loaded === 'false') && ++tries < 12) { el = null; t = setTimeout(find, 300); return }
      if (!el) return setSpot(null)
      // A whole list is too big to spotlight: point at its first item instead.
      if (el.getBoundingClientRect().height > innerHeight * 0.6 && el.firstElementChild) el = el.querySelector('[data-flip]') || el.firstElementChild
      el.classList.add('tour-focus')
      el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
      follow()
    }, 450)
    addEventListener('scroll', follow, true)
    addEventListener('resize', follow)
    return () => { clearTimeout(t); el?.classList.remove('tour-focus'); removeEventListener('scroll', follow, true); removeEventListener('resize', follow) }
  }, [open, i]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !step) return null
  const finish = () => {
    try { localStorage.setItem(keyFor(user), '1') } catch { /* private window */ }
    onClose()
  }
  return (
    <>
    {spot && <div aria-hidden="true" className="tour-spot pointer-events-none fixed z-40 rounded-xl" style={spot} />}
    <div role="dialog" aria-label="Guided tour" aria-live="polite"
      className="toast-in fixed bottom-4 left-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border-2 border-ink bg-card p-4 shadow-print print:hidden"
      onKeyDown={(e) => e.key === 'Escape' && finish()}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Tour · step {i + 1} of {steps.length}</p>
      <h2 key={i} className="step-in mt-1 font-display text-lg font-bold">{step.title}</h2>
      <p key={`t${i}`} className="step-in mt-1 text-sm">{step.text}</p>
      <div className="mt-3 flex items-center gap-1" aria-hidden="true">
        {steps.map((_, k) => <span key={k} className={`h-1.5 flex-1 rounded-full transition-colors ${k <= i ? 'bg-primary' : 'bg-black/10'}`} />)}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button className="text-sm font-semibold text-muted hover:underline" onClick={finish}>Skip the tour</button>
        <span className="flex-1" />
        {i > 0 && <button className="rounded-md px-3 py-1.5 text-sm font-semibold hover:bg-black/5" onClick={() => setI(i - 1)}>Back</button>}
        <button autoFocus className="rounded-md border-2 border-ink bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-print-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          onClick={() => (i + 1 < steps.length ? setI(i + 1) : finish())}>
          {i + 1 < steps.length ? 'Next' : 'Done'}
        </button>
      </div>
    </div>
    </>
  )
}
