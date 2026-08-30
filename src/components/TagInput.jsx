import { useState } from 'react'

const SUGGESTED = ['DC', 'Marvel', 'Image', 'Dark Horse', 'Vertigo', 'IDW', 'Boom!']

export default function TagInput({ value = [], suggestions = [], onChange, presets = SUGGESTED }) {
  const [input, setInput] = useState('')

  const allSuggestions = [...new Set([...presets, ...suggestions, ...value])]
  const filtered = allSuggestions.filter(
    (t) =>
      input &&
      t.toLowerCase().includes(input.toLowerCase()) &&
      !value.includes(t),
  )

  function addTag(raw) {
    const tag = raw.trim()
    if (!tag || value.includes(tag)) return
    onChange([...value, tag])
    setInput('')
  }

  function removeTag(tag) {
    onChange(value.filter((t) => t !== tag))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="tag-input">
      <div className="tag-list">
        {value.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} aria-label={`Usuń ${tag}`}>
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          list="tag-suggestions"
          placeholder={value.length ? 'Dodaj tag…' : 'np. DC, Marvel…'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => input && addTag(input)}
        />
      </div>
      {filtered.length > 0 && (
        <div className="tag-suggestions">
          {filtered.map((t) => (
            <button key={t} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addTag(t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      <datalist id="tag-suggestions">
        {allSuggestions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  )
}
