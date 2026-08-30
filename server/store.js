import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const DATA_DIR = path.join(__dirname, '..', 'data')
export const CSV_PATH = path.join(DATA_DIR, 'comics.csv')
export const COVERS_DIR = path.join(DATA_DIR, 'covers')
export const GALLERY_DIR = path.join(DATA_DIR, 'gallery')
export const TMP_DIR = path.join(DATA_DIR, 'tmp')

const HEADERS = [
  'id',
  'title',
  'series',
  'volume_number',
  'volume_total',
  'year',
  'publisher',
  'description',
  'cover_path',
  'image_urls',
  'tags',
  'created_at',
  'updated_at',
]

export async function ensureDirs() {
  await fs.mkdir(COVERS_DIR, { recursive: true })
  await fs.mkdir(GALLERY_DIR, { recursive: true })
  await fs.mkdir(TMP_DIR, { recursive: true })
  await ensureCsv()
}

async function ensureCsv() {
  try {
    await fs.access(CSV_PATH)
  } catch {
    await fs.writeFile(CSV_PATH, HEADERS.join(',') + '\n', 'utf8')
  }
}

function normalize(row) {
  const r = { ...row }
  for (const h of HEADERS) {
    if (r[h] == null) r[h] = ''
  }
  return r
}

async function readCsv() {
  await ensureCsv()
  const content = await fs.readFile(CSV_PATH, 'utf8')
  if (!content.trim()) return []
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  })
  return records.map(normalize)
}

async function writeCsv(rows) {
  const output = stringify(rows, { header: true, columns: HEADERS })
  await fs.writeFile(CSV_PATH, output, 'utf8')
}

export function splitList(value) {
  return String(value || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function joinList(value) {
  return (Array.isArray(value) ? value : [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join('|')
}

export async function listComics() {
  return readCsv()
}

export async function getComic(id) {
  const all = await readCsv()
  return all.find((c) => c.id === id) || null
}

export async function createComic(data) {
  const all = await readCsv()
  const now = new Date().toISOString()
  const comic = {
    id: randomUUID(),
    title: data.title || '',
    series: data.series || '',
    volume_number: data.volume_number || '',
    volume_total: data.volume_total || '',
    year: data.year || '',
    publisher: data.publisher || '',
    description: data.description || '',
    cover_path: data.cover_path || '',
    image_urls: joinList(data.image_urls),
    tags: joinList(data.tags),
    created_at: now,
    updated_at: now,
  }
  all.push(comic)
  await writeCsv(all)
  return comic
}

export async function updateComic(id, data) {
  const all = await readCsv()
  const idx = all.findIndex((c) => c.id === id)
  if (idx === -1) return null
  const existing = all[idx]
  const updated = {
    ...existing,
    title: data.title ?? existing.title,
    series: data.series ?? existing.series,
    volume_number: data.volume_number ?? existing.volume_number,
    volume_total: data.volume_total ?? existing.volume_total,
    year: data.year ?? existing.year,
    publisher: data.publisher ?? existing.publisher,
    description: data.description ?? existing.description,
    cover_path: data.cover_path ?? existing.cover_path,
    image_urls:
      data.image_urls !== undefined
        ? joinList(data.image_urls)
        : existing.image_urls,
    tags: data.tags !== undefined ? joinList(data.tags) : existing.tags,
    updated_at: new Date().toISOString(),
  }
  all[idx] = updated
  await writeCsv(all)
  return updated
}

export async function deleteComic(id) {
  const all = await readCsv()
  const comic = all.find((c) => c.id === id)
  if (!comic) return null
  const next = all.filter((c) => c.id !== id)
  await writeCsv(next)
  return comic
}

export async function listTags() {
  const all = await readCsv()
  const counts = new Map()
  for (const comic of all) {
    for (const tag of splitList(comic.tags)) {
      if (tag) counts.set(tag, (counts.get(tag) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function coverFilePath(coverPath) {
  if (!coverPath) return null
  const name = path.basename(coverPath)
  return path.join(COVERS_DIR, name)
}
