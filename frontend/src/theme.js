// Light (default), dark, or whatever the device prefers. Saved in this browser.
const KEY = 'bg_theme'
const media = matchMedia('(prefers-color-scheme: dark)')

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'light' } catch { return 'light' }
}

export function applyTheme(choice = getTheme()) {
  const dark = choice === 'dark' || (choice === 'system' && media.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function setTheme(choice) {
  try { localStorage.setItem(KEY, choice) } catch { /* private window: this visit only */ }
  applyTheme(choice)
}

media.addEventListener('change', () => applyTheme())
