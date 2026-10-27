// Loan (wypożyczenie) helpers shared by the React app and the server — keep this
// file free of DOM, JSX and Vite APIs. Dates are local calendar days stored as
// 'YYYY-MM-DD' strings; date math runs on UTC midnights, so timezones and DST
// never shift a day.

const DAY_MS = 86400000

const pad = (n) => String(n).padStart(2, '0')

function utcMs(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// `ms` is always a UTC midnight here, so toISOString() yields the right day.
const isoFromUtcMs = (ms) => new Date(ms).toISOString().slice(0, 10)

// Today's local date. toISOString() would give yesterday's date between
// midnight and 01:00/02:00 in Poland.
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Rejects malformed and impossible dates such as 2026-02-30.
export function isIsoDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    isoFromUtcMs(utcMs(value)) === value
  )
}

export function isLoaned(comic) {
  return Boolean(comic?.loan_to?.trim())
}

// Overdue once the suggested return date has passed (the due day itself is fine).
export function isOverdue(comic, today = todayIso()) {
  return isLoaned(comic) && Boolean(comic.loan_due) && comic.loan_due < today
}

// '' (not lent) | 'loaned' | 'overdue'
export function loanStatus(comic, today = todayIso()) {
  if (!isLoaned(comic)) return ''
  return isOverdue(comic, today) ? 'overdue' : 'loaned'
}

// 'YYYY-MM-DD' → 'DD.MM.YYYY'
export function formatDate(iso) {
  return isIsoDate(iso) ? iso.split('-').reverse().join('.') : iso || ''
}

export function daysBetween(fromIso, toIso) {
  return Math.round((utcMs(toIso) - utcMs(fromIso)) / DAY_MS)
}

export function addDays(iso, days) {
  return isoFromUtcMs(utcMs(iso) + days * DAY_MS)
}

// Clamps to the end of a shorter month: 31.01 + 1 month → 28.02 (29.02 in leap years).
export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m + months, 0)).getUTCDate()
  return isoFromUtcMs(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)))
}

const daysText = (n) => (n === 1 ? '1 dzień' : `${n} dni`)

// How long ago the comic was lent, e.g. "wczoraj", "12 dni temu".
export function sinceLabel(iso, today = todayIso()) {
  if (!isIsoDate(iso)) return ''
  const n = daysBetween(iso, today)
  if (n === 0) return 'dziś'
  if (n === 1) return 'wczoraj'
  return n > 1 ? `${daysText(n)} temu` : `za ${daysText(-n)}`
}

// Time left until the suggested return date, e.g. "za 5 dni", "3 dni po terminie".
export function dueLabel(iso, today = todayIso()) {
  if (!isIsoDate(iso)) return ''
  const n = daysBetween(today, iso)
  if (n === 0) return 'termin dziś'
  if (n === 1) return 'termin jutro'
  return n > 1 ? `za ${daysText(n)}` : `${daysText(-n)} po terminie`
}
