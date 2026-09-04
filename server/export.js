import { promises as fs } from 'node:fs'
import sharp from 'sharp'
import * as store from './store.js'

const THUMB_WIDTH = 480
const THUMB_QUALITY = 72

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
  // toggle sections, with no server round-trip.
  const seriesData = []
  for (const group of groups) {
    const cards = []
    for (const comic of group.volumes) {
      cards.push(await renderCard(comic, coverRef))
    }
    seriesData.push({
      name: group.name,
      countLabel: tomLabel(group.volumes.length),
      cards: cards.join('\n'),
    })
  }

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
    .label { color: #a1a1aa; }
    .gallery-link, .back { color: #60a5fa; }
    .back { border-color: #52525b; }
    .back:hover { background: #3f3f46; }
  }
</style>
</head>
<body>
  <header class="header">
    <h1>📚 Moje Komiksy</h1>
    <span class="meta">${groups.length} serii · ${comics.length} pozycji · wygenerowano ${escapeHtml(generatedAt)}</span>
  </header>
  <section id="view-list">
    ${
      tiles.length
        ? `<div class="series-grid">${tiles.join('\n')}</div>`
        : '<p class="empty">Brak komiksów w kolekcji.</p>'
    }
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
  const COVERS = ${JSON.stringify(coverUris)};
  const listView = document.getElementById('view-list');
  const detailView = document.getElementById('view-detail');
  const detailTitle = document.getElementById('detail-title');
  const detailCards = document.getElementById('detail-cards');

  function applyCovers(root) {
    (root || document).querySelectorAll('img[data-cover]').forEach((img) => {
      const uri = COVERS[Number(img.dataset.cover)];
      if (uri) img.src = uri;
    });
  }

  function showList() {
    detailView.hidden = true;
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
    detailView.hidden = false;
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.series-tile').forEach((tile) => {
    tile.addEventListener('click', () => showDetail(Number(tile.dataset.idx)));
  });
  document.getElementById('back-btn').addEventListener('click', showList);
  applyCovers();
</script>
</body>
</html>`
}
