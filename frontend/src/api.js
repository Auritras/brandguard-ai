// One small wrapper around fetch. In production VITE_API_URL points at the backend.
const BASE = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '')

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

export async function api(path, { method = 'GET', body, file } = {}) {
  const headers = {}
  const auth = getAuth()
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`
  let payload
  if (file) {
    payload = new FormData()
    payload.append('file', file)
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
