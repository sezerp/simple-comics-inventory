import { promises as fs } from 'node:fs'
import sharp from 'sharp'
import * as store from './store.js'

const THUMB_WIDTH = 480
const THUMB_QUALITY = 72
// Above this many authors the author list gets its own filter input.
const AUTHOR_SEARCH_THRESHOLD = 30

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// Reads a stored cover, downscales it and embeds it as a base64 data URI so the
// generated HTML is fully self-contained and works offline.
async function coverDataUri(coverPath) {
  const filePath = store.coverFilePath(coverPath)
  if (!filePath) return ''
  try {
    const buffer = await fs.readFile(filePath)
    const thumb = await sharp(buffer)
      .rotate() // normalize EXIF orientation (phone photos)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY })
      .toBuffer()
    return `data:image/jpeg;base64,${thumb.toString('base64')}`
  } catch {
    return ''
  }
}

function chipList(value) {
  return store
    .splitList(value)
    .map((item) => `<span class="chip">${escapeHtml(item)}</span>`)
    .join('')
}

function factRow(label, value) {
  if (!value) return ''
  return `<p><span class="label">${escapeHtml(label)}:</span> ${escapeHtml(value)}</p>`
}

async function renderCard(comic, coverRef) {
  const coverIdx = await coverRef(comic.cover_path)
  const volume =
    comic.volume_number || comic.volume_total
      ? [comic.volume_number, comic.volume_total].filter(Boolean).join(' / ')
      : ''

  const gallery = store
    .splitList(comic.image_urls)
    .map(
      (url, i) =>
        `<a class="gallery-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Zdjęcie ${i + 1}</a>`,
    )
    .join('')

  const facts = [
    factRow('Seria', comic.series),
    factRow('Tom', volume),
    factRow('Rok', comic.year),
    factRow('ISBN', comic.isbn),
    factRow('Wydawca', comic.publisher),
    factRow('Pisarz', store.splitList(comic.writers).join(', ')),
    factRow('Rysownik/Artysta', store.splitList(comic.artists).join(', ')),
  ].join('')

  const categories = chipList(comic.categories)
  const tags = chipList(comic.tags)

  return `
    <article class="card">
      <div class="cover">
        ${coverIdx >= 0 ? `<img data-cover="${coverIdx}" alt="Okładka: ${escapeHtml(comic.title)}" loading="lazy">` : '<div class="cover-empty">Brak okładki</div>'}
      </div>
      <div class="body">
        <h2>${escapeHtml(comic.title || '(bez tytułu)')}</h2>
        <div class="facts">${facts}</div>
        ${comic.description ? `<p class="description">${escapeHtml(comic.description)}</p>` : ''}
        ${categories ? `<div class="chips">${categories}</div>` : ''}
        ${tags ? `<div class="chips">${tags}</div>` : ''}
        ${gallery ? `<div class="gallery">${gallery}</div>` : ''}
      </div>
    </article>`
}

function tomLabel(n) {
  if (n === 1) return '1 tom'
  const d = n % 10
  const h = n % 100
  if (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) return `${n} tomy`
  return `${n} tomów`
}

// Groups comics by series (comics without a series land in "Bez serii"), sorts
// volumes by volume_number and returns groups sorted alphabetically.
function groupBySeries(comics) {
  const map = new Map()
  for (const comic of comics) {
    const name = (comic.series || '').trim() || 'Bez serii'
    if (!map.has(name)) map.set(name, [])
    map.get(name).push(comic)
  }
  const groups = [...map.entries()].map(([name, volumes]) => {
    volumes.sort((a, b) => {
      const na = Number(a.volume_number)
      const nb = Number(b.volume_number)
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
      return (a.title || '').localeCompare(b.title || '', 'pl')
    })
    return { name, volumes, cover: volumes.find((v) => v.cover_path) || volumes[0] }
  })
  groups.sort((a, b) => {
    if (a.name === 'Bez serii') return 1
    if (b.name === 'Bez serii') return -1
    return a.name.localeCompare(b.name, 'pl')
  })
  return groups
}

async function renderSeriesTile(group, idx, coverRef) {
  const coverIdx = await coverRef(group.cover.cover_path)
  return `
    <button type="button" class="series-tile" data-idx="${idx}">
      <div class="series-cover">
        ${
          coverIdx >= 0
            ? `<img data-cover="${coverIdx}" alt="Okładka: ${escapeHtml(group.name)}" loading="lazy">`
            : '<div class="cover-empty">📚</div>'
        }
      </div>
      <div class="series-name">${escapeHtml(group.name)}</div>
      <div class="series-count">${tomLabel(group.volumes.length)}</div>
    </button>`
}

