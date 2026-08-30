import { useState } from 'react'
import ComicList from './components/ComicList.jsx'
import SeriesView from './components/SeriesView.jsx'
import ComicDetail from './components/ComicDetail.jsx'
import ComicForm from './components/ComicForm.jsx'
import './App.css'

// Primary navigation. To add a new view, add an entry here and a matching
// render block in <main> below — the menu and routing are driven by this list.
const NAV_ITEMS = [
  { name: 'list', label: 'Komiksy', icon: '📚' },
  { name: 'series', label: 'Serie', icon: '🗂️' },
]

function App() {
  const [view, setView] = useState({ name: 'list' })

  const navigate = (name) => setView({ name })

  const openComic = (id, from = 'list') => setView({ name: 'detail', id, from })

  // Highlight a nav item for its own view and for sub-views that belong to it
  // (e.g. a comic detail opened from the series view keeps "Serie" active).
  const navActive = (name) => {
    if (view.name === 'detail' || view.name === 'edit') return name === (view.from || 'list')
    return name === view.name
  }

  return (
    <div className="app">
      <header className="app-header">
        <button type="button" className="logo" onClick={() => navigate('list')}>
          📚 Moje Komiksy
        </button>
        <nav className="main-nav" aria-label="Nawigacja główna">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.name}
              type="button"
              className={`nav-item${navActive(item.name) ? ' active' : ''}`}
              onClick={() => navigate(item.name)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button type="button" className="primary" onClick={() => setView({ name: 'new' })}>
            + Dodaj komiks
          </button>
        </div>
      </header>

      <main className="app-main">
        {view.name === 'list' && (
          <ComicList onOpen={(id) => openComic(id, 'list')} />
        )}

        {view.name === 'series' && (
          <SeriesView onOpen={(id) => openComic(id, 'series')} />
        )}

        {view.name === 'detail' && (
          <ComicDetail
            key={view.id}
            id={view.id}
            onBack={() => navigate(view.from || 'list')}
            onEdit={() => setView({ name: 'edit', id: view.id, from: view.from })}
            onDeleted={() => navigate('list')}
          />
        )}

        {view.name === 'new' && (
          <ComicForm onDone={() => navigate('list')} onCancel={() => navigate('list')} />
        )}

        {view.name === 'edit' && (
          <ComicForm
            id={view.id}
            onDone={() => setView({ name: 'detail', id: view.id, from: view.from })}
            onCancel={() => setView({ name: 'detail', id: view.id, from: view.from })}
          />
        )}
      </main>
    </div>
  )
}

export default App
