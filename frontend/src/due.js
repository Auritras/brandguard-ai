// "Due tomorrow", "Overdue since 3 Dec": how close a draft's due date is, and the colour to show it in.
export function dueLabel(due) {
  if (!due) return { text: '', cls: '' }
  const days = Math.round((new Date(due + 'T23:59:59') - Date.now()) / 86400000)
  const date = new Date(due + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  if (days < 0) return { text: `Overdue since ${date}`, cls: 'text-red-800', days }
  if (days === 0) return { text: 'Due today', cls: 'text-accent-deep', days }
  if (days === 1) return { text: 'Due tomorrow', cls: 'text-accent-deep', days }
  return { text: `Due ${date}`, cls: days <= 3 ? 'text-accent-deep' : '', days }
}