export async function renderHtml(comics) {
  const groups = groupBySeries(comics)

  // Deduplicate cover images: each unique cover is embedded exactly once and
  // referenced by index, so a series' first-volume cover isn't stored twice.
  const coverUris = []
  const coverIndex = new Map()
  const coverRef = async (coverPath) => {
    if (!coverPath) return -1
    if (coverIndex.has(coverPath)) return coverIndex.get(coverPath)
    const uri = await coverDataUri(coverPath)
    if (!uri) {
      coverIndex.set(coverPath, -1)
      return -1
    }
    const idx = coverUris.length
    coverUris.push(uri)
    coverIndex.set(coverPath, idx)
    return idx
  }

  const tiles = []
  for (let i = 0; i < groups.length; i++) {
    tiles.push(await renderSeriesTile(groups[i], i, coverRef))
  }

  // Pre-render every series' cards so the client-side navigation only has to
  // toggle sections, with no server round-trip. The same card HTML is also
  // collected into a flat list to power the title search and author filters.
  const seriesData = []
  const comicsData = []
  for (const group of groups) {
    const cards = []
    for (const comic of group.volumes) {
      const card = await renderCard(comic, coverRef)
      cards.push(card)
      comicsData.push({
        title: comic.title || '',
        series: comic.series || '',
        writers: store.splitList(comic.writers).map((s) => s.trim()).filter(Boolean),
        artists: store.splitList(comic.artists).map((s) => s.trim()).filter(Boolean),
        card,
      })
    }
    seriesData.push({
      name: group.name,
      countLabel: tomLabel(group.volumes.length),
      cards: cards.join('\n'),
    })
  }

  // Alphabetical by title for predictable search results.
  comicsData.sort((a, b) => a.title.localeCompare(b.title, 'pl'))

  // Unique writer/artist names for the clickable author filters.
  const authorSet = new Set()
  for (const comic of comicsData) {
    for (const name of [...comic.writers, ...comic.artists]) authorSet.add(name)
  }
  const authors = [...authorSet].sort((a, b) => a.localeCompare(b, 'pl'))

  const generatedAt = new Date().toLocaleString('pl-PL')

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moje Komiksy — Kolekcja</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f4f4f5;
    color: #1a1a1a;
    line-height: 1.5;
  }
  .header {
    background: #fff;
    border-bottom: 1px solid #e4e4e7;
    padding: 20px 24px;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px 16px;
  }
  .header h1 { margin: 0; font-size: 22px; }
  .header .meta { color: #71717a; font-size: 14px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
    padding: 20px 24px;
    max-width: 1400px;
    margin: 0 auto;
  }
  .card {
    background: #fff;
    border: 1px solid #e4e4e7;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .cover { aspect-ratio: 2 / 3; background: #e4e4e7; }
  .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cover-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #a1a1aa; font-size: 14px; }
  .body { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .body h2 { margin: 0; font-size: 17px; }
  .facts p { margin: 2px 0; font-size: 14px; }
  .label { color: #71717a; }
  .description { font-size: 14px; margin: 0; white-space: pre-line; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 999px;
    background: #f4f4f5;
    border: 1px solid #e4e4e7;
    color: #3f3f46;
  }
  .gallery { display: flex; flex-wrap: wrap; gap: 8px; }
  .gallery-link {
    font-size: 13px;
    color: #2563eb;
    text-decoration: none;
  }
  .empty { padding: 60px 20px; text-align: center; color: #71717a; }
  .series-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 16px;
    padding: 20px 24px;
    max-width: 1400px;
    margin: 0 auto;
  }
  .series-tile {
    appearance: none;
    -webkit-appearance: none;
    background: #fff;
    border: 1px solid #e4e4e7;
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    padding: 0;
    text-align: left;
    font: inherit;
    color: inherit;
    display: flex;
    flex-direction: column;
  }
  .series-tile:hover { border-color: #a1a1aa; }
  .series-cover { aspect-ratio: 2 / 3; background: #e4e4e7; }
  .series-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .series-name { font-size: 15px; font-weight: 600; padding: 10px 12px 2px; }
  .series-count { font-size: 13px; color: #71717a; padding: 0 12px 12px; }
  .toolbar {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 16px 24px 0;
    max-width: 1400px;
    margin: 0 auto;
  }
  .toolbar input[type="search"] {
    font: inherit;
    font-size: 15px;
    padding: 9px 14px;
    border: 1px solid #d4d4d8;
    border-radius: 10px;
    background: #fff;
    color: inherit;
    width: 100%;
    max-width: 480px;
  }
  .toolbar input[type="search"]:focus { outline: none; border-color: #2563eb; }
  .author-bar { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
  .author-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .author-toggle {
    font: inherit;
    font-size: 13px;
    padding: 5px 10px;
    border-radius: 8px;
    background: #fff;
    border: 1px solid #d4d4d8;
    color: #3f3f46;
    cursor: pointer;
  }
  .author-toggle:hover { border-color: #a1a1aa; }
  .author-toggle::before { content: '▸'; display: inline-block; width: 1em; }
  .author-toggle[aria-expanded="true"]::before { content: '▾'; }
  .toolbar input.author-search { font-size: 13px; padding: 5px 10px; border-radius: 8px; width: 220px; max-width: 100%; }
  .author-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .author-empty { margin: 0; font-size: 13px; color: #71717a; }
  .author-chip {
    font: inherit;
    font-size: 13px;
    padding: 4px 10px;
    border-radius: 999px;
    background: #f4f4f5;
    border: 1px solid #e4e4e7;
    color: #3f3f46;
    cursor: pointer;
  }
  .author-chip:hover { border-color: #a1a1aa; }
  .author-chip.active { background: #2563eb; border-color: #2563eb; color: #fff; }
  .clear-btn {
    font: inherit;
    font-size: 13px;
    color: #b91c1c;
    background: none;
    border: 1px solid #fca5a5;
    border-radius: 8px;
    padding: 5px 10px;
    cursor: pointer;
  }
  .clear-btn:hover { background: #fee2e2; }
  .detail-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 16px;
    padding: 16px 24px 0;
    max-width: 1400px;
    margin: 0 auto;
  }
  .detail-bar h2 { margin: 0; font-size: 20px; }
  .back {
    font: inherit;
    font-size: 14px;
    color: #2563eb;
    background: none;
    border: 1px solid #d4d4d8;
    border-radius: 8px;
    padding: 6px 12px;
    cursor: pointer;
  }
  .back:hover { background: #f4f4f5; }
  @media (prefers-color-scheme: dark) {
    body { background: #18181b; color: #f4f4f5; }
    .header, .card, .series-tile { background: #27272a; border-color: #3f3f46; }
    .chip { background: #3f3f46; border-color: #52525b; color: #e4e4e7; }
    .cover, .series-cover { background: #3f3f46; }
    .label, .author-empty { color: #a1a1aa; }
    .gallery-link, .back { color: #60a5fa; }
    .back { border-color: #52525b; }
    .back:hover { background: #3f3f46; }
    .toolbar input[type="search"], .author-chip, .author-toggle { background: #27272a; border-color: #3f3f46; color: #e4e4e7; }
    .author-chip.active { background: #2563eb; border-color: #2563eb; color: #fff; }
    .clear-btn { color: #f87171; border-color: #7f1d1d; }
    .clear-btn:hover { background: #3f3f46; }
  }
</style>
</head>
<body>
  <header class="header">
    <h1>📚 Moje Komiksy</h1>
    <span class="meta">${groups.length} serii · ${comics.length} pozycji · wygenerowano ${escapeHtml(generatedAt)}</span>
  </header>
  <div class="toolbar">
    <input type="search" id="search-input" placeholder="Szukaj po tytule, serii lub autorze…">
    <div class="author-bar"${authors.length ? '' : ' hidden'}>
      <div class="author-head">
        <button type="button" class="author-toggle" id="author-toggle" aria-expanded="false" aria-controls="author-chips">Autorzy (${authors.length})</button>
        <input type="search" class="author-search" id="author-search" placeholder="Filtruj autorów…" aria-label="Filtruj autorów"${authors.length > AUTHOR_SEARCH_THRESHOLD ? '' : ' hidden'}>
      </div>
      <div class="author-chips" id="author-chips" hidden></div>
      <p class="author-empty" id="author-empty" hidden>Brak pasujących autorów</p>
    </div>
    <button type="button" class="clear-btn" id="clear-filters" hidden>✕ Wyczyść filtry</button>
  </div>
  <section id="view-list">
    ${
      tiles.length
        ? `<div class="series-grid">${tiles.join('\n')}</div>`
        : '<p class="empty">Brak komiksów w kolekcji.</p>'
    }
  </section>
  <section id="view-results" hidden>
    <div class="grid" id="results-cards"></div>
    <p class="empty" id="results-empty" hidden>Brak komiksów spełniających kryteria.</p>
  </section>
  <section id="view-detail" hidden>
    <div class="detail-bar">
      <button type="button" class="back" id="back-btn">← Wróć do listy serii</button>
      <h2 id="detail-title"></h2>
    </div>
    <div class="grid" id="detail-cards"></div>
  </section>
<script>
  const SERIES = ${JSON.stringify(seriesData)};
  const COMICS = ${JSON.stringify(comicsData)};
  const AUTHORS = ${JSON.stringify(authors)};
  const COVERS = ${JSON.stringify(coverUris)};
  const listView = document.getElementById('view-list');
  const detailView = document.getElementById('view-detail');
  const detailTitle = document.getElementById('detail-title');
  const detailCards = document.getElementById('detail-cards');
  const resultsView = document.getElementById('view-results');
  const resultsCards = document.getElementById('results-cards');
  const resultsEmpty = document.getElementById('results-empty');
  const searchInput = document.getElementById('search-input');
  const authorChips = document.getElementById('author-chips');
  const authorToggle = document.getElementById('author-toggle');
  const authorSearch = document.getElementById('author-search');
  const authorEmpty = document.getElementById('author-empty');
  const clearBtn = document.getElementById('clear-filters');
  const selectedAuthors = new Set();
  let authorsExpanded = false;

  function esc(s) {
    return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  // Case- and diacritics-insensitive form for searching ("fernandez" finds
  // "Fernández"). NFD doesn't decompose ł, so it is mapped by hand.
  function fold(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replaceAll('ł', 'l');
  }

  function applyCovers(root) {
    (root || document).querySelectorAll('img[data-cover]').forEach((img) => {
      const uri = COVERS[Number(img.dataset.cover)];
      if (uri) img.src = uri;
    });
  }

  function showList() {
    detailView.hidden = true;
    resultsView.hidden = true;
    listView.hidden = false;
    window.scrollTo(0, 0);
  }

  function showDetail(idx) {
    const group = SERIES[idx];
    if (!group) return;
    detailTitle.textContent = group.name + ' · ' + group.countLabel;
    detailCards.innerHTML = group.cards;
    applyCovers(detailCards);
    listView.hidden = true;
    resultsView.hidden = true;
    detailView.hidden = false;
    window.scrollTo(0, 0);
  }

  function hasFilters() {
    return selectedAuthors.size > 0 || searchInput.value.trim() !== '';
  }

  function matches(comic) {
    if (selectedAuthors.size > 0) {
      const names = comic.writers.concat(comic.artists);
      if (![...selectedAuthors].some((a) => names.includes(a))) return false;
    }
    const q = fold(searchInput.value.trim());
    if (q) {
      const hay = fold([comic.title, comic.series, ...comic.writers, ...comic.artists].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function renderAuthorChips() {
    authorChips.innerHTML = AUTHORS.map((a) =>
      '<button type="button" class="author-chip" data-author="' + esc(a) + '">' + esc(a) + '</button>'
    ).join('');
    authorChips.querySelectorAll('.author-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.author;
        if (selectedAuthors.has(name)) selectedAuthors.delete(name);
        else selectedAuthors.add(name);
        update();
      });
    });
  }

  // Collapsed: only the selected authors stay visible. Expanded: every author
  // matching the filter text, plus the selected ones.
  function updateAuthorChips() {
    const q = fold(authorSearch.value.trim());
    let matched = 0;
    let shown = 0;
    authorChips.querySelectorAll('.author-chip').forEach((btn) => {
      const name = btn.dataset.author;
      const selected = selectedAuthors.has(name);
      const match = !q || fold(name).includes(q);
      if (match) matched++;
      btn.classList.toggle('active', selected);
      btn.hidden = !(selected || (authorsExpanded && match));
      if (!btn.hidden) shown++;
    });
    authorChips.hidden = shown === 0;
    authorEmpty.hidden = !(authorsExpanded && matched === 0);
    authorToggle.setAttribute('aria-expanded', String(authorsExpanded));
  }

  function update() {
    updateAuthorChips();
    const filtering = hasFilters();
    clearBtn.hidden = !filtering;
    if (!filtering) {
      resultsView.hidden = true;
      listView.hidden = false;
      return;
    }
    const matched = COMICS.filter(matches);
    resultsCards.innerHTML = matched.map((c) => c.card).join('\\n');
    applyCovers(resultsCards);
    resultsEmpty.hidden = matched.length > 0;
    listView.hidden = true;
    detailView.hidden = true;
    resultsView.hidden = false;
  }

  document.querySelectorAll('.series-tile').forEach((tile) => {
    tile.addEventListener('click', () => showDetail(Number(tile.dataset.idx)));
  });
  document.getElementById('back-btn').addEventListener('click', showList);
  searchInput.addEventListener('input', update);
  authorToggle.addEventListener('click', () => {
    authorsExpanded = !authorsExpanded;
    updateAuthorChips();
  });
  authorSearch.addEventListener('input', () => {
    if (authorSearch.value.trim()) authorsExpanded = true;
    updateAuthorChips();
  });
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    authorSearch.value = '';
    selectedAuthors.clear();
    update();
  });
  renderAuthorChips();
  updateAuthorChips();
  applyCovers();
</script>
</body>
</html>`
}
