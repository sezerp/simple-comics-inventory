import { useState } from 'react'
import ComicList from './components/ComicList.jsx'
import ComicDetail from './components/ComicDetail.jsx'
import ComicForm from './components/ComicForm.jsx'
import './App.css'

function App() {
  const [view, setView] = useState({ name: 'list' })

  return (
    <div className="app">
      <header className="app-header">
        <button type="button" className="logo" onClick={() => setView({ name: 'list' })}>
          📚 Moje Komiksy
        </button>
        <button type="button" className="primary" onClick={() => setView({ name: 'new' })}>
          + Dodaj komiks
        </button>
      </header>

      <main className="app-main">
        {view.name === 'list' && (
          <ComicList onOpen={(id) => setView({ name: 'detail', id })} />
        )}

        {view.name === 'detail' && (
          <ComicDetail
            key={view.id}
            id={view.id}
            onBack={() => setView({ name: 'list' })}
            onEdit={() => setView({ name: 'edit', id: view.id })}
            onDeleted={() => setView({ name: 'list' })}
          />
        )}

        {view.name === 'new' && (
          <ComicForm onDone={() => setView({ name: 'list' })} onCancel={() => setView({ name: 'list' })} />
        )}

        {view.name === 'edit' && (
          <ComicForm
            id={view.id}
            onDone={() => setView({ name: 'detail', id: view.id })}
            onCancel={() => setView({ name: 'detail', id: view.id })}
          />
        )}
      </main>
    </div>
  )
}

export default App
