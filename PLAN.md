# BookLibrary — Future Improvements & Roadmap

This document tracks prioritized ideas to evolve BookLibrary beyond v0.1.0 while keeping it fast, local-first, and household-friendly.

---

## P1 — High-Impact UX & Discovery
- **Google Books API Fallback**: Query Google Books alongside Open Library when an ISBN or title lacks cover art, page counts, or synopsis, and merge metadata cleanly.
- **Edition & ISBN Switcher in Search**: Expand a work result directly in `Search & Add` to browse individual editions (language, publisher, format, year, page count) before adding.
- **Duplicate Detection Banner Before Adding**: Warn inside `BookFormModal` when an added ISBN or title/author already exists in the current reader's library (or in another household member's shelf).
- **Custom Cover Image Upload**: Allow uploading or pasting a photo of a physical book cover, auto-compressed to WebP and persisted in IndexedDB so personal/rare editions always look crisp.
- **Series Name & Volume Number Grouping**: Track `series` + `seriesIndex` on books so multi-book series render grouped in reading order with completion badges (`3 / 6 read`).

## P2 — Reading Habits & Rich Analytics
- **Built-In Reading / Listening Stopwatch Timer**: Start/pause a live session timer directly from a book card; stopping auto-fills elapsed duration (`hh:mm`) or prompts for page/chapter reached.
- **Daily Reading Calendar Heatmap**: GitHub-style 365-day activity heatmap showing pages, chapters, and audio minutes read per day.
- **Genre, Format & Tag Breakdown Charts**: Donut/bar breakdown of finished books by tag, format (`Print` vs `E-book` vs `Audiobook`), rating distribution, and reading pace (pages/hour or books/month).
- **Re-Read Tracking**: Support multiple start/finish date spans and session groups per book rather than a single `dateStarted` / `dateFinished` pair.
- **Quotes & Highlights Vault**: Dedicated searchable tab for favorite quotes, page/timestamp citations, and exportable quote cards.

## P3 — Family & Household Features
- **Household Recommendations ("Recommend to Reader")**: Let one family member suggest a book from their shelf directly onto another member's `#wishlist` / `Want to Read` queue.
- **Physical Book Lending Tracker**: Record when a physical copy is lent out (`lentTo`, `lentDate`) or borrowed from a public library (`dueDate` reminder badge).
- **Kid-Friendly Milestones & Reading Badges**: Unlockable milestone badges (first audiobook, 5-day streak, 1,000 pages, genre explorer) with optional parent-configured reward notes.
- **Shared Family Wishlist**: Cross-profile aggregated `#wishlist` view to make gift shopping and library holds effortless.

## P4 — Cloud Sync & Offline Resilience
- **Optional Google Drive Picker for Multi-Account Sharing**: Allow family members using separate personal Google accounts to pick a shared household Drive JSON file via Google Picker API.
- **Optional Real-Time Sync Adapter (Firebase / Supabase / PocketBase)**: Complement Google Drive sync with an opt-in backend adapter that stays signed in indefinitely (avoiding Google's 1-hour GIS token expiration) and supports live cross-device updates.
- **Interactive Sync Conflict Inspector**: Surface side-by-side diffs whenever two devices edit the same book offline before applying Last-Write-Wins.
- **Automatic Local Backup Snapshots**: Keep rolling weekly snapshots in IndexedDB with 1-click rollback.
- **Offline Cover Caching via Service Worker**: Cache fetched Open Library covers in browser Cache Storage so offline shelves retain full artwork.

## P5 — Import, Export & Print
- **Batch ISBN Barcode Scanning Queue**: Scan a whole stack of books continuously into a staging tray, then bulk-assign shelf/status/tags in one click.
- **Audible, Libby & Kindle Import Helpers**: Parsers for Audible listening history CSV, Libby timeline JSON/CSV, and Kindle `My Clippings.txt`.
- **Customizable PDF Themes & Book Club Handouts**: Choose cover-grid poster mode, compact inventory checklist, or single-book discussion sheet layouts in `PdfExportModal`.
- **Optional CLI PDF Renderer**: Headless Playwright script for generating multi-page family yearbooks straight from exported household JSON.

## P6 — Architecture & Scale
- **Code-Split Heavy Dependencies**: Lazy-load `html5-qrcode` via dynamic `import()` inside `BarcodeScannerModal` so the main JS bundle stays under ~300 kB gzipped.
- **IndexedDB Storage Engine**: Migrate from `localStorage` (~5 MB ceiling) to IndexedDB (`idb`) to support 10,000+ books and binary cover thumbnails smoothly.
- **Automated Playwright E2E Suite**: Headless CI checks covering profile switching, PIN recovery, Open Library search, session logging, and print preview rendering.
