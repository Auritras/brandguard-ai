// One small wrapper around fetch. In production VITE_API_URL points at the backend.
export const BASE = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '')

export function getAuth() {
  try {
    return JSON.parse(localStorage.getItem('bg_auth')) || null
  } catch {
    return null
  }
}

export function setAuth(auth) {
  if (auth) localStorage.setItem('bg_auth', JSON.stringify(auth))
  else localStorage.removeItem('bg_auth')
}

// The token of this browser's demo copy, kept after signing out so the visitor can carry on.
// One saved copy per demo brand ('lumio' also reads the key used before there were two brands).
export function getDemoToken(brand = 'lumio') {
  try {
    return localStorage.getItem(`bg_demo_${brand}`) || (brand === 'lumio' ? localStorage.getItem('bg_demo') : '') || ''
  } catch {
    return ''
  }
}

export function setDemoToken(token, brand = 'lumio') {
  try {
    if (token) localStorage.setItem(`bg_demo_${brand}`, token)
    else localStorage.removeItem(`bg_demo_${brand}`)
  } catch {
    /* private window: each visit starts a fresh copy */
  }
}

// Requests that take a while are announced (the free server sleeps and takes up to a minute to wake),
// so the app can say so instead of looking frozen. See ServerStatus in App.jsx.
const pending = new Set()
export const serverEvents = new EventTarget()
const announce = () => serverEvents.dispatchEvent(new CustomEvent('change', { detail: { slow: [...pending].some((p) => p.slow) } }))

const FIELD = { body: 'Content', title: 'Title', purpose: 'Purpose', audience: 'Audience', channel: 'Channel', text: 'Text',
  reason: 'Reason', note: 'Note', replacement: 'Replacement', alt_text: 'Description', email: 'Email', password: 'Password', name: 'Name', brand: 'Brand name' }
function readable(d) {
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    return d.map((x) => {
      const field = FIELD[x.loc?.[x.loc.length - 1]] || ''
      const max = x.ctx?.max_length
      const msg = max ? `is too long (at most ${max.toLocaleString()} characters)` : (x.msg || '').replace(/^String should /, 'should ').replace(/^Value error, /, '')
      return field ? `${field} ${msg}.` : msg
    }).join(' ')
  }
  return 'Something went wrong.'
}

export async function api(path, { method = 'GET', body, file, fields, token, rev } = {}) {
  const headers = {}
  const auth = token ? null : getAuth()
  if (token && token !== 'none') headers.Authorization = `Bearer ${token}`
  else if (auth?.token) headers.Authorization = `Bearer ${auth.token}`
  if (rev !== undefined && rev !== null) headers['X-Seen-Rev'] = String(rev)
  let payload
  if (file) {
    payload = new FormData()
    payload.append('file', file)
    for (const [k, v] of Object.entries(fields || {})) payload.append(k, v)
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const ticket = { slow: false }
  pending.add(ticket)
  const timer = setTimeout(() => { ticket.slow = true; announce() }, 2500)
  let res
  try {
    // Reading is safe to repeat, so a dropped connection gets one more try before giving up.
    const tries = method === 'GET' ? 2 : 1
    for (let i = 0; i < tries; i++) {
      try {
        res = await fetch(BASE + '/api' + path, { method, headers, body: payload })
        break
      } catch (e) {
        if (i === tries - 1) throw e
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
  } catch {
    const err = new Error(navigator.onLine === false
      ? 'You seem to be offline. Nothing was lost; try again when you are back online.'
      : 'Could not reach the server. It may be waking up; try again in a few seconds.')
    err.status = 0
    throw err
  } finally {
    clearTimeout(timer)
    pending.delete(ticket)
    if (ticket.slow) announce()
  }
  if (res.status === 401 && auth) {
    setAuth(null)
    window.location.assign('/')
  }
  // Every API reply is JSON. Anything else (such as the site's own HTML page) means the
  // site is not pointed at the backend, so say so instead of waiting forever.
  if (!(res.headers.get('content-type') || '').includes('application/json')) {
    const err = new Error(res.status >= 500
      ? 'The server is restarting or busy. Try again in a moment.'
      : 'The site could not reach its server. Check that VITE_API_URL is set and the site was redeployed.')
    err.status = res.status
    throw err
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(readable(data.detail))
    err.status = res.status
    throw err
  }
  return data
}
