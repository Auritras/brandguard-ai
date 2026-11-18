// Rules to and from a spreadsheet (CSV), so a brand can keep its rules in Excel or Google Sheets.

const COLUMNS = ['category', 'title', 'text', 'severity', 'patterns']

const cell = (v) => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function rulesToCsv(rules) {
  const head = ['code', ...COLUMNS, 'status']
  const rows = rules.map((r) => head.map((k) => cell(r[k])).join(','))
  return '﻿' + [head.join(','), ...rows].join('\r\n') + '\r\n' // the BOM makes Excel read Hindi and emoji correctly
}

// RFC 4180 parsing: quoted cells may hold commas, quotes ("") and line breaks.
export function parseCsv(text) {
  const rows = []
  let row = [], val = '', quoted = false
  text = text.replace(/^﻿/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { val += '"'; i++ }
      else if (c === '"') quoted = false
      else val += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(val); val = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(val); rows.push(row); row = []; val = ''
    } else val += c
  }
  if (val || row.length) { row.push(val); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim()))
}

// Returns { rules, problems }. Needs at least the "title" and "text" columns; the rest have defaults.
export function csvToRules(text) {
  const [head, ...rows] = parseCsv(text)
  if (!head) return { rules: [], problems: ['The file is empty.'] }
  const at = Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase(), i]))
  if (at.title === undefined || at.text === undefined) {
    return { rules: [], problems: ['The first row must name the columns, including "title" and "text". Export the rules first to get a template.'] }
  }
  const problems = []
  const rules = []
  rows.forEach((r, n) => {
    const get = (k, d = '') => (at[k] === undefined ? d : (r[at[k]] ?? '').trim() || d)
    const rule = { category: get('category', 'tone').toLowerCase(), title: get('title'), text: get('text'),
      severity: get('severity', 'medium').toLowerCase(), patterns: get('patterns') }
    if (!rule.title || rule.text.length < 5) problems.push(`Row ${n + 2}: needs a title and a rule of at least 5 characters.`)
    else rules.push(rule)
  })
  return { rules, problems }
}

export function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}
