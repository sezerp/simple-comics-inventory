import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { parse } from 'csv-parse/sync'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const DATA_DIR = path.join(__dirname, '..', 'data')
export const DB_PATH = path.join(DATA_DIR, 'comics.db')
export const LEGACY_CSV_PATH = path.join(DATA_DIR, 'comics.csv')
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
  'isbn',
  'publisher',
  'writers',
  'artists',
  'categories',
  'description',
  'cover_path',
  'image_urls',
  'tags',
  'created_at',
  'updated_at',
]

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS comics (
  id TEXT PRIMARY KEY NOT NULL,
  ${HEADERS.slice(1).map((h) => `${h} TEXT NOT NULL DEFAULT ''`).join(',\n  ')}
)`

const COLUMNS = HEADERS.join(', ')
const PLACEHOLDERS = HEADERS.map(() => '?').join(', ')

let db = null

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH)
    db.exec(CREATE_TABLE)
  }
  return db
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function ensureDirs() {
  await fs.mkdir(COVERS_DIR, { recursive: true })
  await fs.mkdir(GALLERY_DIR, { recursive: true })
  await fs.mkdir(TMP_DIR, { recursive: true })
  const migrated = await migrateFromCsv()
  if (migrated > 0) {
    console.log(`[store] Migrated ${migrated} comics from CSV to SQLite`)
  }
  getDb()
}

async function migrateFromCsv() {
  const [dbExists, csvExists] = await Promise.all([
    fileExists(DB_PATH),
    fileExists(LEGACY_CSV_PATH),
  ])
  if (dbExists || !csvExists) return 0

  const content = await fs.readFile(LEGACY_CSV_PATH, 'utf8')
  const records = content.trim()
    ? parse(content, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
      })
    : []

  const d = getDb()
  let inserted = 0
  if (records.length) {
    const insert = d.prepare(
      `INSERT OR IGNORE INTO comics (${COLUMNS}) VALUES (${PLACEHOLDERS})`,
    )
    for (const raw of records) {
      const row = normalize(raw)
      if (!row.id) continue
      insert.run(...HEADERS.map((h) => row[h]))
      inserted++
    }
  }

  await fs.rename(LEGACY_CSV_PATH, `${LEGACY_CSV_PATH}.migrated`)
  return inserted
}

function normalize(row) {
  const r = {}
  for (const h of HEADERS) {
    r[h] = row[h] == null ? '' : String(row[h])
  }
  return r
}

function mapRow(row) {
  const comic = {}
  for (const h of HEADERS) {
    comic[h] = row[h] ?? ''
  }
  return comic
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
  const rows = getDb()
    .prepare(`SELECT ${COLUMNS} FROM comics ORDER BY rowid ASC`)
    .all()
  return rows.map(mapRow)
}

export async function getComic(id) {
  const row = getDb()
    .prepare(`SELECT ${COLUMNS} FROM comics WHERE id = ?`)
    .get(id)
  return row ? mapRow(row) : null
}

export async function createComic(data) {
  const now = new Date().toISOString()
  const comic = {
    id: randomUUID(),
    title: data.title || '',
    series: data.series || '',
    volume_number: data.volume_number || '',
    volume_total: data.volume_total || '',
    year: data.year || '',
    isbn: data.isbn || '',
    publisher: data.publisher || '',
    writers: joinList(data.writers),
    artists: joinList(data.artists),
    categories: joinList(data.categories),
    description: data.description || '',
    cover_path: data.cover_path || '',
    image_urls: joinList(data.image_urls),
    tags: joinList(data.tags),
    created_at: now,
    updated_at: now,
  }
  getDb()
    .prepare(`INSERT INTO comics (${COLUMNS}) VALUES (${PLACEHOLDERS})`)
    .run(...HEADERS.map((h) => comic[h]))
  return comic
}

export async function updateComic(id, data) {
  const existing = await getComic(id)
  if (!existing) return null

  const updated = {
    ...existing,
    title: data.title ?? existing.title,
    series: data.series ?? existing.series,
    volume_number: data.volume_number ?? existing.volume_number,
    volume_total: data.volume_total ?? existing.volume_total,
    year: data.year ?? existing.year,
    isbn: data.isbn ?? existing.isbn,
    publisher: data.publisher ?? existing.publisher,
    writers:
      data.writers !== undefined ? joinList(data.writers) : existing.writers,
    artists:
      data.artists !== undefined ? joinList(data.artists) : existing.artists,
    categories:
      data.categories !== undefined
        ? joinList(data.categories)
        : existing.categories,
    description: data.description ?? existing.description,
    cover_path: data.cover_path ?? existing.cover_path,
    image_urls:
      data.image_urls !== undefined
        ? joinList(data.image_urls)
        : existing.image_urls,
    tags: data.tags !== undefined ? joinList(data.tags) : existing.tags,
    updated_at: new Date().toISOString(),
  }

  const setClause = HEADERS.map((h) => `${h} = ?`).join(', ')
  getDb()
    .prepare(`UPDATE comics SET ${setClause} WHERE id = ?`)
    .run(...HEADERS.map((h) => updated[h]), id)
  return updated
}

export async function deleteComic(id) {
  const comic = await getComic(id)
  if (!comic) return null
  getDb().prepare(`DELETE FROM comics WHERE id = ?`).run(id)
  return comic
}

export async function listTags() {
  const all = await listComics()
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
