import { promises as fs } from 'node:fs'
import sharp from 'sharp'
import { parse as parseIsbn } from 'isbn3'
import * as store from './store.js'

/**
 * Recognizes a comic cover image with Gemini (multimodal + live web search).
 * Returns { method, ocrText, webEntities, isbn, query, suggestions, duplicate, geminiDescription }.
 */
export async function recognizeCover(imagePath, meta = {}) {
  const apiKey = process.env.GEMINI_API_KEY || ''
  if (!apiKey) {
    throw new Error('Brak GEMINI_API_KEY — ustaw klucz w .env, aby rozpoznawać okładki')
  }

  const gemini = await geminiAnalyzeCover(imagePath)

  const query = (meta.title || '').trim() || gemini.title || ''
  let isbn = verifyIsbn(gemini.isbn)

  // Gemini sometimes returns an ISBN that fails checksum validation.
  // Ask it once more (with live search) to return a corrected ISBN.
  if (!isbn && String(gemini.isbn || '').trim()) {
    console.warn(`[ocr] Gemini returned invalid ISBN "${gemini.isbn}"; requesting correction`)
    const corrected = await geminiCorrectIsbn(imagePath, gemini)
    isbn = verifyIsbn(corrected)
    if (isbn) {
      gemini.isbn = isbn
    } else {
      console.warn('[ocr] Gemini ISBN correction still invalid or empty')
    }
  }

  const suggestions = gemini.title ? [mapGeminiResult(gemini)] : []
  let duplicate = null
  if (query) duplicate = await findDuplicate(query, suggestions)

  return {
    method: 'gemini',
    ocrText: gemini.ocrText || '',
    webEntities: [],
    isbn,
    query,
    suggestions,
    duplicate,
    geminiDescription: gemini.description || '',
  }
}

const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash'

// Structured output schema for Gemini cover recognition (Gemini responseSchema
// format uses uppercase type names). Title is required; the rest are optional.
const GEMINI_COVER_SCHEMA = {
  "type": "OBJECT",
  "properties": {
    "title": {
      "type": "STRING",
      "description": "Tytuł tego wydania, dokładnie w brzmieniu z okładki."
    },
    "title_original": {
      "type": "STRING",
      "description": "Tytuł oryginalny, jeśli to przekład. W przeciwnym razie pusty string."
    },
    "series": {
      "type": "STRING",
      "description": "Nazwa serii lub cyklu. Pusty string, jeśli wydanie samodzielne."
    },
    "volume_number": {
      "type": "STRING",
      "description": "Numer tomu lub zeszytu jako tekst, np. \"2\". Pusty string, jeśli brak."
    },
    "writers": {
      "type": "ARRAY",
      "items": { "type": "STRING" },
      "description": "Autorzy scenariusza. Pusta tablica, jeśli nieustaleni."
    },
    "artists": {
      "type": "ARRAY",
      "items": { "type": "STRING" },
      "description": "Autorzy rysunków. Jeśli ta sama osoba pisała i rysowała, podaj ją w obu polach."
    },
    "publisher": {
      "type": "STRING",
      "description": "Wydawnictwo tego konkretnego wydania, np. \"Egmont\", \"Mucha Comics\"."
    },
    "published_year": {
      "type": "STRING",
      "description": "Rok wydania, wyłącznie cztery cyfry, np. \"2019\". Pusty string, jeśli nieustalony."
    },
    "isbn": {
      "type": "STRING",
      "description": "ISBN, same cyfry bez myślników. Pusty string, jeśli niewidoczny i nieodnaleziony."
    },
    "description": {
      "type": "STRING",
      "description": "Opis fabuły w 2-5 zdaniach, po polsku. Pusty string, jeśli nie udało się ustalić treści."
    },
    "categories": {
      "type": "ARRAY",
      "items": { "type": "STRING" },
      "description": "Tagi gatunkowe małymi literami, np. \"noir\", \"superbohaterowie\", \"fantasy\"."
    },
    "ocr_text": {
      "type": "STRING",
      "description": "Cały tekst odczytany z okładki, dosłownie, z zachowaniem kolejności."
    },
    "source_confirmed": {
      "type": "BOOLEAN",
      "description": "true, jeśli dane potwierdzono w wynikach wyszukiwania. false, jeśli pochodzą wyłącznie z okładki lub wiedzy modelu."
    },
    "confidence": {
      "type": "STRING",
      "enum": ["high", "medium", "low"],
      "description": "Pewność identyfikacji komiksu."
    }
  },
  "required": [
    "title", "title_original", "series", "volume_number",
    "writers", "artists", "publisher", "published_year",
    "isbn", "description", "categories", "ocr_text",
    "source_confirmed", "confidence"
  ]
}

