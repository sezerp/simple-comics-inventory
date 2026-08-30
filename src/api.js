const BASE = '/api'

async function readJson(res) {
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return res.json()
}

function queryString(params = {}) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v)
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function splitTags(value) {
  return String(value || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function splitUrls(value) {
  return String(value || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function listComics(params) {
  return fetch(`${BASE}/comics${queryString(params)}`).then(readJson)
}

export async function getComic(id) {
  return fetch(`${BASE}/comics/${encodeURIComponent(id)}`).then(readJson)
}

export async function createComic(formData) {
  return fetch(`${BASE}/comics`, { method: 'POST', body: formData }).then(readJson)
}

export async function updateComic(id, formData) {
  return fetch(`${BASE}/comics/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: formData,
  }).then(readJson)
}

export async function deleteComic(id) {
  return fetch(`${BASE}/comics/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }).then(readJson)
}

export async function listTags() {
  return fetch(`${BASE}/tags`).then(readJson)
}

export async function recognizeImage(formData) {
  return fetch(`${BASE}/ocr`, { method: 'POST', body: formData }).then(readJson)
}
