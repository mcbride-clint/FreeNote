# MarkFlow

A fully client-side Progressive Web App for Markdown note-taking, backed by your own Google Drive. No server, no database, no vendor lock-in — your notes are plain `.md` files in a `MarkFlow` folder on your Drive.

Features:

- CodeMirror 6 editor with live markdown preview
- `[[WikiLink]]` support between notes
- Fuzzy search across all notes (Ctrl/Cmd+K)
- Drag-and-drop import of PDFs and images with text extraction + OCR
- Works offline (Service Worker, IndexedDB cache, offline write queue)
- Installable as a standalone app (PWA)
- Zero backend — pure static hosting, uses OAuth directly from the browser

## Tech Stack

| Concern | Choice |
|---|---|
| Build tool | Vite + TypeScript |
| Editor | CodeMirror 6 |
| Markdown | marked + highlight.js |
| Auth | Google Identity Services (GIS) |
| Storage | Google Drive REST v3 (scope: `drive.file`) |
| Search | Fuse.js |
| OCR | Tesseract.js |
| PDF | pdfjs-dist |
| Offline / PWA | vite-plugin-pwa (Workbox) |

## Google Cloud Setup

MarkFlow authenticates directly against Google from the browser, so you need your own OAuth client:

1. Visit the [Google Cloud Console](https://console.cloud.google.com/) and create a project (or reuse an existing one).
2. Enable the **Google Drive API** under *APIs & Services → Library*.
3. Under *APIs & Services → OAuth consent screen*, configure the consent screen as **External**. Add your Google account as a test user.
4. Under *APIs & Services → Credentials*, create an **OAuth 2.0 Client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:5173` (for local dev)
     - Your production origin, for example `https://yourname.github.io`
   - No redirect URI is required — MarkFlow uses the GIS popup flow.
5. Copy the generated Client ID. You will use it as `VITE_GOOGLE_CLIENT_ID`.

MarkFlow requests the least-privilege scope `drive.file`, which means it can only read and write files it creates itself. It cannot see the rest of your Drive.

## Local Development

Prerequisites: Node 20+.

```bash
npm install
cp .env.example .env
# edit .env and set VITE_GOOGLE_CLIENT_ID=...
npm run dev
```

The app runs at <http://localhost:5173>. Sign in with Google the first time, and a `MarkFlow` folder will be created at the root of your Drive.

## Production Build

```bash
npm run build        # outputs to dist/
npm run preview      # preview the built app locally
```

The output in `dist/` is a fully static bundle — host it on any static provider (GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3, etc.).

### Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | OAuth 2.0 client ID from the Google Cloud Console |
| `VITE_BASE` | Optional base path for the site (defaults to `/`). Used by the GitHub Pages workflow to host under `/<repo-name>/`. |

## Deploying to GitHub Pages

A ready-to-use workflow lives at `.github/workflows/deploy.yml`. It builds and deploys to GitHub Pages on every push to `main`.

Setup:

1. In your repo settings, open *Settings → Pages* and set **Source** to `GitHub Actions`.
2. Open *Settings → Secrets and variables → Actions* and add a **repository secret** named `VITE_GOOGLE_CLIENT_ID` with your OAuth client ID.
3. Add your GitHub Pages URL (for a project site that is `https://<user>.github.io/<repo>/`) as an authorized JavaScript origin on your OAuth client in Google Cloud.
4. Push to `main`. The workflow will build with the correct base path and publish.

Notes:

- The workflow automatically sets `VITE_BASE=/<repo-name>/` so asset URLs resolve correctly on project pages. If you deploy to a custom domain or a user site (`<user>.github.io`), override `VITE_BASE` accordingly.
- A `404.html` copy of `index.html` is added so client-side hash routes and deep links keep working on Pages.

## How It Works

- **Auth.** On first sign-in, MarkFlow requests an access token via GIS. The token is persisted in IndexedDB and silently refreshed when expired. Sign-out revokes the token.
- **Storage.** Each note is a `.md` file in a `MarkFlow` folder at the root of your Drive. The note name is its filename. Files are created via multipart upload and updated with media uploads. The `drive.file` scope means MarkFlow can only touch files it created.
- **Sync.** Writes are debounced by 1.5 seconds. If offline, the write is queued in IndexedDB and flushed when connectivity returns (`navigator.onLine` event). Last-write-wins based on Drive `modifiedTime`.
- **Offline.** Workbox precaches the app shell. Drive API calls are `NetworkOnly` so you never see stale remote state. Notes read from the IndexedDB cache when offline.
- **WikiLinks.** `[[Some Note]]` is parsed in both the editor and the preview. Clicking resolves to an existing note by filename, or navigates to `#/new?title=...` to create one.
- **Imports.** PDFs are first parsed with `pdfjs-dist` for a native text layer. If the text layer is empty (scanned PDF), each page is rendered to a canvas and OCR'd via Tesseract.js. Dropped images go straight to Tesseract.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl`/`Cmd` + `K` | Open search |
| `Ctrl`/`Cmd` + `N` | New note |
| `Ctrl`/`Cmd` + `S` | Force-save current note |
| `Ctrl`/`Cmd` + `B` | Bold (in editor) |
| `Ctrl`/`Cmd` + `I` | Italic (in editor) |

## Privacy

- MarkFlow has **no backend**. There is no analytics, no telemetry, no server receiving your notes.
- Notes live in your Drive under the `drive.file` scope, meaning only files MarkFlow created are visible to the app.
- Your OAuth token is stored locally in IndexedDB.
- Fonts are loaded from Google Fonts (cached by the service worker after first load).

## Project Structure

```
src/
├── main.ts                # entry point
├── app.ts                 # root application shell
├── router.ts              # hash-based router
├── auth/                  # Google Identity Services
├── drive/                 # Drive REST client + sync manager + cache
├── notes/                 # Editor, renderer, note store, wiki links
├── search/                # Fuse.js index
├── ocr/                   # Tesseract + pdfjs extractors
├── ui/                    # Sidebar, toolbar, modals, toasts
├── styles/                # base / renderer / mobile
└── utils/                 # idb, debounce, markdown utils, id gen
```

## Out of Scope / Future

- Real-time collaboration
- End-to-end encryption of Drive files
- Plugin system / custom themes
- Git-backed storage alternative

## License

MIT