// Structured output schema for Gemini ISBN correction.
const GEMINI_ISBN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isbn: { type: 'STRING' },
  },
  required: ['isbn'],
}

// Downscale covers before sending them to Gemini so the full-resolution
// phone photo never leaves the device. Width is capped and height follows
// proportionally.
const MAX_COVER_WIDTH = 1200

async function imageToInlineData(imagePath) {
  const buffer = await fs.readFile(imagePath)
  const resized = await sharp(buffer)
    .rotate() // normalize EXIF orientation (phone photos)
    .resize({ width: MAX_COVER_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()
  return {
    mimeType: 'image/jpeg',
    data: resized.toString('base64'),
  }
}

async function geminiAnalyzeCover(imagePath) {
  const image = await imageToInlineData(imagePath)
  const prompt = `Jesteś asystentem katalogującym komiksy. Na podstawie załączonego zdjęcia okładki zidentyfikuj komiks.\\n\\nUżyj wyszukiwarki Google, aby potwierdzić dane wydania. Jeśli wyniki wyszukiwania nie potwierdzają jakiejś informacji, zostaw odpowiednie pole puste zamiast zgadywać.\\n\\nWypełnij wszystkie pola schematu. Dla informacji, których nie udało się ustalić, użyj pustego stringa lub pustej tablicy.\\n\\nJeśli nie potrafisz zidentyfikować komiksu, zwróć title jako pusty string i wypełnij samo ocr_text.`

  const raw = await callGemini({
    prompt,
    image,
    json: true,
    schema: GEMINI_COVER_SCHEMA,
    search: true,
  })

  const data = parseJson(raw)
  if (!data || typeof data !== 'object') {
    throw new Error('Gemini zwróciło nieprawidłowy wynik (brak structured output)')
  }
  return data
}

async function callGemini({ prompt, image = null, json = false, schema = null, search = false } = {}) {
  const apiKey = process.env.GEMINI_API_KEY || ''
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  const model = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`

  const generationConfig = {
    "thinkingConfig": { "thinkingBudget": 512 },
  }
  if (json) {
    generationConfig.responseMimeType = 'application/json'
    if (schema) generationConfig.responseSchema = schema
  }
  // Controlled generation (responseSchema) does not allow sampling parameters
  // like temperature, so only set it when no schema is used.
  if (!schema) generationConfig.temperature = 0.2

  const parts = []
  if (image) parts.push({ inlineData: image })
  parts.push({ text: prompt })

  const body = {
    contents: [{ parts }],
    generationConfig,
  }
  // Force live web search so Gemini verifies facts against the internet
  // instead of relying on its training data.
  if (search) body.tools = [{ googleSearch: {} }]

  const requestLog = buildGeminiRequestLog({ url, model, prompt, image, body })

  console.log("Searching ", JSON.stringify(requestLog))
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '')
      console.error(
        `[ocr] Gemini request failed: HTTP ${resp.status} ${resp.statusText} ${errBody}`,
      )
      console.error('[ocr] Gemini request:', requestLog)
      throw new Error(`Gemini request failed: HTTP ${resp.status}`)
    }
    const json = await resp.json()
    const text =
      json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
    console.info('[ocr] Gemini response:', buildGeminiResponseLog({ model, json, text }))
    return text.trim()
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Gemini request failed')) throw err
    console.error('[ocr] Gemini request error:', err)
    console.error('[ocr] Gemini request:', requestLog)
    throw new Error('Gemini request failed')
  }
}

// Builds a safe, loggable summary of a Gemini request for debugging errors.
// The API key is masked and the image content is replaced with its size only.
function buildGeminiRequestLog({ url, model, prompt, image, body }) {
  const safeUrl = url.replace(/([?&]key=)[^&]+/i, '$1***')
  return {
    url: safeUrl,
    model,
    prompt: String(prompt || '').slice(0, 2000),
    image: image
      ? { mimeType: image.mimeType, dataBytes: image.data?.length || 0 }
      : null,
    generationConfig: body.generationConfig,
    tools: body.tools,
  }
}

// Builds a loggable summary of a successful Gemini response. The raw text is
// truncated to keep logs readable; the API key is never part of the response.
function buildGeminiResponseLog({ model, json, text }) {
  return {
    model,
    finishReason: json?.candidates?.[0]?.finishReason || null,
    usageMetadata: json?.usageMetadata || null,
    text: String(text || '').slice(0, 4000),
  }
}

function parseJson(text) {
  if (!text) return {}
  const cleaned = text
    .replace(/^```(?:json)?\s*/gm, '')
    .replace(/```\s*$/gm, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return {}
      }
    }
    return {}
  }
}

function mapGeminiResult(data) {
  if (!data || typeof data !== 'object') return null
  const title = String(data.title || '').trim()
  if (!title) return null
  return {
    title,
    subtitle: '',
    series: data.series ? String(data.series) : '',
    volumeNumber: data.volume_number ? String(data.volume_number) : '',
    volumeTotal: data.volume_total ? String(data.volume_total) : '',
    writers: Array.isArray(data.writers)
      ? data.writers.map((w) => String(w)).filter(Boolean)
      : [],
    artists: Array.isArray(data.artists)
      ? data.artists.map((a) => String(a)).filter(Boolean)
      : [],
    publisher: data.publisher ? String(data.publisher) : '',
    publishedDate: data.published_year ? String(data.published_year) : '',
    isbn: data.isbn ? String(data.isbn) : '',
    description: data.description ? String(data.description) : '',
    pageCount: '',
    categories: Array.isArray(data.categories)
      ? data.categories.map((c) => String(c)).filter(Boolean).slice(0, 10)
      : [],
    imageLinks: {},
    imageUrls: Array.isArray(data.image_urls)
      ? data.image_urls.map((u) => String(u)).filter(Boolean).slice(0, 10)
      : [],
    source: 'gemini',
  }
}

// Verifies an ISBN using isbn3 and normalizes it to ISBN-13 when possible.
// Returns the normalized ISBN, or '' when missing/invalid.
function verifyIsbn(value) {
  const cleaned = String(value || '').replace(/[^0-9Xx]/g, '').toUpperCase()
  if (!cleaned) return ''
  const parsed = parseIsbn(cleaned)
  if (parsed && parsed.isValid) return parsed.isbn13 || parsed.isbn10 || cleaned
  return ''
}

// Asks Gemini to look up and return a correct ISBN when the initial one failed validation.
async function geminiCorrectIsbn(imagePath, data) {
  const image = await imageToInlineData(imagePath)
  const wrongIsbn = String(data?.isbn || '').trim()
  const title = String(data?.title || '').trim()
  const ocrText = String(data?.ocr_text || data?.ocrText || '').trim()

  const prompt = `The ISBN "${wrongIsbn}" previously returned for this comic is INVALID (it fails the ISBN checksum validation).

Title: ${title || 'unknown'}
Text read from the cover: ${ocrText || 'none'}

Use Google Search to look up the correct ISBN for this exact comic and make sure the ISBN you return is valid (correct ISBN-10/ISBN-13 checksum). Return a JSON object matching the schema with a single field "isbn" set to the correct ISBN (digits only, or ending with X), or "" if you cannot find a valid ISBN.`

  const raw = await callGemini({
    prompt,
    image,
    json: true,
    schema: GEMINI_ISBN_SCHEMA,
    search: true,
  })

  const result = parseJson(raw)
  return String(result?.isbn || '').trim()
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function titlesMatch(a, b) {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const shorter = na.length < nb.length ? na : nb
  const longer = na.length < nb.length ? nb : na
  return shorter.length >= 6 && longer.includes(shorter)
}

async function findDuplicate(query, suggestions) {
  const comics = await store.listComics()
  if (!query) return null

  for (const comic of comics) {
    if (titlesMatch(query, comic.title)) {
      return {
        id: comic.id,
        title: comic.title,
        year: comic.year,
        volume_number: comic.volume_number,
        volume_total: comic.volume_total,
        tags: store.splitList(comic.tags),
      }
    }
  }

  // Also match by recognized suggestion title.
  for (const s of suggestions) {
    if (!s.title) continue
    const hit = comics.find((c) => titlesMatch(s.title, c.title))
    if (hit) {
      return {
        id: hit.id,
        title: hit.title,
        year: hit.year,
        volume_number: hit.volume_number,
        volume_total: hit.volume_total,
        tags: store.splitList(hit.tags),
      }
    }
  }

  return null
}
