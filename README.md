# Moje Komiksy

Lokalna aplikacja webowa do katalogowania kolekcji komiksów. Wgrywasz zdjęcie
okładki, aplikacja rozpoznaje ją przez Gemini (obraz + wyszukiwanie w internecie)
i proponuje metadane (tytuł, wydawca, rok, opis), a następnie zapisuje wpis w
bazie SQLite na dysku. Działa na komputerze i jest dostępna z telefonu w tej
samej sieci Wi-Fi.

## Pierwsze kroki (Getting Started)

Aplikacja do uruchomienia potrzebuje **Node.js** — środowiska, które uruchamia
program. Instaluje się je raz, z jednego pliku. Poniżej instrukcje krok po kroku
(nie musisz być programistą ani niczego konfigurować ręcznie).

### 1. Zainstaluj Node.js

Wejdź na stronę **https://nodejs.org** i pobierz wersję oznaczoną **LTS**
(zielony przycisk) — to najstabilniejsza wersja.

#### macOS

1. Otwórz https://nodejs.org w przeglądarce.
2. Kliknij zielony przycisk **LTS** — pobierze się plik `.pkg`.
3. Otwórz pobrany plik (folder **Pobrane**) i kliknij dwukrotnie.
4. Klikaj **Dalej / Kontynuuj**, zaakceptuj licencję, a przy pytaniu podaj
   hasło komputera. Zostaw wszystkie ustawienia domyślne.
5. Kliknij **Zamknij** — gotowe.

#### Windows

1. Otwórz https://nodejs.org w przeglądarce.
2. Kliknij zielony przycisk **LTS** — pobierze się plik `.msi`.
3. Otwórz pobrany plik i kliknij dwukrotnie.
4. Klikaj **Next / Dalej**, zaakceptuj licencję i zostaw ustawienia domyślne
   (opcja „Add to PATH" ma być zaznaczona — domyślnie jest).
5. Kliknij **Finish / Zakończ** — gotowe.

#### Sprawdź, czy instalacja się udała

Otwórz terminal: **macOS** — program **Terminal** (Aplikacje → Narzędzia),
**Windows** — **Command Prompt** lub **PowerShell** (z menu Start). Wpisz:

```bash
node -v
npm -v
```

Powinny wyświetlić się numery wersji, np.:

```
v22.12.0
10.9.0
```

Jeśli zamiast tego pojawi się błąd, zamknij terminal, otwórz go ponownie i
spróbuj jeszcze raz.

### 2. Uruchom lokalnie

1. Otwórz terminal w folderze projektu:
   - **macOS:** wpisz `cd ` (ze spacją), przeciągnij folder projektu do okna
     terminala i wciśnij Enter.
   - **Windows:** otwórz folder projektu w Eksploratorze plików, kliknij pasek
     adresu, wpisz `cmd` i wciśnij Enter.
2. Zainstaluj zależności (tylko pierwszy raz):

```bash
npm install
```

3. Uruchom backend i frontend razem:

```bash
npm run dev:all
```

Poczekaj chwilę, aż wszystko się załaduje. Na komputerze otwórz przeglądarkę pod
adresem **http://localhost:5173** (backend działa na porcie `3001`, frontend sam
go proxy-uje).

### 3. Adres dla telefonu (znajdziesz go w konsoli)

Po uruchomieniu aplikacja sama wyświetla w konsoli adres, pod którym jest
dostępna z telefonu. Nie musisz szukać IP ręcznie — odczytaj wiersz **Network**.
Przykładowy output konsoli:

```
[api] Komiksy API działa na http://0.0.0.0:3001

[web]   VITE v8.2.2  ready in 350 ms
[web]
[web]   ➜  Local:   http://localhost:5173/
[web]   ➜  Network: http://192.168.0.104:5173/
```

Objaśnienie:

- **Local** — adres na tym samym komputerze (używasz go na komputerze).
- **Network** — adres dla telefonu i innych urządzeń w tej samej sieci Wi-Fi.
  Wpisz go w przeglądarce telefonu, np. `http://192.168.0.104:5173`.
  (`192.168.0.104` to przykład — u Ciebie będzie inny adres, odczytaj go ze
  swojego wiersza **Network**.)

Dodatkowe uwagi:

- komputer i telefon muszą być podłączone do **tej samej sieci Wi-Fi**,
- jeśli strona na telefonie się nie otwiera, sprawdź zaporę (firewall)
  macOS/Windows, aby zezwolić Node/Vite na połączenia przychodzące,
- adres IP może się zmienić po restarcie komputera lub routera — wtedy ponownie
  odczytaj wiersz **Network** z konsoli.

Możesz też uruchomić backend i frontend osobno w dwóch terminalach:

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

## Eksport (statyczna strona HTML)

W prawym górnym rogu aplikacji znajduje się przycisk **⬇️ Eksport**. Po
kliknięciu aplikacja generuje samodzielną stronę HTML z całą kolekcją (tytuł,
seria, tom, rok, ISBN, wydawca, pisarz, rysownik, kategorie, tagi, opis oraz
miniaturki okładek) i pobiera ją na dysk jako plik `kolekcja.html` (zwykle do
folderu Pobrane). Zapisany plik otwierasz podwójnym kliknięciem — działa w pełni
offline, a odświeżenie strony nie łączy się ponownie z serwerem.

