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

export async function api(path, { method = 'GET', body, file, fields, token } = {}) {
  const headers = {}
  const auth = token ? null : getAuth()
  if (token) headers.Authorization = `Bearer ${token}`
  else if (auth?.token) headers.Authorization = `Bearer ${auth.token}`
  let payload
  if (file) {
    payload = new FormData()
    payload.append('file', file)
    for (const [k, v] of Object.entries(fields || {})) payload.append(k, v)
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(BASE + '/api' + path, { method, headers, body: payload })
  } catch {
    throw new Error('Could not reach the server. It may be waking up; try again in a few seconds.')
  }
  if (res.status === 401 && auth) {
    setAuth(null)
    window.location.assign('/')
  }
  // Every API reply is JSON. Anything else (such as the site's own HTML page) means the
  // site is not pointed at the backend, so say so instead of waiting forever.
  if (!(res.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('The site could not reach its server. Check that VITE_API_URL is set and the site was redeployed.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const d = data.detail
    throw new Error(typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : 'Something went wrong.')
  }
  return data
}
