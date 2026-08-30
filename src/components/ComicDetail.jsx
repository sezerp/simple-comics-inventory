import { useEffect, useState } from 'react'
import { getComic, deleteComic, splitTags, splitUrls } from '../api.js'

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
  const urls = splitUrls(comic.image_urls)

  return (
    <div className="detail-view">
      <div className="detail-actions">
        <button type="button" className="ghost" onClick={onBack}>
          ← Wróć
        </button>
        <div>
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
          <h1>{comic.title || '(bez tytułu)'}</h1>
          {comic.series && <div className="series">{comic.series}</div>}

          <dl className="facts">
            {comic.year && (
              <>
                <dt>Rok wydania</dt>
                <dd>{comic.year}</dd>
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
          </dl>

          {tags.length > 0 && (
            <div className="detail-tags">
              {tags.map((tag) => (
                <span key={tag} className="tag-chip static">
                  {tag}
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
