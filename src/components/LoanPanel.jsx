import { useId, useState } from 'react'
import { lendComic, returnComic } from '../api.js'
import {
  addDays,
  addMonths,
  dueLabel,
  formatDate,
  isLoaned,
  isOverdue,
  sinceLabel,
  todayIso,
} from '../loans.js'

// Lend / edit / return panel in the comic detail view. Errors are shown here,
// because ComicDetail's own error state would replace the whole view.
export default function LoanPanel({ comic, onChange }) {
  const dueId = useId()
  // null = not editing; otherwise the form values { to, date, due }.
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The loan that was just returned, so "Cofnij" can restore it.
  const [lastLoan, setLastLoan] = useState(null)

  const today = todayIso()
  const loaned = isLoaned(comic)
  const overdue = isOverdue(comic, today)

  function openForm() {
    setDraft({
      to: comic.loan_to || '',
      date: comic.loan_date || today,
      due: comic.loan_due || '',
    })
    setError('')
    setLastLoan(null)
  }

  function setDraftField(key, value) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function run(request, onSuccess) {
    setBusy(true)
    setError('')
    try {
      onChange(await request())
      onSuccess()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const to = draft.to.trim()
    if (!to) {
      setError('Podaj, komu wypożyczasz komiks.')
      return
    }
    if (draft.due && draft.date && draft.due < draft.date) {
      setError('Termin zwrotu nie może być wcześniejszy niż data wypożyczenia.')
      return
    }
    run(() => lendComic(comic.id, { ...draft, to }), () => setDraft(null))
  }

  function handleReturn() {
    const previous = { to: comic.loan_to, date: comic.loan_date, due: comic.loan_due }
    run(() => returnComic(comic.id), () => setLastLoan(previous))
  }

  function handleUndo() {
    run(() => lendComic(comic.id, lastLoan), () => setLastLoan(null))
  }

  if (draft) {
    // Quick due-date buttons count from the lend date.
    const base = draft.date || today
    return (
      <div className="loan-panel">
        <form className="fields-panel loan-form" onSubmit={handleSubmit}>
          <div className="loan-form-title">
            {loaned ? 'Edytuj wypożyczenie' : 'Wypożycz komiks'}
          </div>
          <label>
            Komu *
            <input
              type="text"
              value={draft.to}
              maxLength={200}
              autoFocus
              required
              onChange={(e) => setDraftField('to', e.target.value)}
            />
          </label>
          <label>
            Kiedy
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraftField('date', e.target.value)}
            />
          </label>
          <div className="loan-field">
            <label htmlFor={dueId}>Do kiedy (opcjonalnie)</label>
            <div className="loan-due">
              <input
                id={dueId}
                type="date"
                value={draft.due}
                min={draft.date || undefined}
                onChange={(e) => setDraftField('due', e.target.value)}
              />
              <button
                type="button"
                className="loan-quick"
                onClick={() => setDraftField('due', addDays(base, 14))}
              >
                +2 tyg.
              </button>
              <button
                type="button"
                className="loan-quick"
                onClick={() => setDraftField('due', addMonths(base, 1))}
              >
                +1 mies.
              </button>
              {draft.due && (
                <button
                  type="button"
                  className="loan-quick"
                  onClick={() => setDraftField('due', '')}
                  title="Usuń termin zwrotu"
                  aria-label="Usuń termin zwrotu"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          {error && <div className="loan-error">{error}</div>}
          <div className="loan-actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Zapisywanie…' : 'Zapisz'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setDraft(null)}
              disabled={busy}
            >
              Anuluj
            </button>
          </div>
        </form>
      </div>
    )
  }

  if (loaned) {
    return (
      <div className="loan-panel">
        <section className={`loan-box${overdue ? ' late' : ''}`}>
          <div className="loan-box-title">
            {overdue ? '⚠️ Wypożyczona — minął termin zwrotu' : '📤 Wypożyczona'}
          </div>
          <dl className="facts">
            <dt>Komu</dt>
            <dd>{comic.loan_to}</dd>
            {comic.loan_date && (
              <>
                <dt>Od</dt>
                <dd>
                  {formatDate(comic.loan_date)}{' '}
                  <span className="loan-hint">({sinceLabel(comic.loan_date, today)})</span>
                </dd>
              </>
            )}
            <dt>Zwrot do</dt>
            <dd>
              {comic.loan_due ? (
                <>
                  {formatDate(comic.loan_due)}{' '}
                  <span className={`loan-hint${overdue ? ' late' : ''}`}>
                    ({dueLabel(comic.loan_due, today)})
                  </span>
                </>
              ) : (
                <span className="loan-hint">bez terminu</span>
              )}
            </dd>
          </dl>
          {error && <div className="loan-error">{error}</div>}
          <div className="loan-actions">
            <button
              type="button"
              className="ghost"
              onClick={openForm}
              disabled={busy}
              aria-label="Edytuj wypożyczenie"
            >
              Edytuj
            </button>
            <button type="button" className="primary" onClick={handleReturn} disabled={busy}>
              ✓ Zwrócono
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="loan-panel">
      <button type="button" className="ghost" onClick={openForm} disabled={busy}>
        📤 Wypożycz
      </button>
      {lastLoan && (
        <div className="loan-undo">
          Zwrócono.{' '}
          <button type="button" onClick={handleUndo} disabled={busy}>
            ↩ Cofnij
          </button>
        </div>
      )}
      {error && <div className="loan-error">{error}</div>}
    </div>
  )
}
