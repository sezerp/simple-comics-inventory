import { useEffect, useState } from 'react'
import { getComic, deleteComic, splitTags, splitUrls } from '../api.js'

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to the legacy fallback below
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!value) return
    const ok = await copyToClipboard(value)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <button
      type="button"
      className="copy-btn"
      onClick={handleCopy}
      title={`Kopiuj ${label}`}
      aria-label={`Kopiuj ${label}`}
    >
      {copied ? '✓' : '⧉'}
    </button>
  )
}

export default function ComicDetail({ id, onBack, onEdit, onDeleted }) {
  const [comic, setComic] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    getComic(id)
      .then(setComic)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleDelete() {
    try {
      await deleteComic(id)
      onDeleted()
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div className="state">Ładowanie…</div>
  if (error) return <div className="state error">Błąd: {error}</div>
  if (!comic) return <div className="state">Nie znaleziono komiksu.</div>

  const tags = splitTags(comic.tags)
  const writers = splitTags(comic.writers)
  const artists = splitTags(comic.artists)
  const categories = splitTags(comic.categories)
  const urls = splitUrls(comic.image_urls)

  const googleQuery = [comic.title, comic.isbn].filter(Boolean).join(' ')
  const googleUrl = googleQuery
    ? `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`
    : ''

  return (
    <div className="detail-view">
      <div className="detail-actions">
        <button type="button" className="ghost" onClick={onBack}>
          ← Wróć
        </button>
        <div>
          {googleUrl && (
            <a className="google-btn" href={googleUrl} target="_blank" rel="noreferrer">
              🔍 Szukaj w Google
            </a>
          )}
          <button type="button" className="ghost" onClick={onEdit}>
            Edytuj
          </button>
          {confirming ? (
            <>
              <button type="button" className="danger" onClick={handleDelete}>
                Na pewno?
              </button>
              <button type="button" className="ghost" onClick={() => setConfirming(false)}>
                Anuluj
              </button>
            </>
          ) : (
            <button type="button" className="danger-outline" onClick={() => setConfirming(true)}>
              Usuń
            </button>
          )}
        </div>
      </div>

      <div className="detail-hero">
        <div className="detail-cover">
          {comic.cover_path ? (
            <img src={comic.cover_path} alt={comic.title} />
          ) : (
            <div className="cover-placeholder large">📘</div>
          )}
        </div>

        <div className="detail-info">
          <h1 className="detail-title">
            <span>{comic.title || '(bez tytułu)'}</span>
            {comic.title && <CopyButton value={comic.title} label="tytuł" />}
          </h1>
          {comic.series && (
            <div className="series">
              <span>{comic.series}</span>
              <CopyButton value={comic.series} label="serię" />
            </div>
          )}

          <dl className="facts">
            {comic.year && (
              <>
                <dt>Rok wydania</dt>
                <dd>{comic.year}</dd>
              </>
            )}
            {comic.isbn && (
              <>
                <dt>ISBN</dt>
                <dd className="fact-value">
                  <span>{comic.isbn}</span>
                  <CopyButton value={comic.isbn} label="ISBN" />
                </dd>
              </>
            )}
            {comic.volume_number && (
              <>
                <dt>Tom</dt>
                <dd>
                  {comic.volume_number}
                  {comic.volume_total ? ` z ${comic.volume_total}` : ''}
                </dd>
              </>
            )}
            {comic.publisher && (
              <>
                <dt>Wydawca</dt>
                <dd>{comic.publisher}</dd>
              </>
            )}
            {writers.length > 0 && (
              <>
                <dt>Pisarz</dt>
                <dd>{writers.join(', ')}</dd>
              </>
            )}
            {artists.length > 0 && (
              <>
                <dt>Rysownik / Artysta</dt>
                <dd>{artists.join(', ')}</dd>
              </>
            )}
          </dl>

          {(tags.length > 0 || categories.length > 0) && (
            <div className="detail-tags">
              {tags.map((tag) => (
                <span key={`tag-${tag}`} className="tag-chip static">
                  {tag}
                </span>
              ))}
              {categories.map((cat) => (
                <span key={`cat-${cat}`} className="tag-chip static secondary">
                  {cat}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {comic.description && (
        <section className="detail-section">
          <h2>Opis</h2>
          <p className="description">{comic.description}</p>
        </section>
      )}

      {urls.length > 0 && (
        <section className="detail-section">
          <h2>Zdjęcia z internetu ({urls.length})</h2>
          <div className="gallery">
            {urls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={`Zdjęcie ${i + 1}`} loading="lazy" />
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="detail-meta">
        <span>Dodano: {new Date(comic.created_at).toLocaleString('pl-PL')}</span>
        {comic.updated_at && (
          <span>Zmieniono: {new Date(comic.updated_at).toLocaleString('pl-PL')}</span>
        )}
      </section>
    </div>
  )
}
