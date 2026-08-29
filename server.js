const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { marked } = require('marked');
const { spawn, exec, execFile, execFileSync } = require('child_process');

const app = express();

app.use(cors());
app.use(express.json());
// ===== UI language (browser mode) =====
// In Electron mode the main process passes ?lang= via the page URL; in pure browser mode (node server.js) it reads
// the language field from config.json in the project root, used by the UI and the print preview page.
const SERVER_CONFIG_FILE = path.join(__dirname, 'config.json');
function readServerLanguage() {
  try {
    if (fs.existsSync(SERVER_CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SERVER_CONFIG_FILE, 'utf8'));
      if (raw.language === 'en' || raw.language === 'zh') return raw.language;
    }
  } catch (e) { /* ignore */ }
  return 'zh';
}
// In browser mode, inject the configured language (?lang=) when accessing the root path; the renderer process i18n.js uses it to show the corresponding language UI
app.get('/', (req, res, next) => {
  if (!req.query.lang) return res.redirect('/?lang=' + readServerLanguage());
  next();
});
// In browser mode, read the UI language config (for debugging / extension use)
app.get('/api/config', (req, res) => {
  res.json({ language: readServerLanguage() });
});
// Web static root directory (public): relative links inside markdown are resolved against this root
const WEB_ROOT = path.join(__dirname, 'public');
app.use(express.static(WEB_ROOT));
// pdf.js browser library (used for blank PDF pixel detection): expose the pdfjs-dist build artifacts from node_modules
app.use('/pdfjs', express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build')));

// ===== Print preview: Electron has no built-in PDF viewer, so the preview page renders with pdf.js =====
// The main process first stores the generated PDF bytes here; the preview page retrieves them by one-time token (prevents unauthorized fetching, expires in 5 minutes)
let printPreviewStore = {};
function storePrintPreview(buffer) {
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  printPreviewStore[token] = { buffer, expires: Date.now() + 5 * 60 * 1000 };
  for (const k of Object.keys(printPreviewStore)) {
    if (printPreviewStore[k].expires < Date.now()) delete printPreviewStore[k];
  }
  return token;
}

// Print preview page (pdf.js renders each page as an image, with a "Print" button that calls window.print for system printing)
app.get('/print-preview', (req, res) => {
  const { token, title, lang } = req.query;
  const en = lang === 'en';
  if (!token || !printPreviewStore[token]) {
    return res.type('html').send(en ? '<h3>The print preview has expired, please try again.</h3>' : '<h3>打印预览已失效，请重新操作。</h3>');
  }
  res.type('html').send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${en ? 'Print Preview' : '打印预览'}</title>
<style>
  body { margin: 0; background: #525659; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
  #bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; background: #2d2d30; color: #fff; padding: 8px 16px; }
  #bar strong { font-size: 14px; }
  #bar span { font-size: 13px; opacity: .8; }
  #printBtn { margin-left: auto; padding: 6px 18px; border: 0; border-radius: 6px; background: #3b82f6; color: #fff; font-size: 14px; cursor: pointer; }
  #printBtn:hover { background: #2563eb; }
  #loading { color: #fff; padding: 40px; text-align: center; font-size: 14px; }
  #pages { padding: 20px; }
  .page { background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.45); max-width: 820px; margin: 0 auto 16px; }
  .page img { display: block; width: 100%; height: auto; }
  @media print {
    #bar { display: none; }
    body { background: #fff; }
    #pages { padding: 0; }
    .page { max-width: none; margin: 0; box-shadow: none; page-break-after: always; }
  }
</style>
</head>
<body>
  <div id="bar"><strong>${en ? 'Print Preview' : '打印预览'}</strong><span>${en ? 'Total <b id="pagesCount">0</b> pages' : '共 <b id="pagesCount">0</b> 页'}</span>
    <button id="printBtn">${en ? 'Print' : '打印'}</button></div>
  <div id="loading">${en ? 'Loading PDF…' : '正在加载 PDF…'}</div>
  <div id="pages"></div>
  <script type="module">
    const params = new URLSearchParams(location.search);
    if (params.get('title')) document.title = params.get('title');
    const en = params.get('lang') === 'en';
    document.getElementById('printBtn').onclick = () => window.print();
    try {
      const pdfjs = await import('/pdfjs/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      const res = await fetch('/print-preview/pdf?token=' + params.get('token'));
      if (!res.ok) throw new Error(en ? 'Failed to get PDF' : '获取 PDF 失败');
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise;
      document.getElementById('pagesCount').textContent = pdf.numPages;
      document.getElementById('loading').remove();
      const pagesEl = document.getElementById('pages');
      const baseW = 820;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = baseW / vp1.width;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width * 2);
        canvas.height = Math.floor(vp.height * 2);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const wrap = document.createElement('div');
        wrap.className = 'page';
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        img.alt = en ? 'Page ' + i : '第 ' + i + ' 页';
        wrap.appendChild(img);
        pagesEl.appendChild(wrap);
      }
    } catch (e) {
      const l = document.getElementById('loading');
      l.textContent = (en ? 'Load failed: ' : '加载失败: ') + (e && e.message || e);
    }
  </script>
</body>
</html>`);
});

// Return the PDF bytes needed for print preview by one-time token
app.get('/print-preview/pdf', (req, res) => {
  const { token } = req.query;
  const item = token && printPreviewStore[token];
  if (!item) return res.status(404).end();
  delete printPreviewStore[token];
  res.setHeader('Content-Type', 'application/pdf');
  res.send(item.buffer);
});

// Convert an absolute disk path to a path relative to the web root (separated by forward slashes);
// files located outside the web root get a ../ prefix, consistent with how the file list data-path is accessed,
// e.g. D:/AI_learning/.../docs/architecture.zh.md → ../../../../AI_learning/.../docs/architecture.zh.md
function toServerRelPath(absPath) {
  const rel = path.relative(WEB_ROOT, absPath);
  return rel.split(path.sep).join('/');
}

// Detect whether a PDF has a "blank preview" risk: PDFs generated by tools like Typst may render blank in the Chromium built-in viewer
// (pdf.js), but system PDF software can open them normally.
// Only scan the head and tail of the file (the Info dictionary / XMP metadata are usually located there); return true if any feature matches.
const PDF_BLANK_RISK_PATTERNS = [
  /\/Creator\s*\([^)]*Typst[^)]*\)/i,                 // Info dictionary Creator field
  /<xmp:Creator>[^<]*Typst[^<]*<\/xmp:Creator>/i,     // XMP metadata
];
function detectPdfBlankRisk(absPath) {
  try {
    const fd = fs.openSync(absPath, 'r');
    const size = fs.fstatSync(fd).size;
    const headLen = Math.min(size, 64 * 1024);
    const tailLen = Math.min(size, 256 * 1024);
    const buf = Buffer.alloc(headLen + tailLen);
    fs.readSync(fd, buf, 0, headLen, 0);
    fs.readSync(fd, buf, headLen, tailLen, Math.max(0, size - tailLen));
    fs.closeSync(fd);
    return PDF_BLANK_RISK_PATTERNS.some(re => re.test(buf.toString('latin1')));
  } catch (e) {
    return false;
  }
}

// Infer the document type from the file path (shared by add/edit document saving and /api/document/content reading, to avoid mapping drift)
// Returns 'weblink' | 'folder' | specific type | 'other'
function detectDocType(docPath, existingStats) {
  const urlPattern = /^https?:\/\//i;
  if (urlPattern.test(docPath)) return 'weblink';
  if (!existingStats) {
    try {
      existingStats = fs.statSync(docPath);
    } catch (e) {
      existingStats = null; // infer by extension when the path does not exist
    }
  }
  if (existingStats && existingStats.isDirectory()) return 'folder';

  const ext = path.extname(docPath).toLowerCase();
  const docTypes = {
    '.md': 'markdown', '.mdx': 'markdown',
    '.txt': 'text',
    '.log': 'log',
    '.py': 'python', '.php': 'php', '.c': 'c', '.h': 'cheader',
    '.cpp': 'cpp', '.hpp': 'cpp', '.java': 'java',
    '.cmd': 'cmd', '.bat': 'bat', '.ini': 'ini', '.sh': 'shell',
    '.rs': 'rust', '.toml': 'toml', '.xml': 'xml', '.yml': 'yaml', '.yaml': 'yaml',
    '.htm': 'html', '.html': 'html',
    '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.json': 'json', '.css': 'css',
    '.csv': 'csv', '.ts': 'ts', '.tsx': 'ts', '.jsx': 'jsx',
    '.cs': 'cs', '.go': 'go', '.rb': 'rb', '.ps1': 'ps1', '.sql': 'sql',
    '.swift': 'swift', '.kt': 'kt', '.scala': 'scala', '.lua': 'lua', '.pl': 'pl',
    '.r': 'r', '.vue': 'vue', '.scss': 'scss', '.less': 'less',
    '.conf': 'conf', '.cfg': 'conf', '.properties': 'properties', '.gradle': 'gradle',
    '.pdf': 'pdf',
    '.jpg': 'picture', '.jpeg': 'picture', '.png': 'picture', '.gif': 'picture',
    '.bmp': 'picture', '.svg': 'svg-html', '.webp': 'picture',
    '.docx': 'docx', '.doc': 'docx', '.xlsx': 'xlsx', '.xls': 'xlsx',
    '.pptx': 'pptx', '.ppt': 'pptx',
    // video/audio: cannot be previewed in-app, opened by the system default program
    '.mp4': 'video', '.mkv': 'video', '.avi': 'video', '.mov': 'video', '.wmv': 'video',
    '.flv': 'video', '.webm': 'video', '.m4v': 'video', '.mpg': 'video', '.mpeg': 'video',
    '.3gp': 'video', '.rmvb': 'video', '.rm': 'video', '.vob': 'video',
    '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio', '.aac': 'audio', '.ogg': 'audio',
    '.m4a': 'audio', '.wma': 'audio', '.ape': 'audio', '.opus': 'audio',
    '.mid': 'audio', '.midi': 'audio', '.amr': 'audio', '.aiff': 'audio'
  };
  let type = docTypes[ext] || 'other';
  // Extensionless dot files (path.extname returns an empty string) are matched by file name: .env/.gitignore/.editorconfig
  if (type === 'other' && !ext) {
    const base = path.basename(docPath).toLowerCase();
    if (base === '.env') type = 'env';
    else if (base === '.gitignore') type = 'gitignore';
    else if (base === '.editorconfig') type = 'editorconfig';
    else if (['readme','makefile','copying','copyrights','license','authors','manifest'].includes(base)) type = 'text';
  }
  return type;
}

const getDataDir = () => {
  if (process.env.APP_DATA_DIR) {
    return process.env.APP_DATA_DIR;
  }
  return __dirname;
};

const DB_FILE = path.join(getDataDir(), 'library.json');
console.log(`Library database file: ${DB_FILE}`);

function loadLibrary() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveLibrary(library) {
  fs.writeFileSync(DB_FILE, JSON.stringify(library, null, 2), 'utf8');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ===== Directory browsing (simulates a file open dialog) =====
// Each client session (sessionId) records the last directory it accessed;
// when there is no record or the directory no longer exists, fall back to the app's own directory (default path).
const BROWSE_DEFAULT_DIR = getDataDir();
const browseSessions = new Map(); // sessionId -> { lastDir }

function normalizeBrowseDir(dir) {
  if (!dir || typeof dir !== 'string') return null;
  if (!path.isAbsolute(dir)) return null;
  return path.normalize(dir);
}

// Resolve the directory to display for this browse request: prefer the requested directory, otherwise the session's last visited directory, finally fall back to the default directory
function resolveBrowseDir(sessionId, requestedDir) {
  const session = browseSessions.get(sessionId) || {};
  let dir = normalizeBrowseDir(requestedDir) || normalizeBrowseDir(session.lastDir);
  if (!dir) dir = BROWSE_DEFAULT_DIR;
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      dir = BROWSE_DEFAULT_DIR;
    }
  } catch (e) {
    dir = BROWSE_DEFAULT_DIR;
  }
  browseSessions.set(sessionId, { lastDir: dir });
  return dir;
}

// List the subdirectories and files in the first level of a directory (directories first, then files, each sorted by name)
// exts is an optional file-extension whitelist (e.g. ['.md', '.markdown']); directories are not affected by the filter
function listDirectory(dir, exts) {
  const stats = fs.statSync(dir);
  if (!stats.isDirectory()) {
    throw new Error('指定路径不是目录');
  }
  const entries = fs.readdirSync(dir);
  const items = [];
  for (const name of entries) {
    const fullPath = path.join(dir, name);
    let isDir = false;
    let size = null;
    let mtime = null;
    try {
      const s = fs.statSync(fullPath);
      isDir = s.isDirectory();
      size = s.isFile() ? s.size : null;
      mtime = s.mtime;
    } catch (e) {
      continue; // skip entries without permission or that are invalid
    }
    if (!isDir && Array.isArray(exts) && exts.length > 0) {
      const ext = path.extname(name).toLowerCase();
      if (!exts.includes(ext)) continue;
    }
    items.push({ name, path: fullPath, isDir, size, mtime: mtime ? mtime.toISOString() : null });
  }
  items.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
  return items;
}

app.post('/api/browse/list', (req, res) => {
  const { sessionId, dir, exts } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ error: '缺少 sessionId' });
  }
  try {
    const currentDir = resolveBrowseDir(sessionId, dir);
    const items = listDirectory(currentDir, exts);
    const parentDir = path.dirname(currentDir);
    res.json({
      currentDir,
      parentDir: parentDir === currentDir ? null : parentDir,
      items
    });
  } catch (e) {
    res.status(500).json({ error: `读取目录失败: ${e.message}` });
  }
});

// Windows drive list (drive shortcut buttons in the browse dialog; on non-Windows platforms returns the root directory)
app.get('/api/drives', (req, res) => {
  const drives = [];
  try {
    if (process.platform === 'win32') {
      for (let c = 65; c <= 90; c++) {
        const letter = String.fromCharCode(c);
        const root = letter + ':/';
        try {
          fs.statSync(root);
          drives.push({ name: letter + ':', path: root });
        } catch (e) {
          // drive letter does not exist or is inaccessible, skip
        }
      }
    } else {
      const root = path.parse(__dirname).root;
      if (fs.statSync(root)) {
        drives.push({ name: '/', path: root });
      }
    }
  } catch (e) {
    // ignore
  }
  res.json({ drives });
});

app.get('/api/library', (req, res) => {
  const library = loadLibrary();
  res.json(library);
});

app.post('/api/library', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: '书库名称不能为空' });
  }
  
  const library = loadLibrary();
  const existing = library.find(b => b.name === name);
  if (existing) {
    return res.status(400).json({ error: '书库名称已存在' });
  }
  
  const newLibrary = {
    id: generateId(),
    name,
    documents: [],
    createdAt: new Date().toISOString()
  };
  
  library.push(newLibrary);
  saveLibrary(library);
  res.json(newLibrary);
});

app.put('/api/library/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: '书库名称不能为空' });
  }
  
  const library = loadLibrary();
  const index = library.findIndex(b => b.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: '书库不存在' });
  }
  
  const existing = library.find(b => b.name === name && b.id !== id);
  if (existing) {
    return res.status(400).json({ error: '书库名称已存在' });
  }
  
  library[index].name = name;
  saveLibrary(library);
  res.json(library[index]);
});

app.delete('/api/library/:id', (req, res) => {
  const { id } = req.params;
  let library = loadLibrary();
  const index = library.findIndex(b => b.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: '书库不存在' });
  }
  
  const deleted = library.splice(index, 1)[0];
  saveLibrary(library);
  res.json(deleted);
});

app.post('/api/library/:id/documents', (req, res) => {
  const { id } = req.params;
  const { name, path: docPath, tags } = req.body;
  
  if (!name || !docPath) {
    return res.status(400).json({ error: '文档名称和路径不能为空' });
  }
  
  const library = loadLibrary();
  const book = library.find(b => b.id === id);
  
  if (!book) {
    return res.status(404).json({ error: '书库不存在' });
  }
  
  const existing = book.documents.find(d => d.path === docPath);
  if (existing) {
    return res.status(400).json({ error: '文档已存在' });
  }
  
  const docType = detectDocType(docPath);
  
  const newDocument = {
    id: generateId(),
    name,
    path: docPath,
    type: docType,
    tags: Array.isArray(tags) ? tags.filter(t => typeof t === 'string' && t.trim()) : [],
    createdAt: new Date().toISOString()
  };
  
  book.documents.push(newDocument);
  saveLibrary(library);
  res.json(newDocument);
});

// Reorder document sequence (changes the in-memory record order, i.e. the "default sort" order)
// Note: must be placed before PUT /documents/:docId, to avoid "reorder" being matched as a docId
app.put('/api/library/:id/documents/reorder', (req, res) => {
  const { id } = req.params;
  const { docIds } = req.body;

  const library = loadLibrary();
  const book = library.find(b => b.id === id);
  if (!book) {
    return res.status(404).json({ error: '书库不存在' });
  }
  if (!Array.isArray(docIds)) {
    return res.status(400).json({ error: '缺少文档 id 列表' });
  }

  const orderMap = new Map(book.documents.map(d => [d.id, d]));
  const reordered = [];
  const seen = new Set();
  for (const docId of docIds) {
    if (typeof docId === 'string' && !seen.has(docId) && orderMap.has(docId)) {
      reordered.push(orderMap.get(docId));
      seen.add(docId);
    }
  }
  // Backfill documents not included in the list (preserving their original relative order) to prevent data loss
  book.documents.forEach(d => {
    if (!seen.has(d.id)) {
      reordered.push(d);
    }
  });

  book.documents = reordered;
  saveLibrary(library);
  res.json(book.documents);
});

app.put('/api/library/:id/documents/:docId', (req, res) => {
  const { id, docId } = req.params;
  const { name, path: docPath, tags } = req.body;
  
  if (!name || !docPath) {
    return res.status(400).json({ error: '文档名称和路径不能为空' });
  }
  
  const library = loadLibrary();
  const book = library.find(b => b.id === id);
  
  if (!book) {
    return res.status(404).json({ error: '书库不存在' });
  }
  
  const index = book.documents.findIndex(d => d.id === docId);
  if (index === -1) {
    return res.status(404).json({ error: '文档不存在' });
  }
  
  const existing = book.documents.find(d => d.path === docPath && d.id !== docId);
  if (existing) {
    return res.status(400).json({ error: '文档已存在' });
  }
  
  const docType = detectDocType(docPath);
  
  book.documents[index] = {
    ...book.documents[index],
    name,
    path: docPath,
    type: docType,
    tags: Array.isArray(tags) ? tags.filter(t => typeof t === 'string' && t.trim()) : (book.documents[index].tags || []),
    updatedAt: new Date().toISOString()
  };
  
  saveLibrary(library);
  res.json(book.documents[index]);
});

app.delete('/api/library/:id/documents/:docId', (req, res) => {
  const { id, docId } = req.params;
  
  const library = loadLibrary();
  const book = library.find(b => b.id === id);
  
  if (!book) {
    return res.status(404).json({ error: '书库不存在' });
  }
  
  const index = book.documents.findIndex(d => d.id === docId);
  if (index === -1) {
    return res.status(404).json({ error: '文档不存在' });
  }
  
  const deleted = book.documents.splice(index, 1)[0];
  saveLibrary(library);
  res.json(deleted);
});

// Get the set of tags across all documents in the library (deduplicated and sorted)
app.get('/api/library/:id/tags', (req, res) => {
  const { id } = req.params;
  const library = loadLibrary();
  const book = library.find(b => b.id === id);
  if (!book) {
    return res.status(404).json({ error: '书库不存在' });
  }
  const tagSet = new Set();
  (book.documents || []).forEach(d => {
    (d.tags || []).forEach(t => tagSet.add(t));
  });
  res.json(Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN')));
});

// Add a tag to a document
app.post('/api/library/:id/documents/:docId/tags', (req, res) => {
  const { id, docId } = req.params;
  const { tag } = req.body;
  if (!tag || typeof tag !== 'string' || !tag.trim()) {
    return res.status(400).json({ error: '标签不能为空' });
  }
  const trimmed = tag.trim();
  // Validation: only a-zA-Z0-9_- and Chinese characters are allowed (place - at the end of the character class to avoid being treated as a range operator)
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5-]+$/.test(trimmed)) {
    return res.status(400).json({ error: '标签只能包含字母、数字、_、- 和中文' });
  }

  const library = loadLibrary();
  const book = library.find(b => b.id === id);
  if (!book) {
    return res.status(404).json({ error: '书库不存在' });
  }
  const doc = book.documents.find(d => d.id === docId);
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }
  if (!Array.isArray(doc.tags)) doc.tags = [];
  if (!doc.tags.includes(trimmed)) {
    doc.tags.push(trimmed);
    saveLibrary(library);
  }
  res.json(doc);
});

// Remove a tag from a document
app.delete('/api/library/:id/documents/:docId/tags/:tag', (req, res) => {
  const { id, docId, tag } = req.params;
  const library = loadLibrary();
  const book = library.find(b => b.id === id);
  if (!book) {
    return res.status(404).json({ error: '书库不存在' });
  }
  const doc = book.documents.find(d => d.id === docId);
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }
  if (Array.isArray(doc.tags)) {
    doc.tags = doc.tags.filter(t => t !== tag);
    saveLibrary(library);
  }
  res.json(doc);
});

app.get('/api/document/content', (req, res) => {
  const { filePath, force } = req.query;
  
  if (!filePath) {
    return res.status(400).json({ error: '文件路径不能为空' });
  }
  
  try {
    let normalizedPath = filePath;
    
    // Relative path (e.g. ../../../../AI_learning/xxx.md, from markdown internal relative link resolution)
    // resolved against the web root (public) into an absolute disk path, allowing access to files outside the web root
    if (!path.isAbsolute(normalizedPath)) {
      normalizedPath = path.resolve(WEB_ROOT, normalizedPath);
    }
    normalizedPath = path.normalize(normalizedPath);
    
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: `文件不存在: ${normalizedPath}` });
    }
    
    const stats = fs.statSync(normalizedPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: '指定路径不是文件' });
    }
    
    const ext = path.extname(normalizedPath).toLowerCase();
    // The file's access path relative to the web root (with ../ prefix outside the web root, for markdown relative link resolution)
    // plus the absolute disk path (for opening the containing folder, etc.)
    const serverRelPath = toServerRelPath(normalizedPath);
    const absPath = normalizedPath;
    const sendResult = (payload) => res.json({ ...payload, serverRelPath, absPath, size: stats.size });
    
    // Determine type by extension (kept consistent with the frontend inferDocType; only determine type, do not read file content)
    const docType = detectDocType(normalizedPath, stats);
    
    // Unsupported document types: do not read file content (reading a binary file as utf8 produces garbage),
    // the frontend shows "document preview not supported" and provides a button to open it with an external system program
    if (docType === 'other') {
      return sendResult({ content: '', rawContent: '', type: 'other', unsupported: true });
    }
    
    // office / video / audio and other non-previewable documents are opened by the system application; content is not read
    if (docType === 'docx' || docType === 'xlsx' || docType === 'pptx' || docType === 'video' || docType === 'audio') {
      return sendResult({ content: '', rawContent: '', type: docType });
    }
    
    // Files larger than 100MB: first return the file size info; after the frontend shows a prompt
    // the user clicks "Continue" to re-request reading the content with the force=1 parameter
    const MAX_PREVIEW_SIZE = 100 * 1024 * 1024;
    if (stats.size > MAX_PREVIEW_SIZE && force !== '1') {
      return sendResult({ content: '', rawContent: '', type: docType, oversized: true });
    }
    
    // Step two: read and return the content
    if (docType === 'markdown') {
      const content = fs.readFileSync(normalizedPath, 'utf8');
      sendResult({ 
        content: marked.parse(content), 
        rawContent: content,
        type: 'markdown' 
      });
    } else if (docType === 'html') {
      const content = fs.readFileSync(normalizedPath, 'utf8');
      sendResult({ content, rawContent: content, type: 'html' });
    } else if (docType === 'svg-html') {
      const content = fs.readFileSync(normalizedPath, 'utf8');
      sendResult({ 
        content: content, 
        rawContent: content,
        type: 'svg-html' 
      });
    } else if (docType === 'picture') {
      const base64 = fs.readFileSync(normalizedPath, 'base64');
      sendResult({ 
        content: `data:image/${ext.slice(1)};base64,${base64}`, 
        type: 'picture' 
      });
    } else if (docType === 'pdf') {
      const base64 = fs.readFileSync(normalizedPath, 'base64');
      sendResult({ 
        content: `data:application/pdf;base64,${base64}`, 
        type: 'pdf',
        pdfBlankRisk: detectPdfBlankRisk(normalizedPath)
      });
    } else {
      // text/code types: return the original text, highlighted by the frontend hljs
      const content = fs.readFileSync(normalizedPath, 'utf8');
      sendResult({ 
        content: `<pre>${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`, 
        rawContent: content,
        type: docType 
      });
    }
  } catch (e) {
    res.status(500).json({ error: `读取文件失败: ${e.message}` });
  }
});

// pdftocairo rewrites problematic PDFs (generated by Typst, etc.) into a Chromium-viewable PDF.
// Windows: use the bundled pdftocairo.exe (copied from MiKTeX bin).
// macOS / Linux: there is no bundled .exe; prefer a system-installed poppler pdftocairo instead.
// Returns the binary path when available, or null when no conversion tool can be found.
function findPdfTool(platform = process.platform) {
  if (process.env.PDF_CAIRO_BIN) {
    return process.env.PDF_CAIRO_BIN;
  }
  if (platform === 'win32') {
    return path.join(__dirname, 'tools', 'pdftocairo', 'pdftocairo.exe');
  }
  // macOS / Linux: search for a real pdftocairo (poppler-utils / Homebrew / MacPorts)
  const candidates = [
    'pdftocairo',                 // resolves via PATH
    '/usr/bin/pdftocairo',
    '/usr/local/bin/pdftocairo',
    '/opt/homebrew/bin/pdftocairo',
    '/opt/local/bin/pdftocairo'   // MacPorts
  ];
  for (const c of candidates) {
    if (c === 'pdftocairo') {
      // Probe whether pdftocairo is available in PATH
      try {
        execFileSync('pdftocairo', ['-v'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
        return 'pdftocairo';
      } catch (_) {
        // not available
      }
    } else if (fs.existsSync(c)) {
      return c;
    }
  }
  return null;
}

// PDF blank-risk conversion: use pdftocairo to rewrite the original PDF into a standard PDF,
// so documents that the Chromium built-in viewer cannot render properly (generated by Typst, etc.) can display in the preview area.
// The conversion result is written to the system temp directory, read as base64, returned, and finally the temp file is cleaned up.
app.post('/api/pdf/convert', (req, res) => {
  const { filePath } = req.body || {};
  if (!filePath) {
    return res.status(400).json({ error: '文件路径不能为空' });
  }
  let normalizedPath = filePath;
  try {
    if (!path.isAbsolute(normalizedPath)) {
      normalizedPath = path.resolve(WEB_ROOT, normalizedPath);
    }
    normalizedPath = path.normalize(normalizedPath);
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: `文件不存在: ${normalizedPath}` });
    }
    const stats = fs.statSync(normalizedPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: '指定路径不是文件' });
    }
    if (path.extname(normalizedPath).toLowerCase() !== '.pdf') {
      return res.status(400).json({ error: '仅支持 PDF 文件转换' });
    }
    const pdfTool = findPdfTool();
    if (!pdfTool) {
      // No conversion tool available (e.g. macOS/Linux without poppler): serve the original PDF as-is
      // so the preview still works for documents Chromium can render; problematic PDFs can be opened externally.
      const stats = fs.statSync(normalizedPath);
      const base64 = fs.readFileSync(normalizedPath, 'base64');
      return res.json({
        content: `data:application/pdf;base64,${base64}`,
        type: 'pdf',
        serverRelPath: toServerRelPath(normalizedPath),
        absPath: normalizedPath,
        size: stats.size,
        converted: false,
        warning: '未找到系统转换工具 pdftocairo，已直接显示原始 PDF（部分由 Typst 等生成的 PDF 可能无法正常预览，建议用系统软件打开）'
      });
    }

    const tmpOut = path.join(os.tmpdir(), `bookmgr-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`);
    execFile(pdfTool, ['-pdf', normalizedPath, tmpOut], { windowsHide: true, timeout: 120000 }, (err, stdout, stderr) => {
      const cleanup = () => { try { fs.unlinkSync(tmpOut); } catch (_) {} };
      if (err) {
        cleanup();
        console.error(`pdftocairo 转换失败: ${err.message}`, stderr || '');
        return res.status(500).json({ error: `PDF 转换失败: ${err.message}` });
      }
      try {
        if (!fs.existsSync(tmpOut)) {
          cleanup();
          return res.status(500).json({ error: 'PDF 转换失败: 未生成输出文件' });
        }
        const outStats = fs.statSync(tmpOut);
        const base64 = fs.readFileSync(tmpOut, 'base64');
        cleanup();
        res.json({
          content: `data:application/pdf;base64,${base64}`,
          type: 'pdf',
          serverRelPath: toServerRelPath(normalizedPath),
          absPath: normalizedPath,
          size: outStats.size,
          converted: true
        });
      } catch (e) {
        cleanup();
        res.status(500).json({ error: `读取转换结果失败: ${e.message}` });
      }
    });
  } catch (e) {
    res.status(500).json({ error: `PDF 转换失败: ${e.message}` });
  }
});

app.post('/api/export', (req, res) => {
  const library = loadLibrary();
  res.json(library);
});

app.post('/api/import', (req, res) => {
  const data = req.body;
  
  if (!Array.isArray(data)) {
    return res.status(400).json({ error: '导入数据格式不正确' });
  }
  
  if (fs.existsSync(DB_FILE)) {
    const backupFile = DB_FILE + '.bk';
    fs.copyFileSync(DB_FILE, backupFile);
    console.log(`Backup saved to: ${backupFile}`);
  }
  
  saveLibrary(data);
  res.json({ success: true, count: data.length });
});

// mdx/markdown document resource path resolution. Supports two kinds of resource references:
//  - "/" -prefixed resources (e.g. /docs/images/architecture-layers.png): search the document root
//    upward from the current document's directory for the first segment (e.g. docs); the parent of
//    that layer becomes the mdx document root, then verify documentRoot + resource exists.
//  - relative resources (./x, ../x, or a bare name x): resolve directly against the current
//    document's own directory.
// exists -> { found: true, absPath, serverRelPath }; otherwise -> { found: false }
app.get('/api/mdx-resolve', (req, res) => {
  const { filePath, resource } = req.query;
  if (!filePath || !resource) {
    return res.json({ found: false });
  }
  try {
    // Normalize the document path to an absolute path (relative paths resolve against web root)
    let docAbs;
    if (path.isAbsolute(filePath)) {
      docAbs = path.normalize(filePath);
    } else {
      docAbs = path.resolve(WEB_ROOT, filePath);
    }
    if (!fs.existsSync(docAbs)) return res.json({ found: false });

    if (resource.startsWith('/')) {
      // "/" -prefixed: search the document root upward for the first segment of the resource
      const parts = resource.split('/').filter(Boolean);
      if (parts.length === 0) return res.json({ found: false });
      const first = parts[0];
      let dir = path.dirname(docAbs);
      let docRoot = null;
      while (true) {
        const candidate = path.join(dir, first);
        if (fs.existsSync(candidate)) {
          docRoot = dir; // parent of the layer containing "first" is the mdx document root
          break;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break; // reached the drive root, stop
        dir = parent;
      }
      if (!docRoot) return res.json({ found: false });
      const absPath = path.join(docRoot, resource);
      if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
        res.json({ found: true, absPath, serverRelPath: toServerRelPath(absPath) });
      } else {
        res.json({ found: false });
      }
    } else {
      // relative resource: resolve against the current document's directory
      // strip query/fragment which are not part of the file path
      const cleanRes = resource.split(/[?#]/)[0];
      const docDir = path.dirname(docAbs);
      const absPath = path.resolve(docDir, cleanRes);
      if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
        res.json({ found: true, absPath, serverRelPath: toServerRelPath(absPath) });
      } else {
        res.json({ found: false });
      }
    }
  } catch (e) {
    res.json({ found: false });
  }
});

// ===== Raw file service: /fs/<relative path> (for direct reference by iframe, img, etc., modeled after docreader's /fs/) =====
// The path is resolved relative to WEB_ROOT, supporting .. to access files outside the web root (consistent with how data-path / serverRelPath are accessed);
// the ".." segment is encoded as %2E%2E in the URL to bypass the browser's URL normalization;
// drive-letter absolute paths (e.g. C:/xxx, when the document and web root are on different drives serverRelPath is an absolute path) are used directly
app.get('/fs/*', (req, res) => {
  let rel;
  try {
    // req.path contains no query and is not decoded; decode it once here (avoid double-decoding already-decoded parameters)
    rel = decodeURIComponent(req.path).replace(/^\/fs\//, '');
  } catch (e) {
    rel = (req.path || '').replace(/^\/fs\//, '');
  }
  rel = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  let fullPath;
  if (/^[a-zA-Z]:\//.test(rel)) {
    fullPath = path.normalize(rel);
  } else if (/^[a-zA-Z]:$/.test(rel)) {
    fullPath = path.normalize(rel + '/');
  } else {
    fullPath = path.normalize(path.join(WEB_ROOT, rel));
  }
  res.sendFile(fullPath, (err) => {
    if (err) {
      res.status(err.status || 500).json({ error: '文件不存在或无法访问: ' + rel });
    }
  });
});

// Open a file or URL with the OS default handler (cross-platform, shell-injection safe via spawn)
// Windows: explorer.exe; macOS: open; Linux and others: xdg-open
function spawnSystemOpen(target, callback) {
  let cmd;
  let args;
  if (process.platform === 'win32') {
    cmd = 'explorer.exe';
    args = [target];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [target];
  } else {
    cmd = 'xdg-open';
    args = [target];
  }

  const child = spawn(cmd, args, { windowsHide: true, stdio: 'ignore' });
  let done = false;
  const finish = (err) => {
    if (done) return;
    done = true;
    callback(err);
  };
  child.on('error', (err) => finish(err));
  child.on('close', () => finish(null));
}

app.post('/api/open-external', (req, res) => {
  // Remote clients are forbidden from invoking system software to open documents
  if (!isLocalClient(req)) {
    return res.status(403).json({ error: '远程不能调用系统软件' });
  }

  const { filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: '文件路径不能为空' });
  }

  const urlPattern = /^https?:\/\//i;

  let target;
  if (urlPattern.test(filePath)) {
    target = filePath;
  } else {
    target = path.normalize(filePath);

    if (!fs.existsSync(target)) {
      return res.status(404).json({ error: `路径不存在: ${target}` });
    }
  }

  spawnSystemOpen(target, (error) => {
    if (error) {
      console.error(`执行命令失败: ${error.message}`);
      return res.status(500).json({ error: `打开失败: ${error.message}` });
    }
    res.json({ success: true });
  });
});

// Pop up the system "Open with" dialog: no software specified; the system lists available programs and lets the user choose (Windows uses rundll32 OpenAs_RunDLL)
app.post('/api/open-with-dialog', (req, res) => {
  // Remote clients are forbidden from invoking system software to open documents
  if (!isLocalClient(req)) {
    return res.status(403).json({ error: '远程不能调用系统软件' });
  }

  const { filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: '文件路径不能为空' });
  }

  const normalizedPath = path.normalize(filePath);

  if (!fs.existsSync(normalizedPath)) {
    return res.status(404).json({ error: `路径不存在: ${normalizedPath}` });
  }

  if (process.platform !== 'win32') {
    // macOS / Linux have no built-in "Open with" chooser; fall back to opening with the system default program
    spawnSystemOpen(normalizedPath, (error) => {
      if (error) {
        console.error(`执行命令失败: ${error.message}`);
        return res.status(500).json({ error: `打开失败: ${error.message}` });
      }
      res.json({ success: true });
    });
    return;
  }

  // Windows: rundll32.exe shell32.dll,OpenAs_RunDLL <path> pops up the "Open with" selection dialog
  execFile('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', normalizedPath], { windowsHide: true }, (error) => {
    if (error) {
      console.error(`执行命令失败: ${error.message}`);
      return res.status(500).json({ error: `打开失败: ${error.message}` });
    }
    res.json({ success: true });
  });
});

// ===== Editor detection (Windows) =====
// Three main ways to obtain editor paths:
// 1) Registry App Paths (the full path registered by installed software, including the 32-bit WOW6432Node view)
// 2) the where command to query executables in the PATH environment variable
// 3) the system default .txt opener (HKCU UserChoice → HKCR command to extract the exe path)
// Hardcoded scanning of common installation paths as a fallback

// Read the default value of a registry key (REG_SZ text)
function regQueryDefault(key) {
  try {
    const out = execFileSync('reg', ['query', key, '/ve'], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(/REG_SZ\s+(\S.*?)(?:\r?\n|$)/);
    return m ? m[1].trim() : null;
  } catch (e) {
    return null;
  }
}

// Method 1: registry App Paths detection (the key name is the exe file name)
function detectByRegistry() {
  const APP_PATHS_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths';
  const APP_PATHS_KEY32 = 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths';
  const exeNames = [
    ['notepad++.exe', 'Notepad++'],
    ['Code.exe', 'Visual Studio Code'],
    ['sublime_text.exe', 'Sublime Text'],
    ['atom.exe', 'Atom'],
    ['codium.exe', 'VSCodium'],
    ['webstorm64.exe', 'WebStorm'],
    ['webstorm.exe', 'WebStorm'],
    ['idea64.exe', 'IntelliJ IDEA'],
    ['typora.exe', 'Typora'],
    ['emeditor.exe', 'EmEditor'],
    ['editplus.exe', 'EditPlus'],
    ['HBuilderX.exe', 'HBuilderX'],
    ['gvim.exe', 'Vim (gvim)'],
    ['nvim.exe', 'Neovim'],
    ['Trae CN.exe', 'Trae CN'],
    ['Trae.exe', 'Trae'],
    ['CodeBuddy CN.exe', 'CodeBuddy CN'],
    ['CodeBuddy.exe', 'CodeBuddy'],
    ['QoderCN.exe', 'Qoder CN']
  ];
  const results = [];
  for (const [exe, name] of exeNames) {
    let p = regQueryDefault(path.join(APP_PATHS_KEY, exe));
    if (!p) p = regQueryDefault(path.join(APP_PATHS_KEY32, exe));
    if (p) results.push({ name, path: p });
  }
  return results;
}

// Method 2: use where to query executables in the PATH
function detectByWhere() {
  const names = [
    ['code', 'Visual Studio Code'],
    ['subl', 'Sublime Text'],
    ['sublime_text', 'Sublime Text'],
    ['atom', 'Atom'],
    ['codium', 'VSCodium'],
    ['webstorm64', 'WebStorm'],
    ['notepad++', 'Notepad++'],
    ['nvim', 'Neovim'],
    ['vim', 'Vim'],
    ['gvim', 'Vim (gvim)'],
    ['trae', 'Trae CN'],
    ['codebuddy', 'CodeBuddy CN'],
    ['QoderCN', 'Qoder CN']
  ];
  const results = [];
  for (const [cmd, name] of names) {
    try {
      const out = execFileSync('where', [cmd + '.exe'], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
      const first = out.split(/\r?\n/).map(l => l.trim()).find(l => l);
      if (first) results.push({ name, path: first });
    } catch (e) { /* not in PATH */ }
  }
  return results;
}

// Method 3: the system default .txt opener
function detectDefaultTextEditor() {
  try {
    const uc = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.txt\\UserChoice', '/v', 'ProgId'], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = uc.match(/ProgId\s+REG_SZ\s+(\S+)/i);
    if (!m) return null;
    const progId = m[1].trim();
    const cmd = execFileSync('reg', ['query', 'HKCR\\' + progId + '\\shell\\open\\command', '/ve'], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    const m2 = cmd.match(/REG_SZ\s+(\S.*?)(?:\r?\n|$)/);
    if (!m2) return null;
    // Extract the executable file path from the command (handles both quoted and parameterized cases)
    const command = m2[1].trim();
    const exeMatch = command.match(/"([^"]+\.exe)"/i) || command.match(/([A-Za-z]:\\[^"]+?\.exe)/i);
    if (exeMatch) return { name: `系统默认 (${progId})`, path: exeMatch[1] };
  } catch (e) { /* ignore */ }
  return null;
}

// Fallback: hardcoded scanning of common installation paths
function detectByHardcodedPaths() {
  const windir = process.env.windir || 'C:\\Windows';
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const candidates = [
    { name: '记事本 (Notepad)', path: path.join(windir, 'System32', 'notepad.exe') },
    { name: 'Visual Studio Code', path: path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe') },
    { name: 'Visual Studio Code', path: path.join(programFiles, 'Microsoft VS Code', 'Code.exe') },
    { name: 'Notepad++', path: path.join(localAppData, 'Programs', 'Notepad++', 'notepad++.exe') },
    { name: 'Notepad++', path: path.join(programFiles, 'Notepad++', 'notepad++.exe') },
    { name: 'Notepad++', path: path.join(programFilesX86, 'Notepad++', 'notepad++.exe') },
    { name: 'Sublime Text', path: path.join(programFiles, 'Sublime Text', 'sublime_text.exe') },
    { name: 'Sublime Text', path: path.join(localAppData, 'Programs', 'Sublime Text', 'sublime_text.exe') },
    { name: 'Typora', path: path.join(localAppData, 'Programs', 'Typora', 'Typora.exe') },
    { name: 'Neovim', path: path.join(localAppData, 'nvim', 'bin', 'nvim.exe') },
    { name: 'EmEditor', path: path.join(programFiles, 'EmEditor', 'emeditor.exe') },
    { name: 'EditPlus', path: path.join(programFiles, 'EditPlus', 'editplus.exe') },
    { name: 'Trae CN', path: path.join(localAppData, 'Programs', 'Trae CN', 'Trae CN.exe') },
    { name: 'Trae CN', path: path.join(localAppData, 'Programs', 'Trae', 'Trae.exe') },
    { name: 'CodeBuddy CN', path: path.join(localAppData, 'Programs', 'CodeBuddy CN', 'CodeBuddy CN.exe') },
    { name: 'CodeBuddy CN', path: path.join(localAppData, 'Programs', 'CodeBuddy', 'CodeBuddy.exe') },
    { name: 'Qoder CN', path: path.join(localAppData, 'Programs', 'QoderCN', 'QoderCN.exe') }
  ];
  // Vim's installation directory carries a version number (e.g. C:\Program Files\Vim\vim90\gvim.exe); scan to match
  try {
    const vimRoot = path.join(programFiles, 'Vim');
    if (fs.existsSync(vimRoot)) {
      for (const entry of fs.readdirSync(vimRoot)) {
        if (!/^vim/i.test(entry)) continue;
        const gvim = path.join(vimRoot, entry, 'gvim.exe');
        if (fs.existsSync(gvim)) {
          candidates.push({ name: 'Vim (gvim)', path: gvim });
        }
      }
    }
  } catch (e) { /* ignore scan failure */ }
  return candidates;
}

// Cache detection results for 60 seconds, to avoid running many registry queries every time the dialog opens
let editorsCache = null;
let editorsCacheTime = 0;
const EDITORS_CACHE_TTL = 60 * 1000;

app.get('/api/editors', (req, res) => {
  if (editorsCache && Date.now() - editorsCacheTime < EDITORS_CACHE_TTL) {
    return res.json(editorsCache);
  }
  const seen = new Set();
  const editors = [];
  const push = (name, p) => {
    if (!p || seen.has(p)) return;
    if (!fs.existsSync(p)) return;
    seen.add(p);
    editors.push({ id: 'editor-' + editors.length, name, path: p });
  };
  const def = detectDefaultTextEditor();
  if (def) push(def.name, def.path);
  detectByRegistry().forEach(e => push(e.name, e.path));
  detectByWhere().forEach(e => push(e.name, e.path));
  detectByHardcodedPaths().forEach(e => push(e.name, e.path));
  editorsCache = editors;
  editorsCacheTime = Date.now();
  res.json(editors);
});

// ===== Directory scanning to find editors =====
// Known editor exe file names (matched by file name during directory scanning)
const SCAN_EXE_NAMES = new Set([
  'notepad.exe', 'notepad++.exe', 'Code.exe', 'sublime_text.exe', 'atom.exe',
  'codium.exe', 'webstorm64.exe', 'webstorm.exe', 'idea64.exe', 'typora.exe',
  'emeditor.exe', 'editplus.exe', 'HBuilderX.exe', 'gvim.exe', 'vim.exe',
  'nvim.exe', 'Trae CN.exe', 'Trae.exe', 'CodeBuddy CN.exe', 'CodeBuddy.exe',
  'QoderCN.exe'
]);

// exe file name → display name
const EXE_DISPLAY_NAMES = {
  'notepad.exe': '记事本 (Notepad)',
  'notepad++.exe': 'Notepad++',
  'Code.exe': 'Visual Studio Code',
  'sublime_text.exe': 'Sublime Text',
  'atom.exe': 'Atom',
  'codium.exe': 'VSCodium',
  'webstorm64.exe': 'WebStorm',
  'webstorm.exe': 'WebStorm',
  'idea64.exe': 'IntelliJ IDEA',
  'typora.exe': 'Typora',
  'emeditor.exe': 'EmEditor',
  'editplus.exe': 'EditPlus',
  'HBuilderX.exe': 'HBuilderX',
  'gvim.exe': 'Vim (gvim)',
  'vim.exe': 'Vim',
  'nvim.exe': 'Neovim',
  'Trae CN.exe': 'Trae CN',
  'Trae.exe': 'Trae',
  'CodeBuddy CN.exe': 'CodeBuddy CN',
  'CodeBuddy.exe': 'CodeBuddy',
  'QoderCN.exe': 'Qoder CN',
};

// Irrelevant directories to skip during scanning, to speed up traversal
const SCAN_SKIP_DIRS = new Set(['node_modules', '.git', 'Cache', 'Caches', 'Temp', 'tmp', 'logs', 'Logs', '$Recycle.Bin']);

// Scan cancellation flag (set by POST /api/editors/scan-cancel)
let scanCancelled = false;

// Find editor software in a directory (recursion with limited depth, to avoid slow full-disk scanning)
// Only match software files in the preset list (SCAN_EXE_NAMES); when keyword is non-empty,
// the editor name entered in the input box is temporarily added to the search targets (fuzzy match by file name, case-insensitive)
// Async version: periodically yields to the event loop, ensuring "stop search" requests can be handled promptly
async function findEditorsInDirAsync(root, depth = 4, keyword = '') {
  const found = [];
  let visited = 0;
  const kw = (keyword || '').toLowerCase();
  const visit = async (dir, level) => {
    if (scanCancelled || level > depth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return; // skip directories without permission or that are invalid
    }
    for (const ent of entries) {
      if (scanCancelled) return;
      if (++visited % 200 === 0) {
        await new Promise(r => setImmediate(r)); // yield to the event loop
      }
      if (ent.isDirectory()) {
        if (SCAN_SKIP_DIRS.has(ent.name)) continue;
        await visit(path.join(dir, ent.name), level + 1);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.exe') &&
        (SCAN_EXE_NAMES.has(ent.name) || (kw && ent.name.toLowerCase().includes(kw)))) {
        found.push(path.join(dir, ent.name));
      }
    }
  };
  await visit(root, 0);
  return found;
}

// Scan for known editor software in default system paths + user-specified paths
// Default paths: C:\Program Files, C:\Program Files (x86), %LOCALAPPDATA%, %APPDATA%
app.post('/api/editors/scan', async (req, res) => {
  const { dirs, keyword } = req.body || {};
  const defaultDirs = [
    process.env['ProgramFiles'] || 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    process.env.LOCALAPPDATA || '',
    process.env.APPDATA || ''
  ].filter(d => d);
  const extraDirs = Array.isArray(dirs)
    ? dirs.map(d => (typeof d === 'string' ? d.trim() : '')).filter(d => d)
    : [];
  // keyword: fuzzy search by software name/file name; if keyword itself is an existing directory, also add it to scanning
  const kw = typeof keyword === 'string' ? keyword.trim() : '';
  if (kw) {
    try {
      if (fs.statSync(kw).isDirectory()) extraDirs.push(kw);
    } catch (e) { /* not a directory, treat as a keyword */ }
  }

  // Default system paths and user-specified paths are handled the same: only search for software in the preset list,
  // when the input box has a software name (keyword), that software is temporarily added to the search targets for fuzzy file-name matching
  const rootGroups = [
    { dirs: defaultDirs },
    { dirs: extraDirs }
  ];
  const seenRoots = new Set();
  const pathSet = new Set();
  const editors = [];
  scanCancelled = false;
  const startTime = Date.now();
  try {
    for (const group of rootGroups) {
      for (const root of group.dirs) {
        if (scanCancelled) break;
        if (!root || seenRoots.has(root)) continue;
        seenRoots.add(root);
        let stat;
        try {
          stat = fs.statSync(root);
        } catch (e) {
          continue; // skip if the path does not exist
        }
        if (!stat.isDirectory()) continue;
        const found = await findEditorsInDirAsync(root, 4, kw);
        for (const exePath of found) {
          if (pathSet.has(exePath)) continue;
          pathSet.add(exePath);
          const exeName = path.basename(exePath);
          editors.push({
            id: 'scan-' + editors.length,
            name: EXE_DISPLAY_NAMES[exeName] || exeName.replace(/\.exe$/i, ''),
            path: exePath
          });
        }
      }
      if (scanCancelled) break;
    }
  } catch (e) {
    console.error('扫描出错:', e.message);
  }
  res.json({
    editors,
    cancelled: scanCancelled,
    elapsedMs: Date.now() - startTime
  });
});

// Stop an in-progress scan
app.post('/api/editors/scan-cancel', (req, res) => {
  scanCancelled = true;
  res.json({ success: true });
});

// Open a file with the specified editor software
// Method 1 (preferred): the Windows Shell start command launches the program and passes the document path
// Method 2: if cmd start fails, use spawn to launch directly (full exe path + document path argument array)
app.post('/api/open-with-editor', (req, res) => {
  // Remote clients are forbidden from invoking system software to open documents
  if (!isLocalClient(req)) {
    return res.status(403).json({ error: '远程不能调用系统软件' });
  }

  const { filePath, editorPath } = req.body;
  if (!filePath || !editorPath) {
    return res.status(400).json({ error: '缺少文件路径或编辑器路径' });
  }
  const normalizedPath = path.normalize(filePath);
  if (!fs.existsSync(normalizedPath)) {
    return res.status(404).json({ error: `文件不存在: ${normalizedPath}` });
  }
  if (!fs.existsSync(editorPath)) {
    return res.status(404).json({ error: `编辑器不存在: ${editorPath}` });
  }

  // Prefer using cmd start to launch the program and pass the file path (the first quoted argument of start is the window title)
  // Calling start via exec: proven reliable in practice (verified to open software normally in the user's environment)
  // Add a timeout: GUI editors inherit the exec pipe handle and cause the callback to hang,
  // after timeout force-terminate cmd (the software was already started by start, unaffected), and the API responds normally
  exec(`start "" "${editorPath}" "${normalizedPath}"`, { windowsHide: true, timeout: 3000 }, (error) => {
    // The start command has already been issued: even if it times out due to the pipe handle (error.killed / ETIMEDOUT), the software has already opened
    if (error && !error.killed && error.code !== 'ETIMEDOUT') {
      // cmd itself cannot execute (cmd not found / command parsing failed) → fall back to spawn
      console.error(`cmd start 执行失败: ${error.message}，改用 spawn 直接启动`);
      const launch = (exe, args, opts, cb) => {
        let done = false;
        const done2 = (e) => { if (!done) { done = true; cb(e); } };
        try {
          const child = spawn(exe, args, opts);
          child.on('error', (e) => done2(e));
          child.once('spawn', () => done2(null)); // GUI programs stay resident; do not wait for exit
          child.unref();
          setTimeout(() => done2(new Error('启动超时')), 8000);
        } catch (e) {
          done2(e);
        }
      };
      launch(editorPath, [normalizedPath], { detached: true, stdio: 'ignore', windowsHide: true }, (err2) => {
        if (err2) {
          return res.status(500).json({ error: `打开编辑器失败: ${err2.message}（已尝试 cmd start 与直接启动两种方式）` });
        }
        res.json({ success: true });
      });
    } else {
      res.json({ success: true });
    }
  });
});

// ===== Get the machine's IPv4 addresses (for the "listen address" dropdown in the settings window) =====
// Obtained via system network interface enumeration (consistent with the IPv4 addresses shown by ipconfig):
// - Automatically exclude loopback addresses (127.0.0.1, a fixed dropdown item), internal/virtual interfaces, and link-local addresses (169.254.x.x)
// - Invalid addresses (failing IPv4 validation) are not included
// - When no usable address is found, return an empty array; the dropdown keeps only the two fixed items 127.0.0.1 / 0.0.0.0
function getLocalIPv4Addresses() {
  const result = [];
  const seen = new Set();
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const ip = iface.address;
      if (net.isIP(ip) !== 4) continue; // invalid addresses are excluded
      if (ip.startsWith('169.254.')) continue; // link-local (APIPA) addresses are not used as listen addresses
      if (!seen.has(ip)) {
        seen.add(ip);
        result.push(ip);
      }
    }
  }
  return result;
}

// ===== Local client determination (prevents remote browsers from invoking this machine's system software) =====
// When the server listens on 0.0.0.0 / a LAN address, remote browsers can also access the web interface;
// but operations like "open a document with system software" can only be triggered by the local user, so remote clients are always rejected.
// Rule: the client address is a loopback address (127.0.0.1 / ::1), or belongs to one of this machine's network interface addresses → local; otherwise remote.
// Compatible with IPv4-mapped IPv6 notation (e.g. ::ffff:127.0.0.1) by uniformly stripping the ::ffff: prefix before comparison.
function isLocalClient(req) {
  const ip = String(req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/i, '');
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      const addr = String(iface.address || '').replace(/^::ffff:/i, '');
      if (addr === ip) return true;
    }
  }
  return false;
}

// ===== Startup =====
// Start the HTTP server on the specified listen address and port:
// - When the listen port is 0, the OS assigns a random free port (default behavior, avoids port conflicts)
// - When the listen address/port is invalid (e.g. address does not exist, port in use), return a rejected Promise and let the caller decide the fallback strategy
function startServer(host, port) {
  return new Promise((resolve, reject) => {
    let srv;
    try {
      srv = app.listen(port, host);
    } catch (err) {
      return reject(err);
    }
    srv.once('listening', () => {
      // Print preview: after the main process generates the PDF it stores the bytes temporarily for the preview page to retrieve and render
      srv.storePrintPreview = storePrintPreview;
      resolve(srv);
    });
    srv.once('error', reject);
  });
}

module.exports = { startServer, getLocalIPv4Addresses, isLocalClient };

// When server.js is run directly (node server.js, pure web mode):
// Read the listen parameters from config.json under the installation path to start; on failure, restore default parameters and retry
if (require.main === module) {
  const CONFIG_FILE = path.join(__dirname, 'config.json');
  let host = '127.0.0.1';
  let port = 0;
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (typeof cfg.listenAddress === 'string') host = cfg.listenAddress;
      const p = parseInt(cfg.listenPort, 10);
      if (p === 0 || (p >= 3000 && p <= 65535)) port = p;
    }
  } catch (e) {
    console.error(`读取配置文件失败: ${e.message}`);
  }

  const run = (h, p) => startServer(h, p).then((srv) => {
    console.log(`服务器运行在 http://localhost:${srv.address().port}`);
  }).catch((err) => {
    console.error(`监听 ${h}:${p} 失败: ${err.message}`);
    if (h !== '127.0.0.1' || p !== 0) {
      console.error('恢复默认参数 (127.0.0.1:0) 重试');
      return run('127.0.0.1', 0);
    }
    process.exit(1);
  });

  run(host, port);
}