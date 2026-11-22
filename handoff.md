# Agent Handoff — BookLibrary

Quick onboarding reference for continuing development, debugging, or deployment on **BookLibrary**.

---

## 1. Repository & Scope

- **Repo root**: `/Users/emazaric/Documents/AI_projects/LibraryTracker/BookLibrary` (`main` branch)
- **Sibling folders**: `../old` and `../v4` are legacy archives — **do not modify them**.
- **Workspace rule**: Always write complete files (`write_file`) when editing rather than partial inline replacements.

---

## 2. Tech Stack & Commands

- **Framework**: React `19.0.0`, TypeScript `5.7.3`, Vite `6.2.0` (`@vitejs/plugin-react`), Tailwind CSS v4 (`@tailwindcss/vite`)
- **UI & Hardware**: `lucide-react`, `html5-qrcode` (camera ISBN barcode scanner)
- **Tests**: Vitest `3.0.0`

```bash
npm install
npm run dev      # Local Vite dev server (http://localhost:5173)
npm test         # Run all 17 Vitest suites once
npm run build    # Type-check (tsc -b) + production Vite build to dist/
npm run pdf:cli -- --input backup.json --html-only --output report.html
```

---

## 3. Architecture & File Map

### Core Data, State & Services
- `src/types/library.ts` — Schema v4 types (`BookLibraryDatabase`, `UserProfile`, `Shelf`, `Book`, `ReadSessionSpan`, `ReadingLog`, `BookFormat`, `BookOwnership`, `ProgressUnit`, `BookEditionOption`, `SyncStatus`, `DriveConfig`)
- `src/store/LibraryContext.tsx` — React context provider owning IndexedDB + localStorage persistence, profile/PIN/admin auth, soft deletes, re-read cycle management (`startReread`, `addReadHistorySpan`, `deleteReadHistorySpan`), session logging, household recommendations, and Google Drive auto-sync
- `src/services/idbStorage.ts` — IndexedDB database storage wrapper (`booklibrary_storage_v1`) exporting `loadDatabaseFromIdb`, `saveDatabaseToIdb`, `clearDatabaseFromIdb`, and `getStorageEngineInfo`
- `src/services/storage.ts` — `localStorage` fallback & <4 MB mirror (`saveDatabaseWithFallback`), theme state, Drive config, Legacy v3 detection
- `src/services/googleDriveSync.ts` — Google Identity Services (GIS) token flow + Drive REST API v3 JSON sync (`booklibrary-db.json` with `omnilibrary-v4-db.json` fallback)
- `src/services/openLibrary.ts` — Language-matched Open Library search, `fetchWorkEditions`, `searchBooksCombined` (OL + Google Books merge), and `lookupBookByIsbn`
- `src/services/googleBooks.ts` — Google Books Volumes API search & metadata normalization
- `src/services/coverStore.ts` — IndexedDB (`booklibrary_covers_v1`) custom WebP cover storage (`saveCustomCover`, `useResolvedCover`) using `idb-cover:...` keys
- `src/services/importExport.ts` — Household JSON, Profile JSON, Legacy v3 JSON, Goodreads CSV (`My Review` vs `Private Notes`, `Binding`), StoryGraph CSV, Audible Listening/Library CSV, Libby Timeline JSON/CSV, Kindle `My Clippings.txt`, and Reading Logs CSV

### Pure Utilities & Scripts
- `src/utils/admin.ts` — Admin eligibility helpers & PIN reset validation
- `src/utils/analytics.ts` — 365-day/annual daily activity heatmap builder (`buildDailyActivityHeatmap`) and format/tag/rating/pace breakdown metrics (`computeAnalyticsBreakdown`)
- `src/utils/badges.ts` — 9 reading milestones (`READING_BADGE_DEFINITIONS`, `computeReadingBadges`) + parent reward note attachment
- `src/utils/cover.ts` — URL sanitization & deterministic clothbound cover palette generator
- `src/utils/crypto.ts` — Web Crypto salted SHA-256 PIN hashing & verification
- `src/utils/csv.ts` — RFC-style CSV parser/serializer & Goodreads ISBN cleaner
- `src/utils/demoData.ts` — Sample 2-profile household (`Alex` admin, `Maya` reader PIN `1234`)
- `src/utils/duplicates.ts` — `findBookDuplicates` across active profile & household shelves (ISBN + normalized title/author)
- `src/utils/merge.ts` — Last-Write-Wins (LWW) per-record database merge for Google Drive sync & imports
- `src/utils/pdfReport.ts` — Report filtering, stats calculator, and standalone HTML generator supporting 5 layouts (`cards`, `table`, `poster`, `checklist`, `handout`) and 3 themes (`classic`, `modern`, `minimal`)
- `src/utils/progress.ts` — Progress calculations across `pages`, `chapters`, and `duration` (`hh:mm`)
- `src/utils/stats.ts` — Re-read aware monthly buckets (with cycle-scoped page backfill & double-count guard), reading streaks, and timeline grouping (`getBookFinishedOccurrences`)
- `src/utils/themes.ts` — Languages (`BOOK_LANGUAGES`), `OWNERSHIP_META`, `STATUS_META`, `BOOK_FORMAT_META`, avatar themes, suggested tags
- `scripts/render-pdf.mjs` — Optional CLI PDF & printable HTML generator supporting headless Playwright Chromium rendering (`npm run pdf:cli`)

