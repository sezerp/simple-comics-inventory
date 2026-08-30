import { useEffect, useMemo, useState } from 'react'
import { listComics, listTags, splitTags } from '../api.js'

const MAX_VISIBLE_FILTERS = 12
const MAX_SUGGESTIONS = 6

function facetCounts(comics, field) {
  const counts = new Map()
  for (const comic of comics) {
    for (const value of splitTags(comic[field])) {
      if (value) counts.set(value, (counts.get(value) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pl'))
}

function FilterRow({ label, items, active, onToggle }) {
  const [expanded, setExpanded] = useState(false)
  if (!items.length) return null
  const visible = expanded ? items : items.slice(0, MAX_VISIBLE_FILTERS)
  return (
    <div className="filter-group">
      <span className="filter-group-label">{label}</span>
      <div className="filter-tags">
        {visible.map((item) => (
          <button
            key={item.name}
            type="button"
            className={`filter-chip ${active === item.name ? 'active' : ''}`}
            onClick={() => onToggle(active === item.name ? '' : item.name)}
          >
            {item.name}
            {item.count > 1 && <span className="chip-count">{item.count}</span>}
          </button>
        ))}
        {items.length > MAX_VISIBLE_FILTERS && (
          <button
            type="button"
            className="filter-chip more"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '− mniej' : `+ ${items.length - MAX_VISIBLE_FILTERS} więcej`}
          </button>
        )}
      </div>
    </div>
  )
}

export default function ComicList({ onOpen }) {
  const [comics, setComics] = useState([])
  const [tags, setTags] = useState([])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ tag: '', writer: '', artist: '', title: '' })
  const [showSuggestions, setShowSuggestions] = useState(false)
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

  const writers = useMemo(() => facetCounts(comics, 'writers'), [comics])
  const artists = useMemo(() => facetCounts(comics, 'artists'), [comics])
  const titles = useMemo(() => facetCounts(comics, 'title'), [comics])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const includes = (name) => String(name).toLowerCase().includes(q)
    const out = []
    const push = (list, type, label) => {
      let added = 0
      for (const item of list) {
        if (added >= MAX_SUGGESTIONS) break
        if (item.name && includes(item.name)) {
          out.push({ type, label, name: item.name })
          added++
        }
      }
    }
    push(titles, 'title', 'Tytuł')
    push(writers, 'writer', 'Pisarz')
    push(artists, 'artist', 'Rysownik')
    push(tags, 'tag', 'Tag')
    return out
  }, [query, titles, writers, artists, tags])

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }))

  function applySuggestion(s) {
    setFilter(s.type, s.name)
    setQuery('')
    setShowSuggestions(false)
  }

  const activeFilters = [
    filters.title && { key: 'title', label: 'Tytuł', value: filters.title },
    filters.writer && { key: 'writer', label: 'Pisarz', value: filters.writer },
    filters.artist && { key: 'artist', label: 'Rysownik', value: filters.artist },
    filters.tag && { key: 'tag', label: 'Tag', value: filters.tag },
  ].filter(Boolean)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return comics.filter((c) => {
      if (filters.tag && !splitTags(c.tags).includes(filters.tag)) return false
      if (filters.writer && !splitTags(c.writers).includes(filters.writer)) return false
      if (filters.artist && !splitTags(c.artists).includes(filters.artist)) return false
      if (filters.title && c.title !== filters.title) return false
      if (q) {
        const hay = [
          c.title,
          c.series,
          c.publisher,
          c.description,
          c.writers,
          c.artists,
          c.categories,
          c.isbn,
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [comics, filters, query])

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'pl')),
    [filtered],
  )

  const hasAnyFilter = query.trim().length > 0 || activeFilters.length > 0

  if (loading) return <div className="state">Ładowanie kolekcji…</div>
  if (error) return <div className="state error">Błąd: {error}</div>

  return (
    <div className="list-view">
      <div className="toolbar">
        <div className="search-wrap">
          <input
            className="search"
            type="search"
            placeholder="Szukaj tytułu, pisarza, rysownika…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setShowSuggestions(false)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map((s) => (
                <li key={`${s.type}:${s.name}`}>
                  <button
                    type="button"
                    className="suggestion"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySuggestion(s)}
                  >
                    <span className="suggestion-type">{s.label}</span>
                    <span className="suggestion-name">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="active-filters">
          {activeFilters.map((f) => (
            <button
              key={f.key}
              type="button"
              className="active-filter-chip"
              onClick={() => setFilter(f.key, '')}
            >
              {f.label}: {f.value}
              <span className="active-filter-x">×</span>
            </button>
          ))}
          <button
            type="button"
            className="clear-filters"
            onClick={() => setFilters({ tag: '', writer: '', artist: '', title: '' })}
          >
            Wyczyść filtry
          </button>
        </div>
      )}

      <FilterRow
        label="Tagi"
        items={tags}
        active={filters.tag}
        onToggle={(v) => setFilter('tag', v)}
      />
      <FilterRow
        label="Pisarz"
        items={writers}
        active={filters.writer}
        onToggle={(v) => setFilter('writer', v)}
      />
      <FilterRow
        label="Rysownik / Artysta"
        items={artists}
        active={filters.artist}
        onToggle={(v) => setFilter('artist', v)}
      />

      {sorted.length === 0 ? (
        <div className="state empty">
          {hasAnyFilter
            ? 'Brak komiksów dla wybranych kryteriów.'
            : 'Brak komiksów. Kliknij „Dodaj komiks”, aby zacząć kolekcję.'}
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
