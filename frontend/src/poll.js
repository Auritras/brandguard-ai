// Run fn now and then every few seconds while the page is visible: how the app notices what teammates do
// in another window (a draft sent for review, approved, sent back) without a full live connection.
import { useEffect, useRef } from 'react'

export function usePoll(fn, ms = 10000, deps = []) {
  const saved = useRef(fn)
  saved.current = fn
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') saved.current() }
    const t = setInterval(tick, ms)
    addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); removeEventListener('visibilitychange', tick) }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

// Cards slide to their new places when a list is re-sorted or filtered (FLIP: first, last, invert, play).
export function useFlip(container, deps) {
  const last = useRef(new Map())
  useEffect(() => {
    const el = container.current
    if (!el) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const now = new Map()
    for (const child of el.querySelectorAll('[data-flip]')) {
      const r = child.getBoundingClientRect()
      now.set(child.dataset.flip, r)
      const was = last.current.get(child.dataset.flip)
      if (was && !still && (Math.abs(was.left - r.left) > 1 || Math.abs(was.top - r.top) > 1)) {
        child.animate([{ transform: `translate(${was.left - r.left}px, ${was.top - r.top}px)` }, { transform: 'none' }],
          { duration: 380, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
      }
    }
    last.current = now
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}
