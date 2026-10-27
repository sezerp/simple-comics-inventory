import { loanStatus } from '../loans.js'

// Cover container that marks lent comics: grayscale image + "Wypożyczona"
// badge, and a yellow frame once the suggested return date has passed.
export default function LoanCover({ comic, className, children }) {
  const status = loanStatus(comic)
  const classes = [
    className,
    status && 'cover-loaned',
    status === 'overdue' && 'cover-overdue',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {children}
      {status && <span className="loan-badge">Wypożyczona</span>}
    </div>
  )
}