Kolekcja jest pogrupowana po **seriach**: strona startowa pokazuje kafelki serii
(okładka pierwszego tomu + nazwa + liczba tomów), kliknięcie kafelka otwiera
tomy danej serii, a przycisk **„← Wróć do listy serii”** wraca do listy.
Komiksy bez przypisanej serii trafiają do grupy **„Bez serii”**.

- Okładki są **osadzone bezpośrednio w pliku** (jako obrazki base64), więc strona
  działa offline — możesz ją zapisać na dysku i przenieść na telefon (np.
  AirDrop, e-mail, Drive), a potem otworzyć bez serwera i bez internetu.
- Linki do zdjęć z internetu (`image_urls`) pozostają linkami — do ich otwarcia
  potrzebne jest połączenie z internetem.
- Strona nie modyfikuje bazy danych — to tylko podgląd/backup kolekcji.

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

### Jak zdobyć klucz API Gemini (krok po kroku)

Gemini to usługa Google. Aby z niej korzystać, potrzebujesz **konta Google**
(np. Gmail) oraz **darmowego klucza API**, który wpiszesz do pliku `.env`.
Konsola Google bywa zawiła, dlatego poniżej prowadzimy Cię krok po kroku — nie
musisz być programistą.

> **Ważne:** rozpoznawanie okładki przez Gemini wymaga **podpięcia rozliczenia
> (billingu) do projektu Google Cloud**. To nie oznacza od razu kosztów — Google
> daje duży darmowy limit miesięczny — ale bez podpiętej karty/rozliczenia usługa
> nie zadziała (dostaniesz błąd „quota exceeded").

#### 1. Załóż konto Google (jeśli jeszcze nie masz)

1. Otwórz https://accounts.google.com/signup
2. Wypełnij dane i utwórz konto (np. adres Gmail).
3. Zaloguj się nim w przeglądarce.

#### 2. Wejdź do Google Cloud Console i utwórz projekt

1. Otwórz https://console.cloud.google.com
2. Zaloguj się (jeśli trzeba) tym samym kontem Google.
3. U góry kliknij listę projektów (domyślnie „Select a project" lub nazwa
   bieżącego projektu), a potem **New project**.
4. Wpisz nazwę, np. `Moje Komiksy`, i kliknij **Create**.
5. Poczekaj, aż projekt się utworzy, i upewnij się, że jest wybrany (widoczny u
   góry ekranu).

#### 3. Podepnij rozliczenie (billing) do projektu

1. Otwórz https://console.cloud.google.com/billing
2. Kliknij **Link a billing account** (Podłącz konto rozliczeniowe).
3. Jeśli nie masz jeszcze konta rozliczeniowego, kliknij **Create account**
   (Utwórz konto rozliczeniowe) i podaj dane karty. Google pobiera dane tylko do
   weryfikacji — przy darmowym limicie nic nie zapłacisz.
4. Wybierz utworzone konto rozliczeniowe i potwierdź.

#### 4. Włącz API Gemini (Generative Language API)

1. Otwórz
   https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com
2. Upewnij się, że u góry wybrany jest Twój projekt.
3. Kliknij **Enable** (Włącz) i poczekaj chwilę.

#### 5. Utwórz klucz API

1. Otwórz https://console.cloud.google.com/apis/credentials
2. Kliknij **Create credentials** (Utwórz dane logowania) → **API key**.
3. Pojawi się klucz w formacie `AIzaSy...`. Kliknij **Copy** (Kopiuj).

#### 6. Wpisz klucz w aplikacji

1. W folderze projektu utwórz plik `.env` (skopiuj `.env.example` i zmień nazwę
   na `.env`, jeśli jeszcze go nie masz).
2. Wklej klucz w linii `GEMINI_API_KEY=`:

```bash
GEMINI_API_KEY=AIzaSyTwojKlucz
GEMINI_MODEL=gemini-2.5-flash
PORT=3001
```

3. Uruchom ponownie aplikację (`npm run dev:all`), aby nowy klucz został
   wczytany.

#### Szybsza droga: Google AI Studio (bez konfiguracji billingu)

Jeśli chcesz pominąć konfigurację projektu i billingu, możesz wygenerować klucz
w **Google AI Studio**: https://aistudio.google.com/apikey → **Create API key**.
Taki klucz też działa, ale ma mniejszy darmowy limit i szybciej możesz trafić na
limit zapytań. Do regularnego katalogowania lepiej skorzystać z Google Cloud
Console (kroki powyżej) z podpiętym rozliczeniem.

#### Przydatne linki

- Google Cloud Console: https://console.cloud.google.com
- Tworzenie projektu: https://console.cloud.google.com/projectcreate
- Rozliczenie (billing): https://console.cloud.google.com/billing
- Włączanie Gemini API:
  https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com
- Klucze API (Credentials): https://console.cloud.google.com/apis/credentials
- Google AI Studio (klucz bez billingu): https://aistudio.google.com/apikey

Przepływ: zdjęcie okładki → Gemini (obraz + Google Search grounding) →
structured output z metadanymi → propozycje do uzupełnienia formularza +
wykrywanie duplikatu po tytule. Model `gemini-2.5-flash` obsługuje obrazy i
wyszukiwanie w Google; możesz zmienić `GEMINI_MODEL` na inny model multimodalny.
