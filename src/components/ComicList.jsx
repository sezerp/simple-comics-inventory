import { useEffect, useMemo, useState } from 'react'
import { listComics, listTags, splitTags } from '../api.js'

export default function ComicList({ onOpen }) {
  const [comics, setComics] = useState([])
  const [tags, setTags] = useState([])
  const [activeTag, setActiveTag] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listComics()
      .then(setComics)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    listTags().then(setTags).catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return comics.filter((c) => {
      if (activeTag && !splitTags(c.tags).includes(activeTag)) return false
      if (q) {
        const hay = [c.title, c.series, c.publisher, c.description]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [comics, activeTag, query])

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'pl')),
    [filtered],
  )

  if (loading) return <div className="state">Ładowanie kolekcji…</div>
  if (error) return <div className="state error">Błąd: {error}</div>

  return (
    <div className="list-view">
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Szukaj tytułu, serii, wydawcy…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {tags.length > 0 && (
        <div className="filter-tags">
          <button
            type="button"
            className={`filter-chip ${!activeTag ? 'active' : ''}`}
            onClick={() => setActiveTag('')}
          >
            Wszystkie ({comics.length})
          </button>
          {tags.map((t) => (
            <button
              key={t.name}
              type="button"
              className={`filter-chip ${activeTag === t.name ? 'active' : ''}`}
              onClick={() => setActiveTag(activeTag === t.name ? '' : t.name)}
            >
              {t.name} ({t.count})
            </button>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="state empty">
          Brak komiksów. Kliknij „Dodaj komiks”, aby zacząć kolekcję.
        </div>
      ) : (
        <div className="comic-grid">
          {sorted.map((comic) => (
            <button
              key={comic.id}
              type="button"
              className="comic-card"
              onClick={() => onOpen(comic.id)}
            >
              <div className="cover">
                {comic.cover_path ? (
                  <img src={comic.cover_path} alt={comic.title} loading="lazy" />
                ) : (
                  <div className="cover-placeholder">📘</div>
                )}
              </div>
              <div className="card-body">
                <h3>{comic.title || '(bez tytułu)'}</h3>
                <div className="card-meta">
                  {comic.year && <span>{comic.year}</span>}
                  {comic.volume_number && (
                    <span>
                      Tom {comic.volume_number}
                      {comic.volume_total ? ` z ${comic.volume_total}` : ''}
                    </span>
                  )}
                </div>
                <div className="card-tags">
                  {splitTags(comic.tags).map((tag) => (
                    <span key={tag} className="mini-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
