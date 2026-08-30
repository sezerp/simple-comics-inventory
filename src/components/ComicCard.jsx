import { splitTags } from '../api.js'

export default function ComicCard({ comic, onOpen }) {
  return (
    <button type="button" className="comic-card" onClick={() => onOpen(comic.id)}>
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
  )
}
