import { useEffect, useMemo, useState } from 'react'
import { listComics } from '../api.js'
import ComicCard from './ComicCard.jsx'

function tomLabel(n) {
  if (n === 1) return '1 tom'
  const d = n % 10
  const h = n % 100
  if (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) return `${n} tomy`
  return `${n} tomów`
}

export default function SeriesView({ onOpen }) {
  const [comics, setComics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [activeSeries, setActiveSeries] = useState('')

  useEffect(() => {
    listComics()
      .then(setComics)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const seriesGroups = useMemo(() => {
    const map = new Map()
    for (const comic of comics) {
      const name = (comic.series || '').trim()
      if (!name) continue
      if (!map.has(name)) map.set(name, [])
      map.get(name).push(comic)
    }
    for (const volumes of map.values()) {
      volumes.sort((a, b) => {
        const na = Number(a.volume_number)
        const nb = Number(b.volume_number)
        if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
        return a.title.localeCompare(b.title, 'pl')
      })
    }
    return [...map.entries()]
      .map(([name, volumes]) => ({
        name,
        volumes,
        cover: volumes.find((v) => v.cover_path) || volumes[0],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
  }, [comics])

  const unseriedCount = useMemo(
    () => comics.filter((c) => !(c.series || '').trim()).length,
    [comics],
  )

  if (loading) return <div className="state">Ładowanie serii…</div>
  if (error) return <div className="state error">Błąd: {error}</div>

  if (activeSeries) {
    const group = seriesGroups.find((g) => g.name === activeSeries)
    if (!group) {
      return (
        <div className="series-view">
          <div className="detail-actions">
            <button type="button" className="ghost" onClick={() => setActiveSeries('')}>
              ← Serie
            </button>
          </div>
          <div className="state empty">Nie znaleziono serii.</div>
        </div>
      )
    }
    return (
      <div className="series-view">
        <div className="detail-actions">
          <button type="button" className="ghost" onClick={() => setActiveSeries('')}>
            ← Serie
          </button>
          <span className="series-count">{tomLabel(group.volumes.length)}</span>
        </div>
        <h1 className="series-heading">{group.name}</h1>
        <div className="comic-grid">
          {group.volumes.map((comic) => (
            <ComicCard key={comic.id} comic={comic} onOpen={onOpen} />
          ))}
        </div>
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const visibleGroups = q
    ? seriesGroups.filter((g) => g.name.toLowerCase().includes(q))
    : seriesGroups

  return (
    <div className="series-view">
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Szukaj serii…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {visibleGroups.length === 0 ? (
        <div className="state empty">
          {seriesGroups.length === 0
            ? 'Brak serii. Uzupełnij pole „Seria”, aby pogrupować komiksy.'
            : 'Brak serii dla wybranego zapytania.'}
        </div>
      ) : (
        <div className="series-grid">
          {visibleGroups.map((group) => (
            <button
              key={group.name}
              type="button"
              className="series-card"
              onClick={() => setActiveSeries(group.name)}
            >
              <div className="cover">
                {group.cover?.cover_path ? (
                  <img src={group.cover.cover_path} alt={group.name} loading="lazy" />
                ) : (
                  <div className="cover-placeholder">📚</div>
                )}
              </div>
              <div className="series-card-body">
                <h3>{group.name}</h3>
                <div className="series-count">{tomLabel(group.volumes.length)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {unseriedCount > 0 && (
        <div className="series-hint">
          {unseriedCount} komiks(ów) bez przypisanej serii nie jest tu pokazywanych.
        </div>
      )}
    </div>
  )
}