### UI Components (`src/components/`)
- `layout/`: `Header.tsx` (sticky top header containing desktop pills + mobile tab strip), `MobileNav.tsx`
- `common/`: `BookCover.tsx`, `Modal.tsx`, `StarRating.tsx`, `ToastContainer.tsx`
- `library/`: `LibraryView.tsx` (spotlight strip, `#Wishlist` & `Reviews` tabs, Language/Ownership filters, `Flat | By Shelf | By Series` grouping), `BookCard.tsx` & `BookListRow.tsx` (with `Re-read #N` / `N× read` pills), `BookDetailDrawer.tsx` (with *Start Re-Read* & *Read History* editor), `BookFormModal.tsx`, `FamilyWishlistModal.tsx`
- `search/`: `SearchView.tsx` (OL + Google Books combined results, expandable `Editions` switcher, *Scan ISBN* + *Batch Scan*), `BarcodeScannerModal.tsx` (`Single Scan` + continuous/pasted `Batch Queue` with bulk assignment)
- `timeline/`: `TimelineView.tsx`, `MonthlyChart.tsx`, `ReadingHeatmap.tsx`, `BreakdownCharts.tsx`, `LogSessionModal.tsx`
- `profiles/`: `ProfileGate.tsx`, `PinModal.tsx` (keypad + Forgot PIN admin recovery), `HouseholdAdminModal.tsx` (roles, PIN resets, per-reader badge `Rewards` editor), `ProfileFormModal.tsx`, `ProfileSwitcher.tsx`
- `management/`: `ShelvesDataView.tsx` (with live IndexedDB / localStorage storage engine badge), `CloudSyncModal.tsx`, `ImportPreviewModal.tsx`, `PdfExportModal.tsx` (themes, layouts, featured book picker), `PrintReportView.tsx`

### Tests (`src/__tests__/`)
- `admin.test.ts`, `analytics.test.ts`, `badges.test.ts`, `crypto.test.ts`, `csv.test.ts`, `duplicates.test.ts`, `googleBooks.test.ts`, `googleDriveSync.test.ts`, `idbStorage.test.ts`, `importExport.test.ts`, `importers.test.ts`, `merge.test.ts`, `openLibrary.test.ts`, `pdfReport.test.ts`, `progress.test.ts`, `rereads.test.ts`, `stats.test.ts` (17 suites, 50 tests).

---

## 4. Critical Quirks & Invariants (Do Not Break)

1. **iPhone Safari Active Tap Area (Navigation & Overlays)**
   - **Never put interactive navigation or flush-bottom buttons at `fixed bottom-0` on mobile.** iPhone Safari intercepts taps near the bottom chrome edge to reveal its browser toolbar (*Previous / Next / Share / Tabs*) instead of firing clicks.
   - Mobile tab navigation (`MobileNav`) renders inside the sticky top `<header>` (`Header.tsx`).
   - `index.html` uses `viewport-fit=cover`, `src/index.css` sets `100dvh` + `touch-action: manipulation`, and `App.tsx`, `ProfileGate.tsx`, `ToastContainer.tsx`, `Modal.tsx`, `PinModal.tsx`, and `BookDetailDrawer.tsx` all maintain safe-area / bottom clearance (`calc(env(safe-area-inset-bottom) + ...)` and `overscroll-contain`).

2. **Google Drive GIS Auth**
   - Uses browser-only Google Identity Services token flow with scope `https://www.googleapis.com/auth/drive.file` **only** — no Client Secret, no Authorized Redirect URIs, and do **not** add `userinfo.email` (triggers `Error 400: invalid_scope` on unverified consent configs).
   - Shared household Google account pattern: devices share `VITE_GOOGLE_CLIENT_ID` (from GitHub Actions Variable) and auto-discover the household JSON file on Drive without hardcoding secrets into the repo.

3. **IndexedDB Storage & Custom Cover URLs (`idb-cover:...`)**
   - `saveDatabaseWithFallback` persists full DB JSON to IndexedDB (`booklibrary_storage_v1`) and mirrors payloads `< 4,000,000` chars to `localStorage` (removing the `localStorage` key when exceeded so quota isn't exhausted).
   - `BookFormModal.tsx` intentionally uses `<input type="text">` (not `type="url"`) for Cover Image URL so `idb-cover:...` keys pass HTML5 form validation. Always resolve covers through `useResolvedCover` in React, and never emit `idb-cover:...` directly into standalone printable HTML `<img>` tags.

4. **Goodreads CSV Review vs Private Notes**
   - Keep `b.review || ''` in Goodreads column `My Review` and `b.notes || ''` in `Private Notes` (`src/__tests__/importExport.test.ts` asserts lossless round-trip of `notes`).

5. **Soft Deletes for LWW Sync**
   - `LibraryContext.tsx` soft-deletes entities using `deletedAt` + `updatedAt`. Do not switch to hard array filtering, or deleted records will resurrect during `mergeDatabases` Drive syncs.

---

## 5. Deployment & Roadmap

- **GitHub Pages CI/CD**: `.github/workflows/deploy-pages.yml` runs on Node `24` for every push to `main`: installs dependencies (`npm ci`), runs `npm test`, builds with `VITE_BASE_PATH=./` and optional `VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}`, and deploys `dist/`.
- **Publishing changes**: `git push origin main`
- **Remaining Roadmap** (`PLAN.md`):
  - **P2**: Stopwatch reading timer, Quotes & Highlights vault
  - **P4**: Google Picker multi-account Drive sharing, real-time sync adapter, conflict inspector, local snapshots, SW cover cache
  - **P6**: Lazy-load `html5-qrcode`, Playwright E2E tests
