# Moje Komiksy

Lokalna aplikacja webowa do katalogowania kolekcji komiksów. Wgrywasz zdjęcie
okładki, aplikacja rozpoznaje ją przez Gemini (obraz + wyszukiwanie w internecie)
i proponuje metadane (tytuł, wydawca, rok, opis), a następnie zapisuje wpis w
bazie SQLite na dysku. Działa na komputerze i jest dostępna z telefonu w tej
samej sieci Wi-Fi.

## Uruchomienie

```bash
npm install
npm run dev:all
```

- Frontend (Vite): http://localhost:5173
- Backend (API): http://localhost:3001

Do użytku z telefonu Vite nasłuchuje na wszystkich interfejsach (`host: true`),
więc otwórz w telefonie `http://<IP_komputera>:5173` (komputer i telefon muszą
być w tej samej sieci).

Możesz też uruchomić osobno w dwóch terminalach:

```bash
npm run server   # backend
npm run dev      # frontend
```

## Dane

Dane przechowywane są w bazie SQLite `data/comics.db` (wbudowane `node:sqlite`,
bez dodatkowych zależności):

- `data/covers/` — wgrane zdjęcia okładek,
- `data/gallery/` — (opcjonalnie) pobrane zdjęcia,
- `data/tmp/` — pliki tymczasowe OCR.

Tabela `comics` ma kolumny: `id, title, series, volume_number, volume_total,
year, isbn, publisher, writers, artists, categories, description, cover_path,
image_urls, tags, created_at, updated_at`.

Listy (`writers` — pisarz, `artists` — rysownik/artysta, `categories` —
kategorie, `tags` — tagi, `image_urls` — linki do zdjęć) zapisywane są jako
wartości rozdzielone `|`. Listy tagów i kategorii są dynamiczne — możesz
dodawać dowolne nowe pozycje w formularzu.

Przy pierwszym uruchomieniu po aktualizacji aplikacja automatycznie migruje
istniejący plik `data/comics.csv` do SQLite (i zachowuje go jako kopię zapasową
`data/comics.csv.migrated`).

## Rozpoznawanie okładki (Gemini)

Okładkę rozpoznaje **Gemini** (model multimodalny + wyszukiwanie w internecie).
Wgrywasz zdjęcie → Gemini analizuje obraz, transkrybuje widoczny tekst i szuka w
internecie potwierdzonych metadanych (tytuł, wydawca, rok, ISBN, opis), zwracając
wynik jako **structured output** (`responseSchema`). Opis (2–10 zdań) jest
proponowany przez Gemini i można go wkleić jednym kliknięciem.

Zwrócony przez Gemini ISBN jest weryfikowany biblioteką `isbn3` (suma kontrolna
ISBN-10/ISBN-13). Jeśli ISBN jest błędny, aplikacja prosi Gemini o poprawkę —
dodatkowe zapytanie z wyszukiwaniem w internecie, które zwraca poprawny ISBN.

Przed wysłaniem do Gemini zdjęcie okładki jest zmniejszane do maksymalnie
**1200 px szerokości** (wysokość skalowana proporcjonalnie, obrazki mniejsze nie
są powiększane). Dzięki temu oryginalne zdjęcie w pełnej rozdzielczości nie
opuszcza dysku — do API trafia tylko zmniejszona kopia (JPEG, jakość 85), z
zastosowaną orientacją EXIF.

Wymagany jest klucz API Gemini. Utwórz plik `.env` na podstawie `.env.example`:

```bash
GEMINI_API_KEY=twoj_klucz
GEMINI_MODEL=gemini-2.5-flash
PORT=3001
```

Przepływ: zdjęcie okładki → Gemini (obraz + Google Search grounding) →
structured output z metadanymi → propozycje do uzupełnienia formularza +
wykrywanie duplikatu po tytule. Model `gemini-2.5-flash` obsługuje obrazy i
wyszukiwanie w Google; możesz zmienić `GEMINI_MODEL` na inny model multimodalny.
