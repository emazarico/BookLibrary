# BookLibrary — Future Improvements & Roadmap

This document tracks prioritized ideas to evolve BookLibrary beyond v0.1.0 while keeping it fast, local-first, and household-friendly.

---

## Recently Shipped Beyond v0.1.0
- **Book Language Field & Filter**: Defaults to `English`, auto-fills from search/edition metadata, editable per book, and filterable in `My Library`.
- **Want-to-Read Comments & Recommender**: Dedicated `recommendedBy` and `wantToReadNote` fields for `Want to Read` books, surfaced on book cards and detail drawers.
- **Final Review & Library Reviews Tab**: Dedicated `review` field (editable on finishing or inside `BookDetailDrawer` / `LogSessionModal` and preserved cleanly on Goodreads CSV round-trips) with a **Reviews** tab in `My Library`.
- **Ownership & Borrowing Tags**: Track whether each book is `Owned`, `Public Library`, `Borrowed`, or `Other` with contextual source notes, due-date badges, and overdue alerts.

---

## P1 — High-Impact UX & Discovery (Completed ✅)
- [x] **Google Books API Fallback** ✅: Queries Google Books alongside Open Library via `searchBooksCombined` & ISBN fallback when an ISBN or title lacks cover art, page counts, or synopsis, and merges metadata cleanly.
- [x] **Edition & ISBN Switcher in Search** ✅: Expand any Open Library work result directly in `Search & Add` to browse individual editions (language, publisher, format, year, page count, ISBN) and apply them before adding.
- [x] **Duplicate Detection Banner Before Adding** ✅: Warns inside `BookFormModal` when an added ISBN or title/author already exists in the current reader's library or on another household member's shelf.
- [x] **Custom Cover Image Upload & Paste** ✅: Upload or clipboard-paste a photo of a physical book cover, auto-compressed to WebP and persisted in IndexedDB (`idb-cover:...`) so personal/rare editions always look crisp.
- [x] **Series Name & Volume Number Grouping** ✅: Track `series` + `seriesIndex` on books so multi-book series render grouped in reading order with completion badges (`X / Y finished`) under **By Series**.

## P2 — Reading Habits & Rich Analytics
- **Built-In Reading / Listening Stopwatch Timer**: Start/pause a live session timer directly from a book card; stopping auto-fills elapsed duration (`hh:mm`) or prompts for page/chapter reached.
- [x] **Daily Reading Calendar Heatmap** ✅: GitHub-style 365-day / annual activity heatmap (`ReadingHeatmap`) showing pages, chapters, and audio minutes read per day with interactive hover & mobile tap details.
- [x] **Genre, Format & Tag Breakdown Charts** ✅: SVG format donut (`Print` vs `E-book` vs `Audiobook`), top non-meta tag distribution bars, rating buckets, and reading pace KPIs (`BreakdownCharts`).
- [x] **Re-Read Tracking** ✅: Full `readHistory: ReadSessionSpan[]` and `readCycle` support, cycle-aware monthly stats & timeline completions, and *Start Re-Read* / *Read History* controls in `BookDetailDrawer`.
- **Quotes & Highlights Vault**: Dedicated searchable tab for favorite quotes, page/timestamp citations, and exportable quote cards.

## P3 — Family & Household Features (Completed ✅)
- [x] **Household Recommendations ("Recommend to Reader")** ✅: Send any book from a reader's drawer directly onto another household member's `#wishlist` / `Want to Read` queue with a custom recommendation note.
- [x] **Physical Book Lending & Due-Date Tracker** ✅: Record when a physical copy is lent out (`lentTo`, `lentDate`, 1-click *Mark Returned*) or borrowed (`dueDate` reminder & overdue warning badge).
- [x] **Kid-Friendly Milestones & Reading Badges** ✅: 9 unlockable milestone badges (First Finish, Bookworm, Library Legend, 1,000-Page Explorer, Audio Adventurer, 5-Day Streak, Book Critic, Genre Explorer, Series Champion) with optional parent-configured reward notes in **Parent / Admin**.
- [x] **Shared Family Wishlist** ✅: Cross-profile aggregated `#wishlist` modal (with optional *Include all Want to Read* toggle) and 1-click *Add to My Wishlist* to make gift shopping and library trips effortless.

## P4 — Cloud Sync & Offline Resilience
- **Optional Google Drive Picker for Multi-Account Sharing**: Allow family members using separate personal Google accounts to pick a shared household Drive JSON file via Google Picker API.
- **Optional Real-Time Sync Adapter (Firebase / Supabase / PocketBase)**: Complement Google Drive sync with an opt-in backend adapter that stays signed in indefinitely (avoiding Google's 1-hour GIS token expiration) and supports live cross-device updates.
- **Interactive Sync Conflict Inspector**: Surface side-by-side diffs whenever two devices edit the same book offline before applying Last-Write-Wins.
- **Automatic Local Backup Snapshots**: Keep rolling weekly snapshots in IndexedDB with 1-click rollback.
- **Offline Cover Caching via Service Worker**: Cache fetched Open Library covers in browser Cache Storage so offline shelves retain full artwork.

## P5 — Import, Export & Print (Completed ✅)
- [x] **Batch ISBN Barcode Scanning Queue** ✅: Switch between `Single Scan` and `Batch Queue` inside `BarcodeScannerModal` (continuous debounced camera scanning or multi-ISBN paste), look up & deduplicate asynchronously, and bulk-assign shelf/status/format/ownership/tags in one click.
- [x] **Audible, Libby & Kindle Import Helpers** ✅: Auto-detect and import Audible Listening/Library CSV (generating duration `ReadingLog`s), Libby Timeline JSON/CSV, and Kindle `My Clippings.txt` alongside Goodreads & StoryGraph CSVs.
- [x] **Customizable PDF Themes & Book Club Handouts** ✅: Support `Classic Serif`, `Modern Indigo`, and `Minimal Ink-Saver` themes plus `Visual Cards`, `Compact Table`, `Cover-Grid Poster`, `Inventory Checklist`, and single-book `Book Club Handout` discussion sheets in `PdfExportModal`, `PrintReportView`, and standalone HTML exports.
- [x] **Optional CLI PDF Renderer** ✅: Standalone `scripts/render-pdf.mjs` (`npm run pdf:cli`) supporting `--html-only` and headless Playwright PDF generation straight from exported household or profile JSON.

## P6 — Architecture & Scale
- **Code-Split Heavy Dependencies**: Lazy-load `html5-qrcode` via dynamic `import()` inside `BarcodeScannerModal` so the main JS bundle stays under ~300 kB gzipped.
- [x] **IndexedDB Storage Engine** ✅: High-capacity IndexedDB persistence (`booklibrary_storage_v1`) with synchronous `localStorage` mirror below 4 MB (`saveDatabaseWithFallback`), seamless auto-migration from `localStorage`, and live storage engine/size readout in **Shelves & Data**.
- **Automated Playwright E2E Suite**: Headless CI checks covering profile switching, PIN recovery, Open Library search, session logging, and print preview rendering.
