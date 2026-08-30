import { useEffect, useState } from 'react'
import {
  createComic,
  updateComic,
  getComic,
  listTags,
  recognizeImage,
  splitTags,
  splitUrls,
} from '../api.js'
import TagInput from './TagInput.jsx'

const EMPTY_FORM = {
  title: '',
  series: '',
  volume_number: '',
  volume_total: '',
  year: '',
  isbn: '',
  publisher: '',
  description: '',
}

function imageUrlsFrom(links = {}) {
  const order = [
    'extraLarge',
    'large',
    'medium',
    'small',
    'thumbnail',
    'smallThumbnail',
  ]
  return order.map((k) => links[k]).filter(Boolean).slice(0, 10)
}

export default function ComicForm({ id, onDone, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [tags, setTags] = useState([])
  const [writers, setWriters] = useState([])
  const [artists, setArtists] = useState([])
  const [categories, setCategories] = useState([])
  const [imageUrls, setImageUrls] = useState([])
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [existingCover, setExistingCover] = useState('')
  const [allTags, setAllTags] = useState([])

  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [ocrResult, setOcrResult] = useState(null)
  const [ocrError, setOcrError] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    listTags()
      .then((t) => setAllTags(t.map((x) => x.name)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    getComic(id)
      .then((comic) => {
        setForm({
          title: comic.title,
          series: comic.series,
          volume_number: comic.volume_number,
          volume_total: comic.volume_total,
          year: comic.year,
          isbn: comic.isbn,
          publisher: comic.publisher,
          description: comic.description,
        })
        setTags(splitTags(comic.tags))
        setWriters(splitTags(comic.writers))
        setArtists(splitTags(comic.artists))
        setCategories(splitTags(comic.categories))
        setImageUrls(splitUrls(comic.image_urls))
        setExistingCover(comic.cover_path || '')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    setCoverPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    runOcr(file)
  }

  async function runOcr(file) {
    setRecognizing(true)
    setOcrResult(null)
    setOcrError('')
    const fd = new FormData()
    fd.append('image', file)
    try {
      const result = await recognizeImage(fd)
      setOcrResult(result)
    } catch (e) {
      setOcrError(e.message)
    } finally {
      setRecognizing(false)
    }
  }

  function applySuggestion(s) {
    setForm((f) => ({
      ...f,
      title: s.title || f.title,
      series: s.series || f.series,
      volume_number: s.volumeNumber || f.volume_number,
      volume_total: s.volumeTotal || f.volume_total,
      year: s.publishedDate ? s.publishedDate.slice(0, 4) : f.year,
      isbn: s.isbn || f.isbn,
      publisher: s.publisher || f.publisher,
      description: s.description || f.description,
    }))
    if (s.writers?.length) {
      setWriters((prev) => [...new Set([...prev, ...s.writers])])
    }
    if (s.artists?.length) {
      setArtists((prev) => [...new Set([...prev, ...s.artists])])
    }
    if (s.categories?.length) {
      setCategories((prev) => [...new Set([...prev, ...s.categories])])
    }
    const urls = s.imageUrls?.length ? s.imageUrls : imageUrlsFrom(s.imageLinks)
    if (urls.length) setImageUrls((prev) => [...new Set([...prev, ...urls])].slice(0, 10))
  }

  function applyGeminiDescription() {
    if (ocrResult?.geminiDescription) {
      setForm((f) => ({ ...f, description: ocrResult.geminiDescription }))
    }
  }

  function setImageUrl(index, value) {
    setImageUrls((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function removeImageUrl(index) {
    setImageUrls((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('Tytuł jest wymagany.')
      return
    }
    setSaving(true)
    setError('')

    const fd = new FormData()
    for (const [key, value] of Object.entries(form)) {
      fd.append(key, value ?? '')
    }
    fd.append('tags', JSON.stringify(tags))
    fd.append('writers', JSON.stringify(writers))
    fd.append('artists', JSON.stringify(artists))
    fd.append('categories', JSON.stringify(categories))
    fd.append('image_urls', JSON.stringify(imageUrls))
    if (coverFile) fd.append('cover', coverFile)

    try {
      if (id) await updateComic(id, fd)
      else await createComic(fd)
      onDone()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="state">Ładowanie…</div>

  return (
    <form className="comic-form" onSubmit={handleSubmit}>
      <div className="form-head">
        <h1>{id ? 'Edytuj komiks' : 'Dodaj komiks'}</h1>
        <div>
          <button type="button" className="ghost" onClick={onCancel}>
            Anuluj
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Zapisywanie…' : 'Zapisz'}
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-layout">
        <div className="photo-panel">
          <label className="dropzone">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
            />
            {coverPreview || existingCover ? (
              <img
                src={coverPreview || existingCover}
                alt="Okładka"
                className="cover-preview"
              />
            ) : (
              <div className="dropzone-hint">
                📷 Zrób lub wybierz zdjęcie okładki
              </div>
            )}
          </label>

          {recognizing && <div className="ocr-status">Rozpoznawanie okładki…</div>}
          {ocrError && <div className="ocr-status error">Rozpoznawanie: {ocrError}</div>}

          {ocrResult && (
            <div className="ocr-panel">
              <div className="ocr-method">
                Rozpoznano (Gemini)
              </div>

              {ocrResult.isbn && <div className="ocr-status">ISBN: {ocrResult.isbn}</div>}

              {ocrResult.duplicate && (
                <div className="duplicate-warning">
                  ⚠️ Wygląda, że masz już: <strong>{ocrResult.duplicate.title}</strong>
                  {ocrResult.duplicate.year && ` (${ocrResult.duplicate.year})`}
                </div>
              )}

              {ocrResult.ocrText && (
                <details className="ocr-text">
                  <summary>Odczytany tekst</summary>
                  <pre>{ocrResult.ocrText}</pre>
                </details>
              )}

              {ocrResult.suggestions?.length > 0 && (
                <div className="suggestions">
                  <div className="suggestions-title">Propozycje (kliknij, aby uzupełnić):</div>
                  {ocrResult.suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className="suggestion"
                      onClick={() => applySuggestion(s)}
                    >
                      <div className="suggestion-title">
                        {s.title}
                        {s.source === 'gemini' && <span className="source-badge">Gemini</span>}
                        {s.publishedDate && <span> ({s.publishedDate.slice(0, 4)})</span>}
                      </div>
                      {s.publisher && <div className="suggestion-sub">{s.publisher}</div>}
                    </button>
                  ))}
                </div>
              )}

              {ocrResult.geminiDescription && (
                <div className="gemini-description">
                  <div className="suggestions-title">Opis zaproponowany przez Gemini:</div>
                  <p>{ocrResult.geminiDescription}</p>
                  <button type="button" className="suggestion" onClick={applyGeminiDescription}>
                    Użyj tego opisu
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="fields-panel">
          <label>
            Tytuł *
            <input
              type="text"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              required
            />
          </label>

          <label>
            Seria
            <input
              type="text"
              value={form.series}
              onChange={(e) => setField('series', e.target.value)}
            />
          </label>

          <div className="row">
            <label>
              Numer tomu
              <input
                type="text"
                inputMode="numeric"
                value={form.volume_number}
                onChange={(e) => setField('volume_number', e.target.value)}
              />
            </label>
            <label>
              Z ilu tomów
              <input
                type="text"
                inputMode="numeric"
                placeholder="tylko jeśli > 1"
                value={form.volume_total}
                onChange={(e) => setField('volume_total', e.target.value)}
              />
            </label>
          </div>

          <div className="row">
            <label>
              Rok wydania
              <input
                type="text"
                inputMode="numeric"
                value={form.year}
                onChange={(e) => setField('year', e.target.value)}
              />
            </label>
            <label>
              ISBN
              <input
                type="text"
                placeholder="np. 978…"
                value={form.isbn}
                onChange={(e) => setField('isbn', e.target.value)}
              />
            </label>
          </div>

          <label>
            Wydawca
            <input
              type="text"
              value={form.publisher}
              onChange={(e) => setField('publisher', e.target.value)}
            />
          </label>

          <label>
            Pisarz
            <TagInput value={writers} onChange={setWriters} presets={[]} />
          </label>

          <label>
            Rysownik / Artysta
            <TagInput value={artists} onChange={setArtists} presets={[]} />
          </label>

          <label>
            Kategorie
            <TagInput value={categories} onChange={setCategories} presets={[]} />
          </label>

          <label>
            Tagi
            <TagInput value={tags} suggestions={allTags} onChange={setTags} />
          </label>

          <label>
            Opis (2–10 zdań)
            <textarea
              rows={6}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </label>
        </div>
      </div>

      <section className="url-section">
        <h2>Zdjęcia z internetu ({imageUrls.length}/10)</h2>
        {imageUrls.length === 0 && (
          <p className="hint">Możesz dodać do 10 linków do zdjęć komiksu.</p>
        )}
        {imageUrls.map((url, i) => (
          <div key={i} className="url-row">
            <input
              type="url"
              value={url}
              placeholder="https://…"
              onChange={(e) => setImageUrl(i, e.target.value)}
            />
            <button type="button" className="danger-outline" onClick={() => removeImageUrl(i)}>
              Usuń
            </button>
          </div>
        ))}
        {imageUrls.length < 10 && (
          <button
            type="button"
            className="ghost"
            onClick={() => setImageUrls((prev) => [...prev, ''])}
          >
            + Dodaj link do zdjęcia
          </button>
        )}
      </section>
    </form>
  )
}
