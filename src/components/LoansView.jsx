import { useEffect, useMemo, useState } from 'react'
import { listComics, lendComic, returnComic } from '../api.js'
import { dueLabel, formatDate, isLoaned, isOverdue, sinceLabel, todayIso } from '../loans.js'

const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// Loans with a due date first, earliest first, so overdue ones end up on top.
// Loans without a due date go last, oldest first. Ties are sorted by title.
function compareLoans(a, b) {
  if (!a.loan_due !== !b.loan_due) return a.loan_due ? -1 : 1
  return (
    compareStrings(a.loan_due, b.loan_due) ||
    compareStrings(a.loan_date, b.loan_date) ||
    (a.title || '').localeCompare(b.title || '', 'pl')
  )
}

function volumeText(comic) {
  if (!comic.volume_number) return ''
  return `tom ${comic.volume_number}${comic.volume_total ? ` z ${comic.volume_total}` : ''}`
}

export default function LoansView({ onOpen }) {
  const [comics, setComics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState('')
  // Returned rows stay listed (muted, with "Cofnij") until the tab is reopened,
  // so the list never jumps under the cursor and the borrower isn't lost.
  const [returnedIds, setReturnedIds] = useState(() => new Set())

  useEffect(() => {
    listComics()
      .then(setComics)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const loans = useMemo(() => comics.filter(isLoaned).sort(compareLoans), [comics])

  // Returns a comic, or restores its original loan when it was just returned.
  async function toggleReturned(comic) {
    const returned = returnedIds.has(comic.id)
    setBusyId(comic.id)
    setActionError('')
    try {
      if (returned) {
        await lendComic(comic.id, {
          to: comic.loan_to,
          date: comic.loan_date,
          due: comic.loan_due,
        })
      } else {
        await returnComic(comic.id)
      }
      setReturnedIds((prev) => {
        const next = new Set(prev)
        if (returned) next.delete(comic.id)
        else next.add(comic.id)
        return next
      })
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusyId('')
    }
  }

  if (loading) return <div className="state">Ładowanie wypożyczeń…</div>
  if (error) return <div className="state error">Błąd: {error}</div>

  const today = todayIso()
  const active = loans.filter((c) => !returnedIds.has(c.id))
  const lateCount = active.filter((c) => isOverdue(c, today)).length

  return (
    <div className="loans-view">
      <div className="loans-head">
        <h1>Wypożyczone</h1>
        {loans.length > 0 && (
          <div className="loans-summary">
            Razem: {active.length}
            {lateCount > 0 && (
              <>
                {' · '}
                <strong>po terminie: {lateCount}</strong>
              </>
            )}
          </div>
        )}
      </div>

      {actionError && <div className="form-error">{actionError}</div>}

      {loans.length === 0 ? (
        <div className="state empty">
          Nic nie jest teraz wypożyczone. Otwórz komiks i kliknij „📤 Wypożycz”.
        </div>
      ) : (
        <ul className="loan-list">
          {loans.map((comic) => {
            const returned = returnedIds.has(comic.id)
            const late = !returned && isOverdue(comic, today)
            const sub = [comic.series, volumeText(comic)].filter(Boolean).join(' · ')
            const rowClass = `loan-row${late ? ' late' : ''}${returned ? ' returned' : ''}`
            return (
              <li key={comic.id} className={rowClass}>
                <button type="button" className="loan-open" onClick={() => onOpen(comic.id)}>
                  <div className="loan-thumb">
                    {comic.cover_path ? (
                      <img src={comic.cover_path} alt="" loading="lazy" />
                    ) : (
                      '📘'
                    )}
                  </div>
                  <div className="loan-cell">
                    <span className="loan-title">{comic.title || '(bez tytułu)'}</span>
                    {sub && <span className="loan-sub">{sub}</span>}
                  </div>
                  <div className="loan-cell">
                    <span className="loan-label">Komu</span>
                    <span>{comic.loan_to}</span>
                  </div>
                  <div className="loan-cell">
                    <span className="loan-label">Od</span>
                    <span>{formatDate(comic.loan_date)}</span>
                    {comic.loan_date && (
                      <span className="loan-hint">{sinceLabel(comic.loan_date, today)}</span>
                    )}
                  </div>
                  <div className="loan-cell">
                    <span className="loan-label">Zwrot do</span>
                    {comic.loan_due ? (
                      <>
                        <span>{formatDate(comic.loan_due)}</span>
                        <span className={`loan-hint${late ? ' late' : ''}`}>
                          {dueLabel(comic.loan_due, today)}
                        </span>
                      </>
                    ) : (
                      <span className="loan-hint">bez terminu</span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  className="ghost loan-row-action"
                  onClick={() => toggleReturned(comic)}
                  disabled={busyId === comic.id}
                >
                  {returned ? '↩ Cofnij' : '✓ Zwrócono'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
