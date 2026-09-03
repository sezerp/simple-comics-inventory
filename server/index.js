try {
  process.loadEnvFile?.('.env')
} catch {
  // .env is optional
}

import express from 'express'
import multer from 'multer'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import * as store from './store.js'
import { recognizeCover } from './ocr.js'
import { renderHtml } from './export.js'

const app = express()
app.use(express.json())

app.use('/covers', express.static(store.COVERS_DIR))
app.use('/gallery', express.static(store.GALLERY_DIR))

function coverStorage(dir) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg'
      cb(null, `${Date.now()}-${randomUUID()}${ext}`)
    },
  })
}

const uploadCover = multer({
  storage: coverStorage(store.COVERS_DIR),
  limits: { fileSize: 25 * 1024 * 1024 },
})

const uploadOcr = multer({
  storage: coverStorage(store.TMP_DIR),
  limits: { fileSize: 25 * 1024 * 1024 },
})

function parseList(value) {
  if (value == null) return []
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean)
      }
    } catch {
      // not JSON, fall through to split on newline/comma
    }
    return value
      .split(/[\n,|]/)
      .map((v) => v.trim())
      .filter(Boolean)
  }
  return []
}

const STRING_FIELDS = [
  'title',
  'series',
  'volume_number',
  'volume_total',
  'year',
  'isbn',
  'publisher',
  'description',
]

const LIST_FIELDS = ['image_urls', 'tags', 'writers', 'artists', 'categories']

function normalizeBody(body = {}, { withDefaults = false } = {}) {
  const out = {}
  for (const field of STRING_FIELDS) {
    if (withDefaults || field in body) out[field] = body[field] ?? ''
  }
  for (const field of LIST_FIELDS) {
    if (field in body) out[field] = parseList(body[field])
    else if (withDefaults) out[field] = []
  }
  return out
}

app.get('/api/comics', async (req, res) => {
  try {
    let comics = await store.listComics()
    const { tag, q } = req.query
    if (tag) {
      comics = comics.filter((c) => store.splitList(c.tags).includes(tag))
    }
    if (q) {
      const needle = String(q).toLowerCase()
      comics = comics.filter((c) =>
        [
          c.title,
          c.series,
          c.publisher,
          c.description,
          c.writers,
          c.artists,
          c.categories,
          c.isbn,
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
    }
    res.json(comics)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/export.html', async (req, res) => {
  try {
    const comics = await store.listComics()
    const html = await renderHtml(comics)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', 'inline; filename="kolekcja.html"')
    res.send(html)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/tags', async (req, res) => {
  try {
    res.json(await store.listTags())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/comics/:id', async (req, res) => {
  try {
    const comic = await store.getComic(req.params.id)
    if (!comic) return res.status(404).json({ error: 'Nie znaleziono komiksu' })
    res.json(comic)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/comics', uploadCover.single('cover'), async (req, res) => {
  try {
    const data = normalizeBody(req.body, { withDefaults: true })
    if (req.file) data.cover_path = `/covers/${req.file.filename}`
    const comic = await store.createComic(data)
    res.status(201).json(comic)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/comics/:id', uploadCover.single('cover'), async (req, res) => {
  try {
    const data = normalizeBody(req.body)
    if (req.file) data.cover_path = `/covers/${req.file.filename}`
    const comic = await store.updateComic(req.params.id, data)
    if (!comic) return res.status(404).json({ error: 'Nie znaleziono komiksu' })
    res.json(comic)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/comics/:id', async (req, res) => {
  try {
    const comic = await store.deleteComic(req.params.id)
    if (!comic) return res.status(404).json({ error: 'Nie znaleziono komiksu' })
    const coverFile = store.coverFilePath(comic.cover_path)
    if (coverFile) {
      await fs.unlink(coverFile).catch(() => {})
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/ocr', uploadOcr.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Brak pliku obrazu' })
    const result = await recognizeCover(req.file.path, req.body || {})
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  } finally {
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {})
    }
  }
})

async function main() {
  await store.ensureDirs()
  const port = Number(process.env.PORT) || 3001
  app.listen(port, '0.0.0.0', () => {
    console.log(`Komiksy API działa na http://0.0.0.0:${port}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
