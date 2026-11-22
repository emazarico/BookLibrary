# BookLibrary

A local-first, multi-reader household book & audiobook library tracker PWA built with **Vite + React + TypeScript + Tailwind CSS v4**.

## Key Features

- **Multi-User Household Profiles + Optional PIN Lock**: Full-screen *"Who's Reading?"* profile selector, optional 4–6 digit PIN protection (salted SHA-256), and instant profile switching that logs the current reader out before prompting for the next reader's PIN.
- **Parental / Household Admin, PIN Recovery & Badge Rewards**: Designate Parent/Admin profiles who can unlock forgotten reader PINs right from the PIN keypad (*"Forgot PIN? Ask Household Admin"*), manage household roles, and configure custom milestone **Rewards** per reader.
- **Dynamic 3D Book Cards + Custom Cover Upload/Paste**: Tactile tilted book covers with spine sheen, page-edge thickness, CORS-free ambient blurred cover aura, deterministic clothbound fallbacks, and WebP-compressed custom cover uploads / clipboard pastes stored in IndexedDB (`idb-cover:...`).
- **Dual Catalog Search (Open Library + Google Books) & Edition Switcher**: Language-matched search with Google Books fallback (`searchBooksCombined`) for missing covers/synopses/page counts, expandable per-work **Editions & ISBN switcher** in `Search & Add`, and duplicate detection warnings across your own and household shelves before adding.
- **Book Language, Series Grouping, Want-to-Read Notes & Final Reviews**: Track per-book language (`English` default, filterable), multi-volume `Series #N` grouping with completion bars (**By Series** view), `Recommended By` / `Why I Want to Read` comments, and dedicated **Final Reviews** featured in the **Reviews** tab in `My Library`.
- **Ownership Tags, Library Due Dates & Physical Lending Tracker**: Tag books as `Owned`, `Public Library`, `Borrowed`, or `Other` with source notes, due-date / overdue warning badges, and 1-click *Lend Out / Mark Returned* tracking.
- **Family Wishlist & Household Recommendations**: Send book recommendations directly onto another household member's `#wishlist` / `Want to Read` queue, and browse the household-wide **Family Wishlist** modal with 1-click *Add to My Wishlist*.
- **Flexible Progress Tracking (`Pages`, `Chapters`, `Duration hh:mm`)**: Track reading progress by pages, chapter numbers (with optional unknown totals), or `hh:mm` audio timestamps, and optionally capture a star rating + final review when finishing a session.
- **Timeline, Milestones & Reading Badges**: Interactive monthly Pages / Books bar chart, KPI cards with yearly book goal ring, reading streak tracking, 9 unlockable **Milestones & Reading Badges** with optional parent reward notes, and dated session log.
- **Configurable PDF & Printable HTML Reports**: Export customized library reports filtered by reader(s), date range, reading status, format, and tags — with optional summary KPIs, monthly SVG chart, timeline, personal notes, and reading log table.
- **Portable Import & Export**: Lossless BookLibrary Household JSON, single-profile JSON, Legacy v3 JSON migration, Goodreads CSV (preserving `My Review` vs `Private Notes` and `Binding`), StoryGraph CSV import, and Reading Log CSV export.
- **Google Drive Household Sync**: Zero-backend, `$0` cloud sync storing all profiles, shelves, books, and reading logs in a single shared JSON file in Google Drive with Last-Write-Wins (LWW) per-record merge.
- **Modern ISBN Camera Scanner & PWA**: `html5-qrcode` barcode scanner + offline-ready PWA shell.

---

## Local Development

```bash
npm install
npm run dev
```

Run tests and production build:

```bash
npm test
npm run build
```

---

## Setting Up Free Google Drive Sync (Google Auth Platform)

BookLibrary runs purely in your browser using Google Identity Services (GIS) token flow, so **no backend server and no Client Secret** are needed:

1. **Create Project & Enable Drive API**:
   - Open [Google Cloud Console](https://console.cloud.google.com/) and create a free project.
   - Search for **Google Drive API** and click **Enable**.
2. **Configure Google Auth Platform & Test Users**:
   - Open **Google Auth Platform** (or *APIs & Services → OAuth consent screen*) → click **Get Started**.
   - Choose **External** user type and finish creating the app.
   - Go to **Audience** in the left sidebar → under **Test users**, click **+ Add users** and add the Gmail account(s) that will sign in (such as your shared household Google account). *(Without this, Google blocks sign-in with `403: access_denied`.)*
3. **Create a Web Application Client ID (JavaScript Origins ONLY)**:
   - Open **Clients** → click **+ Create client** → select **Web application**.
   - Under **Authorized JavaScript origins**, add your exact origin(s) with **no subpath and no trailing slash**:
     - Local dev: `http://localhost:5173` (and `http://127.0.0.1:5173` if you visit via IP — Google treats them as separate origins!)
     - GitHub Pages: `https://<username>.github.io`
   - Leave **Authorized redirect URIs** completely **blank** (the GIS popup token flow does not use redirect URIs).
   - Click **Create** and copy the **Client ID** (`...apps.googleusercontent.com`).
4. **Adding New Household Devices**:
   - On any new phone or laptop signed into your **shared household Google account**, you only need the **Client ID** (or nothing at all if you configure `VITE_GOOGLE_CLIENT_ID` at build time). Leave **Shared File ID** blank — BookLibrary automatically finds your existing `booklibrary-db.json` (or legacy `omnilibrary-v4-db.json`) on Drive!
   - When Google displays *"Google hasn't verified this app"*, click **Continue** (or **Advanced → Go to BookLibrary**) and grant Drive access.

### Troubleshooting Google Sign-In
- **`403: access_denied`**: Add your Gmail address under **Google Auth Platform → Audience → Test users**.
- **`origin_mismatch` / popup closes immediately**: Verify the exact scheme, hostname, and port in your browser bar match **Authorized JavaScript origins** (note `localhost` vs `127.0.0.1`, no subpath, no trailing `/`).
- **`Drive API has not been used`**: Ensure **Google Drive API** is enabled in *APIs & Services → Library*, then wait ~60 seconds.

---

## Deploy to GitHub Pages

BookLibrary includes `.github/workflows/deploy-pages.yml` and relative asset paths (`VITE_BASE_PATH=./`) out of the box:

1. Create an empty GitHub repository named `BookLibrary` (no README/license).
2. Push your local `main` branch and `v0.1.0` tag:
   ```bash
   git remote add origin https://github.com/<USERNAME>/BookLibrary.git
   git push -u origin main --tags
   ```
3. In your GitHub repo, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
4. *(Optional, recommended)* Under **Settings → Secrets and variables → Actions → Variables → New repository variable**, add `VITE_GOOGLE_CLIENT_ID` with your Web Client ID (`...apps.googleusercontent.com`), then re-run the workflow so every family device has the Client ID pre-filled.
5. In **Google Cloud Console → Google Auth Platform → Clients**, add `https://<USERNAME>.github.io` under **Authorized JavaScript origins** (no `/BookLibrary` path and no trailing slash).
6. Open `https://<USERNAME>.github.io/BookLibrary/` from any phone or laptop and optionally tap **Add to Home Screen** to install as a PWA.
