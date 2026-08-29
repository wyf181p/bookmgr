# 📚 Local Document Manager (文档管理器)

A local document management desktop application built with **Electron**, for centrally organizing books, documents, and various text files on your computer. It manages the mapping between documents and their local paths — making it easy to classify, find, and open them without remembering where each file is saved.

The web UI can also run standalone in a browser (`node server.js`), which gives you print preview support that Electron itself lacks.

---

## ✨ Features

- **Library-based organization** — group scattered local documents into libraries; drag to reorder; switch with one click
- **Direct preview** — no need to open other software for:
  - **Markdown** with an enhanced rendering engine: KaTeX math formulas, mermaid diagrams, JSXGraph math figures, syntax highlighting, line numbers, copy button, front-matter metadata, and a clickable table of contents
  - **Plain text / code** (many languages) with syntax highlighting and line numbers
  - **HTML** (sandboxed iframe), **PDF** (pdf.js viewer), **images** (zoom + thumbnail navigator)
  - **Folders** — browse directory contents as a file list
- **Tag system** — tag documents, filter and search by tag; one document can have multiple tags
- **Full-content keyword search** — search documents by library / type / name / tag, with `*` wildcards; batch-save results to a library
- **Find inside a document** — <kbd>Ctrl+F</kbd> find bar with hit highlighting (Markdown / text / code / HTML)
- **Tabs & multi-view** — lock any preview as a tab; drag-sort tabs; drag tabs to the right/bottom to create side-by-side views for multi-document browsing
- **Export / Import backup** — data is stored in a local `library.json`; export all libraries to a single JSON file and import it back anytime
- **Open with system software** — "Open With" dialog, plus an editor picker that scans installed editors (VS Code, etc.)
- **Auto-hide toolbar** — right-click the nav area to toggle auto-hide for a larger reading area
- **🌐 Chinese / English UI** — switch language in the settings window, or edit `config.json` manually; on first launch the language is auto-detected from the system locale (Chinese systems → Chinese, otherwise English)

---

## 🖥️ Requirements

- **Node.js** ≥ 18 (for development)
- **npm** (bundled with Node.js)
- Windows / macOS / Linux (packaging targets are configurable in `package.json`)

---

## 🚀 Getting Started

### Run as a desktop app (Electron)

```bash
npm install
npm run electron
```

### Run as a web app (browser mode)

```bash
npm start
# or
node server.js
```

Then open the printed URL (e.g. `http://localhost:3081`) in your browser. Browser mode supports print preview; the Electron app does not (see the help document for details).

### Build the installer

```bash
npm run dist
```

Builds a Windows NSIS installer via electron-builder (output in `dist/`).

---

## ⚙️ Configuration

Settings are stored in **`config.json`**, which lives next to the executable in a packaged install (so you can edit it manually), or in the project root in development.

```json
{
  "listenAddress": "127.0.0.1",
  "listenPort": 0,
  "language": "zh"
}
```

| Key | Description |
|-----|-------------|
| `listenAddress` | HTTP listen address. **Default: `127.0.0.1`** — local only (this is what a fresh install writes on first launch); change to `0.0.0.0` to listen on all interfaces (LAN access). Other local IPv4 addresses are also available. |
| `listenPort` | HTTP listen port. **Default: `0`** = a random free port. Range `3000–65535`. |
| `language` | UI language: `"zh"` (Chinese, default) or `"en"` (English). If the file is missing or has no `language` key on first launch, it is auto-detected from the system locale and written back. |

You can also change the language at runtime: **Help → Settings** → Interface Language, then it takes effect immediately (listen address/port still require a restart).

> The settings window also shows the exact config file path.

---

## 📖 Documentation

The app ships with two help documents (Chinese and English versions), opened from the **Help** menu:

| Document | Description |
|----------|-------------|
| `public/bookmgr_usage.md` / `_en.md` | Software user guide (libraries, documents, preview, tabs, search, shortcuts…) |
| `public/markdown_katex_tool.md` / `_en.md` | Markdown extended syntax help: basic syntax, LaTeX/KaTeX formulas, math figures (JSXGraph), mermaid diagrams, page properties (front-matter / YAML), CSS styling |

---

## 🗂️ Data Storage

- **`library.json`** — all library/document/tag records. Located in the app data directory (packaged) or the project root (development). Deleting a library or document only removes the **record**; the original files on disk are never touched.
- **`config.json`** — server and language settings (see above).

---

## 🏗️ Project Structure

```
book-mgr/
├── main.js              # Electron main process: window, menu, dialogs, settings IPC, config
├── preload.js           # contextBridge: exposes print / open / settings APIs to the renderer
├── server.js            # Express backend: static files, REST API, print-preview store
├── settings.html        # Settings window (listen address/port, interface language)
├── config.json          # Server + language settings (manually editable)
├── public/              # Web UI (served by server.js)
│   ├── index.html       # Main page
│   ├── app.js           # UI logic (libraries, documents, preview, tabs, search…)
│   └── js/i18n.js       # Chinese/English i18n (dictionary + DOM translation)
├── tools/               # Dev utilities (i18n audit / tests, doc translation generator)
├── package.json
└── LICENSE              # MIT License
```

### REST API (selected)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/library` · `POST /api/library` · `PUT/DELETE /api/library/:id` | Library CRUD |
| `POST /api/library/:id/documents` · `PUT/DELETE …/:docId` | Document CRUD |
| `GET /api/document/content` | Read document content |
| `POST /api/pdf/convert` | PDF rendering pipeline |
| `GET /api/export` · `POST /api/import` | Backup export / import |
| `GET /api/browse/list` · `GET /api/drives` | File/drive browsing |
| `GET /api/editors` · `POST /api/editors/scan` | Installed editor discovery |
| `GET /api/config` | Language config (browser mode) |
| `/fs/*` | Serve files relative to the web root |

---

## 🛠️ Development

- `node --check` on the JS files, plus Electron headless UI tests in `tools/` (e.g. `tools/i18n_test.js`) can be used to regression-check the Chinese/English UI.
- `tools/audit_i18n.py` audits whether every UI string has an i18n dictionary entry.
- `tools/gen_mdtool_en.py` regenerates the English Markdown-syntax help document from the Chinese one (translation pairs in `tools/trans_pairs_a.py`).

---

## 📄 License

[MIT](LICENSE) © 2026 sw
