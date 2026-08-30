const API_BASE = '/api';

// Version marker: use the browser F12 console to confirm the latest frontend code is loaded (2026-08-19 splitter PointerEvent + pointer capture fix)
console.log('[book-mgr] app.js build 2026-08-19-scroll-restore');

let libraries = [];
let currentLibrary = null;
let currentDocument = null;
// Access path of the current document relative to web root (forward slashes; paths outside web root use a ../ prefix, consistent with the file list data-path).
// Used to resolve relative-path links inside markdown documents
let currentServerPath = '';
let deleteCallback = null;
let editingLibraryId = null;
let currentTagFilter = null; // Current tag filter value; null means all
let currentDocSort = 'default'; // Document list sort order: default/edit/time-asc/time-desc/name-asc/name-desc

async function fetchLibraries() {
  const response = await fetch(`${API_BASE}/library`);
  libraries = await response.json();
   // Backward-compat for old data: if stored type is missing or 'other', re-infer from path
   // (e.g. index.d.ts added by an older version was wrongly stored as 'other'; corrected to 'ts' here)
  libraries.forEach(lib => {
    (lib.documents || []).forEach(d => {
      if (!d.type || d.type === 'other') d.type = inferDocType(d.path);
    });
  });
  renderLibraries();
}

function renderLibraries() {
  const list = document.getElementById('libraryList');
  list.innerHTML = '';
  
  if (libraries.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>暂无书库，点击上方按钮创建</p></div>';
    return;
  }
  
  libraries.forEach((library, index) => {
    const item = document.createElement('div');
    item.className = `library-item ${currentLibrary?.id === library.id ? 'active' : ''}`;
    item.dataset.id = library.id;
    item.dataset.index = index;
    item.draggable = true;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'library-name';
    nameSpan.textContent = library.name;
    
    const countSpan = document.createElement('span');
    countSpan.className = 'doc-count';
    countSpan.textContent = library.documents.length;
    
    item.appendChild(nameSpan);
    item.appendChild(countSpan);
    
    item.addEventListener('click', () => {
      if (editingLibraryId !== library.id) {
        selectLibrary(library);
      }
    });
    
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDragDrop);
    
    list.appendChild(item);
  });
}

function startEditLibrary(libraryId, itemElement) {
  editingLibraryId = libraryId;
  
  const nameSpan = itemElement.querySelector('.library-name');
  const currentName = nameSpan.textContent;
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'library-edit-input';
  input.value = currentName;
  
  nameSpan.replaceWith(input);
  
  input.focus();
  input.select();
  
  const saveAndClose = async () => {
    const newName = input.value.trim();
    const libId = editingLibraryId;
    editingLibraryId = null;
    
    if (newName && newName !== currentName) {
      const response = await fetch(`${API_BASE}/library/${libId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });
      
      if (!response.ok) {
        const error = await response.json();
        alert(t(error.error));
      }
    }
    
    await fetchLibraries();
  };
  
  const cancel = () => {
    editingLibraryId = null;
    renderLibraries();
  };
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.removeEventListener('blur', saveAndClose);
      saveAndClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.removeEventListener('blur', saveAndClose);
      cancel();
    }
  });
  
  input.addEventListener('blur', saveAndClose);
}

let draggedItem = null;
let draggedIndex = null;

function handleDragStart(e) {
  draggedItem = e.target;
  draggedIndex = parseInt(e.target.dataset.index);
  e.target.style.opacity = '0.5';
}

function handleDragOver(e) {
  e.preventDefault();
}

async function handleDragDrop(e) {
  e.preventDefault();
  const targetItem = e.target.closest('.library-item');
  
  if (targetItem && draggedItem && draggedItem !== targetItem) {
    const targetIndex = parseInt(targetItem.dataset.index);
    
    const [removed] = libraries.splice(draggedIndex, 1);
    libraries.splice(targetIndex, 0, removed);
    
    await fetch(`${API_BASE}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(libraries)
    });
    
    renderLibraries();
  }
  
  if (draggedItem) {
    draggedItem.style.opacity = '1';
    draggedItem = null;
    draggedIndex = null;
  }
}

function selectLibrary(library) {
  // The library's file list is shown on the main page: clicking a library switches back to the main tab
  if (activeTabId !== 'main') switchToTab('main');
  viewActive['view-main'] = 'main';
  currentLibrary = library;
  renderLibraries();
  
  document.getElementById('currentLibraryName').textContent = library.name;
  document.getElementById('clearLibraryBtn').disabled = false;
  document.getElementById('addDocBtn').disabled = false;
  document.getElementById('editLibraryBtn').disabled = false;
  
  document.getElementById('libraryView').classList.remove('hidden');
  document.getElementById('documentView').classList.add('hidden');
  
  // Reset tag filter state and load the tag set
  currentTagFilter = null;
  document.getElementById('tagPanel').classList.add('hidden');
  document.getElementById('tagFilterBtn').classList.remove('active');
  updateDocSortSelectState();
  loadTagFilterList();
  renderDocuments();
  updateNavBars(); // Active page is the library list: show the library control area, hide the document navigation area
}

function renderDocuments() {
  const list = document.getElementById('documentList');
  list.innerHTML = '';
  
  if (!currentLibrary || currentLibrary.documents.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>暂无文档，请点击上方按钮添加</p></div>';
    return;
  }

  // Filter by current tag
  let docs = currentLibrary.documents;
  if (currentTagFilter) {
    docs = docs.filter(doc => (doc.tags || []).includes(currentTagFilter));
    if (docs.length === 0) {
      list.innerHTML = t('<div class="empty-state"><p>标签 "{0}" 下暂无文档</p></div>', escapeHtml(currentTagFilter));
      return;
    }
  }
  
  // Time/name sorting only affects the page render order, not the record order in global memory
  const editMode = currentDocSort === 'edit';
  if (!editMode && currentDocSort !== 'default') {
    docs = docs.slice().sort((a, b) => {
      if (currentDocSort === 'time-asc' || currentDocSort === 'time-desc') {
        const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return currentDocSort === 'time-asc' ? ta - tb : tb - ta;
      }
      return currentDocSort === 'name-asc'
        ? String(a.name).localeCompare(String(b.name), 'zh-CN')
        : String(b.name).localeCompare(String(a.name), 'zh-CN');
    });
  }

  // Document icons are uniformly provided by getTypeIcon (see DOC_TYPE_DEFS)
  
  docs.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'document-item';
    const displayPath = truncatePath(doc.path);
    item.innerHTML = `
      ${editMode ? `<span class="drag-handle" draggable="true" title="拖动调整顺序" data-id="${doc.id}">☰</span>` : ''}
      <span class="document-icon">${getTypeIcon(doc.type)}</span>
      <div class="document-info">
        <h3>${doc.name}</h3>
        <p title="${doc.path}">${displayPath}</p>
      </div>
      <span class="type-badge type-${doc.type}">${getTypeName(doc.type)}</span>
      <button class="edit-btn" title="文档属性编辑" onclick="editDocument('${doc.id}')">✏️</button>
      <button class="delete-btn" title="删除" onclick="deleteDocument('${doc.id}')">🗑️</button>
    `;
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-btn') && !e.target.classList.contains('edit-btn') && !e.target.classList.contains('drag-handle')) {
        openDocument(doc);
      }
    });
    if (editMode) {
      item.classList.add('sort-edit-mode');
      item.dataset.id = doc.id;
      const handle = item.querySelector('.drag-handle');
      if (handle) {
        handle.addEventListener('dragstart', handleDocDragStart);
        handle.addEventListener('dragend', handleDocDragEnd);
      }
      item.addEventListener('dragover', handleDocDragOver);
      item.addEventListener('dragleave', handleDocDragLeave);
      item.addEventListener('drop', handleDocDrop);
    }
    list.appendChild(item);
  });
}

// ===== Sort order switching =====
function onDocSortChange(value) {
  const sortSelect = document.getElementById('docSortSelect');
  if (value === 'edit' && currentTagFilter !== null) {
    alert(t('只有关闭标签列表，或在标签列表中选择"所有"时，才能编辑排序'));
    sortSelect.value = currentDocSort;
    return;
  }
  currentDocSort = value;
  renderDocuments();
}

// ===== Sort edit mode: drag to reorder the global in-memory record order =====
let dragDocId = null; // id of the document being dragged
let dragGhostEl = null; // virtual rectangle box that follows the mouse while dragging

function handleDocDragStart(e) {
  const handle = e.target;
  if (!handle.classList.contains('drag-handle')) return;
  dragDocId = handle.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragDocId);
  handle.classList.add('dragging');

  // During dragging: disable the hover shake effect on list items; only highlight on hover
  const listEl = document.getElementById('documentList');
  if (listEl) listEl.classList.add('sort-dragging');

  // Generate a virtual rectangle box that follows the mouse (clones the current document item's appearance)
  const item = handle.closest('.document-item');
  if (item) {
    item.classList.add('drag-source');
    const ghost = item.cloneNode(true);
    ghost.classList.add('drag-ghost');
    // The ghost box keeps only the item appearance, removing the drag handle and action buttons
    ghost.querySelectorAll('.drag-handle, .edit-btn, .delete-btn').forEach(el => el.remove());
    ghost.style.position = 'fixed';
    ghost.style.top = '-1000px';
    ghost.style.left = '-1000px';
    ghost.style.width = item.offsetWidth + 'px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 20, Math.max(12, Math.floor(item.offsetHeight / 2)));
    dragGhostEl = ghost;
    // The browser already captured a snapshot at dragstart, so the temporary node can be removed immediately
    setTimeout(() => {
      if (dragGhostEl && dragGhostEl.parentNode) dragGhostEl.parentNode.removeChild(dragGhostEl);
      dragGhostEl = null;
    }, 0);
  }
}

function handleDocDragEnd(e) {
  dragDocId = null;
  if (dragGhostEl && dragGhostEl.parentNode) dragGhostEl.parentNode.removeChild(dragGhostEl);
  dragGhostEl = null;
  const listEl = document.getElementById('documentList');
  if (listEl) listEl.classList.remove('sort-dragging');
  document.querySelectorAll('#documentList .document-item').forEach(el => {
    el.classList.remove('drag-over', 'drag-before', 'drag-after', 'drag-source');
  });
  const handle = e.target;
  if (handle && handle.classList) handle.classList.remove('dragging');
}

function handleDocDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const item = e.currentTarget;
  if (!item.classList.contains('document-item')) return;
  item.classList.add('drag-over');
  // Determine insertion direction by position: target is before the dragged doc -> insert before it;
  // target is after the dragged doc -> insert after it
  if (!dragDocId || !currentLibrary) return;
  const arr = currentLibrary.documents;
  const from = arr.findIndex(d => d.id === dragDocId);
  const to = arr.findIndex(d => d.id === item.dataset.id);
  if (from === -1 || to === -1 || from === to) return;
  const before = to < from;
  item.classList.toggle('drag-before', before);
  item.classList.toggle('drag-after', !before);
}

function handleDocDragLeave(e) {
  const item = e.currentTarget;
  item.classList.remove('drag-over', 'drag-before', 'drag-after');
}

async function handleDocDrop(e) {
  e.preventDefault();
  const targetItem = e.currentTarget;
  targetItem.classList.remove('drag-over', 'drag-before', 'drag-after');
  if (!dragDocId || !currentLibrary) return;
  const targetId = targetItem.dataset.id;
  if (!targetId || dragDocId === targetId) return;

  // Dragging reorders the records array in global memory (the default sort order)
  const arr = currentLibrary.documents;
  const from = arr.findIndex(d => d.id === dragDocId);
  const to = arr.findIndex(d => d.id === targetId);
  if (from === -1 || to === -1 || from === to) return;
  const [moved] = arr.splice(from, 1);
  // Insertion rule (by position comparison):
  // - target position is before the dragged doc (to < from) -> insert forward, i.e. before the target;
  // - target position is after the dragged doc (to > from) -> insert backward, i.e. after the target
  //   (after removing from, the target shifts left by one, so splice(to) lands exactly after the target)
  arr.splice(to, 0, moved);

  try {
    const response = await fetch(`${API_BASE}/library/${currentLibrary.id}/documents/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docIds: arr.map(d => d.id) })
    });
    if (!response.ok) {
      const error = await response.json();
      alert(t(error.error) || t('保存排序失败'));
      await fetchLibraries();
      selectLibrary(libraries.find(l => l.id === currentLibrary.id));
      return;
    }
  } catch (err) {
    console.error('保存文档排序失败:', err);
    alert(t('保存文档排序失败'));
    await fetchLibraries();
    selectLibrary(libraries.find(l => l.id === currentLibrary.id));
    return;
  }
  renderDocuments();
}

function truncatePath(path, maxLength = 60) {
  if (path.length <= maxLength) {
    return path;
  }
  
  const startLength = Math.floor(maxLength / 3);
  const endLength = maxLength - startLength - 3;
  
  return path.substring(0, startLength) + '...' + path.substring(path.length - endLength);
}

// ===== Authoritative file-type definition table (single source of truth) =====
// Hierarchical mapping: extension -> file type -> display name + icon (+ hljs highlight language)
// exts are dotless lowercase extensions (matching getFileExt's return); lang exists only for text/code types
const DOC_TYPE_DEFS = [
  { type: 'markdown',    name: 'Markdown',    exts: ['md', 'mdx'],                    icon: '📝' },
  { type: 'text',        name: 'Text',        exts: ['txt'],                          icon: '📋', lang: 'plaintext' },
  { type: 'log',         name: 'Log',         exts: ['log'],                          icon: '📋', lang: 'plaintext' },
  { type: 'python',      name: 'Python',      exts: ['py'],                           icon: '🐍', lang: 'python' },
  { type: 'php',         name: 'PHP',         exts: ['php'],                          icon: '🐘', lang: 'php' },
  { type: 'c',           name: 'C',           exts: ['c'],                            icon: '📋', lang: 'c' },
  { type: 'cheader',     name: 'CHeader',     exts: ['h'],                            icon: '📋', lang: 'c' },
  { type: 'cpp',         name: 'Cpp',         exts: ['cpp', 'hpp'],                   icon: '📋', lang: 'cpp' },
  { type: 'java',        name: 'Java',        exts: ['java'],                         icon: '☕', lang: 'java' },
  { type: 'cmd',         name: 'CMD',         exts: ['cmd'],                          icon: '🖥️', lang: 'dos' },
  { type: 'bat',         name: 'BAT',         exts: ['bat'],                          icon: '🖥️', lang: 'dos' },
  { type: 'ini',         name: 'INI',         exts: ['ini'],                          icon: '🧾', lang: 'ini' },
  { type: 'shell',       name: 'Shell',       exts: ['sh'],                           icon: '🖥️', lang: 'bash' },
  { type: 'rust',        name: 'Rust',        exts: ['rs'],                           icon: '🦀', lang: 'rust' },
  { type: 'toml',        name: 'TOML',        exts: ['toml'],                         icon: '🧾', lang: 'ini' },
  { type: 'xml',         name: 'XML',         exts: ['xml'],                          icon: '🧾', lang: 'xml' },
  { type: 'yaml',        name: 'YAML',        exts: ['yml', 'yaml'],                  icon: '🧾', lang: 'yaml' },
  { type: 'js',          name: 'Javascript',  exts: ['js', 'mjs', 'cjs'],             icon: '📋', lang: 'javascript' },
  { type: 'json',        name: 'Json',        exts: ['json'],                         icon: '📋', lang: 'json' },
  { type: 'css',         name: 'CSS',         exts: ['css'],                          icon: '🎨', lang: 'css' },
  { type: 'csv',         name: 'CSV',         exts: ['csv'],                          icon: '📊', lang: 'plaintext' },
  { type: 'ts',          name: 'TypeScript',  exts: ['ts', 'tsx'],                    icon: '🟦', lang: 'typescript' },
  { type: 'jsx',         name: 'JSX',         exts: ['jsx'],                          icon: '⚛️', lang: 'javascript' },
  { type: 'cs',          name: 'C#',          exts: ['cs'],                           icon: '🔷', lang: 'csharp' },
  { type: 'go',          name: 'Go',          exts: ['go'],                           icon: '🐹', lang: 'go' },
  { type: 'rb',          name: 'Ruby',        exts: ['rb'],                           icon: '💎', lang: 'ruby' },
  { type: 'ps1',         name: 'PowerShell',  exts: ['ps1'],                          icon: '🖥️', lang: 'powershell' },
  { type: 'sql',         name: 'SQL',         exts: ['sql'],                          icon: '🗄️', lang: 'sql' },
  { type: 'swift',       name: 'Swift',       exts: ['swift'],                        icon: '🕊️', lang: 'swift' },
  { type: 'kt',          name: 'Kotlin',      exts: ['kt'],                           icon: '🟣', lang: 'kotlin' },
  { type: 'scala',       name: 'Scala',       exts: ['scala'],                        icon: '📋', lang: 'scala' },
  { type: 'lua',         name: 'Lua',         exts: ['lua'],                          icon: '🌙', lang: 'lua' },
  { type: 'pl',          name: 'Perl',        exts: ['pl'],                           icon: '🐫', lang: 'perl' },
  { type: 'r',           name: 'R',           exts: ['r'],                            icon: '📈', lang: 'r' },
  { type: 'vue',         name: 'Vue',         exts: ['vue'],                          icon: '💚', lang: 'xml' },
  { type: 'scss',        name: 'SCSS',        exts: ['scss'],                         icon: '🎨', lang: 'scss' },
  { type: 'less',        name: 'Less',        exts: ['less'],                         icon: '🎨', lang: 'less' },
  { type: 'conf',        name: '配置',         exts: ['conf', 'cfg'],                  icon: '🧾', lang: 'plaintext' },
  { type: 'properties',  name: 'Properties',  exts: ['properties'],                   icon: '🧾', lang: 'properties' },
  { type: 'gradle',      name: 'Gradle',      exts: ['gradle'],                       icon: '🧾', lang: 'groovy' },
  { type: 'env',         name: 'Env',         exts: ['env'],                          icon: '🧾', lang: 'plaintext' },
  { type: 'gitignore',   name: 'GitIgnore',   exts: ['gitignore'],                    icon: '🧾', lang: 'plaintext' },
  { type: 'editorconfig', name: 'EditorConfig', exts: ['editorconfig'],               icon: '🧾', lang: 'plaintext' },
  { type: 'html',        name: 'HTML',        exts: ['html', 'htm'],                  icon: '🌐' },
  { type: 'pdf',         name: 'PDF',         exts: ['pdf'],                          icon: '📕' },
  { type: 'picture',     name: '图片',         exts: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'], icon: '🖼️' },
  { type: 'svg-html',    name: 'SVG',          exts: ['svg'],                          icon: '🖼️' },
  { type: 'docx',        name: 'Word',        exts: ['docx', 'doc'],                  icon: '📘' },
  { type: 'xlsx',        name: 'Excel',       exts: ['xlsx', 'xls'],                  icon: '📗' },
  { type: 'pptx',        name: 'PowerPoint',  exts: ['pptx', 'ppt'],                  icon: '📙' },
  { type: 'zip',         name: 'Zip',         exts: ['zip', '.7z', '.war'],           icon: '🗜️' },
  { type: 'tar',         name: 'Tar',         exts: ['tar', '.tgz', '.gz'],           icon: '📦' },
  { type: 'exe',         name: 'Software',    exts: ['.exe'],                         icon: '⚙️' },
  // Video/audio: cannot be previewed in-app, opened by the system default program
  { type: 'video',       name: '视频',         exts: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'rmvb', 'rm', 'vob'], icon: '🎬' },
  { type: 'audio',       name: '音频',         exts: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'ape', 'opus', 'mid', 'midi', 'amr', 'aiff'], icon: '🎵' },
  { type: 'folder',      name: '文件夹',       icon: '📁' },
  { type: 'weblink',     name: 'Web链接',      icon: '🔗' },
  { type: 'other',       name: '其他',         icon: '📄' }
];

// Look up the type definition by dotless extension (also handles entries whose exts include a dot)
function findDocDef(ext) {
  return DOC_TYPE_DEFS.find(d => d.exts && (d.exts.includes(ext) || d.exts.includes('.' + ext)));
}

// extension -> file type (URLs are recognized as weblink; unknown extensions return other)
function getFileType(nameOrPath) {
  const s = String(nameOrPath || '');
  if (/^https?:\/\//i.test(s)) return 'weblink';
  const def = findDocDef(getFileExt(s));

  const base = nameOrPath.split(/[\\/]/).pop();
  const name = base.replace(/\.[^/.]+$/, '') || base;
  const commonTextFiles = ['README','Makefile','makefile','COPYING','COPYRIGHTS','LICENSE','AUTHORS','manifest'];
  if (!def) {
    if (commonTextFiles.includes(name)) {return "text";}
  };
  return def ? def.type : 'other';
}

// Types whose full filename (with extension) should be kept when inferring the document name: programming code/config files.
// markdown/text/log and other document types, plus image/Office media types, still drop the extension (original behavior).
const KEEP_FULL_NAME_TYPES = new Set([
  'python', 'php', 'c', 'cheader', 'cpp', 'java', 'cmd', 'bat', 'shell', 'rust',
  'js', 'json', 'css', 'csv', 'ts', 'jsx', 'cs', 'go', 'rb', 'ps1', 'sql',
  'swift', 'kt', 'scala', 'lua', 'pl', 'r', 'vue', 'scss', 'less',
  'ini', 'toml', 'xml', 'yaml', 'conf', 'properties', 'gradle', 'env',
  'gitignore', 'editorconfig', 'html'
]);

// Whether the path/name is programming code or a config file (keep the extension when inferring the document name)
function keepFullFileName(nameOrPath) {
  return KEEP_FULL_NAME_TYPES.has(getFileType(nameOrPath));
}

// file type -> display name
function getTypeName(type) {
  const def = DOC_TYPE_DEFS.find(d => d.type === type);
  return def ? def.name : '其他';
}

// file type -> icon
function getTypeIcon(type) {
  const def = DOC_TYPE_DEFS.find(d => d.type === type);
  return def ? def.icon : '📄'; //📦
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  el.classList.add('hidden');
  // While in fullscreen, the modal is temporarily mounted under the fullscreen element; on close, move it back to its original parent
  if (el.dataset.origParentId) {
    const orig = document.getElementById(el.dataset.origParentId) || document.body;
    orig.appendChild(el);
    delete el.dataset.origParentId;
  }
}

function showModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  // In fullscreen state, the modal must be inside the fullscreen element to be displayed
  const fsEl = document.fullscreenElement;
  if (fsEl && !fsEl.contains(el)) {
    const parent = el.parentElement || document.body;
    el.dataset.origParentId = parent.id || parent.tagName.toLowerCase();
    fsEl.appendChild(el);
  }
  el.classList.remove('hidden');
}

document.getElementById('addLibraryBtn').addEventListener('click', () => {
  document.getElementById('libraryNameInput').value = '';
  showModal('addLibraryModal');
});

async function createLibrary() {
  const name = document.getElementById('libraryNameInput').value.trim();
  
  if (!name) {
    alert(t('请输入书库名称'));
    return;
  }
  
  const response = await fetch(`${API_BASE}/library`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  
  if (response.ok) {
    await fetchLibraries();
    closeModal('addLibraryModal');
  } else {
    const error = await response.json();
    alert(t(error.error));
  }
}

// ===== Clear library dialog: draggable + resizable =====
const CLEAR_MODAL_MIN_W = 360;
const CLEAR_MODAL_MIN_H = 300;
const CLEAR_MODAL_BASE_W = 420; // base width for delete-library mode
const CLEAR_MODAL_DOCS_W = 800; // fixed window width in clear-documents mode
const CLEAR_MODAL_DOCS_H = 600; // fixed window height in clear-documents mode
let clearBaseW = CLEAR_MODAL_BASE_W; // user-adjusted base width
let clearBaseH = 340;              // user-adjusted base height

// Drag the title bar + resize from the bottom-right handle
function initClearModalDrag() {
  const modal = document.querySelector('.clear-lib-modal');
  const header = modal.querySelector('.modal-header');
  const handle = document.getElementById('clearResizeHandle');
  if (!modal || !header || !handle) return;

    // Drag the title bar to move the window
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return; // do not intercept clicks on the close button etc.
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = modal.offsetLeft;
    const startTop = modal.offsetTop;
    const onMove = (ev) => {
      const left = Math.max(0, Math.min(startLeft + ev.clientX - startX, window.innerWidth - modal.offsetWidth));
      const top = Math.max(0, Math.min(startTop + ev.clientY - startY, window.innerHeight - modal.offsetHeight));
      modal.style.left = left + 'px';
      modal.style.top = top + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Resize via the bottom-right handle
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = modal.offsetWidth;
    const startH = modal.offsetHeight;
    const onMove = (ev) => {
      const w = Math.max(CLEAR_MODAL_MIN_W, startW + ev.clientX - startX);
      const h = Math.max(CLEAR_MODAL_MIN_H, startH + ev.clientY - startY);
      modal.style.width = w + 'px';
      modal.style.height = h + 'px';
      clearBaseW = w;
      clearBaseH = h;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// Reset size and position when opening the dialog (centered)
function resetClearModalLayout() {
  const modal = document.querySelector('.clear-lib-modal');
  if (!modal) return;
  clearBaseW = CLEAR_MODAL_BASE_W;
  clearBaseH = 340;
  modal.style.width = clearBaseW + 'px';
  modal.style.height = clearBaseH + 'px';
  modal.style.left = Math.max(8, Math.round((window.innerWidth - clearBaseW) / 2)) + 'px';
  modal.style.top = Math.max(8, Math.round((window.innerHeight - 340) / 3)) + 'px';
}

initClearModalDrag();

// ===== Clear library (two modes: delete library / clear documents) =====
let clearDocsSelected = new Set(); // ids of documents selected in clear-documents mode
let clearDocsAll = [];             // all documents of the current library (for search filtering)

document.getElementById('clearLibraryBtn').addEventListener('click', () => {
  if (!currentLibrary) return;
  // Default to the "delete library" mode
  document.querySelector('input[name="clearMode"][value="delete"]').checked = true;
  document.querySelector('input[name="clearMode"][value="docs"]').checked = false;
  document.getElementById('clearLibName').textContent = currentLibrary.name;
  clearDocsSelected = new Set();
  clearDocsAll = currentLibrary.documents || [];
  document.getElementById('clearSearchType').value = '';
  document.getElementById('clearSearchTag').value = '';
  document.getElementById('clearSearchName').value = '';
  document.getElementById('clearSelectAll').checked = false;
  resetClearModalLayout(); // reset window size and position
  onClearModeChange();
  renderClearDocList(clearDocsAll);
  showModal('clearLibraryModal');
});

// Mode switch: delete library <-> clear documents
function onClearModeChange() {
  const mode = document.querySelector('input[name="clearMode"]:checked');
  const isDocs = mode && mode.value === 'docs';
  document.getElementById('clearDocsSection').classList.toggle('hidden', !isDocs);
  document.getElementById('clearLibInfo').classList.toggle('hidden', isDocs);
  // When switching to "clear documents", window size is fixed to 800x600px (avoid being too wide); restored when switching back to "delete library"
  const modal = document.querySelector('.clear-lib-modal');
  if (modal) {
    if (isDocs) {
      modal.style.width = CLEAR_MODAL_DOCS_W + 'px';
      modal.style.height = CLEAR_MODAL_DOCS_H + 'px';
    } else {
      modal.style.width = clearBaseW + 'px';
      modal.style.height = clearBaseH + 'px';
    }
  }
}

// Render the clear-documents list (each row: checkbox + name + type + tags), preserving selection state
function renderClearDocList(list) {
  const container = document.getElementById('clearDocList');
  const docs = list || [];
  if (docs.length === 0) {
    container.innerHTML = '<div class="clear-doc-empty">无文档记录</div>';
    return;
  }
  container.innerHTML = '';
  docs.forEach(doc => {
    const row = document.createElement('div');
    row.className = 'clear-doc-row';
    row.dataset.id = doc.id;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = clearDocsSelected.has(doc.id);
    cb.addEventListener('change', () => {
      if (cb.checked) clearDocsSelected.add(doc.id);
      else clearDocsSelected.delete(doc.id);
      updateClearSelectAllState();
    });
    const nameSpan = document.createElement('span');
    nameSpan.className = 'clear-doc-name';
    nameSpan.textContent = doc.name;
    nameSpan.title = doc.path;
    const typeSpan = document.createElement('span');
    typeSpan.className = 'clear-doc-type';
    typeSpan.textContent = getTypeName(doc.type);
    const tagsSpan = document.createElement('span');
    tagsSpan.className = 'clear-doc-tags';
    tagsSpan.textContent = (doc.tags || []).join('、');
    row.appendChild(cb);
    row.appendChild(nameSpan);
    row.appendChild(typeSpan);
    row.appendChild(tagsSpan);
    container.appendChild(row);
  });
}

// Select all: check/uncheck all records in the current visible list
function onClearSelectAll() {
  const checked = document.getElementById('clearSelectAll').checked;
  document.querySelectorAll('#clearDocList .clear-doc-row').forEach(row => {
    const cb = row.querySelector('input[type="checkbox"]');
    cb.checked = checked;
    if (checked) clearDocsSelected.add(row.dataset.id);
    else clearDocsSelected.delete(row.dataset.id);
  });
}

// Update the select-all checkbox state: checked only when all visible rows are selected
function updateClearSelectAllState() {
  const rows = document.querySelectorAll('#clearDocList .clear-doc-row');
  const allChecked = rows.length > 0 && [...rows].every(row => row.querySelector('input[type="checkbox"]').checked);
  document.getElementById('clearSelectAll').checked = allChecked;
}

// Convert a search condition to a matching regex: empty, "所有" (all), or "all" -> null (ignore this condition); * matches any char sequence; case-insensitive
function buildClearFilter(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '所有' || s.toLowerCase() === 'all') return null;
  let pattern = '';
  for (const ch of s) {
    if (ch === '*') pattern += '.*';
    else pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(pattern, 'i');
}

// Search filtering: document type / document tag / document name (AND relationship)
// Empty or "所有" (all) ignores the condition; supports * wildcard matching
function searchClearDocs() {
  const typeRe = buildClearFilter(document.getElementById('clearSearchType').value);
  const tagRe = buildClearFilter(document.getElementById('clearSearchTag').value);
  const nameRe = buildClearFilter(document.getElementById('clearSearchName').value);
  const filtered = clearDocsAll.filter(doc => {
    if (typeRe) {
      const typeText = doc.type + ' ' + getTypeName(doc.type);
      if (!typeRe.test(typeText)) return false;
    }
    if (tagRe) {
      const tags = (doc.tags || []).join(' ');
      if (!tagRe.test(tags)) return false;
    }
    if (nameRe && !nameRe.test(doc.name)) return false;
    return true;
  });
  renderClearDocList(filtered);
  updateClearSelectAllState();
}

// Clear-library dialog "OK": open the corresponding confirmation dialog per current mode (reuses deleteConfirmModal)
function confirmClearLibrary() {
  const mode = document.querySelector('input[name="clearMode"]:checked');
  if (!mode || !currentLibrary) return;
  if (mode.value === 'delete') {
    // Delete library: after confirmation, delete the library and all records
    document.getElementById('deleteMessage').innerHTML =
      t('将删除本书库及所有记录（<span class="delete-warn">不删除原始文件</span>）：<span class="delete-lib-name">{0}</span>', escapeHtml(currentLibrary.name));
    deleteCallback = async () => {
      await fetch(`${API_BASE}/library/${currentLibrary.id}`, { method: 'DELETE' });
      currentLibrary = null;
      await fetchLibraries();
      document.getElementById('currentLibraryName').textContent = '请选择一个书库';
      document.getElementById('clearLibraryBtn').disabled = true;
      document.getElementById('addDocBtn').disabled = true;
      document.getElementById('editLibraryBtn').disabled = true;
      document.getElementById('documentList').innerHTML = '<div class="empty-state"><p>暂无文档，请点击上方按钮添加</p></div>';
      closeModal('deleteConfirmModal');
    };
  } else {
    // Clear documents: after confirmation, delete the selected document records
    if (clearDocsSelected.size === 0) {
      alert(t('请先选择要清理的文档记录'));
      return;
    }
    document.getElementById('deleteMessage').innerHTML =
      t('将删除本书库（<span class="delete-lib-name">{0}</span>）中选中的 ', escapeHtml(currentLibrary.name)) +
      t('<span class="delete-count">{0}</span> 条记录（<span class="delete-warn">不删除原始文件</span>）', clearDocsSelected.size);
    deleteCallback = async () => {
      for (const docId of clearDocsSelected) {
        await fetch(`${API_BASE}/library/${currentLibrary.id}/documents/${docId}`, { method: 'DELETE' });
      }
      await fetchLibraries();
      selectLibrary(libraries.find(l => l.id === currentLibrary.id));
      closeModal('deleteConfirmModal');
    };
  }
  closeModal('clearLibraryModal');
  showModal('deleteConfirmModal');
}

document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
  if (deleteCallback) {
    deleteCallback();
    deleteCallback = null;
  }
});

document.getElementById('addDocBtn').addEventListener('click', () => {
  if (!currentLibrary) {
    alert(t('请先选择一个书库或新建一个书库'));
    return;
  }
  document.getElementById('addDocLibraryName').textContent = currentLibrary.name;
  document.getElementById('docNameInput').value = '';
  document.getElementById('docPathInput').value = '';
  resetTagUi('doc');
  loadTagOptions('doc');
  showModal('addDocModal');
});

document.getElementById('editLibraryBtn').addEventListener('click', () => {
  if (!currentLibrary) return;
  document.getElementById('editLibraryNameInput').value = currentLibrary.name;
  showModal('editLibraryModal');
});

async function saveLibraryName() {
  if (!currentLibrary) return;
  
  const newName = document.getElementById('editLibraryNameInput').value.trim();
  
  if (!newName) {
    alert(t('请输入书库名称'));
    return;
  }
  
  const response = await fetch(`${API_BASE}/library/${currentLibrary.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName })
  });
  
  if (response.ok) {
    await fetchLibraries();
    selectLibrary(libraries.find(l => l.id === currentLibrary.id));
    closeModal('editLibraryModal');
  } else {
    const error = await response.json();
    alert(t(error.error));
  }
}

function selectDocFile() {
  openBrowseDialog('docPathInput');
}

document.getElementById('docPathInput').addEventListener('input', () => {
  const pathInput = document.getElementById('docPathInput');
  const nameInput = document.getElementById('docNameInput');
  const path = pathInput.value.trim();
  
  if (path && !nameInput.value) {
    let fileName = '';
    const lastBackslash = path.lastIndexOf('\\');
    const lastSlash = path.lastIndexOf('/');
    const lastSeparator = Math.max(lastBackslash, lastSlash);
    
    if (lastSeparator !== -1) {
      fileName = path.substring(lastSeparator + 1);
    } else {
      fileName = path;
    }
    
    // Programming code/config files keep the full filename (with extension); other types drop the extension
    if (!keepFullFileName(fileName)) {
      fileName = fileName.replace(/\.[^/.]+$/, '');
    }
    
    if (fileName.startsWith('"')) {
      fileName = fileName.replace(/^"/, '');
    }
    if (fileName.endsWith('"')) {
      fileName = fileName.replace(/"$/, '');
    }
    
    nameInput.value = fileName;
  }
});

async function addDocument() {
  if (!currentLibrary) return;
  
  const name = document.getElementById('docNameInput').value.trim();
  let path = document.getElementById('docPathInput').value.trim();
  
  if (path.startsWith('"') && path.endsWith('"')) {
    path = path.slice(1, -1);
  }
  
  if (!name || !path) {
    alert(t('请输入文档名称和路径'));
    return;
  }
  
  const tags = getModalTags('doc');
  const response = await fetch(`${API_BASE}/library/${currentLibrary.id}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, path, tags })
  });
  
  if (response.ok) {
    await fetchLibraries();
    selectLibrary(libraries.find(l => l.id === currentLibrary.id));
    closeModal('addDocModal');
  } else {
    const error = await response.json();
    alert(t(error.error));
  }
}

function editDocument(docId) {
  if (!currentLibrary) return;
  
  const doc = currentLibrary.documents.find(d => d.id === docId);
  if (!doc) return;
  
  document.getElementById('editDocId').value = doc.id;
  document.getElementById('editDocLibraryId').value = currentLibrary.id;
  document.getElementById('editDocLibraryName').textContent = currentLibrary.name;
  document.getElementById('editDocTypeName').textContent = getTypeName(doc.type);
  document.getElementById('editDocNameInput').value = doc.name;
  document.getElementById('editDocPathInput').value = doc.path;
  
  resetTagUi('edit', doc.tags || []);
  loadTagOptions('edit', doc.tags || []);
  showModal('editDocModal');
}

function selectEditDocFile() {
  openBrowseDialog('editDocPathInput');
}

// ===== Document tags (shared by add/edit dialogs, prefix: 'doc' | 'edit') =====
// Tag validity: only letters, digits, _, - and Chinese are allowed (- placed at the end of the character class to avoid being treated as a range)
function isValidTag(tag) {
  return /^[a-zA-Z0-9_\u4e00-\u9fa5-]+$/.test(tag);
}

// Read the set of tags already added in the current dialog
function getModalTags(prefix) {
  const list = document.getElementById(`${prefix}TagsList`);
  if (!list) return [];
  return Array.from(list.querySelectorAll('.tag-chip .tag-name')).map(el => el.textContent);
}

// Reset the tag UI (optionally pass initial tags)
function resetTagUi(prefix, tags) {
  const select = document.getElementById(`${prefix}TagSelect`);
  const customWrap = document.getElementById(`${prefix}TagCustomWrap`);
  const customInput = document.getElementById(`${prefix}TagCustomInput`);
  const list = document.getElementById(`${prefix}TagsList`);
  if (select) select.value = '';
  if (customWrap) customWrap.classList.add('hidden');
  if (customInput) customInput.value = '';
  renderTagsList(prefix, tags || []);
}

// Render the tag set (rounded background + delete button)
function renderTagsList(prefix, tags) {
  const list = document.getElementById(`${prefix}TagsList`);
  if (!list) return;
  list.innerHTML = '';
  (tags || []).forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    const name = document.createElement('span');
    name.className = 'tag-name';
    name.textContent = tag;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'tag-delete';
    del.title = '删除标签';
    del.textContent = '✕';
    del.addEventListener('click', () => removeDocTag(prefix, tag));
    chip.appendChild(name);
    chip.appendChild(del);
    list.appendChild(chip);
  });
}

// Load the library's full tag set into the dropdown (shows the complete tag set, including already-selected tags)
// Tag source: a 'ctx' prefix uses the library selected in the right-click dialog; others use the current library (see getTagLibId)
async function loadTagOptions(prefix, existingTags) {
  const libId = getTagLibId(prefix);
  if (!libId) return;
  const select = document.getElementById(`${prefix}TagSelect`);
  if (!select) return;
  try {
    const response = await fetch(`${API_BASE}/library/${libId}/tags`);
    const tags = await response.json();
    const current = select.value;
    select.innerHTML = `
      <option value="">-- 选择或自定义标签 --</option>
      <option value="__custom__">✏️ 自定义标签...</option>
    `;
    (Array.isArray(tags) ? tags : []).forEach(tag => {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = tag;
      select.appendChild(opt);
    });
    select.value = current;
  } catch (e) {
    console.error('加载标签失败:', e);
  }
}

// Dropdown change: custom -> show input box; existing tag -> add directly to the set
function onTagSelectChange(prefix) {
  const select = document.getElementById(`${prefix}TagSelect`);
  const customWrap = document.getElementById(`${prefix}TagCustomWrap`);
  const customInput = document.getElementById(`${prefix}TagCustomInput`);
  const value = select.value;

  if (value === '__custom__') {
    customWrap.classList.remove('hidden');
    customInput.focus();
    select.value = '';
    return;
  }
  customWrap.classList.add('hidden');
  if (value) {
    addTagToDoc(prefix, value);
    select.value = '';
  }
}

// Add a tag from the custom input box
function addTagFromInput(prefix) {
  const input = document.getElementById(`${prefix}TagCustomInput`);
  const tag = input.value.trim();
  if (!tag) {
    alert(t('请输入标签名称'));
    return;
  }
  if (!isValidTag(tag)) {
    alert(t('标签只能包含字母、数字、_、- 和中文'));
    input.focus();
    return;
  }
  addTagToDoc(prefix, tag);
  input.value = '';
  input.focus();
}

// Add a tag to the set (dedupe)
function addTagToDoc(prefix, tag) {
  const current = getModalTags(prefix);
  if (current.includes(tag)) {
    alert(t('标签 "{0}" 已存在', tag));
    return;
  }
  current.push(tag);
  renderTagsList(prefix, current);
  loadTagOptions(prefix, current);
}

// Remove a tag
function removeDocTag(prefix, tag) {
  const current = getModalTags(prefix).filter(t => t !== tag);
  renderTagsList(prefix, current);
  loadTagOptions(prefix, current);
}

// ===== Document list tag filter (library view) =====
// Load the library's tag set into the filter panel (first item is "所有" / all)
async function loadTagFilterList() {
  const listEl = document.getElementById('tagFilterList');
  if (!listEl || !currentLibrary) return;
  let tags = [];
  try {
    const response = await fetch(`${API_BASE}/library/${currentLibrary.id}/tags`);
    tags = await response.json();
  } catch (e) {
    console.error('加载标签过滤列表失败:', e);
  }
  if (!Array.isArray(tags)) tags = [];

  listEl.innerHTML = '';
  // The "all" item (dataset.all sentinel, to avoid comparison failure after UI language translation)
  const allItem = document.createElement('span');
  allItem.className = 'tag-filter-item' + (currentTagFilter === null ? ' active' : '');
  allItem.dataset.all = '1';
  allItem.textContent = t('所有');
  allItem.addEventListener('click', () => selectTagFilter(null));
  listEl.appendChild(allItem);

  // Each tag item (rounded background)
  tags.forEach(tag => {
    const item = document.createElement('span');
    item.className = 'tag-filter-item' + (currentTagFilter === tag ? ' active' : '');
    item.textContent = tag;
    item.title = tag;
    item.addEventListener('click', () => selectTagFilter(tag));
    listEl.appendChild(item);
  });
}

// Click a tag filter item
function selectTagFilter(tag) {
  currentTagFilter = tag || null;
  // highlight the current selected item
  document.querySelectorAll('#tagFilterList .tag-filter-item').forEach(el => {
    const isAll = el.dataset.all === '1';
    el.classList.toggle('active', isAll ? currentTagFilter === null : el.textContent === currentTagFilter);
  });
  updateDocSortSelectState();
  renderDocuments();
}

// Sync the sort dropdown based on the current tag filter state: disable "sort edit" when a tag filter is active
function updateDocSortSelectState() {
  const sortSelect = document.getElementById('docSortSelect');
  if (!sortSelect) return;
  const editOption = sortSelect.querySelector('option[value="edit"]');
  if (currentTagFilter !== null) {
    // Disallow sort editing when showing only documents under a specific tag (it would change the global in-memory order)
    if (currentDocSort === 'edit') currentDocSort = 'default';
    sortSelect.value = currentDocSort;
    if (editOption) editOption.disabled = true;
  } else {
    if (editOption) editOption.disabled = false;
  }
}

// Toggle the tag panel show/hide (shows all documents when hidden)
function toggleTagPanel() {
  const panel = document.getElementById('tagPanel');
  const btn = document.getElementById('tagFilterBtn');
  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden');
    btn.classList.add('active');
    loadTagFilterList();
  } else {
    panel.classList.add('hidden');
    btn.classList.remove('active');
    // restore display of all documents when closing
    currentTagFilter = null;
    updateDocSortSelectState();
    renderDocuments();
  }
}

document.getElementById('tagFilterBtn').addEventListener('click', toggleTagPanel);

// ===== Simulated file open dialog (Windows style) =====
const browseSessionId = 'browse-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 8);
let browseTargetInputId = null; // id of the input box to fill back the path after confirmation
let browseCurrentDir = null;    // currently displayed directory
let browseParentDir = null;     // parent directory
let browseItems = [];           // entries in the current directory
let browseMode = 'path';        // 'path' = fill path into input box; 'md' = select a markdown file to open preview directly
let browseSortKey = null;       // sort field: null='name'|'type'|'size'|'mtime'
let browseSortDir = 'asc';      // 'asc' | 'desc'

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// Robustly get the file extension (lowercase): take the filename (strip path) then the part after the last dot.
// Aligned with path.extname semantics: a directory name containing a dot does not affect the result (D:/my.dir/vitest.e2e.config.ts -> 'ts'),
// extensionless files return '' (D:/my.dir/README -> ''), dot files return the part after the dot (.env -> 'env').
function getFileExt(nameOrPath) {
  const base = String(nameOrPath || '').split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot < 0) return '';
  return base.substring(dot + 1).toLowerCase();
}

// filename/path -> icon (uniformly provided by DOC_TYPE_DEFS; zip/exe etc. go through a supplementary table; unknown defaults to '📄' 📦)
function fileIcon(name) {
  const ext = getFileExt(name);
  const def = findDocDef(ext);
  if (def) return def.icon;
  return '📄';
  // const extra = { zip: '🗜️', exe: '⚙️' };
  // return extra[ext] || '📄';
}

function typeName(name) {
  const ext = getFileExt(name);
  if (ext) {
    const types = {
      md: 'Markdown 文档', txt: '文本文档', pdf: 'PDF 文档', json: 'JSON 文件', js: 'JavaScript 文件',
      html: 'HTML 文件', css: 'CSS 文件', png: 'PNG 图片', jpg: 'JPG 图片', jpeg: 'JPEG 图片',
      gif: 'GIF 图片', svg: 'SVG 图片', webp: 'WEBP 图片', docx: 'Word 文档', xlsx: 'Excel 表格',
      pptx: 'PowerPoint 演示', zip: '压缩文件', exe: '应用程序',
      // code/text types
      ts: 'TypeScript 文件', tsx: 'TypeScript 文件', jsx: 'JSX 文件', py: 'Python 文件',
      rb: 'Ruby 文件', go: 'Go 文件', rs: 'Rust 文件', kt: 'Kotlin 文件', scala: 'Scala 文件',
      swift: 'Swift 文件', lua: 'Lua 文件', pl: 'Perl 文件', r: 'R 文件', php: 'PHP 文件',
      cs: 'C# 文件', java: 'Java 文件', c: 'C 文件', h: 'C 头文件', cpp: 'C++ 文件', hpp: 'C++ 头文件',
      sh: 'Shell 脚本', cmd: 'CMD 脚本', bat: 'BAT 脚本', ps1: 'PowerShell 脚本',
      sql: 'SQL 文件', csv: 'CSV 表格', log: '日志文件', mjs: 'JavaScript 文件', cjs: 'JavaScript 文件',
      vue: 'Vue 文件', scss: 'SCSS 样式', less: 'LESS 样式',
      xml: 'XML 文件', yml: 'YAML 文件', yaml: 'YAML 文件', toml: 'TOML 文件', ini: 'INI 文件',
      conf: '配置文件', cfg: '配置文件', properties: 'Properties 文件', gradle: 'Gradle 文件',
      env: 'Env 配置', gitignore: 'GitIgnore 文件', editorconfig: 'EditorConfig 文件'
    };
    return types[ext] || ext.toUpperCase() + ' 文件';
  }
  return '文件';
}

async function openBrowseDialog(targetInputId) {
  browseMode = 'path';
  browseTargetInputId = targetInputId;
  document.getElementById('browseFileNameInput').value = '';
  showModal('browseModal');
  loadBrowseDrives(); // load partition shortcut buttons
  await fetchBrowseList();
}

async function fetchBrowseList(dir, exts) {
  const body = document.getElementById('browseListBody');
  body.innerHTML = '<div class="empty-state"><p>正在加载...</p></div>';
  try {
    const payload = { sessionId: browseSessionId, dir };
    if (Array.isArray(exts) && exts.length > 0) payload.exts = exts;
    const response = await fetch(`${API_BASE}/browse/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '加载目录失败');
    // After switching directories (double-click to enter / go up / address bar / partition button), clear the filename input,
    // to avoid a leftover name from a previous single-click selection being concatenated into a wrong file path on confirm
    document.getElementById('browseFileNameInput').value = '';
    renderBrowseList(data);
  } catch (e) {
    body.innerHTML = `<div class="empty-state"><p>${escapeHtml(e.message)}</p></div>`;
  }
}

// Load the Windows drive list and render it as a shortcut button bar (refer to docreader's loadDrives/goToDrive)
async function loadBrowseDrives() {
  const bar = document.getElementById('browseDrivesBar');
  if (!bar) return;
  try {
    const response = await fetch(`${API_BASE}/drives`);
    const data = await response.json();
    if (!response.ok || !data || !data.drives || data.drives.length === 0) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    bar.innerHTML = '<span class="browse-drives-label">分区:</span>' +
      data.drives.map(d =>
        '<button type="button" class="browse-drive-btn" data-path="' + escapeHtml(d.path) + '" title="' + t('切换到 {0}', escapeHtml(d.path)) + '" onclick="goToDrive(this)">' +
        escapeHtml(d.name) + '</button>'
      ).join('');
  } catch (e) {
    bar.style.display = 'none';
  }
}

// Click a partition button -> switch to that partition's root path
function goToDrive(btn) {
  const path = btn.getAttribute('data-path');
  if (path) fetchBrowseList(path);
}

// Highlight the corresponding partition button based on the current directory
function updateDriveHighlight(currentDir) {
  const bar = document.getElementById('browseDrivesBar');
  if (!bar || bar.style.display === 'none') return;
  const cur = String(currentDir || '');
  bar.querySelectorAll('.browse-drive-btn').forEach((btn) => {
    const p = btn.getAttribute('data-path');
    btn.classList.toggle('active', !!p && (cur === p || cur.indexOf(p) === 0));
  });
}

function renderBrowseList(data) {
  browseCurrentDir = data.currentDir;
  browseParentDir = data.parentDir;
  browseItems = data.items;
  document.getElementById('browseAddressInput').value = data.currentDir;

  const body = document.getElementById('browseListBody');
  if (data.items.length === 0) {
    body.innerHTML = '<div class="empty-state"><p>此文件夹为空</p></div>';
    return;
  }
  body.innerHTML = '';

  // Apply sorting (directories always first, each sorted by field)
  const sorted = sortBrowseItems(browseItems);
  sorted.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'browse-row' + (item.isDir ? ' is-dir' : '');
    row.innerHTML = `
      <span class="col-icon">${item.isDir ? '📁' : fileIcon(item.name)}</span>
      <span class="col-name" title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</span>
      <span class="col-type">${item.isDir ? '文件夹' : typeName(item.name)}</span>
      <span class="col-size">${item.isDir ? '' : formatSize(item.size)}</span>
      <span class="col-mtime">${formatMtime(item.mtime)}</span>
    `;
    row.addEventListener('click', () => selectBrowseRow(row, item));
    row.addEventListener('dblclick', () => {
      if (item.isDir) {
        fetchBrowseList(item.path);
      } else {
        confirmBrowsePath(item.path);
      }
    });
    body.appendChild(row);
  });
  updateBrowseSortHeader();
  // highlight the partition button corresponding to the current directory
  updateDriveHighlight(data.currentDir);
}

// Sort entries by current sort field/direction (directories first, files after, each sorted by field)
function sortBrowseItems(items) {
  const dirs = items.filter(i => i.isDir);
  const files = items.filter(i => !i.isDir);
  const cmp = (a, b) => {
    if (browseSortKey === 'type') {
      const ta = a.isDir ? '' : typeName(a.name);
      const tb = b.isDir ? '' : typeName(b.name);
      return ta.localeCompare(tb, 'zh-CN');
    }
    if (browseSortKey === 'size') {
      return (a.size || 0) - (b.size || 0);
    }
    if (browseSortKey === 'mtime') {
      const ma = a.mtime ? new Date(a.mtime).getTime() : 0;
      const mb = b.mtime ? new Date(b.mtime).getTime() : 0;
      return ma - mb;
    }
    // default sort by name
    return a.name.localeCompare(b.name, 'zh-CN');
  };
  const sortList = (list) => {
    if (!browseSortKey) return list; // default order (server-side already sorted)
    const sorted = list.slice().sort(cmp);
    return browseSortDir === 'desc' ? sorted.reverse() : sorted;
  };
  return sortList(dirs).concat(sortList(files));
}

// Click a header field name to cycle sort: default -> ascending -> descending -> default
function toggleBrowseSort(key) {
  if (browseSortKey !== key) {
    browseSortKey = key;
    browseSortDir = 'asc';
  } else if (browseSortDir === 'asc') {
    browseSortDir = 'desc';
  } else {
    browseSortKey = null;
    browseSortDir = 'asc';
  }
  renderBrowseList({ currentDir: browseCurrentDir, parentDir: browseParentDir, items: browseItems });
}

// Update the header sort indicator (arrow/highlight), only on the browse dialog header, to avoid clashing with the folder list header
function updateBrowseSortHeader() {
  document.querySelectorAll('#browseModal .browse-list-header .sortable').forEach(el => {
    const key = el.dataset.sortKey;
    el.classList.remove('sorted-asc', 'sorted-desc');
    if (browseSortKey === key) {
      el.classList.add(browseSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
  });
}

// Click a header field name to sort
document.querySelectorAll('.browse-list-header .sortable').forEach(el => {
  el.addEventListener('click', () => toggleBrowseSort(el.dataset.sortKey));
});

// Format modification time (ISO -> YYYY-MM-DD HH:mm)
function formatMtime(mtime) {
  if (!mtime) return '';
  const d = new Date(mtime);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function selectBrowseRow(row, item) {
  document.querySelectorAll('#browseListBody .browse-row.selected').forEach(r => r.classList.remove('selected'));
  row.classList.add('selected');
  if (item) document.getElementById('browseFileNameInput').value = item.name;
}

function pathJoin(dir, name) {
  // The separator follows the directory itself (the server normalizes it with path.normalize per platform):
  // Windows paths use backslash, POSIX (Linux/macOS) paths use forward slash — never hardcode a backslash
  const sep = dir.indexOf('\\') >= 0 ? '\\' : '/';
  return dir.replace(/[\\/]+$/, '') + sep + name;
}

function confirmBrowse() {
  const value = document.getElementById('browseFileNameInput').value.trim();
  if (!value || !browseCurrentDir) return;
  let fullPath;
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/')) {
    // Absolute paths (Windows drive/UNC, or POSIX root like /www/...) are used as-is
    fullPath = value;
  } else {
    fullPath = pathJoin(browseCurrentDir, value);
  }
  // Only the "open folder" window (browseMode='md') supports selecting a directory and showing its file list in the preview area;
  // other modes (e.g. the browse in the add-document window) only fill the path back into the input box when selecting a directory/file
  if (browseMode === 'md') {
    const dirItem = (browseItems || []).find(it => it.isDir && (it.path === fullPath || it.name === value));
    if (dirItem) {
      closeBrowseModal();
      renderFolderList({ name: dirItem.name, path: dirItem.path, type: 'folder' });
      return;
    }
  }
  confirmBrowsePath(fullPath);
}

// Infer the document type from the file extension (consistent with server.js's docTypes mapping)
function inferDocType(filePath) {
  // extension -> type (URLs recognized as weblink; unknown extensions return other), uniformly provided by DOC_TYPE_DEFS
  return getFileType(filePath);
}

function confirmBrowsePath(fullPath) {
  // Editor selection mode: add the selected .exe to the custom editor list and select it
  if (browseMode === 'editor') {
    closeBrowseModal();
    onEditorExeSelected(fullPath);
    return;
  }
  // markdown preview mode: infer type by extension, reuse the open method of the library document list
  // (external types like docx/xlsx/pptx are opened via the system software)
  if (browseMode === 'md') {
    closeBrowseModal();
    const base = fullPath.split(/[\\/]/).pop();
    const name = base.replace(/\.[^/.]+$/, '') || base;
    openDocument({ name, path: fullPath, type: inferDocType(fullPath), createdAt: null });
    return;
  }
  const target = document.getElementById(browseTargetInputId);
  if (target) target.value = fullPath;
  // After selecting a file, always auto-update the document name from the path (the user can edit it later)
  const nameInputId = browseTargetInputId === 'docPathInput' ? 'docNameInput' : 'editDocNameInput';
  const nameInput = document.getElementById(nameInputId);
  if (nameInput) {
    const base = fullPath.split(/[\\/]/).pop();
    // Programming code/config files keep the full filename (with extension); other types drop the extension
    nameInput.value = keepFullFileName(base) ? base : base.replace(/\.[^/.]+$/, '');
  }
  closeBrowseModal();
}

// ===== Open a document via the system "Open With" dialog =====
// Button state: shown and enabled for all document types (text/markdown/html/pdf/image/folder etc.),
// so the user can open the current document or folder with system software at any time
function updateEditorBtnState() {
  const btn = document.getElementById('editDocBtn');
  if (!btn) return;
  const showBtn = !!currentDocument;
  btn.classList.toggle('hidden', !showBtn);
  btn.disabled = !showBtn;
}

// Editor preference memory (localStorage)
const EDITOR_CUSTOM_KEY = 'editorCustomList'; // user-added editors found via search
const EDITOR_TYPE_KEY = 'editorTypeChoice';   // remembered editor choice per document type
const EDITOR_LAST_KEY = 'editorLastChoice';   // globally most recently used editor

function getCustomEditors() {
  try { return JSON.parse(localStorage.getItem(EDITOR_CUSTOM_KEY) || '[]'); } catch (e) { return []; }
}

function saveCustomEditors(list) {
  try { localStorage.setItem(EDITOR_CUSTOM_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}

function getTypeEditorChoice(type) {
  try { return (JSON.parse(localStorage.getItem(EDITOR_TYPE_KEY) || '{}'))[type] || null; } catch (e) { return null; }
}

function setTypeEditorChoice(type, path) {
  try {
    const all = JSON.parse(localStorage.getItem(EDITOR_TYPE_KEY) || '{}');
    all[type] = path;
    localStorage.setItem(EDITOR_TYPE_KEY, JSON.stringify(all));
  } catch (e) { /* ignore */ }
}

function getEditorLastChoice() {
  try { return localStorage.getItem(EDITOR_LAST_KEY) || null; } catch (e) { return null; }
}

function setEditorLastChoice(path) {
  try { localStorage.setItem(EDITOR_LAST_KEY, path); } catch (e) { /* ignore */ }
}

// Search path list (localStorage persisted)
const EDITOR_SEARCH_PATHS_KEY = 'editorSearchPaths';

function getEditorSearchPaths() {
  try { return JSON.parse(localStorage.getItem(EDITOR_SEARCH_PATHS_KEY) || '[]'); } catch (e) { return []; }
}

function saveEditorSearchPaths(list) {
  try { localStorage.setItem(EDITOR_SEARCH_PATHS_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}

function editorBaseName(exePath) {
  const base = String(exePath).split(/[\\/]/).pop() || exePath;
  return base.replace(/\.exe$/i, '');
}

let detectedEditors = []; // editors detected by the system (cached when the dialog opens)
let scannedEditors = [];   // editors newly added by directory scan (updated after clicking "find")

async function openEditorPicker() {
  if (!currentDocument) return;
  try {
    const res = await fetch(`${API_BASE}/editors`);
    const data = await res.json();
    detectedEditors = Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('加载编辑软件列表失败:', e);
    detectedEditors = [];
  }
  resetEditorPickerModalPosition();
  renderEditorSearchPathList();
  renderEditorPickerList();
  showModal('editorPickerModal');
}

// Render the editor selection list (system-detected + custom, with the last-selected editor first and selected by default)
function renderEditorPickerList() {
  const wrap = document.getElementById('editorList');
  if (!wrap || !currentDocument) return;
  const typeChoice = getTypeEditorChoice(currentDocument.type);
  const preferred = typeChoice || getEditorLastChoice();
  const custom = getCustomEditors().filter(c => c && c.path && !detectedEditors.some(d => d.path === c.path));
  // Merge: system-detected + directory-scanned + custom, dedupe by path
  const list = [];
  const pathSet = new Set();
  [...detectedEditors, ...scannedEditors, ...custom].forEach(e => {
    if (!e || !e.path || pathSet.has(e.path)) return;
    pathSet.add(e.path);
    list.push(e);
  });
  // The previously selected editor is moved to the top of the list
  if (preferred) {
    const idx = list.findIndex(e => e.path === preferred);
    if (idx > 0) {
      const [pref] = list.splice(idx, 1);
      list.unshift(pref);
    }
  }
  if (list.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><p>未检测到编辑软件，请点击下方"查找软件..."选择</p></div>';
    document.getElementById('editorChosenName').textContent = '';
    return;
  }
  wrap.innerHTML = '';
  let chosenName = '';
  list.forEach(ed => {
    const label = document.createElement('label');
    label.className = 'editor-option';
    label.innerHTML = `
      <input type="radio" name="editorChoice" value="${escapeHtml(ed.path)}">
      <span class="editor-name">${escapeHtml(ed.name)}</span>
      <span class="editor-path" title="${escapeHtml(ed.path)}">${escapeHtml(ed.path)}</span>
    `;
    const radio = label.querySelector('input');
    if (ed.path === preferred) {
      radio.checked = true;
      chosenName = ed.name;
    }
    radio.addEventListener('change', () => {
      document.getElementById('editorChosenName').textContent = ed.name;
    });
    wrap.appendChild(label);
  });
  document.getElementById('editorChosenName').textContent = chosenName;
}

// ===== Search path management =====
// Add a path to the search list
function addEditorSearchPath() {
  const input = document.getElementById('editorSearchPathInput');
  const val = input ? input.value.trim() : '';
  if (!val) {
    alert(t('请输入要扫描的路径'));
    return;
  }
  const paths = getEditorSearchPaths();
  if (paths.includes(val)) {
    alert(t('该路径已在列表中'));
    return;
  }
  paths.push(val);
  saveEditorSearchPaths(paths);
  renderEditorSearchPathList();
  input.value = '';
}

// Remove a search path
function removeEditorSearchPath(index) {
  const paths = getEditorSearchPaths();
  paths.splice(index, 1);
  saveEditorSearchPaths(paths);
  renderEditorSearchPathList();
}

// Render the search path list
function renderEditorSearchPathList() {
  const wrap = document.getElementById('editorSearchPathList');
  if (!wrap) return;
  const paths = getEditorSearchPaths();
  if (paths.length === 0) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = '';
  paths.forEach((p, i) => {
    const item = document.createElement('span');
    item.className = 'editor-search-path-item';
    item.innerHTML = `
      <span class="editor-search-path-text" title="${escapeHtml(p)}">${escapeHtml(p)}</span>
      <button class="editor-search-path-remove" title="移除该路径" onclick="removeEditorSearchPath(${i})">×</button>
    `;
    wrap.appendChild(item);
  });
}

// Click "find": scan default system paths + added paths, compare with the listed editors and update the list
// Show elapsed time and a "stop find" button during scanning
let scanTimerId = null;  // elapsed-time timer
let scanStartTime = 0;   // scan start time

function updateScanStatusUI(text, extraHtml) {
  const el = document.getElementById('editorScanStatus');
  if (el) el.innerHTML = text + (extraHtml || '');
}

async function scanEditorsByPaths() {
  // Show scan status: timer + stop-find button
  scanStartTime = Date.now();
  if (scanTimerId) clearInterval(scanTimerId);
  const showRunning = () => {
    const secs = ((Date.now() - scanStartTime) / 1000).toFixed(1);
    updateScanStatusUI(
      '<span class="scan-running">' + t('正在查找编辑软件... 已用 {0} 秒', secs) + '</span>',
      ' <button class="btn btn-secondary btn-sm" onclick="stopEditorScan()">停止查找</button>'
    );
  };
  showRunning();
  scanTimerId = setInterval(showRunning, 200);
  try {
    const res = await fetch(`${API_BASE}/editors/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // dirs=added search paths; keyword=current text in the input (path or software name)
      body: JSON.stringify({
        dirs: getEditorSearchPaths(),
        keyword: (document.getElementById('editorSearchPathInput') || {}).value || ''
      })
    });
    const data = await res.json();
    if (scanTimerId) { clearInterval(scanTimerId); scanTimerId = null; }
    if (!res.ok) {
      updateScanStatusUI('<span class="scan-error">' + t('扫描失败: {0}', escapeHtml(data.error || t('未知错误'))) + '</span>');
      return;
    }
    scannedEditors = Array.isArray(data.editors) ? data.editors : [];
    renderEditorPickerList();
    const secs = ((Date.now() - scanStartTime) / 1000).toFixed(1);
    if (data.cancelled) {
      updateScanStatusUI('<span class="scan-info">' + t('已停止查找，用时 {0} 秒，已找到 {1} 个编辑软件并更新到列表', secs, scannedEditors.length) + '</span>');
    } else {
      updateScanStatusUI('<span class="scan-info">' + t('扫描完成，用时 {0} 秒，发现 {1} 个编辑软件，已更新到列表', secs, scannedEditors.length) + '</span>');
    }
  } catch (e) {
    if (scanTimerId) { clearInterval(scanTimerId); scanTimerId = null; }
    updateScanStatusUI('<span class="scan-error">' + t('扫描失败: {0}', escapeHtml(e.message)) + '</span>');
  }
}

// Stop find
async function stopEditorScan() {
  try {
    await fetch(`${API_BASE}/editors/scan-cancel`, { method: 'POST' });
  } catch (e) { /* ignore */ }
  updateScanStatusUI('<span class="scan-info">正在停止查找...</span>');
}

// Open the system file browse dialog, showing only .exe programs
async function browseEditorExe() {
  browseMode = 'editor';
  browseTargetInputId = 'editorPickerModal'; // placeholder; in edit mode it won't be written back
  document.getElementById('browseFileNameInput').value = '';
  showModal('browseModal');
  loadBrowseDrives(); // load partition shortcut buttons
  await fetchBrowseList(null, ['.exe']);
}

// Browse-selected editor: record into the custom list and select it by default
function onEditorExeSelected(exePath) {
  let custom = getCustomEditors();
  if (!custom.some(c => c.path === exePath)) {
    custom.push({ name: editorBaseName(exePath), path: exePath });
    saveCustomEditors(custom);
  }
  renderEditorPickerList();
  document.querySelectorAll('#editorList input[name="editorChoice"]').forEach(r => {
    if (r.value === exePath) {
      r.checked = true;
      document.getElementById('editorChosenName').textContent = editorBaseName(exePath);
    }
  });
}

// Confirm: remember the choice for this type and open the current document with the selected editor
async function confirmEditorChoice() {
  if (!currentDocument) return;
  const checked = document.querySelector('#editorList input[name="editorChoice"]:checked');
  if (!checked) {
    alert(t('请先选择一个编辑软件'));
    return;
  }
  const editorPath = checked.value;
  const type = currentDocument.type;
  // Remember the choice for this type: next time a doc of this type is edited, this software appears in the list and is selected by default
  setTypeEditorChoice(type, editorPath);
  // Record the globally most recently used editor (appears first and selected next time the list opens)
  setEditorLastChoice(editorPath);
  if (!detectedEditors.some(d => d.path === editorPath)) {
    const custom = getCustomEditors();
    if (!custom.some(c => c.path === editorPath)) {
      custom.push({ name: editorBaseName(editorPath), path: editorPath });
      saveCustomEditors(custom);
    }
  }
  try {
    const res = await fetch(`${API_BASE}/open-with-editor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: currentDocument.path, editorPath })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(t(data.error) || t('打开编辑器失败'));
      return;
    }
  } catch (e) {
    alert(t('打开编辑器失败: ') + e.message);
    return;
  }
  closeModal('editorPickerModal');
}

function closeBrowseModal() {
  closeModal('browseModal');
}

document.getElementById('browseUpBtn').addEventListener('click', () => {
  if (browseParentDir) fetchBrowseList(browseParentDir);
});

document.getElementById('browseGoBtn').addEventListener('click', () => {
  const value = document.getElementById('browseAddressInput').value.trim();
  if (value) fetchBrowseList(value);
});

document.getElementById('browseAddressInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const value = e.target.value.trim();
    if (value) fetchBrowseList(value);
  }
});

document.getElementById('browseFileNameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmBrowse();
});

async function saveDocument() {
  const docId = document.getElementById('editDocId').value;
  const libraryId = document.getElementById('editDocLibraryId').value;
  const name = document.getElementById('editDocNameInput').value.trim();
  let path = document.getElementById('editDocPathInput').value.trim();
  
  if (path.startsWith('"') && path.endsWith('"')) {
    path = path.slice(1, -1);
  }
  
  if (!name || !path) {
    alert(t('请输入文档名称和路径'));
    return;
  }
  
  const tags = getModalTags('edit');
  const response = await fetch(`${API_BASE}/library/${libraryId}/documents/${docId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, path, tags })
  });
  
  if (response.ok) {
    await fetchLibraries();
    selectLibrary(libraries.find(l => l.id === libraryId));
    closeModal('editDocModal');
  } else {
    const error = await response.json();
    alert(t(error.error));
  }
}

async function deleteDocument(docId) {
  if (!currentLibrary) return;
  
  document.getElementById('deleteMessage').innerHTML =
    '确定要删除这个文档记录吗？<span class="delete-warn">注：只删记录不删原文件！</span>';
  deleteCallback = async () => {
    await fetch(`${API_BASE}/library/${currentLibrary.id}/documents/${docId}`, { method: 'DELETE' });
    await fetchLibraries();
    selectLibrary(libraries.find(l => l.id === currentLibrary.id));
    closeModal('deleteConfirmModal');
  };
  
  showModal('deleteConfirmModal');
}

// ===== Tabs/pagination (tab pages) and multi-view: each tab page holds its own content node, operations are naturally isolated =====
// The main page (main) is fixed in the main view and is the default workspace: document lists / folder-opened content are all shown on the main page;
// The lock button binds the current preview document as a new tab page (tab + sequence number); a tab page owns an independent content DOM node
// (contentEl), so scroll position, iframe state, and render method do not affect each other.
// Tab pages can be dragged to reorder, or dragged to the right/bottom to form side-by-side views; empty views auto-hide.
let tabPages = [];      // { id, name, isMain, viewId, contentEl, snapshot }
let views = [];         // { id, isMain, el, tabIds: [] } view model
let viewSeq = 0;        // child-view id incrementing sequence (ensures unique ids, avoids duplicate ids after view delete/recreate)
let activeTabId = 'main';
let activeViewId = 'view-main';
let viewActive = {};    // active tab per view: { viewId: tabId }, multiple views can each show/highlight their own active tab
let tabSeq = 0;         // tab sequence counter

// Content node of the currently active tab page: the main page reuses #documentContent; tab pages use their own independent node
function getActiveContentEl() {
  const tab = tabPages.find(t => t.id === activeTabId);
  if (tab && tab.contentEl) return tab.contentEl;
  return document.getElementById('documentContent');
}

function initTabs() {
  tabPages = [{ id: 'main', name: '主页', isMain: true, viewId: 'view-main', contentEl: null, snapshot: null }];
  views = [{ id: 'view-main', isMain: true, el: document.querySelector('.view-main'), tabIds: ['main'] }];
  viewActive = { 'view-main': 'main' };
  activeTabId = 'main';
  activeViewId = 'view-main';
  tabSeq = 0;
  renderTabView();
}

// Collect a snapshot of the current preview view (content HTML + header info + related global state)
function makeSnapshot() {
  const docView = document.getElementById('documentView');
  const activeTab = tabPages.find(t => t.id === activeTabId);
  // Library/document panels exist only on the main view's main page; a tab page owns an independent document content node, whose view state is always 'document'.
  // Do not judge by the main view's documentView show/hide: when a tab page in another view is active while the main view shows the library list,
  // its snapshot would be wrongly recorded as 'library', causing it to show the library list instead of document content after being dragged into the main view
  const isLibrary = !(activeTab && activeTab.contentEl) && docView.classList.contains('hidden');
  const contentEl = getActiveContentEl();
  // Inner scroll container (the content node's outer wrapper may not be scrollable):
  // - PDF actually scrolls inside .pdf-pages; markdown inside the iframe's internal document; text in contentEl itself
  let pdfScrollTop = 0;
  let mdScrollTop = 0;
  if (contentEl) {
    const pp = contentEl.querySelector('.pdf-pages');
    if (pp) pdfScrollTop = pp.scrollTop;
    const f = contentEl.querySelector('iframe.md-preview-frame');
    if (f && f.contentDocument) {
      const se = f.contentDocument.scrollingElement || f.contentDocument.documentElement;
      if (se) mdScrollTop = se.scrollTop;
    }
  }
  return {
    viewState: isLibrary ? 'library' : 'document',
    doc: currentDocument ? { name: currentDocument.name, path: currentDocument.path, type: currentDocument.type } : null,
    serverPath: currentServerPath || '',
    folderParent: folderViewParentDir || null,
    folderLastData: folderViewLastData || null,
    title: document.getElementById('documentTitle').textContent,
    typeText: document.getElementById('documentType').textContent,
    typeClass: document.getElementById('documentType').className,
    pathText: document.getElementById('documentPath').textContent,
    pathTitle: document.getElementById('documentPath').title,
    contentHtml: contentEl ? contentEl.innerHTML : '',
    scrollTop: contentEl ? contentEl.scrollTop : 0,
    pdfScrollTop,
    mdScrollTop,
    modeTabsHtml: document.getElementById('renderModeTabs').innerHTML,
    modeTabsVisible: !document.getElementById('renderModeTabs').classList.contains('hidden'),
    tocVisible: !document.getElementById('tocToggleBtn').classList.contains('hidden'),
    renderData: currentRenderData || null,
  };
}

// View content host (document-body): main view is documentView's body; child view is the body inside its pane
function getViewBodyEl(viewId) {
  if (viewId === 'view-main') {
    const dv = document.getElementById('documentView');
    return dv ? dv.querySelector('.document-body') : null;
  }
  const v = views.find(x => x.id === viewId);
  return v ? v.el.querySelector('.document-body') : null;
}

// Mount a tab page's content node to its view host: only switch the content display of the view the active tab page belongs to,
// other views keep showing their own active tab page, without affecting each other (multiple views can show their content simultaneously)
function mountTabContent(tab) {
  if (!tab) return;
  const body = getViewBodyEl(tab.viewId);
  // Hide all content nodes within this view (tab-page independent nodes and the shared documentContent)
  if (body) {
    body.querySelectorAll(':scope > .document-content').forEach(el => { el.style.display = 'none'; });
  }
  if (!tab.contentEl) {
    // Main page shared node: show it if it belongs to this view's host
    const host = document.getElementById('documentContent');
    if (host && body && body.contains(host)) host.style.display = '';
    return;
  }
  // Tab-page independent node: mount to its view host and show
  if (body && !body.contains(tab.contentEl)) body.appendChild(tab.contentEl);
  tab.contentEl.style.display = '';
}

// Apply the main view's panel (library list / document area) display state:
// determined by "the main view's own active tab", not the global active tab --
// so when a tab page in another view is active, the main view (with main page/library list) content is not hidden
function applyMainPanels() {
  const libraryView = document.getElementById('libraryView');
  const docView = document.getElementById('documentView');
  if (!libraryView || !docView) return;
  const mainTabId = viewActive['view-main'] || 'main';
  const mainTab = tabPages.find(t => t.id === mainTabId);
  const hasDoc = !!(mainTab && mainTab.snapshot && mainTab.snapshot.viewState === 'document');
  libraryView.classList.toggle('hidden', hasDoc);
  docView.classList.toggle('hidden', !hasDoc);
}

// Restore snapshot to the preview area
function restoreSnapshot(snap, tab) {
  if (!snap) return;
  if (tab) viewActive[tab.viewId] = tab.id;
  applyMainPanels();
  currentDocument = snap.doc;
  currentServerPath = snap.serverPath || '';
  folderViewParentDir = snap.folderParent || null;
  folderViewLastData = snap.folderLastData || null;
  currentRenderData = snap.renderData;
  document.getElementById('documentTitle').textContent = snap.title || '';
  document.getElementById('documentType').textContent = snap.typeText || '';
  document.getElementById('documentType').className = snap.typeClass || 'type-badge';
  document.getElementById('documentPath').textContent = snap.pathText || '';
  document.getElementById('documentPath').title = snap.pathTitle || '';
  const hasOwnNode = !!(tab && tab.contentEl);
  const target = hasOwnNode ? tab.contentEl : getActiveContentEl();
  // A tab page's independent node content is resident, no need to rewrite; the main page's shared node is restored from the snapshot
  if (!hasOwnNode) target.innerHTML = snap.contentHtml || '';
  // Restore scroll position (a resident tab node already keeps its scroll; this is a fallback sync)
  target.scrollTop = snap.scrollTop || 0;
  mountTabContent(tab || tabPages.find(t => t.id === activeTabId));
  // When switching/showing a tab page, ensure its markdown preview iframe's theme matches the page theme
  // (tab content is resident; if the theme was switched after it was rendered, sync it back here)
  syncFrameTheme(getMdFrame());
  const modeTabs = document.getElementById('renderModeTabs');
  modeTabs.innerHTML = snap.modeTabsHtml || '';
  modeTabs.classList.toggle('hidden', !snap.modeTabsVisible);
  document.getElementById('tocToggleBtn').classList.toggle('hidden', !snap.tocVisible);
  updateEditorBtnState();
  updateFolderParentLink();
  // PDF preview is dynamically rendered by pdf.js. Two cases requiring viewer rebuild:
  // 1) Main page shared node: innerHTML is rewritten on restore, so canvas bitmap and scroll are both lost;
  // 2) Tab page independent node: its pdf-pages has no pages or the canvas bitmap is empty (e.g. copied from the main page on lock).
  // Resident tab pages that already have rendered pages (canvas has width) skip the rebuild, only falling back to restore inner scroll.
  const pdfViewerEl = document.querySelector('.pdf-viewer');
  const pdfPagesEl = document.getElementById('pdf-pages');
  if (pdfViewerEl && snap.doc && snap.doc.type === 'pdf' && snap.renderData && pdfPagesEl) {
    const firstCanvas = pdfPagesEl.querySelector('canvas');
    const blank = pdfPagesEl.children.length === 0 || (firstCanvas && (!firstCanvas.width || !firstCanvas.height));
    if (!hasOwnNode || blank) {
      renderPdfViewer(snap.renderData, snap.doc, snap.pdfScrollTop || 0);
    }
  }
  // Inner scroll container fallback restore: showing/re-mounting may zero the inner scroll under a display:none outer layer,
  // or content nodes need to wait for the replacer/render to be ready before repositioning after being rewritten.
  if (snap.pdfScrollTop || snap.mdScrollTop) {
    requestAnimationFrame(() => {
      if (snap.pdfScrollTop) {
        const pp = target.querySelector('.pdf-pages');
        if (pp && pp.scrollHeight > pp.clientHeight) pp.scrollTop = snap.pdfScrollTop;
      }
      if (snap.mdScrollTop) {
        const f = target.querySelector('iframe.md-preview-frame');
        if (f) {
          const applyMd = () => {
            if (f.contentDocument) {
              const se = f.contentDocument.scrollingElement || f.contentDocument.documentElement;
              if (se) se.scrollTop = snap.mdScrollTop;
            }
          };
          if (f.contentDocument && f.contentDocument.readyState === 'complete') applyMd();
          else f.addEventListener('load', applyMd, { once: true });
        }
      }
    });
  }
}

// Save the snapshot of the currently active tab page
function saveActiveTab() {
  const tab = tabPages.find(t => t.id === activeTabId);
  if (tab) tab.snapshot = makeSnapshot();
}

// Switch to the specified tab page
function switchToTab(id) {
  if (id === activeTabId) return;
  saveActiveTab();
  activeTabId = id;
  const tab = tabPages.find(t => t.id === id);
  if (tab) {
    activeViewId = tab.viewId;
    restoreSnapshot(tab.snapshot, tab);
  }
  renderTabView();
}

// Lock the current preview content as a tab page
function lockCurrentAsTab() {
  const docView = document.getElementById('documentView');
  if (docView.classList.contains('hidden') || !currentDocument) {
    alert(t('请先打开一个文档，再锁定为分页'));
    return;
  }
  // First capture the current document view snapshot; the new tab page is bound to this content (cached in memory, switching no longer reads from server)
  const snapshot = makeSnapshot();
  const wasMain = activeTabId === 'main';
  saveActiveTab();
  tabSeq++;
  const newTabId = 'tab-' + tabSeq;
  // Create an independent content node for the tab page: copy current content so subsequent scroll/render don't interfere
  const contentEl = document.createElement('div');
  contentEl.className = 'document-content';
  contentEl.style.display = 'none';
  contentEl.innerHTML = snapshot.contentHtml;
  contentEl.scrollTop = snapshot.scrollTop;
  const newTab = { id: newTabId, name: t('分页{0}', tabSeq), isMain: false, viewId: activeViewId, contentEl, snapshot };
  tabPages.push(newTab);
  views.forEach(v => { if (v.id === activeViewId) v.tabIds.push(newTabId); });
  if (wasMain) {
    // After locking the main page: unbind the main page content and switch back to the library list (sync snapshot),
    // then switch to the newly created tab page, showing the document content bound to it
    showHomeLibrary();
    activeTabId = newTabId;
    activeViewId = newTab.viewId;
    restoreSnapshot(newTab.snapshot, newTab);
  }
  renderTabView();
}

// Main page switches back to the library file list view, and syncs the main page snapshot (library view)
function showHomeLibrary() {
  document.getElementById('libraryView').classList.remove('hidden');
  document.getElementById('documentView').classList.add('hidden');
  currentDocument = null;
  currentServerPath = '';
  folderViewParentDir = null;
  folderViewLastData = null;
  currentRenderData = null;
  getActiveContentEl().innerHTML = '';
  document.getElementById('documentTitle').textContent = '';
  document.getElementById('documentType').textContent = '';
  document.getElementById('documentPath').textContent = '';
  document.getElementById('documentPath').title = '';
  updateEditorBtnState();
  updateFolderParentLink();
  const mainTab = tabPages.find(t => t.id === 'main');
  if (mainTab) mainTab.snapshot = makeSnapshot();
  updateNavBars(); // main page shows library list: display library control area, hide document nav area
}

// Close a tab page (the main page cannot be closed)
function closeTab(id) {
  if (id === 'main') return;
  const idx = tabPages.findIndex(t => t.id === id);
  if (idx < 0) return;
  const wasActive = activeTabId === id;
  const closed = tabPages[idx];
  const closedViewId = closed.viewId;
  const wasViewActive = viewActive[closedViewId] === id;
  tabPages.splice(idx, 1);
  // Remove from the owning view; when a view has no tab pages it auto-hides (is removed)
  const v = views.find(x => x.id === closedViewId);
  if (v) {
    const ti = v.tabIds.indexOf(id);
    if (ti >= 0) v.tabIds.splice(ti, 1);
    if (!v.isMain && v.tabIds.length === 0) removeView(v.id);
  }
  // When only the main page remains after closing, reset the tab sequence so the next lock renumbers from "Tab 1"
  if (tabPages.length <= 1) tabSeq = 0;
  // When the closed page is a view's active tab (globally active or that view's own active):
  // if the view still has tab pages, activate its first remaining tab page; if the view has no tab pages, return to the main page
  if (wasActive || wasViewActive) {
    const view = views.find(x => x.id === closedViewId);
    const nextId = view && view.tabIds.length > 0 ? view.tabIds[0] : null;
    if (nextId) {
      const next = tabPages.find(t => t.id === nextId);
      viewActive[closedViewId] = nextId;
      if (wasActive) {
        activeTabId = nextId;
        activeViewId = closedViewId;
        restoreSnapshot(next ? next.snapshot : null, next);
      } else {
        mountTabContent(next);
      }
    } else {
      if (wasActive) {
        activeTabId = 'main';
        activeViewId = 'view-main';
        const mainTab = tabPages.find(t => t.id === 'main');
        if (mainTab && mainTab.snapshot) restoreSnapshot(mainTab.snapshot, mainTab);
      }
      delete viewActive[closedViewId];
    }
  }
  renderTabView();
}

// ===== View management: main view fixed, child views host dragged-in tab pages, empty views auto-hide =====
// Create a child view (dock: 'right' side-by-side / 'bottom' stacked), return the view id
function createView(dock) {
  const id = 'view-' + (++viewSeq);
  const pane = document.createElement('div');
  pane.className = 'view-pane';
  pane.dataset.viewId = id;
  pane.innerHTML = `
    <div class="tab-view hidden">
      <div class="tab-list"></div>
    </div>
    <div class="document-view">
      <div class="document-body">
        <div class="document-content" style="display:none;"></div>
      </div>
      <div class="view-drop-zone"></div>
    </div>
  `;
  if (dock === 'bottom') {
    let row = document.getElementById('viewsRowBottom');
    if (!row) {
      row = document.createElement('div');
      row.id = 'viewsRowBottom';
      row.className = 'views-row vertical';
      document.getElementById('viewsWrap').appendChild(row);
    }
    row.appendChild(pane);
  } else {
    document.getElementById('viewsRowMain').appendChild(pane);
  }
  views.push({ id, isMain: false, el: pane, tabIds: [], dock: dock || 'right' });
  return id;
}

// Ensure at most one child view (at most two views: main view + one child view).
// If the target direction already has a same-direction child view, reuse it; if different, migrate all tab pages of the old child view into the new child view then remove the old view
function ensureSingleSubView(dock) {
  const existing = views.find(v => !v.isMain);
  if (existing && existing.dock === dock) return existing.id;
  const newId = createView(dock);
  if (existing) mergeTabsToView(existing.id, newId);
  return newId;
}

// Migrate all tab pages of fromView into toView (change viewId, move content nodes, merge tabIds order), then remove fromView
function mergeTabsToView(fromViewId, toViewId) {
  const fromView = views.find(v => v.id === fromViewId);
  const toView = views.find(v => v.id === toViewId);
  if (!fromView || !toView) return;
  const fromBody = getViewBodyEl(fromViewId);
  const toBody = getViewBodyEl(toViewId);
  const moved = tabPages.filter(t => t.viewId === fromViewId);
  moved.forEach(t => {
    t.viewId = toViewId;
    if (t.contentEl) {
      if (fromBody && fromBody.contains(t.contentEl)) fromBody.removeChild(t.contentEl);
      if (toBody && !toBody.contains(t.contentEl)) toBody.appendChild(t.contentEl);
      t.contentEl.style.display = 'none';
    }
  });
  toView.tabIds = toView.tabIds.concat(fromView.tabIds);
  if (viewActive[fromViewId] != null) viewActive[toViewId] = viewActive[fromViewId];
  delete viewActive[fromViewId];
  removeView(fromViewId);
}

// Remove a child view (only non-main views; called automatically for empty views)
function removeView(viewId) {
  const vi = views.findIndex(x => x.id === viewId);
  if (vi < 0 || views[vi].isMain) return;
  views[vi].el.remove();
  views.splice(vi, 1);
  // If the bottom row has no more views, remove the whole row
  const row = document.getElementById('viewsRowBottom');
  if (row && row.children.length === 0) row.remove();
  // If the removed view is the current active view, switch back to the main view's main page
  if (activeViewId === viewId) {
    activeViewId = 'view-main';
    activeTabId = 'main';
    const mainTab = tabPages.find(t => t.id === 'main');
    if (mainTab && mainTab.snapshot) restoreSnapshot(mainTab.snapshot, mainTab);
  }
  // After a view is removed, clear the residual splitter drag sizes (inline flex fixed values set during drag),
  // letting remaining views naturally spring back to flex:1 filling the whole area, avoiding whitespace left by the removed view
  resetViewSizes();
  renderTabView();
}

// Clear inline flex fixed values on views/view rows (set as 0 0 Xpx during splitter drag),
// so remaining views restore natural layout (flex:1 equal width/height filling), called after a view is removed.
function resetViewSizes() {
  document.querySelectorAll('.view-pane, .views-row').forEach(el => {
    if (el.style.flex) el.style.flex = '';
  });
}

// ===== View splitters: vertical lines between same-row views, horizontal line between main row and bottom row, draggable to resize =====
function syncViewSplitters() {
  const wrap = document.getElementById('viewsWrap');
  if (!wrap) return;
  // Clean up old splitters
  wrap.querySelectorAll('.view-splitter, .view-splitter-h').forEach(s => s.remove());
  // Main row: insert a vertical line between views (from the second view, insert before it)
  const mainRow = document.getElementById('viewsRowMain');
  if (mainRow) {
    const panes = mainRow.querySelectorAll(':scope > .view-pane');
    for (let i = 1; i < panes.length; i++) {
      const sp = document.createElement('div');
      sp.className = 'view-splitter';
      mainRow.insertBefore(sp, panes[i]);
    }
  }
  // Bottom row: insert vertical lines between in-row views; insert a horizontal line between main row and bottom row
  const bottomRow = document.getElementById('viewsRowBottom');
  if (bottomRow) {
    const panes = bottomRow.querySelectorAll(':scope > .view-pane');
    for (let i = 1; i < panes.length; i++) {
      const sp = document.createElement('div');
      sp.className = 'view-splitter';
      bottomRow.insertBefore(sp, panes[i]);
    }
    const hs = document.createElement('div');
    hs.className = 'view-splitter-h';
    wrap.insertBefore(hs, bottomRow);
  }
  // Bind drag-to-resize (use PointerEvent: compatible with mouse/touch/stylus,
  // and via setPointerCapture ensure the event chain isn't intercepted by iframes when dragging over them)
  wrap.querySelectorAll('.view-splitter, .view-splitter-h').forEach(s => {
    s.addEventListener('pointerdown', startSplitterDrag);
  });
}

// Drag the splitter to resize adjacent views (prev fixed size, next flex-fills the remaining space)
let splitterDrag = null;

function startSplitterDrag(e) {
  const s = e.currentTarget;
  if (e.button !== 0) return;
  e.preventDefault();
  const isH = s.classList.contains('view-splitter-h');
  const prev = s.previousElementSibling;
  const next = s.nextElementSibling;
  if (!prev || !next) return;
  // Capture the pointer: subsequent pointermove/pointerup keep dispatching to this splitter and bubble to document,
  // so the event chain is not lost even when the pointer moves over an iframe
  try { s.setPointerCapture(e.pointerId); } catch (err) {}
  const startPos = isH ? e.clientY : e.clientX;
  const prevSize = isH ? prev.getBoundingClientRect().height : prev.getBoundingClientRect().width;
  splitterDrag = { isH, prev, next, startPos, prevSize };
  document.body.classList.add('resizing');
  document.addEventListener('pointermove', moveSplitter);
  document.addEventListener('pointerup', endSplitterDrag);
  document.addEventListener('pointercancel', endSplitterDrag);
}

function moveSplitter(e) {
  if (!splitterDrag) return;
  const { isH, prev, startPos, prevSize } = splitterDrag;
  const delta = (isH ? e.clientY : e.clientX) - startPos;
  const min = 60;
  const newPrev = Math.max(min, prevSize + delta);
  prev.style.flex = '0 0 ' + newPrev + 'px';
}

function endSplitterDrag() {
  splitterDrag = null;
  document.body.classList.remove('resizing');
  document.removeEventListener('pointermove', moveSplitter);
  document.removeEventListener('pointerup', endSplitterDrag);
  document.removeEventListener('pointercancel', endSplitterDrag);
}

// Render the tab bar for all views: each view renders its own tab pages in v.tabIds order (order after drag-sort equals tabIds)
function renderTabView() {
  views.forEach(v => {
    const tabBar = v.el.querySelector('.tab-view');
    const list = v.el.querySelector('.tab-list');
    if (!tabBar || !list) return;
    // In multi-view mode (main view + one child view), show a 1px outline on the "active view" frame;
    // when only the main view exists, no view is highlighted
    const multi = views.length > 1;
    v.el.classList.toggle('view-active', multi && v.id === activeViewId);
    // Take tab pages in v.tabIds order (tabIds is the authoritative record of the view's tab pages; tabs render strictly in this array order,
    // avoiding extra/overlapping tab labels caused by stale viewId references)
    const tabIdList = Array.isArray(v.tabIds) ? v.tabIds : [];
    const tabs = tabIdList.map(id => tabPages.find(t => t.id === id)).filter(Boolean);
    // Main view: show the main page tab bar whenever any view has tab pages beyond the main page, for easy return to main page;
    // Child view: show if it has at least 1 tab page
    // (tabPages always contains main page; tabPages.length > 1 means "besides main page, other tab pages are distributed across views")
    const anyOtherTab = tabPages.length > 1;
    const hasPages = v.isMain ? anyOtherTab : tabs.length > 0;
    tabBar.classList.toggle('hidden', !hasPages);
    if (!hasPages) { list.innerHTML = ''; return; }
    list.innerHTML = tabs.map(tab => {
      // Highlight each view's own active tab page (viewActive records the view's active tab page),
      // so multiple views can each highlight their own active tab page simultaneously
      const active = (viewActive[v.id] || activeTabId) === tab.id ? ' active' : '';
      // The main page is the active workspace; title takes the current document in real time; a tab page takes the document from its cached snapshot
      const doc = tab.isMain
        ? currentDocument
        : (tab.snapshot && tab.snapshot.doc ? tab.snapshot.doc : null);
      const closeBtn = tab.isMain
        ? ''
        : `<span class="tab-close" title="关闭分页" onclick="event.stopPropagation(); closeTab('${tab.id}')">✕</span>`;
      const title = doc ? `${doc.name} — ${doc.path}` : tab.name;
      return `<div class="tab-item${active}" data-tab="${tab.id}" draggable="${tab.isMain ? 'false' : 'true'}" title="${escapeHtml(title)}" onclick="switchToTab('${tab.id}')"><span class="tab-name">${tab.name}</span>${closeBtn}</div>`;
    }).join('');
    // Bind tab page dragging: reorder + cross-view drag to create split views
    list.querySelectorAll('.tab-item[draggable="true"]').forEach(el => {
      el.addEventListener('dragstart', handleTabDragStart);
      el.addEventListener('dragend', handleTabDragEnd);
    });
    if (!v._dragBound) {
      v._dragBound = true;
      // The tab bar and the whole view panel can both be drop targets (drag to the content area's right/bottom edge to create a split view)
      list.addEventListener('dragover', handleTabDragOver);
      list.addEventListener('drop', handleTabDrop);
      tabBar.addEventListener('dragover', handleTabDragOver);
      tabBar.addEventListener('drop', handleTabDrop);
      v.el.addEventListener('dragover', handleTabDragOver);
      v.el.addEventListener('drop', handleTabDrop);
    }
  });
  // Sync view splitters: vertical lines between in-row views, horizontal line between main row and bottom row
  syncViewSplitters();
  // Switch the global navigation area: show library control area when active page is library list, show document navigation area when active page is a document
  updateNavBars();
}

// Current showing of library control area (otherwise document navigation area): determined by the active tab page
// Active tab page in the main view -> by its content area state: library list shows libNavBar, document/folder shows docNavBar;
// Active tab page in another view (multi-view mode) -> show docNavBar, ensuring that tab page's document header (TOC/lock etc. buttons) is usable
function isLibNavActive() {
  const activeTab = tabPages.find(t => t.id === activeTabId);
  const inMain = !!(activeTab && (activeTab.isMain || activeTab.viewId === 'view-main'));
  if (!inMain) return false;
  const docView = document.getElementById('documentView');
  return !docView || docView.classList.contains('hidden');
}

// Switch the top global navigation area based on the active tab page (note: the main view's content panel is controlled by applyMainPanels,
// determined by its own active tab page; the navigation area follows the global active tab page)
function updateNavBars() {
  const libNav = document.getElementById('libNavBar');
  const docNav = document.getElementById('docNavBar');
  if (!libNav || !docNav) return;
  libNav.classList.toggle('hidden', !isLibNavActive());
  docNav.classList.toggle('hidden', isLibNavActive());
}

// ===== Top navigation area auto-hide: right-click the nav area menu item "auto-hide" to toggle on/off =====
let navAutoHide = false;          // auto-hide mode switch (off means the nav area is fixed)
const NAV_AUTO_REVEAL = 20;       // top trigger reveal strip height (px)

// Apply auto-hide mode: toggle the main area style class (collapse nav area / restore fixed display)
function applyNavAutoHide() {
  const mainArea = document.querySelector('.main-area');
  mainArea.classList.toggle('nav-autohide', navAutoHide);
  if (!navAutoHide) mainArea.classList.remove('nav-revealed');
}

function showNavContextMenu(x, y) {
  const menu = document.getElementById('navContextMenu');
  document.getElementById('navAutoHideItem').classList.toggle('checked', navAutoHide);
  menu.classList.remove('hidden');
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
}

function hideNavContextMenu() {
  document.getElementById('navContextMenu').classList.add('hidden');
}

document.getElementById('navAutoHideItem').addEventListener('click', () => {
  navAutoHide = !navAutoHide;
  applyNavAutoHide();
  if (navAutoHide) document.querySelector('.main-area').classList.add('nav-revealed');
  hideNavContextMenu();
});

document.addEventListener('contextmenu', (e) => {
  const navEl = e.target.closest('.library-header, .document-header');
  if (!navEl) { hideNavContextMenu(); return; }
  e.preventDefault();
  showNavContextMenu(e.clientX, e.clientY);
});

document.addEventListener('click', hideNavContextMenu);
window.addEventListener('blur', hideNavContextMenu);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideNavContextMenu();
});

// In auto-hide mode: show the corresponding nav area when the mouse is within the top 20px of the main area or over the revealed nav area
document.addEventListener('mousemove', (e) => {
  if (!navAutoHide) return;
  const mainArea = document.querySelector('.main-area');
  const r = mainArea.getBoundingClientRect();
  const y = e.clientY;
  let revealed = false;
  if (y >= r.top && y <= r.bottom) {
    revealed = y - r.top <= NAV_AUTO_REVEAL;
    if (!revealed) {
      const active = document.getElementById(isLibNavActive() ? 'libNavBar' : 'docNavBar');
      if (active && !active.classList.contains('hidden')) {
        const ar = active.getBoundingClientRect();
        revealed = y >= ar.top && y <= ar.bottom;
      }
    }
  }
  mainArea.classList.toggle('nav-revealed', revealed);
});

// ===== Folder view event delegation =====
// Shared by main page/tab pages (including content copies generated by locking): double-click a directory to open its sub-directory list in the current view,
// double-click a file to switch back to the main page and open it there; row selection, column sort, and toolbar buttons are handled uniformly.
// (Directly bound listeners are lost after a tab page is cloned via innerHTML, so all are changed to event delegation)
function folderViewRoot(el) {
  if (!el || !el.closest) return null;
  const root = el.closest('.folder-view');
  return (root && root.closest('.document-content')) ? root : null;
}

// The tab page corresponding to the document content node where the folder view resides (the main page shared node #documentContent corresponds to main page, returns null)
function folderViewContentTab(root) {
  const contentEl = root ? root.closest('.document-content') : null;
  return tabPages.find(t => t.contentEl === contentEl) || null;
}

// Before "in-place navigation" inside a folder view (enter sub-directory / go up one level / column sort), first activate the tab page the view belongs to,
// so renderFolderList/toggleFolderSort render into that tab page's own content via getActiveContentEl(),
// avoiding wrongly writing into (the global active) main view's content area
function activateFolderViewTab(root) {
  const tab = folderViewContentTab(root);
  if (tab) switchToTab(tab.id);
}

document.addEventListener('dblclick', (e) => {
  const root = folderViewRoot(e.target);
  if (!root) return;
  const row = e.target.closest('.browse-row');
  if (!row || !root.contains(row) || !row.dataset.path) return;
  const name = ((row.querySelector('.col-name') || {}).textContent || '').trim();
  e.preventDefault();
  if (row.dataset.isDir === '1') {
    // Directory: show that directory's file list in the current view (main page or current tab page)
    activateFolderViewTab(root);
    renderFolderList({ name, path: row.dataset.path, type: 'folder' });
  } else {
    // File: switch back to main page and open it there
    const baseName = name.replace(/\.[^/.]+$/, '') || name;
    openDocument(
      { name: baseName, path: row.dataset.path, type: inferDocType(row.dataset.path) },
      { folderParent: root.dataset.currentDir || null }
    );
  }
});

document.addEventListener('click', (e) => {
  const root = folderViewRoot(e.target);
  if (!root) return;
  // row selection
  const row = e.target.closest('.browse-row');
  if (row && root.contains(row)) {
    root.querySelectorAll('.browse-row.selected').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
    return;
  }
  // Column name sort (three-state: descending -> ascending -> cancel to default)
  const sortable = e.target.closest('.browse-list-header .sortable');
  if (sortable && root.contains(sortable)) {
    activateFolderViewTab(root);
    toggleFolderSort(sortable.dataset.sortKey);
    return;
  }
  // toolbar buttons
  const btn = e.target.closest('button');
  if (!btn || btn.disabled || !root.contains(btn)) return;
  if (btn.id === 'folderUpBtn') {
    const parentDir = root.dataset.parentDir;
    if (!parentDir) return;
    activateFolderViewTab(root);
    const base = parentDir.split(/[\\/]/).filter(Boolean).pop();
    renderFolderList({ name: base || parentDir, path: parentDir, type: 'folder' });
  } else if (btn.id === 'folderAddDocBtn') {
    const item = getSelectedFolderItem(root);
    if (!item) { alert(t('请先选择文件或目录')); return; }
    openAddDocFromContext(item);
  } else if (btn.id === 'folderTempFavBtn') {
    const item = getSelectedFolderItem(root);
    if (!item) { alert(t('请先选择文件或目录')); return; }
    addToTempFavorites(item);
  } else if (btn.id === 'folderOpenExternalBtn') {
    openExternalLink(root.dataset.currentDir);
  } else if (btn.id === 'folderCopyPathBtn') {
    copyToClipboard(root.dataset.currentDir, btn).then(() => {
      const copyIcon = btn.innerHTML;
      btn.title = '已复制';
      btn.innerHTML = '✅';
      setTimeout(() => {
        btn.title = '复制当前文件夹路径';
        btn.innerHTML = copyIcon;
      }, 1500);
    }).catch(() => console.error('复制路径失败'));
  }
});

// Multi-view: clicking anywhere in a view (tab bar, document content area, blank area, etc.) makes that view the active view:
// the global active tab page switches to that view's own active tab page, and the top nav area/toolbar then point to that tab page.
// (Clicks inside a markdown preview iframe don't bubble to the parent document, so iframe-internal clicks can't trigger activation)
document.addEventListener('click', (e) => {
  const pane = e.target.closest('.view-pane');
  if (!pane) return;
  const tabId = viewActive[pane.dataset.viewId];
  if (!tabId || tabId === activeTabId) return;
  switchToTab(tabId);
});

// ===== Tab page drag: reorder within a view + drag to right/bottom to create a split view =====
let dragTabId = null;
let dragHover = { viewId: null, insertIndex: null, split: null }; // drag hover state

// During tab page dragging, open/close a transparent hit layer over each view's document render area (including iframes):
// dragover/drop inside an iframe don't bubble to the parent document, causing the dragged-over tab content area to be undetectable
// and showing a forbidden icon; the hit layer lives in the parent document DOM and covers the content area, ensuring the whole view area is detectable
function setDraggingDrop(on) {
  document.querySelectorAll('.view-pane').forEach(p => p.classList.toggle('dragging-drop', !!on));
}

function handleTabDragStart(e) {
  const el = e.target.closest('.tab-item');
  if (!el || !el.dataset.tab) return;
  dragTabId = el.dataset.tab;
  dragHover = { viewId: null, insertIndex: null, split: null };
  el.classList.add('dragging');
  setDraggingDrop(true);
  e.dataTransfer.setData('text/plain', dragTabId);
  e.dataTransfer.effectAllowed = 'move';
}

function handleTabDragEnd() {
  dragTabId = null;
  dragHover = { viewId: null, insertIndex: null, split: null };
  setDraggingDrop(false);
  document.querySelectorAll('.tab-item.dragging').forEach(el => el.classList.remove('dragging'));
  clearDragIndicators();
}

// While dragging over the tab bar/content area: record the hover position and update visual indicators (insertion line / split dashed box)
function handleTabDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const pane = e.target.closest('.view-pane');
  if (!pane) return;
  const viewId = pane.dataset.viewId;
  dragHover.viewId = viewId;
  const list = e.target.closest('.tab-list');
  if (list) {
    // Inside the tab bar: compute the insertion index by mouse x relative to each tab's center (0..length)
    const tabs = Array.from(list.querySelectorAll('.tab-item'));
    const x = e.clientX;
    let idx = tabs.length;
    for (let i = 0; i < tabs.length; i++) {
      const r = tabs[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) { idx = i; break; }
    }
    dragHover.insertIndex = idx;
    dragHover.split = null;
  } else {
    // Hovering over the content area: show a split dashed box in the main view's right/bottom half
    dragHover.insertIndex = null;
    if (viewId === 'view-main') {
      const rect = pane.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      if (relX > rect.width * 0.6) dragHover.split = 'right';
      else if (relY > rect.height * 0.6) dragHover.split = 'bottom';
      else dragHover.split = null;
    } else {
      dragHover.split = null;
    }
  }
  updateDragIndicators();
}

// Update drag visual indicators: tab insertion line + right/bottom split dashed box + target view outline
function updateDragIndicators() {
  const wrap = document.getElementById('viewsWrap');
  const line = ensureDragIndicator('tabDropLine');
  const overlay = ensureDragIndicator('splitDropOverlay');
  const outline = ensureDragIndicator('viewDropOutline');
  const wrapRect = wrap.getBoundingClientRect();
  // Target view outline: show the view's dashed outline when hovering over a view area (hinting the tab page will move into this view)
  if (dragHover.viewId && dragHover.insertIndex === null && !dragHover.split) {
    const pane = document.querySelector(`.view-pane[data-view-id="${dragHover.viewId}"]`);
    if (pane) {
      const r = pane.getBoundingClientRect();
      outline.style.display = 'block';
      outline.style.left = (r.left - wrapRect.left) + 'px';
      outline.style.top = (r.top - wrapRect.top) + 'px';
      outline.style.width = r.width + 'px';
      outline.style.height = r.height + 'px';
    } else {
      outline.style.display = 'none';
    }
  } else {
    outline.style.display = 'none';
  }
  // Tab insertion position indicator line: positioned by insertion index (left edge of the tab at the index, or right edge of the last tab at the end)
  if (dragHover.viewId && dragHover.insertIndex !== null) {
    const list = document.querySelector(`.view-pane[data-view-id="${dragHover.viewId}"] .tab-list`);
    const tabs = list ? Array.from(list.querySelectorAll('.tab-item')) : [];
    let x = null, top = null, h = null;
    if (tabs.length === 0) {
      const r = list ? list.getBoundingClientRect() : null;
      if (r) { x = r.left; top = r.top; h = r.height; }
    } else if (dragHover.insertIndex < tabs.length) {
      const r = tabs[dragHover.insertIndex].getBoundingClientRect();
      x = r.left; top = r.top; h = r.height;
    } else {
      const r = tabs[tabs.length - 1].getBoundingClientRect();
      x = r.right; top = r.top; h = r.height;
    }
    if (x !== null) {
      line.style.display = 'block';
      line.style.left = (x - wrapRect.left) + 'px';
      line.style.top = (top - wrapRect.top) + 'px';
      line.style.height = h + 'px';
    } else {
      line.style.display = 'none';
    }
  } else {
    line.style.display = 'none';
  }
  // Split area dashed box: main view right half / bottom half
  if (dragHover.split && dragHover.viewId === 'view-main') {
    const pane = document.querySelector('.view-main');
    const r = pane.getBoundingClientRect();
    if (dragHover.split === 'right') {
      overlay.style.display = 'block';
      overlay.style.left = (r.left - wrapRect.left + r.width * 0.5) + 'px';
      overlay.style.top = (r.top - wrapRect.top) + 'px';
      overlay.style.width = (r.width * 0.5) + 'px';
      overlay.style.height = r.height + 'px';
    } else {
      overlay.style.display = 'block';
      overlay.style.left = (r.left - wrapRect.left) + 'px';
      overlay.style.top = (r.top - wrapRect.top + r.height * 0.5) + 'px';
      overlay.style.width = r.width + 'px';
      overlay.style.height = (r.height * 0.5) + 'px';
    }
  } else {
    overlay.style.display = 'none';
  }
}

// Lazily create drag indicator elements (insertion line / split dashed box)
function ensureDragIndicator(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:absolute;display:none;z-index:1000;pointer-events:none;';
    if (id === 'tabDropLine') {
      el.style.width = '2px';
      el.style.background = 'var(--accent, #4f8cff)';
    } else {
      el.style.border = '2px dashed var(--accent, #4f8cff)';
      el.style.background = 'rgba(79,140,255,0.08)';
      el.style.boxSizing = 'border-box';
    }
    document.getElementById('viewsWrap').appendChild(el);
  }
  return el;
}

function clearDragIndicators() {
  ['tabDropLine', 'splitDropOverlay', 'viewDropOutline'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function handleTabDrop(e) {
  e.preventDefault();
  const srcId = e.dataTransfer.getData('text/plain') || dragTabId;
  clearDragIndicators();
  setDraggingDrop(false);
  if (!srcId || srcId === 'main') return;
  const srcTab = tabPages.find(t => t.id === srcId);
  if (!srcTab) return;
  // Record the active tab page before the drop, to decide whether to switch back to a suitable remaining tab page in the source view
  const wasActive = activeTabId === srcId;
  const targetPane = e.target.closest('.view-pane');
  if (!targetPane) return;
  const targetViewId = targetPane.dataset.viewId;

  // Remove from the source view first (record the source index for same-view sort correction);
  // must be removed before split merges the child view, to avoid the dragged tab being migrated in then inserted again
  const srcView = views.find(v => v.id === srcTab.viewId);
  let srcIdx = -1;
  if (srcView) {
    srcIdx = srcView.tabIds.indexOf(srcId);
    if (srcIdx >= 0) srcView.tabIds.splice(srcIdx, 1);
  }

  // Drop location: prefer the split recorded during drag hover (right/bottom split view), otherwise move into the target view.
  // Keep at most two views: on split, reuse/replace the only child view (if direction differs, all old child view tab pages migrate into the new child view)
  let destViewId = null;
  if (dragHover.split) destViewId = ensureSingleSubView(dragHover.split);
  else destViewId = targetViewId;
  if (!destViewId) return;

  srcTab.viewId = destViewId;
  const dstView = views.find(v => v.id === destViewId);
  if (dstView) {
    // Same-view sort: insert by the insertion index recorded during drag hover (srcId already removed from the source array,
    // if the source index is before the insertion point, the insertion point needs to shift back by 1)
    let idx = (dragHover.insertIndex !== null && dragHover.insertIndex !== undefined)
      ? dragHover.insertIndex
      : dstView.tabIds.length;
    if (srcView === dstView && srcIdx >= 0 && srcIdx < idx) idx--;
    idx = Math.max(0, Math.min(idx, dstView.tabIds.length));
    dstView.tabIds.splice(idx, 0, srcId);
  }
  // At most two views: if directly dropped onto another child view (without going through split), two child views may still coexist,
  // migrate all tab pages of the other child view into the target view and remove it, keeping only one child view
  if (dstView && !dstView.isMain) {
    const otherSub = views.find(v => !v.isMain && v.id !== destViewId);
    if (otherSub) mergeTabsToView(otherSub.id, destViewId);
  }
  // A non-main view with 0 tab pages auto-hides: use the view's tabIds authoritative record (consistent with tab rendering),
  // to avoid a stale residual tab page keeping an empty view alive based on a viewId scan
  views.forEach(v => {
    if (v.isMain) return;
    if (v.tabIds.length === 0) removeView(v.id);
  });
  // Cross-view: move the content node to the target view's host
  if (srcTab.contentEl) {
    const body = getViewBodyEl(destViewId);
    if (body && body.contains(srcTab.contentEl)) body.removeChild(srcTab.contentEl);
  }
  // Activation rules after a cross-view drop (requirement: first activate a remaining tab page in the source view, then activate the dragged tab page in the target view):
  // 1. If the dragged tab page was active and the source view still has other tab pages (main view always has main page),
  //    first activate a remaining tab page in the source view (mount its content to the source view host and highlight), avoiding a blank source view;
  // 2. Then activate the dragged tab page in the target view (global active page points to it);
  //    the two views each show/highlight their own active tab page, without affecting each other
  const srcRemaining = srcView ? tabPages.filter(t => t.viewId === srcView.id && t.id !== srcId) : [];
  if (srcView !== dstView && wasActive && srcRemaining.length > 0) {
    const nextTab = srcRemaining[0];
    viewActive[srcView.id] = nextTab.id;
    mountTabContent(nextTab);
  }
  activeTabId = srcId;
  activeViewId = destViewId;
  restoreSnapshot(srcTab.snapshot, srcTab);
  renderTabView();
}

// 用隐藏的 <a target="_blank"> 点击方式打开 Web 链接文档（不在服务端调用系统程序）:
// 浏览器会新开标签页；Electron 下主进程的 setWindowOpenHandler 会把它转到系统默认浏览器
function openWeblink(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Open a document and preview it
// opts.record === false means do not add to history (e.g. opened from history/back button)
async function openDocument(doc, opts) {
  // Files opened from the document list/folder are shown on the main page by default, not affecting each tab page's content; switch back to main page before rendering
  if (activeTabId !== 'main') switchToTab('main');
  const recordHistory = !(opts && opts.record === false);
  // Record the current document before opening, for history dedupe (reopening the same file won't be added again)
  const prevDoc = currentDocument;
  currentDocument = doc;
  updateEditorBtnState();

  // Record the parent directory source: files opened from the folder list record their parent directory; other entries (doc list/history/back) clear it on open
  folderViewParentDir = (opts && opts.folderParent) ? opts.folderParent : null;

  // Folder type: render the folder list in the content area (first-level directories and files)
  if (doc.type === 'folder') {
    renderFolderList(doc);
    return;
  }

  // Web 链接类型: 直接在前端用隐藏 <a target="_blank"> 点击打开，不经过服务端调用系统程序
  // (Electron 下由主进程 setWindowOpenHandler 转到系统默认浏览器; 纯浏览器模式下新开标签页)
  if (doc.type === 'weblink') {
    openWeblink(doc.path);
    return;
  }

  // Types that cannot be previewed in-app: open directly with the system default program (office docs / video / audio)
  const externalTypes = ['docx', 'xlsx', 'pptx', 'video', 'audio'];
  if (externalTypes.includes(doc.type)) {
    try {
      const response = await fetch(`${API_BASE}/open-external`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: doc.path })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(t(data && data.error) || t('打开文件失败 (HTTP {0})', response.status));
      }
    } catch (error) {
      console.error('打开文件失败:', error);
    }
    return;
  }
  
  document.getElementById('documentTitle').textContent = doc.name;
  document.getElementById('documentType').textContent = getTypeName(doc.type);
  document.getElementById('documentType').className = `type-badge type-${doc.type}`;
  
  // Show the path in small font below the filename (long paths omit the middle, keeping head and tail)
  const pathEl = document.getElementById('documentPath');
  if (pathEl) {
    pathEl.textContent = truncateMiddle(doc.path, 80);
    pathEl.title = doc.path;
  }
  
  document.getElementById('libraryView').classList.add('hidden');
  document.getElementById('documentView').classList.remove('hidden');
  
  const contentDiv = getActiveContentEl();
  contentDiv.innerHTML = '<div style="text-align:center; padding: 2rem;">加载中...</div>';
  
  try {
    const response = await fetch(`${API_BASE}/document/content?filePath=${encodeURIComponent(doc.path)}`);
    const data = await response.json();
    
    if (data.error) {
      contentDiv.innerHTML = `<div style="color:red; padding: 2rem;">${data.error}</div>`;
      folderViewParentDir = null;
      updateFolderParentLink();
      return;
    }
    
    // Files over 100MB: the preview area first shows a file-size hint; after clicking "continue", re-fetch content with force=1
    if (data.oversized) {
      renderOversizedGate(data, doc);
      updateFolderParentLink();
      if (recordHistory && isFindableType(doc.type)) addToMdHistory(doc, prevDoc);
      return;
    }
    
    // Record the current document's path relative to web root (with ../ prefix outside web root), for markdown relative link resolution
    currentServerPath = data.serverRelPath || '';
    renderDocumentContent(data, doc.type);
    // Files opened from the folder list: show the parent directory link at the top
    updateFolderParentLink();
    // The main page tab title reflects the current document name and path in real time
    renderTabView();
    // Only documents opened from the document list/folder are added to history (documents opened from history/back button are not added)
    if (recordHistory && isFindableType(doc.type)) addToMdHistory(doc, prevDoc);
  } catch (error) {
    contentDiv.innerHTML = '<div style="color:red; padding: 2rem;">' + t('加载文档失败: {0}', error.message) + '</div>';
    folderViewParentDir = null;
    updateFolderParentLink();
  }
}

// ===== Folder browsing (click a folder document -> render first-level directory and file list in the content area) =====
const folderSessionId = 'folder-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 8);
let folderParentDir = null;   // parent directory of the current folder list
let folderViewParentDir = null; // the folder directory the current preview file came from (recorded when opened from the folder list, used to show the parent directory link)

// Show the first-level directories and files of the folder in the content area
async function renderFolderList(doc) {
  currentDocument = doc;
  // When showing the folder list, do not show the "parent directory link" at the top (the toolbar already has an up button)
  folderViewParentDir = null;
  updateFolderParentLink();
  updateEditorBtnState();
  document.getElementById('documentTitle').textContent = doc.name;
  document.getElementById('documentType').textContent = '文件夹';
  document.getElementById('documentType').className = 'type-badge type-folder';
  const pathEl = document.getElementById('documentPath');
  if (pathEl) {
    pathEl.textContent = truncateMiddle(doc.path, 80);
    pathEl.title = doc.path;
  }
  document.getElementById('libraryView').classList.add('hidden');
  document.getElementById('documentView').classList.remove('hidden');
  // The active page has switched to the document/folder content area: sync the top nav area (show document functions, hide library control area)
  updateNavBars();

  const contentDiv = getActiveContentEl();
  contentDiv.innerHTML = '<div class="empty-state"><p>正在加载...</p></div>';
  try {
    const response = await fetch(`${API_BASE}/browse/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: folderSessionId, dir: doc.path })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '读取目录失败');
    renderFolderListData(data);
    // The main page tab title reflects the currently opened folder in real time
    renderTabView();
  } catch (e) {
    contentDiv.innerHTML = `<div class="empty-state"><p>${escapeHtml(e.message)}</p></div>`;
  }
}

// ===== Folder list column sort (three-state: first descending -> then ascending -> third cancel to default) =====
let folderSortKey = null;   // null | 'name' | 'type' | 'size' | 'mtime'
let folderSortDir = 'desc'; // 'desc' | 'asc'
let folderViewLastData = null; // most recent folder data (for in-place re-render after column sort, no re-request)

// Sort entries by current sort field/direction (directories first, files after, each sorted by field)
function sortFolderItems(items) {
  const dirs = items.filter(i => i.isDir);
  const files = items.filter(i => !i.isDir);
  const cmp = (a, b) => {
    if (folderSortKey === 'type') {
      const ta = a.isDir ? '' : typeName(a.name);
      const tb = b.isDir ? '' : typeName(b.name);
      return ta.localeCompare(tb, 'zh-CN');
    }
    if (folderSortKey === 'size') {
      return (a.size || 0) - (b.size || 0);
    }
    if (folderSortKey === 'mtime') {
      const ma = a.mtime ? new Date(a.mtime).getTime() : 0;
      const mb = b.mtime ? new Date(b.mtime).getTime() : 0;
      return ma - mb;
    }
    // default sort by name
    return a.name.localeCompare(b.name, 'zh-CN');
  };
  const sortList = (list) => {
    if (!folderSortKey) return list; // default order (server-side already sorted)
    const sorted = list.slice().sort(cmp);
    return folderSortDir === 'desc' ? sorted.reverse() : sorted;
  };
  return sortList(dirs).concat(sortList(files));
}

// Click a column name to cycle sort: descending -> ascending -> cancel (back to default)
function toggleFolderSort(key) {
  if (folderSortKey !== key) {
    folderSortKey = key;
    folderSortDir = 'desc';
  } else if (folderSortDir === 'desc') {
    folderSortDir = 'asc';
  } else {
    folderSortKey = null;
    folderSortDir = 'desc';
  }
  if (folderViewLastData) renderFolderListData(folderViewLastData);
}

// Update the folder list header's sort indicator (arrow/highlight), applied to the folder header inside the specified content root
function updateFolderSortHeader(rootEl) {
  const root = rootEl || getActiveContentEl();
  if (!root) return;
  const header = root.querySelector('.browse-list-header');
  if (!header) return;
  header.querySelectorAll('.sortable').forEach(el => {
    el.classList.remove('sorted-asc', 'sorted-desc');
    if (folderSortKey === el.dataset.sortKey) {
      el.classList.add(folderSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
  });
}

function renderFolderListData(data) {
  folderParentDir = data.parentDir;
  folderViewLastData = data; // cache for in-place re-render after column sort
  const items = data.items || [];
  // Apply column sort (directories always first, each sorted by field)
  const sortedItems = sortFolderItems(items);
  const contentDiv = getActiveContentEl();

  let html = '<div class="folder-view">';
  // Toolbar: up one level (first, with a small gap before subsequent buttons) + add document/temp favorite/external open/copy (icon-only, no text)
  html += '<div class="folder-toolbar">';
  html += `<button class="btn btn-secondary btn-sm" id="folderUpBtn" title="向上一级" style="margin-right:0.5rem;" ${data.parentDir ? '' : 'disabled'}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg></button>`;
  html += `<button class="btn btn-secondary btn-sm" id="folderAddDocBtn" title="将选中的文件或目录添加到书库"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>`;
  html += `<button class="btn btn-secondary btn-sm" id="folderTempFavBtn" title="将选中的文件或目录加入临时收藏书库（不弹窗）"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></button>`;
  html += `<button class="btn btn-secondary btn-sm" id="folderOpenExternalBtn" title="在系统文件管理器中打开当前文件夹"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></button>`;
  html += `<button class="btn btn-secondary btn-sm" id="folderCopyPathBtn" title="复制当前文件夹路径"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>`;
  html += `<span class="folder-path" title="${escapeHtml(data.currentDir)}">${escapeHtml(data.currentDir)}</span>`;
  html += '</div>';
  // List (reuses the browse dialog's list structure and styles)
  html += '<div class="browse-list">';
  html += '<div class="browse-list-header">' +
    '<span class="col-icon"></span>' +
    '<span class="col-name sortable" data-sort-key="name" title="点击排序">名称</span>' +
    '<span class="col-type sortable" data-sort-key="type" title="点击排序">类型</span>' +
    '<span class="col-size sortable" data-sort-key="size" title="点击排序">大小</span>' +
    '<span class="col-mtime sortable" data-sort-key="mtime" title="点击排序">修改时间</span>' +
    '</div>';
  html += '<div class="browse-list-body">';
  if (sortedItems.length === 0) {
    html += '<div class="empty-state"><p>此文件夹为空</p></div>';
  } else {
    sortedItems.forEach((item, index) => {
      html += `<div class="browse-row${item.isDir ? ' is-dir' : ''}" data-idx="${index}" data-path="${escapeHtml(item.path)}" data-is-dir="${item.isDir ? '1' : '0'}" title="${escapeHtml(item.path)}">` +
        `<span class="col-icon">${item.isDir ? '📁' : fileIcon(item.name)}</span>` +
        `<span class="col-name">${escapeHtml(item.name)}</span>` +
        `<span class="col-type">${item.isDir ? '文件夹' : typeName(item.name)}</span>` +
        `<span class="col-size">${item.isDir ? '' : formatSize(item.size)}</span>` +
        `<span class="col-mtime">${formatMtime(item.mtime)}</span>` +
        '</div>';
    });
  }
  // Bottom stats row: total list items / directory count / file count
  const totalCount = items.length;
  const dirCount = items.filter(i => i.isDir).length;
  const fileCount = items.filter(i => !i.isDir).length;
  html += '</div>'; // close browse-list-body
  html += '<div class="folder-list-footer">' + t('共 {0} 项 · 目录 {1} 个 · 文件 {2} 个', totalCount, dirCount, fileCount) + '</div>';
  html += '</div></div>'; // close browse-list and folder-view
  contentDiv.innerHTML = html;

  // A folder view's content may be copied into a tab page (a locked tab cloned via innerHTML, directly-bound listeners are lost),
  // so row double-click/selection, column sort, and toolbar buttons are uniformly handled by the delegated listener at the bottom of the page;
  // here we only record the current directory/parent directory on the view root node, for the delegation to restore navigation context.
  const viewRoot = contentDiv.querySelector('.folder-view');
  if (!viewRoot) return;
  viewRoot.dataset.currentDir = data.currentDir || '';
  viewRoot.dataset.parentDir = data.parentDir || '';
  updateFolderSortHeader(viewRoot);
}

// Get the currently selected file or directory in the folder list (returns null if none selected)
function getSelectedFolderItem(rootEl) {
  const root = rootEl || getActiveContentEl();
  const row = root && root.querySelector('.browse-row.selected');
  if (!row || !row.dataset.path) return null;
  return { path: row.dataset.path, isDir: row.dataset.isDir === '1' };
}

// Update the parent directory link at the top of the preview: files opened from the folder list show their parent directory link; click to return to the folder list
function updateFolderParentLink() {
  const linkEl = document.getElementById('documentFolderLink');
  if (!linkEl) return;
  const parentDir = folderViewParentDir;
  if (!parentDir) {
    linkEl.classList.add('hidden');
    linkEl.onclick = null;
    return;
  }
  const base = parentDir.split(/[\\/]/).filter(Boolean).pop();
  linkEl.textContent = '📁 ' + (base || parentDir);
  linkEl.title = t('返回文件夹列表: {0}', parentDir);
  linkEl.classList.remove('hidden');
  linkEl.onclick = () => {
    renderFolderList({ name: base || parentDir, path: parentDir, type: 'folder' });
  };
}

// ===== Folder list toolbar: add to library / temp favorite =====
let ctxTagLibId = null;      // the source library id for tags in the "add to library" dialog (linked with library name selection)

// Auto-analyze the document name and category from the path (category is folder when isDir=true)
function analyzePathForDoc(path, isDir) {
  const base = String(path).split(/[\\/]/).pop() || path;
  // Programming code/config files keep the full filename (with extension); other types drop the extension
  const name = isDir ? base : (keepFullFileName(base) ? base : base.replace(/\.[^/.]+$/, ''));
  const type = isDir ? 'folder' : inferDocType(path);
  return { name, type, typeName: getTypeName(type) };
}

// Tag source library: the right-click "add to library" dialog uses ctxTagLibId; other dialogs use the current library
function getTagLibId(prefix) {
  // 'ctx' dialog: directly use the selected library id; null means "custom library", no existing tags
  if (prefix === 'ctx') return ctxTagLibId;
  return currentLibrary ? currentLibrary.id : null;
}

// Open the right-click "add to library" dialog: library name can be entered/selected from dropdown; path/category/name auto-analyzed; tags reuse the add-document dialog interaction
function openAddDocFromContext(item) {
  const { name, typeName } = analyzePathForDoc(item.path, item.isDir);
  // Default to selecting the current library (or the first library if none)
  const defaultLib = currentLibrary || libraries[0] || null;
  ctxTagLibId = defaultLib ? defaultLib.id : null;
  const libSelect = document.getElementById('ctxLibrarySelect');
  // Dropdown: first item "custom library", then the existing library list
  libSelect.innerHTML = '<option value="__custom__">✏️ 自定义书库...</option>';
  libraries.forEach(lib => {
    const opt = document.createElement('option');
    opt.value = lib.id;
    opt.textContent = lib.name;
    libSelect.appendChild(opt);
  });
  libSelect.value = ctxTagLibId || '__custom__';
  // The library name input is shown only for "custom library"
  const customWrap = document.getElementById('ctxLibraryCustomWrap');
  const nameInput = document.getElementById('ctxLibraryNameInput');
  if (customWrap) customWrap.classList.toggle('hidden', !!ctxTagLibId);
  if (nameInput) nameInput.value = '';
  document.getElementById('ctxDocPathInput').value = item.path;
  document.getElementById('ctxDocTypeInput').value = typeName;
  document.getElementById('ctxDocNameInput').value = name;
  resetTagUi('ctx');
  loadTagOptions('ctx');
  showModal('addContextDocModal');
}

  // Selecting an existing library from dropdown -> auto-fill the library name input and load that library's tag set
function onCtxLibrarySelect() {
  const libSelect = document.getElementById('ctxLibrarySelect');
  const customWrap = document.getElementById('ctxLibraryCustomWrap');
  const nameInput = document.getElementById('ctxLibraryNameInput');
  const value = libSelect.value;
  if (value === '__custom__') {
    // Custom library: show the library name input, no existing tags
    ctxTagLibId = null;
    if (customWrap) customWrap.classList.remove('hidden');
    if (nameInput) nameInput.focus();
  } else {
    // Existing library: hide the input, tags loaded by that library
    const lib = libraries.find(l => l.id === value);
    ctxTagLibId = lib ? lib.id : null;
    if (customWrap) customWrap.classList.add('hidden');
  }
  // After switching library, clear selected tags and reload the tag set by the selected library
  resetTagUi('ctx');
  loadTagOptions('ctx');
}

// Confirm add: if the library name doesn't exist, auto-create it, then add the document
async function confirmAddContextDoc() {
  const libSelect = document.getElementById('ctxLibrarySelect');
  let lib = null;
  if (libSelect.value === '__custom__') {
    // Custom library: validate the new library name (non-empty is valid); reuse if exists, create if not
    const libName = document.getElementById('ctxLibraryNameInput').value.trim();
    if (!libName) {
      alert(t('请输入自定义书库名称'));
      return;
    }
    lib = libraries.find(l => l.name === libName) || null;
    if (!lib) {
      const resp = await fetch(`${API_BASE}/library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: libName })
      });
      if (!resp.ok) {
        const err = await resp.json();
        alert(t(err.error) || t('创建书库失败'));
        return;
      }
      lib = await resp.json();
    }
  } else {
    // Existing library: directly use the dropdown-selected library
    lib = libraries.find(l => l.id === libSelect.value) || null;
    if (!lib) {
      alert(t('请选择书库'));
      return;
    }
  }
  const name = document.getElementById('ctxDocNameInput').value.trim();
  const path = document.getElementById('ctxDocPathInput').value.trim();
  if (!name || !path) {
    alert(t('请输入文档名称和路径'));
    return;
  }
  const tags = getModalTags('ctx');
  const resp2 = await fetch(`${API_BASE}/library/${lib.id}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, path, tags })
  });
  if (!resp2.ok) {
    const err = await resp2.json();
    alert(t(err.error) || t('添加文档失败'));
    return;
  }
  await fetchLibraries();
  selectLibrary(libraries.find(l => l.id === lib.id));
  closeModal('addContextDocModal');
}

// Temp favorite: auto-create/reuse the "temp favorite" library and add the document (no tags, no dialog)
async function addToTempFavorites(item) {
  const { name } = analyzePathForDoc(item.path, item.isDir);
  const TEMP_LIB_NAME = '临时收藏';
  let lib = libraries.find(l => l.name === TEMP_LIB_NAME);
  if (!lib) {
    const resp = await fetch(`${API_BASE}/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: TEMP_LIB_NAME })
    });
    if (!resp.ok) {
      const err = await resp.json();
      alert(t(err.error) || t('创建临时收藏书库失败'));
      return;
    }
    lib = await resp.json();
  }
  const resp2 = await fetch(`${API_BASE}/library/${lib.id}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, path: item.path, tags: [] })
  });
  if (!resp2.ok) {
    const err = await resp2.json();
    alert(t(err.error) || t('加入临时收藏失败'));
    return;
  }
  await fetchLibraries();
  selectLibrary(libraries.find(l => l.id === lib.id));
  alert(t('已加入临时收藏书库: {0}', name));
}

// Show the software help document in the document preview area (bookmgr_usage.md, located in the public static directory)
async function showHelpDocument(mddoc) {
  try {
    if (!mddoc){
      // When the UI language is English, open the English help document
      const helpDoc = (window.I18N && window.I18N.isEn) ? 'bookmgr_usage_en.md' : 'bookmgr_usage.md';
      mddoc = {name: helpDoc, path: helpDoc, type: 'markdown'};
    }
    else if(!mddoc.name || !mddoc.path || !mddoc.type || mddoc.type != "markdown") {
      console.error('加载文档失败, 传入doc参数值不正确:'+str(mddoc));
    }
    const response = await fetch(mddoc.path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rawContent = await response.text();

    const doc = { name: mddoc.name, path: mddoc.path, type: mddoc.type };
    currentDocument = doc;
    // The help document is not opened from the folder list, so hide the parent directory link
    folderViewParentDir = null;
    updateFolderParentLink();
    // The help document is inside web root (public), so its path relative to web root is mddoc.path
    currentServerPath = mddoc.path || '';

    document.getElementById('documentTitle').textContent = doc.name;
    document.getElementById('documentType').textContent = getTypeName(doc.type);
    document.getElementById('documentType').className = `type-badge type-${doc.type}`;

    const pathEl = document.getElementById('documentPath');
    if (pathEl) {
      pathEl.textContent = truncateMiddle(doc.path, 80);
      pathEl.title = doc.path;
    }

    document.getElementById('libraryView').classList.add('hidden');
    document.getElementById('documentView').classList.remove('hidden');

    renderDocumentContent({ rawContent, type: 'markdown' }, 'markdown');
  } catch (error) {
    console.error('加载帮助文档失败:', error);
    const contentDiv = getActiveContentEl();
    if (contentDiv) {
      contentDiv.innerHTML = '<div style="color:red; padding: 2rem;">' + t('加载帮助文档失败: {0}', error.message) + '</div>';
    }
  }
}

function toggleToc() {
  const frame = getMdFrame();
  const tocToggleBtn = document.getElementById('tocToggleBtn');
  if (!frame || !frame.contentDocument) return;
  const idoc = frame.contentDocument;
  const toc = idoc.getElementById('frameToc');
  const content = idoc.getElementById('frameContent');
  if (!toc || !content) return;
  const hidden = toc.classList.toggle('hidden');
  content.classList.toggle('full-width', hidden);
  tocToggleBtn.textContent = '📑';
}

async function openExternalLink(url) {
  try {
    const response = await fetch(`${API_BASE}/open-external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: url })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(t(data && data.error) || t('打开外部链接失败 (HTTP {0})', response.status));
    }
  } catch (error) {
    console.error('打开外部链接失败:', error);
  }
}

// Open the folder containing the current document (browse-window style, filtered to .md/.markdown)
function openCurrentFolder() {
  if (!currentDocument || !currentDocument.path) return;
  const idx = Math.max(currentDocument.path.lastIndexOf('\\'), currentDocument.path.lastIndexOf('/'));
  const dir = idx > 0 ? currentDocument.path.substring(0, idx) : currentDocument.path;
  browseMode = 'md';
  browseTargetInputId = null;
  document.getElementById('browseFileNameInput').value = '';
  showModal('browseModal');
  loadBrowseDrives(); // load partition shortcut buttons
  fetchBrowseList(dir);
}

// ===== Document history =====
const MD_HISTORY_KEY = 'md_doc_history';
const MD_HISTORY_MAX = 20;

function getMdHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(MD_HISTORY_KEY)) || [];
    // Sort by access time descending (most recently accessed at the top)
    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (e) {
    return [];
  }
}

// Add to history (only called for documents opened from the document list/folder)
// prevDoc is the current document before opening: if it's the same file as history's most recent, don't add again
function addToMdHistory(doc, prevDoc) {
  let history = getMdHistory();
  // Same file as the current document before opening -> don't add again
  if (prevDoc && prevDoc.path === doc.path) return;
  // Same file as the most recent history entry -> don't add again
  if (history.length > 0 && history[0].path === doc.path) return;
  history = history.filter(item => item.path !== doc.path);
  history.unshift({ name: doc.name, path: doc.path, type: doc.type, timestamp: Date.now() });
  if (history.length > MD_HISTORY_MAX) history = history.slice(0, MD_HISTORY_MAX);
  localStorage.setItem(MD_HISTORY_KEY, JSON.stringify(history));
  updateMdHistoryDropdown();
}

// Omit the middle of a long path, keeping the beginning and end (e.g. C:\Users\...\doc.md)
function truncateMiddle(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  const half = Math.floor((maxLen - 3) / 2);
  return str.slice(0, half) + '...' + str.slice(str.length - half);
}

function updateMdHistoryDropdown() {
  const dropdown = document.getElementById('mdHistoryDropdown');
  if (!dropdown) return;
  const history = getMdHistory();

  if (history.length === 0) {
    dropdown.innerHTML = '<div class="md-history-empty">暂无历史记录</div>';
    return;
  }

  let html = `
    <div class="md-history-item md-history-clear" onclick="clearMdHistory()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      <span class="md-history-text">清除记录</span>
    </div>
  `;
  html += '<div class="md-history-divider"></div>';

  history.forEach((item, index) => {
    // Truncate to fit the dropdown container width, ensuring head and tail are visible (middle ...)
    // Container text area ~317px / ~6.72px per monospace char ≈ 47 chars; threshold matches capacity
    const pathText = truncateMiddle(item.path, 47);
    html += `
      <div class="md-history-item" title="${escapeHtml(item.name)}" onclick="loadFromMdHistory(${index})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <div class="md-history-info">
          <span class="md-history-text" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <span class="md-history-path" title="${escapeHtml(item.path)}">${escapeHtml(pathText)}</span>
        </div>
      </div>
    `;
  });

  dropdown.innerHTML = html;
}

function toggleMdHistory() {
  const dropdown = document.getElementById('mdHistoryDropdown');
  dropdown.classList.toggle('show');
  updateMdHistoryDropdown();
}

function hideMdHistory() {
  const dropdown = document.getElementById('mdHistoryDropdown');
  if (dropdown) dropdown.classList.remove('show');
}

function loadFromMdHistory(index) {
  const history = getMdHistory();
  const item = history[index];
  if (!item) return;
  hideMdHistory();
  // While showing the document, move this history entry to the first position (as the most recently accessed document)
  if (index !== 0) {
    history.splice(index, 1);
    history.unshift({ name: item.name, path: item.path, type: item.type, timestamp: Date.now() });
    if (history.length > MD_HISTORY_MAX) history = history.slice(0, MD_HISTORY_MAX);
    localStorage.setItem(MD_HISTORY_KEY, JSON.stringify(history));
    updateMdHistoryDropdown();
  }
  // Fetch the document content and render directly from the server (open by the real type recorded, supporting markdown/text/code files)
  // History-opened documents are not re-added to history (record: false); the pin-to-top logic is already done above
  openDocument({ name: item.name, path: item.path, type: item.type || 'markdown' }, { record: false });
}

// Back button: find the previous document of the current one in history order and open preview (not added to history)
function goBackHistory() {
  const history = getMdHistory();
  if (!history.length) return;
  // Locate the current document's position in history (at the front when opened from document list/folder)
  let idx = -1;
  if (currentDocument && currentDocument.path) {
    const found = history.findIndex(h => h.path === currentDocument.path);
    idx = found >= 0 ? found : -1;
  }
  const next = idx + 1;
  if (next >= history.length) return; // Already at the earliest history record
  const item = history[next];
  openDocument({ name: item.name, path: item.path, type: item.type || 'markdown' }, { record: false });
}

function clearMdHistory() {
  if (confirm(t('确定要清除所有历史记录吗？此操作不可恢复。'))) {
    localStorage.removeItem(MD_HISTORY_KEY);
    updateMdHistoryDropdown();
  }
}

// Click outside to close the history dropdown
document.addEventListener('click', function(e) {
  const container = document.querySelector('.md-history-container');
  const dropdown = document.getElementById('mdHistoryDropdown');
  if (container && dropdown && !container.contains(e.target)) {
    dropdown.classList.remove('show');
  }
});

// Press ESC to close the history dropdown (main window focus scenario; inside iframe handled by the iframe script)
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const dropdown = document.getElementById('mdHistoryDropdown');
    if (dropdown) dropdown.classList.remove('show');
    const findBar = document.getElementById('findBar');
    if (findBar && !findBar.classList.contains('hidden')) closeFindBar();
  }
});

// Use pdf.js to render each page as an image, generating printable (printToPDF) HTML (fallback path)
async function buildPdfPrintHtml(data, doc) {
  const pdfjs = await loadPdfjsLib();
  const bytes = dataUrlToUint8Array(data.content);
  if (!bytes) throw new Error('PDF 数据无效');
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const title = escapeHtml(doc ? doc.name : 'PDF 文档');
  const imgs = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = 1400 / vp1.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width * 2);
    canvas.height = Math.floor(vp.height * 2);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    imgs.push('<div style="page-break-after: always; text-align:center;"><img src="' + canvas.toDataURL('image/png') + '" style="max-width:100%; height:auto;"></div>');
  }
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + t('打印 - {0}', title) + '</title><style>body{margin:0}@page{margin:10mm}</style></head><body>' + imgs.join('\n') + '</body></html>';
}

// Pure browser environment fallback: open a print window (no Electron, render images then call system print)
function printViaPopup(html) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert(t('无法打开打印窗口，请检查是否被浏览器拦截'));
    return false;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
  return true;
}

// Print PDF: prefer handing raw PDF bytes to the main process (pdf.js preview window, vector crisp);
// when the main process isn't updated, render via pdf.js to images and go through printHtml; pure browser goes through the print popup
async function printPdfDocument() {
  const data = currentRenderData; // full data object (includes the content field)
  if (!data || !data.content || !/^data:application\/pdf;base64,/.test(data.content)) {
    alert(t('PDF 数据未就绪，请稍后重试'));
    return;
  }
  const doc = currentDocument;
  try {
    if (window.electronAPI && window.electronAPI.printPdf) {
      const base64 = data.content.split(',')[1];
      const result = await window.electronAPI.printPdf(base64, doc ? doc.name : 'PDF 文档');
      if (result && !result.success) alert(t('打印失败: {0}', result.error || t('未知错误')));
      return;
    }
    const html = await buildPdfPrintHtml(data, doc);
    if (window.electronAPI && window.electronAPI.printHtml) {
      const result = await window.electronAPI.printHtml(html, doc ? doc.name : 'PDF 文档');
      if (result && !result.success) alert(t('打印失败: {0}', result.error || t('未知错误')));
      return;
    }
    printViaPopup(html);
  } catch (e) {
    console.error('PDF 打印失败:', e);
    alert(t('打印失败: {0}', e && e.message || e));
  }
}

// Print the .document-body area content
function printDocument() {
  const contentDiv = getActiveContentEl();
  if (!contentDiv) return;

  // PDF: open the pdf.js print preview with raw bytes (Electron has no built-in PDF viewer, can't print/preview directly)
  if (currentDocument && currentDocument.type === 'pdf') {
    printPdfDocument();
    return;
  }

  // Electron environment: generate a PDF preview window via the main process printToPDF (Electron has no built-in print preview)
  if (window.electronAPI && window.electronAPI.printHtml) {
    let html = '';
    const frame = contentDiv.querySelector('iframe');
    if (frame && frame.contentDocument) {
      // markdown / html: take the complete document inside the iframe (preserving styles), and fix relative resource paths to absolute
      html = frame.contentDocument.documentElement.outerHTML;
      html = html.replace(/(href|src)="(css|js)\//g, `$1="${location.origin}/$2/`);
    } else {
      // text-type documents
      const content = contentDiv.innerHTML;
      html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>打印 - ${escapeHtml(currentDocument ? currentDocument.name : '文档')}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif; line-height: 1.6; color: #333; padding: 24px; }
  pre { background: #f6f8fa; padding: 12px 16px; border-radius: 6px; overflow-x: auto; font-family: Consolas, 'Courier New', monospace; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
  code { font-family: Consolas, 'Courier New', monospace; }
  table { border-collapse: collapse; width: fit-content; margin: 8px 0; }
  th, td { border: 1px solid #dfe2e5; padding: 6px 10px; }
  img { max-width: 100%; height: auto; }
  blockquote { border-left: 4px solid #ddd; margin: 8px 0; padding-left: 12px; color: #666; }
</style>
</head>
<body>${content}</body>
</html>`;
    }
    window.electronAPI.printHtml(html, currentDocument ? currentDocument.name : '文档').then(result => {
      if (result && !result.success) {
        alert(`打印失败: ${result.error || '未知错误'}`);
      }
    }).catch(err => {
      console.error('打印请求失败:', err);
      alert(t('打印失败: {0}', err.message));
    });
    return;
  }

  // markdown / html etc. content is rendered inside an iframe, call iframe print directly (preserving complete styles)
  const frame = contentDiv.querySelector('iframe');
  if (frame && frame.contentWindow) {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (e) {
      // Cross-origin iframes (e.g. PDF's data: URL) can't be programmatically printed, prompt the user to use its own print function
      console.warn('无法直接调用 iframe 打印:', e.message);
      if (currentDocument && currentDocument.type === 'pdf') {
        alert(t('PDF 文档请使用 PDF 查看器自带的打印功能（在预览区域的 PDF 工具栏点击打印按钮）。'));
      } else {
        alert(t('当前文档无法直接打印，请使用浏览器自带的打印功能（Ctrl+P）。'));
      }
    }
    return;
  }

  // text-type documents: content is rendered directly in #documentContent, open a print window
  const content = contentDiv.innerHTML;
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert(t('无法打开打印窗口，请检查是否被浏览器拦截'));
    return;
  }
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>打印 - ${escapeHtml(currentDocument ? currentDocument.name : '文档')}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif; line-height: 1.6; color: #333; padding: 24px; }
        pre { background: #f6f8fa; padding: 12px 16px; border-radius: 6px; overflow-x: auto; font-family: Consolas, 'Courier New', monospace; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
        code { font-family: Consolas, 'Courier New', monospace; }
        table { border-collapse: collapse; width: fit-content; margin: 8px 0; }
        th, td { border: 1px solid #dfe2e5; padding: 6px 10px; }
        img { max-width: 100%; height: auto; }
        blockquote { border-left: 4px solid #ddd; margin: 8px 0; padding-left: 12px; color: #666; }
      </style>
    </head>
    <body>${content}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 300);
}

// ===== Document find (Ctrl+F) =====
let findQuery = '';
let findMatches = [];   // current matched <mark> elements
let findIndex = -1;     // current highlight position

// Document types that support find (plain text/code/markdown/html)
function isFindableType(type) {
  // Text/code types (with hljs language or markdown/html rendering) support find, uniformly provided by DOC_TYPE_DEFS
  const def = DOC_TYPE_DEFS.find(d => d.type === type);
  return !!(def && (def.lang || type === 'markdown' || type === 'html'));
}

// Return the document to search within (markdown/html content is rendered inside an iframe)
function getFindDoc() {
  const frame = getMdFrame();
  if (frame && frame.contentDocument) return frame.contentDocument;
  const htmlFrame = document.getElementById('htmlPreviewFrame');
  if (htmlFrame && htmlFrame.contentDocument) return htmlFrame.contentDocument;
  return document;
}

// Return the find root node
function getFindRoot(doc) {
  if (doc === document) return getActiveContentEl();
  return doc.body;
}

// Clear previous highlights
function clearFindHighlights() {
  const doc = getFindDoc();
  const marks = doc.querySelectorAll('mark.find-hl');
  marks.forEach(m => {
    const text = doc.createTextNode(m.textContent);
    m.parentNode.replaceChild(text, m);
  });
  findMatches = [];
  findIndex = -1;
}

// Find and highlight all matches in the current document (case-insensitive, preserving original text)
function findInDoc(query) {
  clearFindHighlights();
  const doc = getFindDoc();
  const root = getFindRoot(doc);
  if (!root) return;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  const qlower = query.toLowerCase();
  nodes.forEach(node => {
    const text = node.nodeValue || '';
    if (!text.toLowerCase().includes(qlower)) return;
    const parent = node.parentNode;
    if (!parent) return;
    if (parent.closest && parent.closest('mark.find-hl')) return;
    if (parent.closest && parent.closest('script, style')) return;

    const lower = text.toLowerCase();
    const frag = doc.createDocumentFragment();
    let last = 0;
    let idx = lower.indexOf(qlower);
    while (idx !== -1) {
      if (idx > last) frag.appendChild(doc.createTextNode(text.slice(last, idx)));
      const mark = doc.createElement('mark');
      mark.className = 'find-hl';
      mark.textContent = text.slice(idx, idx + query.length);
      frag.appendChild(mark);
      findMatches.push(mark);
      last = idx + query.length;
      idx = lower.indexOf(qlower, last);
    }
    if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
    parent.replaceChild(frag, node);
  });
}

// Find next and scroll to that position
function findNext() {
  const input = document.getElementById('findInput');
  const query = input.value.trim();
  if (!query) return;
  if (query !== findQuery) {
    findQuery = query;
    findInDoc(query);
  }
  if (findMatches.length === 0) return;

  findIndex = (findIndex + 1) % findMatches.length;
  const doc = getFindDoc();
  doc.querySelectorAll('mark.find-hl.find-current').forEach(m => m.classList.remove('find-current'));
  const current = findMatches[findIndex];
  current.classList.add('find-current');
  current.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Open the find bar
function showFindBar() {
  if (!currentDocument || !isFindableType(currentDocument.type)) return;
  const bar = document.getElementById('findBar');
  if (!bar) return;
  bar.classList.remove('hidden');
  const input = document.getElementById('findInput');
  input.value = '';
  input.focus();
  findQuery = '';
  clearFindHighlights();
}

// Close the find bar and clear highlights
function closeFindBar() {
  const bar = document.getElementById('findBar');
  if (bar) bar.classList.add('hidden');
  findQuery = '';
  clearFindHighlights();
}

// Ctrl+F opens the find bar (main window focus scenario)
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault();
    showFindBar();
  }
});

// Enter in the find input triggers find next
document.getElementById('findInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    findNext();
  }
});

// ===== Light/dark theme switch (affects markdown preview iframe and main window text/code file views) =====
const MD_THEME_KEY = 'md_preferred_theme';

function getMdTheme() {
  return localStorage.getItem(MD_THEME_KEY) === 'dark' ? 'dark' : 'light';
}

  // Apply the specified theme (default current theme) to the markdown preview iframe:
  // update the <html> data-theme marker and theme/code-highlight stylesheets, so the iframe internal theme matches the main window
function applyFrameTheme(frame, theme) {
  if (!frame || !frame.contentDocument) return;
  const isDark = (theme || getMdTheme()) === 'dark';
  const idoc = frame.contentDocument;
  const htmlEl = idoc.documentElement;
  if (isDark) {
    htmlEl.setAttribute('data-theme', 'dark');
    htmlEl.classList.add('dark');
  } else {
    htmlEl.removeAttribute('data-theme');
    htmlEl.classList.remove('dark');
  }
  const themeSheet = idoc.getElementById('theme-stylesheet');
  const hljsSheet = idoc.getElementById('hljs-stylesheet');
  if (themeSheet) themeSheet.href = isDark ? 'css/tech-blog-dark.css' : 'css/tech-blog-light.css';
  if (hljsSheet) hljsSheet.href = isDark ? 'css/github-dark.min.css' : 'css/github.min.css';
}

// Sync a specified frame's theme: apply immediately if loaded; apply on load if not yet loaded
function syncFrameTheme(frame) {
  if (!frame) return;
  if (frame.contentDocument) { applyFrameTheme(frame); return; }
  if (!frame._themeSyncBound) {
    frame._themeSyncBound = true;
    frame.addEventListener('load', () => applyFrameTheme(frame));
  }
}

function setMdTheme(theme) {
  const isDark = theme === 'dark';
  const btn = document.getElementById('mdThemeBtn');
  if (btn) {
    btn.classList.toggle('dark', isDark);
    btn.title = isDark ? '切换为浅色背景' : '切换为深色背景';
  }

  // Main window syncs theme marker and hljs theme style: text/code file views render directly in the main window, so they must follow the theme
  const rootEl = document.documentElement;
  if (isDark) {
    rootEl.setAttribute('data-theme', 'dark');
    rootEl.classList.add('dark');
  } else {
    rootEl.removeAttribute('data-theme');
    rootEl.classList.remove('dark');
  }
  const mainHljsSheet = document.getElementById('hljs-stylesheet');
  if (mainHljsSheet) mainHljsSheet.href = isDark ? 'css/github-dark.min.css' : 'css/github.min.css';

  // Sync all markdown preview iframes' theme styles (each view/each tab page's content node has its own independent frame),
  // ensuring all rendered tab pages stay consistent when switching themes (not just the currently active tab page)
  document.querySelectorAll('iframe.md-preview-frame').forEach(frame => applyFrameTheme(frame, theme));

  localStorage.setItem(MD_THEME_KEY, theme);
}

function toggleMdTheme() {
  setMdTheme(getMdTheme() === 'dark' ? 'light' : 'dark');
}

// Restore theme on page load (only update button state; iframes use the theme per getMdTheme() when rendered)
(function restoreMdTheme() {
  const savedTheme = localStorage.getItem(MD_THEME_KEY);
  if (savedTheme) setMdTheme(savedTheme);
})();

function handleExternalLinkClick(e) {
  const link = e.target.closest('a');
  if (!link) return;
  
  const href = link.getAttribute('href');
  if (!href) return;
  
  if (href.startsWith('#')) {
    return;
  }
  
  // http/https 链接是互联网资源，直接在前端用 <a target="_blank"> 方式打开（不经过服务端调用系统程序）:
  // 纯浏览器模式新开标签页，Electron 下由主进程 setWindowOpenHandler 转到系统默认浏览器
  const urlPattern = /^https?:\/\//i;
  if (urlPattern.test(href)) {
    e.preventDefault();
    e.stopPropagation();
    openWeblink(href);
  }
}

// ===== Markdown rendering =====
let swmathgraph = null;
let swmdtool = null;

function initMdRenderer() {
  swmathgraph = new SWMathGraph({});
  swmdtool = new SWMDtool({
    marked: marked,
    katex: katex,
    jsyaml: jsyaml,
    hljs: hljs,
    // mermaid is rendered inside the preview iframe; the parent page doesn't trigger async mermaid.run()
    mermaid: null,
    swmathgraph: swmathgraph,
  });
}

// Inline styles inside the preview iframe
const MD_FRAME_STYLES = `
  html, body { margin: 0; padding: 0; }
  body { padding: 1.5rem; overflow-y: auto; }
  /* TOC + content layout */
  .md-frame-layout { display: flex; gap: 2rem; max-width: 1400px; margin: 0 auto; }
  .md-frame-toc { width: 240px; flex-shrink: 0; position: sticky; top: 0; max-height: calc(100vh - 3rem); overflow-y: auto; background-color: var(--bg-secondary, #f6f8fa); padding: 1rem; border-radius: 8px; transition: all 0.3s ease; }
  .md-frame-toc.hidden { display: none; }
  .md-frame-content { flex: 1; min-width: 0; }
  .md-frame-content.full-width { max-width: 100%; }
  .toc-title { font-size: 0.875rem; font-weight: 600; margin-bottom: 0.75rem; padding-bottom: 0.4rem; border-bottom: 1px solid var(--border-color, #e1e4e8); color: var(--text-primary, #24292e); }
  .toc-list { list-style: none; padding: 0; margin: 0; }
  .toc-list li { margin-bottom: 0.3rem; }
  .toc-list a { font-size: 0.8125rem; color: var(--text-secondary, #586069); display: block; padding: 0.35rem 0.5rem; border-radius: 4px; text-decoration: none; transition: all 0.15s; }
  .toc-list a:hover { color: var(--primary-color, #0366d6); background-color: var(--bg-tertiary, #f1f3f5); }
  /* Current TOC item: background-color highlight (works for light/dark theme), no border/outline */
  .toc-list a.active { color: var(--primary-color, #0366d6); background-color: var(--primary-light, #e8f4fd); font-weight: 600; }
  .toc-list a:focus { outline: none; }
  .toc-list .toc-ind1 { padding-left: 1.0rem; font-size: 0.75rem; }
  .toc-list .toc-ind2 { padding-left: 1.8rem; font-size: 0.75rem; }
  .page h1, .page h2, .page h3, .page h4, .page h5, .page h6 { scroll-margin-top: 80px; }
  .page table { width: fit-content; }
  .page pre { position: relative; overflow-x: auto; }
  .page pre code { background: none; padding: 0; color: inherit; }
  .page pre code table { width: 100%; border-collapse: collapse !important; table-layout: auto; }
  .page pre code table, .page pre code table tbody, .page pre code table tbody tr, .page pre code table tbody tr td {
    border-spacing: 0 !important; border: none; padding: 0; background-color: none;
  }
  .page .katex { font-family: 'KaTeX-Main', 'KaTeX-SansSerif'; font-size: 1.0em; text-indent: 0; text-rendering: auto; }
  .page .hljs-ln-numbers { text-align: right; color: #ccc; border-right: 1px solid #ccc; vertical-align: top; padding-right: 5px !important; white-space: nowrap; min-width: 40px; width: 0; }
  .page .hljs-ln-code { padding-left: 5px !important; width: 100%; word-wrap: break-word; }
  .page .hljs-ln { border-collapse: collapse; font-size: inherit; font-family: inherit; white-space: pre; }
  .page .hljs-ln td { padding: 0; }
  .page .hljs-ln-n:before { content: attr(data-line-number); }
  .page .hljs-cmd-prompt { color: #888; }
  .page .hljs-cmd-name { color: #da2792; }
  .page .hljs-cmd-params { color: #222; }
  .page .hljs-cmd-variable { color: #130a94a2; }
  .page tbody tr:hover { background-color: #e8f4fd; }
  .page article { padding: 10px; }
  .page article articlehead { display: block; font-size: 11px; font-family: iconfont; color: #888; }
  .page article title { font-size: 30px; display: block; text-align: center; }
  .page article author, .page article date, .page article tags { margin-left: 10px; text-align: center; }
  .page article author::before { content: "\\e662"; padding-left: 10px; padding-right: 5px; }
  .page article date::before { content: "\\e747"; padding-left: 10px; padding-right: 5px; }
  .page article tags::before { content: "\\e60e"; padding-left: 10px; padding-right: 5px; }
  .code-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 6px; opacity: 0; transition: opacity 0.2s ease; z-index: 10; }
  .page pre:hover .code-actions { opacity: 1; }
  .code-action-btn { width: 28px; height: 28px; padding: 0; display: flex; align-items: center; justify-content: center; color: #6a737d; background-color: transparent; border: 1px solid #e1e4e8; border-radius: 4px; cursor: pointer; transition: all 0.2s ease; }
  .code-action-btn:hover { background-color: #f1f3f5; color: #24292e; border-color: #586069; }
  .code-action-btn svg { width: 14px; height: 14px; }
  .code-action-btn.copied, .code-action-btn.active { color: #31a476; border-color: #31a476; }
  /* Find match highlight (works for light/dark theme) */
  mark.find-hl { background-color: var(--find-hl-bg, #fff3a3); color: inherit; padding: 0 1px; border-radius: 2px; }
  mark.find-hl.find-current { background-color: var(--find-current-bg, #ff9632); color: #fff; }
  [data-theme="dark"] { --find-hl-bg: #6b5b1e; --find-current-bg: #c96a1c; }
  ::-webkit-scrollbar { background: var(--scrollbar-bg, #fcfcfc); width: 10px; }
  ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb-bg, #888); border-radius: 6px; min-height: 40px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-bg-hover, #636363); }
  /* Document header (front-matter parsing: title/description/keywords/tags etc.) */
  .md-doc-header {
    padding: 1rem 1.2rem 1rem;
    margin-bottom: 1.2rem;
    border-bottom: 1px solid var(--border-color, #e1e4e8);
    background-color: var(--bg-secondary, #f6f8fa);
    border-radius: 8px;
  }
  .md-doc-title {
    margin: 0 0 0.5rem;
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.4;
    color: var(--text-primary, #24292e);
  }
  .md-doc-desc {
    margin: 0 0 0.6rem;
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--text-secondary, #586069);
  }
  .md-doc-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .md-doc-tag {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    font-size: 0.75rem;
    line-height: 1.4;
    border: 1px solid var(--border-color, #e1e4e8);
    border-radius: 10px;
    background-color: var(--bg-tertiary, #f1f3f5);
    color: var(--text-secondary, #586069);
  }
  .md-doc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-tertiary, #6a737d);
  }
  .md-doc-meta-item {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
  }
  /* Frame container (converted from <Frame>): image and caption grouped, caption centered directly below the image;
     light-gray card background, on hover only the border highlights (the image itself unchanged), light/dark theme adapts via CSS variables */
  .mdx-frame {
    text-align: center;
    margin: 1rem auto;
    padding: 0.8rem 1rem 0.6rem;
    background-color: var(--bg-secondary, #f6f8fa);
    border: 1px solid var(--border-color, #e1e4e8);
    border-radius: 8px;
    transition: border-color 0.2s ease;
  }
  .mdx-frame:hover {
    border-color: var(--primary-color, #0366d6); /* on hover only 1px border highlight, image and text unchanged */
  }
  .mdx-frame img {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
  }
  /* mdx resource link (refer to docreader's mdx-frame-link): display style for "/" -prefixed images inside Frame after resolution */
  .mdx-resource {
    display: block;
    text-align: center;
    margin: 1rem auto;
    cursor: pointer; /* image and the caption below belong to the same clickable unit */
  }
  /* The theme style a:hover adds a border-bottom underline to links, causing an extra line under the caption text on hover; remove it */
  .mdx-frame .mdx-resource,
  .mdx-frame .mdx-resource:hover {
    border-bottom: none;
    text-decoration: none;
  }
  .mdx-resource img {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
  }
  .mdx-frame-caption {
    display: block;
    margin-top: 0.4rem;
    font-size: 0.85rem;
    color: var(--text-secondary, #586069);
  }
`;

// Build the preview iframe's complete HTML document
function buildMdFrameHtml(html, theme, docPath) {
  const isDark = theme === 'dark';
  const themeCss = isDark ? 'css/tech-blog-dark.css' : 'css/tech-blog-light.css';
  const hljsCss = isDark ? 'css/github-dark.min.css' : 'css/github.min.css';
  return `<!DOCTYPE html>
<html lang="zh-CN"${isDark ? ' data-theme="dark" class="dark"' : ''}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${themeCss}" id="theme-stylesheet">
<link rel="stylesheet" href="${hljsCss}" id="hljs-stylesheet">
<link rel="stylesheet" href="css/iconfont.css">
<link rel="stylesheet" href="css/font_io.css">
<link rel="stylesheet" href="css/katex.min.css">
<link rel="stylesheet" href="css/jsxgraph.css">
<style>${MD_FRAME_STYLES}</style>
</head>
<body>
<div class="md-frame-layout">
  <aside class="md-frame-toc" id="frameToc">
    <div class="toc-title">📑 目录</div>
    <ul class="toc-list" id="frameTocList"></ul>
  </aside>
  <main class="md-frame-content" id="frameContent">
${html}
  </main>
</div>
<script src="js/mermaid.min.js"><\/script>
<script>
  // markdown relative links are rendered as onclick="openServerFile(...)"; here the call is forwarded to the main window
  // (consistent with the file list's data-path access; allows opening files outside web root by server-relative path)
  window.openServerFile = function(relPath, name) {
    if (window.parent && window.parent.openServerFile) window.parent.openServerFile(relPath, name);
  };
  // Resolve both "/" -prefixed and relative (./x, ../x, bare x) resource paths inside mdx/markdown (e.g. images):
  // the server resolves a "/" -prefixed resource against the mdx document root, and a relative resource against the
  // current document's own directory, then verifies whether the file exists;
  // found -> rewrite img src to a /fs/-accessible path (actually display the image) and render it as a clickable link
  // (click opens the resource content via openServerFile); not found -> keep as-is
  (function() {
    var docPath = ${JSON.stringify(docPath || '')};
    if (!docPath) return;
    var imgs = document.querySelectorAll('#frameContent img');
    if (!imgs.length) return;
    imgs.forEach(function(img) {
      var src = img.getAttribute('src') || '';
      // The markdown renderer may percent-encode the URL; decode it so the relative
      // path uses the real characters before we re-encode it for the request
      try { src = decodeURI(src); } catch (e) {}
      // absolute URLs / data / blob / anchors are not server-resolvable resources; keep as-is
      if (/^(https?:|data:|blob:|mailto:|javascript:|#)/i.test(src)) return;
      // already wrapped by an earlier pass
      if (img.closest('a.mdx-resource')) return;
      fetch('/api/mdx-resolve?filePath=' + encodeURIComponent(docPath) + '&resource=' + encodeURIComponent(src))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data && data.found && data.serverRelPath) {
             // serverRelPath is relative to web root and may carry a ../ prefix (files outside web root);
             // encode the whole path as a single segment (don't keep "/" and ".." dot segments) to avoid the browser URL spec folding the path,
             // the /fs/ route decodes it and uses path.join to restore the correct file
            img.setAttribute('src', '/fs/' + encodeURIComponent(data.serverRelPath));
            var a = document.createElement('a');
            a.href = 'javascript:void(0);';
            a.className = 'mdx-resource';
            a.title = (typeof t === 'function') ? t('打开资源: {0}', src) : ('打开资源: ' + src);
            a.onclick = function() {
              window.parent.openServerFile(data.serverRelPath, src.split('/').pop());
              return false;
            };
            img.parentNode.insertBefore(a, img);
            a.appendChild(img);
            // Move an existing caption below the image into the link, making the image and text a single clickable unit (hover/click reacts on the whole group)
            var capSibling = a.nextSibling;
            while (capSibling && capSibling.nodeType !== 1) capSibling = capSibling.nextSibling;
            if (capSibling && capSibling.classList && capSibling.classList.contains('mdx-frame-caption')) {
              a.appendChild(capSibling);
            }
          }
        })
        .catch(function() { /* not found or error: keep as-is */ });
    });
  })();
  // Frame caption is shown centered directly below the image (Frame is already converted to a .mdx-frame container in the render pipeline, grouped with the image;
  // refer to docreader's mdx-frame-caption)
  document.querySelectorAll('#frameContent .mdx-frame').forEach(function(frame) {
    if (frame.querySelector('.mdx-frame-caption')) return;
    var caption = frame.getAttribute('caption') || '';
    var img = frame.querySelector('img');
    if (!caption || !img) return;
    var cap = document.createElement('span');
    cap.className = 'mdx-frame-caption';
    cap.textContent = caption;
    // caption and image belong to the same clickable unit: if the image is already inside the link, put the caption in the link (hover/click reacts on the whole group),
    // otherwise place it right after the image; after resolve succeeds, the link-wrap callback moves the caption into the link
    var holder = img.closest('.mdx-resource') || img;
    if (holder !== img) {
      holder.appendChild(cap);
    } else {
      holder.parentNode.insertBefore(cap, holder.nextSibling);
    }
  });
  // When clicking the iframe content area, notify the main window to close the history dropdown
  document.addEventListener('click', function() {
    if (window.parent.hideMdHistory) window.parent.hideMdHistory();
  });
  // When ESC is pressed, notify the main window to close the history dropdown
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && window.parent.hideMdHistory) window.parent.hideMdHistory();
  });
        // Ctrl+F opens the main window find bar (key presses inside the iframe don't bubble to the main window)
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      if (window.parent.showFindBar) window.parent.showFindBar();
    }
  });
  // http/https 链接在渲染时已加上 target="_blank"（见 markdown 链接后处理），直接由浏览器/Electron 默认行为打开：
  // 纯浏览器模式新开标签页，Electron 下主进程 setWindowOpenHandler 转到系统默认浏览器，无需再拦截走服务端
  // mermaid rendering
  try {
    mermaid.initialize({ startOnLoad: false, theme: 'default', flowchart: { useMaxWidth: false } });
    mermaid.run();
  } catch (err) { console.error('mermaid 渲染失败:', err); }
  // code block action buttons (copy + line numbers)
  document.querySelectorAll('.page pre').forEach(function(pre) {
    if (pre.querySelector('.code-actions')) return;
    var actionsDiv = document.createElement('div');
    actionsDiv.className = 'code-actions';
    var copyBtn = document.createElement('button');
    copyBtn.className = 'code-action-btn codecp-action-btn';
    copyBtn.title = '复制';
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    copyBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var code = pre.querySelector('code');
      if (!code) return;
      var text = code.textContent;
      function done() {
        copyBtn.classList.add('copied');
        copyBtn.title = '已复制';
        setTimeout(function() { copyBtn.classList.remove('copied'); copyBtn.title = '复制'; }, 5000);
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done).catch(function(err){ console.error('复制失败:', err); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'absolute'; ta.style.opacity = 0; ta.style.left = '-999999px'; ta.style.top = '-999999px';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand('copy') ? done() : console.error('复制失败');
        ta.remove();
      }
    });
    var lineNumBtn = document.createElement('button');
    lineNumBtn.className = 'code-action-btn codeln-action-btn';
    lineNumBtn.title = '行号';
    lineNumBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="2.5" cy="1" r="1.5"></circle><circle cx="2.5" cy="7" r="1.5"></circle><circle cx="2.5" cy="13" r="1.5"></circle><circle cx="2.5" cy="19" r="1.5"></circle><line x1="8" y1="-1" x2="8" y2="21" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"></line><line x1="12.5" y1="1" x2="21" y2="1" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line><line x1="12.5" y1="7" x2="21" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line><line x1="12.5" y1="13" x2="21" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line><line x1="12.5" y1="19" x2="21" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line></svg>';
    lineNumBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      pre.classList.toggle('show-line-numbers');
      lineNumBtn.classList.toggle('active');
      pre.querySelectorAll('.hljs-ln-numbers').forEach(function(lne) {
        lne.style.display = lineNumBtn.classList.contains('active') ? 'block' : 'none';
      });
    });
    actionsDiv.appendChild(copyBtn);
    actionsDiv.appendChild(lineNumBtn);
    pre.appendChild(actionsDiv);
  });
  // generate the table of contents
  (function generateFrameToc() {
    var contentEl = document.getElementById('frameContent');
    var tocList = document.getElementById('frameTocList');
    if (!contentEl || !tocList) return;
    var headsearchkeys = ['h1', 'h2', 'h3'];
    if (!contentEl.querySelector('h1')) {
      if (contentEl.querySelector('h2')) headsearchkeys = ['h2', 'h3', 'h4'];
      else if (contentEl.querySelector('h3')) headsearchkeys = ['h3', 'h4', 'h5'];
      else if (contentEl.querySelector('h4')) headsearchkeys = ['h4', 'h5', 'h6'];
    }
    var headings = contentEl.querySelectorAll(headsearchkeys.join(','));
    var tocHTML = '';
    headings.forEach(function(heading, index) {
      var id = 'heading-' + index;
      heading.id = id;
      var level = heading.tagName.toLowerCase();
      var indentClass = level === headsearchkeys[1] ? 'toc-ind1' : (level === headsearchkeys[2] ? 'toc-ind2' : '');
      tocHTML += '<li><a href="#' + id + '" class="' + indentClass + '">' + heading.textContent + '</a></li>';
    });
    tocList.innerHTML = tocHTML || '<li><a href="#">无目录</a></li>';

    var links = tocList.querySelectorAll('a');
    var setActive = function(link) {
      links.forEach(function(l) { l.classList.toggle('active', l === link); });
    };

    // Click a TOC item: immediately highlight it and smoothly scroll to the heading
    links.forEach(function(a) {
      a.addEventListener('click', function(e) {
        e.preventDefault();
        setActive(a);
        var target = document.getElementById(a.getAttribute('href').slice(1));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // On scroll, highlight the current TOC item (when scrolled to bottom, highlight the last heading)
    var updateActive = function() {
      var activeId = '';
      var minTop = Infinity;
      headings.forEach(function(heading) {
        if (!heading.id) return;
        var rect = heading.getBoundingClientRect();
        if (rect.top <= 100 && rect.top > -rect.height && rect.top < minTop) {
          minTop = rect.top;
          activeId = heading.id;
        }
      });
      // When the document is scrolled to the bottom (the last heading can't scroll to the top area), highlight the last heading
      if (!activeId && headings.length > 0) {
        var scroller = document.scrollingElement || document.documentElement;
        var atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 2;
        if (atBottom) activeId = headings[headings.length - 1].id;
      }
      links.forEach(function(link) {
        link.classList.toggle('active', link.getAttribute('href') === '#' + activeId);
      });
    };
    document.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
  })();
<\/script>
</body>
</html>`;
}

// Return the markdown preview iframe inside the content node of the "current active tab page":
// under multi-view, each view (and each tab page) has its own independent mdPreviewFrame in its content node,
// the TOC switch button must target the frame of the active tab page, not the global first one
function getMdFrame() {
  const contentEl = getActiveContentEl();
  if (!contentEl) return null;
  return contentEl.querySelector('iframe#mdPreviewFrame') || contentEl.querySelector('iframe.md-preview-frame');
}

// ===== Markdown relative-path link resolution (refer to docreader/public/index.html's resolveDocRelativePath) =====
// Resolve relative links inside markdown to a server-relative path based on the current document's path on the server (relative to web root)
// e.g. current document server path is ../../../../AI_learning/.../docs/architecture.zh.md,
// link architecture.zh.md → ../../../../AI_learning/.../docs/architecture.zh.md
// when the current document is outside web root, the resolution result also carries a .. prefix, consistent with the file list's data-path access
function resolveDocRelativePath(rel) {
  if (!currentServerPath) return '';
  var base = currentServerPath;
  var i = base.lastIndexOf('/');
  base = i >= 0 ? base.slice(0, i + 1) : '';
  var parts = (base + rel).split('/');
  var stack = [];
  for (var k = 0; k < parts.length; k++) {
    var p = parts[k];
    if (p === '' || p === '.') continue;
    if (p === '..') {
      if (stack.length && stack[stack.length - 1] !== '..') stack.pop();
      else stack.push('..');
    } else {
      stack.push(p);
    }
  }
  return stack.join('/');
}

// JS string escaping (for inline onclick parameters)
function jsString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Open a file by server-relative path (called when a markdown relative link is clicked, consistent with the file list's data-path access)
// relPath looks like ../../../../AI_learning/.../docs/architecture.zh.md (relative to web root, may point outside web root)
async function openServerFile(relPath, name) {
  const fname = name || (relPath || '').split('/').pop();
  if (!relPath) return;
  try {
    const response = await fetch(`${API_BASE}/document/content?filePath=${encodeURIComponent(relPath)}`);
    const data = await response.json();
    if (!response.ok || data.error) {
      alert(t('无法打开文件: {0}', data.error || ('HTTP ' + response.status)));
      return;
    }
    // Files over 100MB: show the file-size hint; after clicking "continue", re-fetch with force=1
    if (data.oversized) {
      const doc = { name: fname, path: data.absPath || relPath, type: data.type };
      currentDocument = doc;
      folderViewParentDir = null;
      updateFolderParentLink();
      currentServerPath = data.serverRelPath || relPath;
      document.getElementById('documentTitle').textContent = fname;
      document.getElementById('documentType').textContent = getTypeName(data.type);
      document.getElementById('documentType').className = `type-badge type-${data.type}`;
      const pathEl = document.getElementById('documentPath');
      if (pathEl) {
        pathEl.textContent = truncateMiddle(doc.path, 80);
        pathEl.title = doc.path;
      }
      document.getElementById('libraryView').classList.add('hidden');
      document.getElementById('documentView').classList.remove('hidden');
      renderOversizedGate(data, doc);
      return;
    }
    const doc = { name: fname, path: data.absPath || relPath, type: data.type };
    currentDocument = doc;
    // A file opened via a markdown relative link is not opened from the folder list, so hide the parent directory link
    folderViewParentDir = null;
    updateFolderParentLink();
    // Record the document's path relative to web root, for resolving its internal relative links
    currentServerPath = data.serverRelPath || relPath;

    document.getElementById('documentTitle').textContent = fname;
    document.getElementById('documentType').textContent = getTypeName(data.type);
    document.getElementById('documentType').className = `type-badge type-${data.type}`;
    const pathEl = document.getElementById('documentPath');
    if (pathEl) {
      pathEl.textContent = truncateMiddle(doc.path, 80);
      pathEl.title = doc.path;
    }
    document.getElementById('libraryView').classList.add('hidden');
    document.getElementById('documentView').classList.remove('hidden');

    renderDocumentContent(data, data.type);
    // Documents opened via markdown relative links are not added to history (only doc list/folder opens are added)
  } catch (error) {
    console.error('打开文件失败:', error);
    alert(t('打开文件失败: {0}', error.message));
  }
}

// ===== Frame container conversion (refer to docreader's mdx-frame) =====
// swmdtool's render pipeline strips the <Frame> tag (in practice marked keeps it as-is, but it disappears in swmdtool output),
// so before rendering, <Frame> must be converted to <div class="mdx-frame"> to make it a real DOM container,
// so the caption attribute value can be shown centered directly below the image by the script inside the preview iframe (grouped with the image).
// The conversion skips fenced code blocks (```/~~~) and indented code blocks (4 spaces/tab) to avoid breaking code examples.
function transformFrameToDiv(md) {
  var lines = String(md).split('\n');
  var fence = null; // current fence char (` or ~), null means not inside a code block
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var fm = line.match(/^\s*(```+|~~~+)/);
    if (fm) {
      if (!fence) fence = fm[1].charAt(0);
      else if (fm[1].charAt(0) === fence) fence = null;
      out.push(line);
      continue;
    }
    if (!fence && /^( {4}|\t)/.test(line)) {
      out.push(line); // indented code block
      continue;
    }
    if (fence) {
      out.push(line); // inside fenced code block
      continue;
    }
    out.push(line
      .replace(/<Frame\b([^>]*)>/gi, '<div class="mdx-frame"$1>')
      .replace(/<\/Frame\s*>/gi, '</div>'));
  }
  return out.join('\n');
}

// Render markdown to an HTML string (shares the same render pipeline with preview, used by renderMarkdown / html-text mode)
function renderMarkdownHtml(content) {
  if (!swmdtool) initMdRenderer();
  try {
    // Render in a hidden host (swmdtool depends on the parent page's marked/katex/hljs globals)
    let host = document.getElementById('mdRenderHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'mdRenderHost';
      host.style.cssText = 'position:absolute; left:-9999px; top:0; width:900px; visibility:hidden; pointer-events:none;';
      document.body.appendChild(host);
    }
    host.disabledAddStyle = true;
    host.disabledGenToc = true;
    content = handle_md_content_style_enh(host, content);
    // Frame container conversion (before rendering, see transformFrameToDiv comments)
    content = transformFrameToDiv(content);

    swmdtool.resetOptions();
    swmdtool.setOptions({ mdfile_name: currentDocument ? currentDocument.name : '' });
    swmdtool.render(content, host);

    // ===== front-matter document header =====
    // swmdtool parses the document's top "--- yaml ---" into swmdtool.page properties via a preprocess hook
    // take title/description/keywords/tags etc. to display in the document header
    const fmPage = swmdtool.page || {};
    if (fmPage.title || fmPage.description || fmPage.keywords || fmPage.tags || fmPage.author || fmPage.date) {
      let fmHtml = '<div class="md-doc-header">';
      if (fmPage.title) {
        fmHtml += `<h1 class="md-doc-title">${escapeHtml(String(fmPage.title))}</h1>`;
      }
      if (fmPage.description) {
        fmHtml += `<p class="md-doc-desc">${escapeHtml(String(fmPage.description))}</p>`;
      }
      // keywords / tags -> labels
      const tagList = [];
      if (Array.isArray(fmPage.keywords)) tagList.push(...fmPage.keywords);
      else if (fmPage.keywords) tagList.push(String(fmPage.keywords));
      if (Array.isArray(fmPage.tags)) tagList.push(...fmPage.tags);
      else if (fmPage.tags) tagList.push(String(fmPage.tags));
      if (tagList.length) {
        fmHtml += '<div class="md-doc-tags">' +
          tagList.map(t => `<span class="md-doc-tag">${escapeHtml(String(t))}</span>`).join('') +
          '</div>';
      }
      if (fmPage.author || fmPage.date) {
        let meta = '';
        if (fmPage.author) meta += `<span class="md-doc-meta-item">✍️ ${escapeHtml(String(fmPage.author))}</span>`;
        if (fmPage.date) meta += `<span class="md-doc-meta-item">📅 ${escapeHtml(String(fmPage.date))}</span>`;
        if (meta) fmHtml += `<div class="md-doc-meta">${meta}</div>`;
      }
      fmHtml += '</div>';
      host.insertAdjacentHTML('afterbegin', fmHtml);
      // If the first heading equals the front-matter title, hide it to avoid duplication
      if (fmPage.title) {
        const firstH = host.querySelector('.page h1, .page h2');
        if (firstH && firstH.textContent.trim() === String(fmPage.title).trim()) {
          firstH.style.display = 'none';
        }
      }
    }

    // Handle links: resolve relative-path links based on the current document's path on the server (relative to web root), render as a javascript method to open
    // (consistent with the file list's data-path access, can directly open files outside web root)
      // e.g. current document is ../../../../AI_learning/.../docs/architecture.zh.md, link [Chinese](architecture.zh.md)
    //     → onclick="openServerFile('../../../../AI_learning/.../docs/architecture.zh.md', 'architecture.zh.md')"
    host.querySelectorAll('a').forEach((ae) => {
      var ahref = ae.getAttribute('href');
      if (!ahref) return;
      // The markdown renderer may percent-encode the URL; decode it so the relative
      // path uses the real characters before resolving against the current document
      try { ahref = decodeURI(ahref); } catch (e) {}
      // anchor links keep as-is
      if (ahref.startsWith('#')) return;
      // strip query/fragment which are not part of the file path before resolving
      ahref = ahref.split(/[?#]/)[0];
      // absolute-protocol links (http/https/mailto etc.) keep as-is, add target=_blank
      if (/^(https?:|mailto:|tel:|ftp:|javascript:|data:)/i.test(ahref)) {
        ae.target = '_blank';
        return;
      }
      // relative-path links: resolve to a server-relative path based on the current document path, render as a javascript method to open
      var resolved = resolveDocRelativePath(ahref);
      if (resolved) {
        var fname = resolved.split('/').pop();
        ae.href = 'javascript:void(0);';
        ae.setAttribute('onclick', 'openServerFile(\'' + jsString(resolved) + '\', \'' + jsString(fname) + '\');return false;');
        ae.removeAttribute('target');
      } else {
        ae.target = '_blank';
      }
    });

    // return the rendered HTML string (for renderMarkdown to put into the preview iframe / html-text mode to show as text)
    return host.innerHTML;
  } catch (error) {
    console.error('渲染 Markdown 为 HTML 失败:', error);
    throw error;
  }
}

// Render markdown to the preview iframe (theme styles apply only inside the iframe)
function renderMarkdown(content) {
  const contentDiv = getActiveContentEl();
  try {
    const html = renderMarkdownHtml(content);
    contentDiv.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.id = 'mdPreviewFrame';
    frame.className = 'md-preview-frame';
    frame.srcdoc = buildMdFrameHtml(html, getMdTheme(), currentDocument ? currentDocument.path : '');
    contentDiv.appendChild(frame);
    // TOC is generated inside the iframe (see buildMdFrameHtml inline script), main window doesn't need to build it
  } catch (error) {
    console.error('加载 Markdown 失败:', error);
    contentDiv.innerHTML = `
      <div style="color:red; padding: 2rem;">
        <strong>❌ 加载失败</strong>
        <p>无法加载 Markdown 文档: ${error.message}</p>
      </div>
    `;
  }
}

function handle_md_content_style_enh(oneDiv, content) {
  if (!content || !oneDiv) return content;

  var bi = content.indexOf('<!-- swmdtool-page-custom-style -->');
  if (bi < 0) bi = 0;
  bi = content.indexOf('<style>', bi);
  if (bi < 0) return content;
  var ei = content.indexOf('</style>', bi);
  if (ei < bi) return content;

  var page;
  if (oneDiv.id) page = '#' + oneDiv.id;
  if ((!page || page.length <= 1) && oneDiv.className) {
    var clist = oneDiv.className.split(' ');
    if (typeof clist === 'string') clist = [clist];
    page = '.' + clist[0];
  }
  if (page && page.length > 1) {
    return content.substring(0, bi) + content.substring(bi, ei).replace(/\.page /gs, page + ' ') + content.substring(ei);
  }
  return content;
}

function copyToClipboard(textToCopy, fElem) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(textToCopy);
  } else {
    let textArea = document.createElement('textarea');
    textArea.value = textToCopy;
    textArea.style.position = 'absolute';
    textArea.style.opacity = 0;
    textArea.style.readOnly = true;
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    if (fElem) {
      fElem.appendChild(textArea);
      textArea.style.left = fElem.offsetLeft + 'px';
      textArea.style.top = fElem.offsetTop + 'px';
    } else {
      document.body.appendChild(textArea);
    }
    textArea.focus();
    textArea.select();
    return new Promise((res, rej) => {
      document.execCommand('copy') ? res() : rej();
      textArea.remove();
    });
  }
}

// Add action buttons to code blocks (copy + line numbers)
function addCodeActionButtons() {
  const codeBlocks = document.querySelectorAll('#documentContent pre');

  codeBlocks.forEach(pre => {
    if (pre.querySelector('.code-actions')) return;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'code-actions';

    // copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-action-btn codecp-action-btn';
    copyBtn.title = '复制';
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `;

    copyBtn.addEventListener('click', async function(e) {
      e.stopPropagation();
      const code = pre.querySelector('code');
      if (!code) return;
      const textToCopy = code.textContent;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(textToCopy);
        } else {
          await copyToClipboard(textToCopy, copyBtn);
        }
        copyBtn.classList.add('copied');
        copyBtn.title = '已复制';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.title = '复制';
        }, 5000);
      } catch (err) {
        console.error('复制失败:', err);
      }
    });

    // line-number button (meaningless for overlong single-line wrap mode, don't add)
    if (!pre.classList.contains('wrap-long-lines')) {
      const lineNumBtn = document.createElement('button');
      lineNumBtn.className = 'code-action-btn codeln-action-btn';
      lineNumBtn.title = '行号';
      lineNumBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="2.5" cy="1" r="1.5"></circle>
          <circle cx="2.5" cy="7" r="1.5"></circle>
          <circle cx="2.5" cy="13" r="1.5"></circle>
          <circle cx="2.5" cy="19" r="1.5"></circle>
          <line x1="8" y1="-1" x2="8" y2="21" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"></line>
          <line x1="12.5" y1="1" x2="21" y2="1" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
          <line x1="12.5" y1="7" x2="21" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
          <line x1="12.5" y1="13" x2="21" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
          <line x1="12.5" y1="19" x2="21" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
        </svg>
      `;

      lineNumBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        pre.classList.toggle('show-line-numbers');
        lineNumBtn.classList.toggle('active');

        if (lineNumBtn.classList.contains('active')) {
          pre.querySelectorAll('.hljs-ln-numbers').forEach((lne) => { lne.style.display = 'block'; });
        } else {
          pre.querySelectorAll('.hljs-ln-numbers').forEach((lne) => { lne.style.display = 'none'; });
        }
      });

      actionsDiv.appendChild(lineNumBtn);
    }

    actionsDiv.appendChild(copyBtn);
    pre.appendChild(actionsDiv);
  });
}

// filename/path -> hljs highlight language (provided by DOC_TYPE_DEFS's lang; returns null to auto-detect)
function hljsLang(name) {
  const def = findDocDef(getFileExt(name));
  return def && def.lang ? def.lang : null;
}

// single-line length over this threshold is treated as an overlong single line (minified code etc.): visually wrap, no line numbers
const OVERLONG_LINE_LIMIT = 100000;

// whether there's an overlong single line (O(n) scan, doesn't split the whole string by line)
function hasOverlongLine(content) {
  const s = content || '';
  let start = 0;
  let idx;
  while ((idx = s.indexOf('\n', start)) !== -1) {
    if (idx - start > OVERLONG_LINE_LIMIT) return true;
    start = idx + 1;
  }
  return s.length - start > OVERLONG_LINE_LIMIT;
}

// Render text/code files (refer to docreader's renderTextFile: hljs highlight + line numbers + copy button)
// langOverride optional: force a specified hljs language (e.g. pass 'xml' when showing HTML source in html-text mode)
function renderTextFile(content, type, langOverride) {
  const contentDiv = getActiveContentEl();
  const lang = langOverride || hljsLang(currentDocument ? currentDocument.name : (type || ''));
  // Overlong single line (minified code etc.): visually wrap; line numbers are meaningless and a single line's huge inline box layout would freeze the preview
  const wrapLongLines = hasOverlongLine(content);
  let code;
  try {
    const highlighted = lang
      ? hljs.highlight(content, { language: lang, ignoreIllegals: true }).value
      : hljs.highlightAuto(content).value;
    code = '<code class="hljs">' + highlighted + '</code>';
  } catch (e) {
    code = '<code>' + escapeHtml(content) + '</code>';
  }
  contentDiv.innerHTML = '<pre id="file-pre"' + (wrapLongLines ? ' class="wrap-long-lines"' : '') + '>' + code + '</pre>';

  // Generate the line-number structure (hidden by default, shown when clicking the code block's "line number" button); skip in overlong-single-line mode
  try {
    if (typeof hljs_ln === 'function' && !wrapLongLines) {
      const codeEl = document.getElementById('file-pre').querySelector('code');
      if (codeEl) {
        hljs_ln().addlineNumbersBlock(codeEl);
        contentDiv.querySelectorAll('.hljs-ln-numbers').forEach((lne) => {
          lne.style.display = 'none';
        });
      }
    }
  } catch (e) {
    console.error('生成行号失败:', e);
  }

  // copy + line-number action buttons
  addCodeActionButtons();
}

let currentRenderData = null; // cache current document data, used by render-mode switch tabs

function renderDocumentContent(data, type) {
  const contentDiv = getActiveContentEl();
  const tocToggleBtn = document.getElementById('tocToggleBtn');
  currentRenderData = data;
  
  tocToggleBtn.textContent = '📑';
  hideRenderModeTabs(); // hide render-mode switch tabs by default; markdown/html branches show on demand
  
  switch (type) {
    case 'markdown':
      // render mode switch tabs: markdown(default) / text / html-text
      setupRenderModeTabs(['markdown', 'text', 'html-text'], 'markdown');
      renderMarkdown(data.rawContent || data.content);
      // TOC is built by renderMarkdown after iframe load (buildToc/setupTocScrollHighlight)
      tocToggleBtn.classList.remove('hidden');
      break;
    case 'text':
    case 'log':
    case 'python':
    case 'php':
    case 'c':
    case 'cheader':
    case 'cpp':
    case 'java':
    case 'cmd':
    case 'bat':
    case 'ini':
    case 'shell':
    case 'rust':
    case 'toml':
    case 'xml':
    case 'yaml':
    case 'json':
    case 'js':
    case 'css':
    case 'csv':
    case 'ts':
    case 'jsx':
    case 'cs':
    case 'go':
    case 'rb':
    case 'ps1':
    case 'sql':
    case 'swift':
    case 'kt':
    case 'scala':
    case 'lua':
    case 'pl':
    case 'r':
    case 'vue':
    case 'scss':
    case 'less':
    case 'conf':
    case 'properties':
    case 'gradle':
    case 'env':
    case 'gitignore':
    case 'editorconfig':
      // client-side rendering: hljs highlight + line numbers + copy button (refer to docreader's renderTextFile)
      renderTextFile(data.rawContent || data.content, type);
      tocToggleBtn.classList.add('hidden');
      break;
    case 'html':
      // render mode switch tabs: html(default) / text
      setupRenderModeTabs(['html', 'text'], 'html');
      renderHtmlContent(data.content);
      tocToggleBtn.classList.add('hidden');
      break;
    case 'pdf':
      // PDF always rendered via pdf.js, each page rendered to canvas (see renderPdfViewer)
      renderPdfViewer(data, currentDocument);
      tocToggleBtn.classList.add('hidden');
      break;
    case 'svg-html':
      // SVG rendered as an image: use the /fs/ path to display the raw file directly (refer to docreader's image handling)
      contentDiv.innerHTML =
        '<div class="img-viewer">' +
        '  <div class="img-main-row">' +
        '    <div class="img-viewport" id="img-viewport">' +
        '      <img id="img-main" src="/fs/' + encodeURIComponent(data.serverRelPath) + '" alt="SVG预览" draggable="false">' +
        '    </div>' +
        '  </div>' +
        '</div>';
      tocToggleBtn.classList.add('hidden');
      initImageViewer();
      break;
    case 'picture':
      // Image previewer (refer to docreader's img-viewer): zoom + thumbnail nav + mouse-drag to view parts
      contentDiv.innerHTML =
        '<div class="img-viewer">' +
        '  <div class="img-toolbar">' +
        '    <button class="img-btn" onclick="imgZoom(-1)" title="缩小">−</button>' +
        '    <span class="img-zoom-pct" id="img-zoom-pct">100%</span>' +
        '    <button class="img-btn" onclick="imgZoom(1)" title="放大">+</button>' +
        '    <span class="img-toolbar-sep"></span>' +
        '    <button class="img-btn" id="img-nav-toggle" onclick="toggleImgNav()" title="显示/隐藏缩略导航图">🗺 导航</button>' +
        '    <span class="img-toolbar-hint">滚轮缩放 · 拖动查看不同部分</span>' +
        '  </div>' +
        '  <div class="img-main-row">' +
        '    <div class="img-nav hidden" id="img-nav">' +
        '      <div class="img-nav-wrap" id="img-nav-wrap"><canvas id="img-nav-canvas"></canvas><div class="img-nav-rect" id="img-nav-rect"></div></div>' +
        '      <div class="img-nav-info">拖动主图查看不同部分; 点击缩略图可跳转显示区域</div>' +
        '    </div>' +
        '    <div class="img-viewport" id="img-viewport">' +
        '      <img id="img-main" src="' + data.content + '" alt="图片预览" draggable="false">' +
        '    </div>' +
        '  </div>' +
        '</div>';
      tocToggleBtn.classList.add('hidden');
      initImageViewer();
      break;
    default:
      // Unsupported document type (unknown extension): prompt unsupported preview, and provide a button to open with the system external program
      renderUnsupportedDoc(currentDocument || (data.absPath ? { path: data.absPath } : null));
      tocToggleBtn.classList.add('hidden');
  }
}

// ===== Unsupported document type: prompt + open-with-system-external-program button =====
function renderUnsupportedDoc(doc) {
  const contentDiv = getActiveContentEl();
  const filePath = doc && doc.path ? doc.path : '';
  contentDiv.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:flex-start; height:100%; gap:14px; text-align:center; padding-top:3rem; box-sizing:border-box;">
      <div style="font-size:48px; line-height:1;">📄</div>
      <div style="font-size:20px; font-weight:600; color:#333;">不支持该文档预览</div>
      <div style="color:#888; max-width:420px;">当前文档类型无法在应用内预览，可使用系统默认程序打开。</div>
      <button class="btn btn-primary" onclick="openFileWithSystemApp('${jsString(filePath)}')">用系统程序打开</button>
    </div>
  `;
}

// ===== PDF blank-render risk: preview area first shows explanation + "continue" button, after click the server converts then displays =====
function renderPdfRiskGate(data, doc) {
  const contentDiv = getActiveContentEl();
  const filePath = (doc && doc.path) ? doc.path : (data.absPath || '');
  const name = (doc && doc.name) ? doc.name : '';
  const type = (doc && doc.type) ? doc.type : (data.type || 'pdf');
  contentDiv.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:14px; text-align:center; padding:2rem; box-sizing:border-box;">
      <div style="font-size:48px; line-height:1;">📄</div>
      <div style="font-size:20px; font-weight:600; color:#333;">PDF 预览兼容性提示</div>
      <div style="color:#888; max-width:460px;">
        该 PDF 由 Typst 等工具生成，内置预览器可能将其渲染为空白（系统 PDF 软件可正常打开）。<br>
        点击下方按钮，服务端将用转换工具重写为兼容版本后再显示。
      </div>
      <button class="btn btn-primary" onclick="continueConvertPdf('${jsString(filePath)}', '${jsString(name)}', '${jsString(type)}')">继续预览（转换后显示）</button>
    </div>
  `;
}

// After clicking "continue preview": request the server to convert the PDF with pdftocairo, return the compatible version then render preview
async function continueConvertPdf(filePath, name, type) {
  const contentDiv = getActiveContentEl();
  contentDiv.innerHTML = '<div style="text-align:center; padding: 2rem;">正在转换 PDF，请稍候...</div>';
  try {
    const response = await fetch(`${API_BASE}/pdf/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath })
    });
    const data = await response.json();
    if (data.error) {
      contentDiv.innerHTML = `<div style="color:red; padding: 2rem;">${escapeHtml(data.error)}</div>`;
      return;
    }
    const doc = { name, path: data.absPath || filePath, type: data.type || type || 'pdf' };
    currentDocument = doc;
    updateEditorBtnState();
    currentServerPath = data.serverRelPath || '';
    renderDocumentContent(data, doc.type);
    updateFolderParentLink();
  } catch (error) {
    contentDiv.innerHTML = '<div style="color:red; padding: 2rem;">' + t('PDF 转换失败: {0}', escapeHtml(error.message)) + '</div>';
  }
}

// ===== pdf.js pixel sampling: truly detect whether the PDF render is blank (supplement to server-side heuristic detection) =====
// Principle: the Chromium built-in PDF viewer inside the iframe cannot be probed by the page (cross-origin),
// so in the background, render page 1 to a canvas via pdf.js and sample pixels; if almost all white, it means
// the PDF renders blank in the current viewer engine, switch to the compatibility hint gate for the user to confirm conversion.
let pdfjsLibPromise = null;
function loadPdfjsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('/pdfjs/pdf.min.mjs').then(mod => {
      mod.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      return mod;
    }).catch(e => { pdfjsLibPromise = null; throw e; });
  }
  return pdfjsLibPromise;
}

// ===== PDF preview: Electron has no built-in PDF viewer, so render each page to canvas via pdf.js =====
// Pages inside the viewport plus a buffer are lazily rendered asynchronously; when scrolled out of view, clear the canvas to free memory; zoom rebuilds sizes.
let pdfViewer = null;   // { pdf, scale, pct, pageCount, pageHeights[], pageOffsets[], rendering[], fitScale }
const PDF_PAGE_GAP = 14;

function pdfContentWidth() {
  const pagesEl = document.getElementById('pdf-pages');
  const pad = PDF_PAGE_GAP * 2;
  const avail = (pagesEl && pagesEl.clientWidth > 0) ? pagesEl.clientWidth - pad : 800;
  return Math.max(200, Math.min(avail, 1200));
}

async function renderPdfViewer(data, doc, initialScrollTop) {
  const contentDiv = getActiveContentEl();
  contentDiv.innerHTML = `
    <div class="pdf-viewer">
      <div class="pdf-toolbar">
        <button type="button" class="pdf-btn" id="pdfPrevPage" title="上一页" onclick="pdfTurnPage(-1)">◀</button>
        <label id="pdfPageLabel">1 / –</label>
        <button type="button" class="pdf-btn" id="pdfNextPage" title="下一页" onclick="pdfTurnPage(1)">▶</button>
        <span style="flex:1"></span>
        <button type="button" class="pdf-btn" id="pdfZoomOut" title="缩小" onclick="pdfZoom(-20)">−</button>
        <label id="pdfZoomLabel">100%</label>
        <button type="button" class="pdf-btn" id="pdfZoomIn" title="放大" onclick="pdfZoom(20)">+</button>
        <label class="pdf-hint">滚轮滚动查看各页 · 按钮翻页 · 缩放自适应宽度</label>
      </div>
      <div class="pdf-pages" id="pdf-pages"></div>
    </div>`;
  const pagesEl = document.getElementById('pdf-pages');
  pdfViewer = null;
  try {
    const pdfjs = await loadPdfjsLib();
    const bytes = dataUrlToUint8Array(data.content);
    if (!bytes) throw new Error('PDF 数据无效');
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    if (!pdf || !pdf.numPages) throw new Error('PDF 页数为 0');
    pdfViewer = { pdf, scale: 1, pct: 100, pageCount: pdf.numPages, pageHeights: [], pageOffsets: [], rendering: [] };
    await buildPdfPages();
    pagesEl.addEventListener('scroll', pdfRefreshVisible, { passive: true });
    // After rebuild (e.g. main page snapshot restore) put the scroll position back into the inner scroll container
    if (initialScrollTop) pagesEl.scrollTop = initialScrollTop;
    pdfRefreshVisible();
  } catch (e) {
    console.warn('PDF 渲染失败:', e && e.message || e);
    renderPdfRiskGate(data, doc);
  }
}

async function buildPdfPages() {
  const pagesEl = document.getElementById('pdf-pages');
  const s = pdfViewer;
  if (!pagesEl || !s) return;
  const p1 = await s.pdf.getPage(1);
  const fitScale = pdfContentWidth() / p1.getViewport({ scale: 1 }).width;
  s.fitScale = fitScale;
  s.scale = fitScale * (s.pct / 100);
  pagesEl.innerHTML = '';
  s.pageHeights = [];
  s.rendering = [];
  for (let i = 1; i <= s.pageCount; i++) {
    const page = await s.pdf.getPage(i);
    const vp = page.getViewport({ scale: s.scale });
    const wrap = document.createElement('div');
    wrap.className = 'pdf-page';
    wrap.style.width = Math.floor(vp.width) + 'px';
    wrap.style.height = Math.floor(vp.height) + 'px';
    const canvas = document.createElement('canvas');
    canvas.style.width = vp.width + 'px';
    canvas.style.height = vp.height + 'px';
    wrap.appendChild(canvas);
    pagesEl.appendChild(wrap);
    s.pageHeights.push(Math.floor(vp.height));
  }
  const label = document.getElementById('pdfPageLabel');
  if (label) label.textContent = '1 / ' + s.pageCount;
  pdfRefreshVisible();
}

function pdfTurnPage(dir) {
  const pagesEl = document.getElementById('pdf-pages');
  const s = pdfViewer;
  if (!pagesEl || !s || !s.pageOffsets.length) return;
  const label = document.getElementById('pdfPageLabel');
  const cur = label ? (parseInt(label.textContent, 10) || 1) : 1;
  const target = Math.max(1, Math.min(s.pageCount, cur + dir));
  const top = s.pageOffsets[target - 1];
  if (typeof top === 'number') pagesEl.scrollTo({ top, behavior: 'smooth' });
}

function pdfZoom(delta) {
  const s = pdfViewer;
  if (!s) return;
  s.pct = Math.max(50, Math.min(300, s.pct + delta));
  const zl = document.getElementById('pdfZoomLabel');
  if (zl) zl.textContent = s.pct + '%';
  buildPdfPages().catch(e => console.warn('PDF 缩放重建失败:', e && e.message || e));
}

function pdfRefreshVisible() {
  const pagesEl = document.getElementById('pdf-pages');
  const s = pdfViewer;
  if (!pagesEl || !s || !s.pageHeights.length) return;
  const scrollTop = pagesEl.scrollTop;
  const ph = pagesEl.clientHeight || 400;
  // Compute each page's start offset + total height
  let acc = 0;
  const offs = [];
  let cur = 1;
  for (let i = 0; i < s.pageHeights.length; i++) {
    offs.push(acc);
    if (acc <= scrollTop + ph * 0.2) cur = i + 1;
    acc += s.pageHeights[i] + PDF_PAGE_GAP;
  }
  s.pageOffsets = offs;
  const label = document.getElementById('pdfPageLabel');
  if (label) label.textContent = cur + ' / ' + s.pageCount;
  const avgH = acc / s.pageCount;
  const bufferPx = Math.floor(avgH * 3) || 900;
  const viewTop = scrollTop - bufferPx;
  const viewBottom = scrollTop + ph + bufferPx;
  for (let i = 0; i < s.pageCount; i++) {
    const pTop = offs[i];
    if (pTop + s.pageHeights[i] >= viewTop && pTop <= viewBottom) renderPdfPage(i);
    else clearPdfPage(i);
  }
}

function renderPdfPage(i) {
  const s = pdfViewer;
  const pagesEl = document.getElementById('pdf-pages');
  if (!s || !pagesEl || !pagesEl.children[i]) return;
  if (s.rendering[i]) return;
  s.rendering[i] = true;
  const canvas = pagesEl.children[i].querySelector('canvas');
  canvas.width = 0; canvas.height = 0;
  s.pdf.getPage(i + 1).then(page => {
    if (pdfViewer !== s) return;
    const vp = page.getViewport({ scale: s.scale });
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return page.render({ canvasContext: ctx, viewport: vp }).promise;
  }).then(() => {
    if (pdfViewer !== s) return;
    s.rendering[i] = false;
  }).catch(e => {
    if (pdfViewer !== s) return;
    s.rendering[i] = false;
    console.warn('PDF 第 ' + (i + 1) + ' 页渲染失败:', e && e.message || e);
  });
}

function clearPdfPage(i) {
  const pagesEl = document.getElementById('pdf-pages');
  if (!pagesEl || !pagesEl.children[i]) return;
  const canvas = pagesEl.children[i].querySelector('canvas');
  if (canvas && (canvas.width || canvas.height)) { canvas.width = 0; canvas.height = 0; }
}

// Convert a data URL form of PDF to Uint8Array for pdf.js loading
function dataUrlToUint8Array(dataUrl) {
  const m = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!m) return null;
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Render page 1 to a canvas, count the non-white pixel ratio; return true if almost all white (suspected blank render)
async function pdfFirstPageBlankRatio(dataUrl) {
  const pdfjs = await loadPdfjsLib();
  const bytes = dataUrlToUint8Array(dataUrl);
  if (!bytes) return 0;
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    if (pdf.numPages < 1) return 0;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonWhite = 0;
    for (let i = 0; i < img.length; i += 4) {
      // Any channel clearly below 255 (including anti-aliasing gray edges) is treated as having content
      if (img[i] < 245 || img[i+1] < 245 || img[i+2] < 245) nonWhite++;
    }
    return nonWhite / (canvas.width * canvas.height);
  } finally {
    try { pdf.destroy(); } catch (_) {}
  }
}

// Background verification: PDF already shown via iframe, but pdf.js renders page 1 almost all white -> switch to compatibility hint gate
async function verifyPdfRendersBlank(data, doc) {
  try {
    const ratio = await pdfFirstPageBlankRatio(data.content);
    // Blank threshold: non-white pixel ratio below 0.1% (normal pages are usually far above this)
    if (ratio < 0.001) {
      // Before switching, verify the preview area still shows this PDF (avoid wrongly overwriting after the user switched documents)
      const contentDiv = getActiveContentEl();
      const iframe = contentDiv && contentDiv.querySelector('iframe');
      if (iframe && iframe.src === data.content) {
        renderPdfRiskGate(data, doc);
      }
    }
  } catch (e) {
    // On detection failure (e.g. pdf.js load/render error) don't disturb the user; keep the iframe as-is
    console.warn('PDF 空白像素检测失败:', e && e.message || e);
  }
}

// ===== Files over 100MB: preview area first shows file-size hint + "continue" button =====
function renderOversizedGate(data, doc) {
  const contentDiv = getActiveContentEl();
  const sizeText = formatSize(data.size);
  const filePath = doc && doc.path ? doc.path : '';
  const name = doc && doc.name ? doc.name : '';
  const type = doc && doc.type ? doc.type : (data.type || '');
  contentDiv.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:14px; text-align:center; padding:2rem; box-sizing:border-box;">
      <div style="font-size:48px; line-height:1;">⚠️</div>
      <div style="font-size:20px; font-weight:600; color:#333;">文件较大</div>
      <div style="color:#888; max-width:460px;">
        文件大小: <strong>${sizeText}</strong>，超出 100MB，继续打开预览可能需要较长时间。
      </div>
      <button class="btn btn-primary" onclick="continueOpenOversized('${jsString(filePath)}', '${jsString(name)}', '${jsString(type)}')">继续打开</button>
    </div>
  `;
}

// After clicking "continue open": re-fetch the file content with force=1 and render preview
async function continueOpenOversized(filePath, name, type) {
  const contentDiv = getActiveContentEl();
  contentDiv.innerHTML = '<div style="text-align:center; padding: 2rem;">加载中...</div>';
  try {
    const response = await fetch(`${API_BASE}/document/content?filePath=${encodeURIComponent(filePath)}&force=1`);
    const data = await response.json();
    if (data.error) {
      contentDiv.innerHTML = `<div style="color:red; padding: 2rem;">${escapeHtml(data.error)}</div>`;
      return;
    }
    if (data.oversized) {
      // Defensive handling (with force=1 the server no longer returns oversized)
      renderOversizedGate(data, { path: filePath, name, type: data.type || type });
      return;
    }
    const doc = { name, path: data.absPath || filePath, type: data.type || type };
    currentDocument = doc;
    updateEditorBtnState();
    currentServerPath = data.serverRelPath || '';
    renderDocumentContent(data, doc.type);
    updateFolderParentLink();
  } catch (error) {
    contentDiv.innerHTML = '<div style="color:red; padding: 2rem;">' + t('加载文档失败: {0}', error.message) + '</div>';
  }
}

// Pop up the system "Open with" dialog to open the current document: don't specify a program, let the system list available programs,
// the user picks the program to open with (Electron goes through main process rundll32 OpenAs_RunDLL; browser falls back to server endpoint)
async function openWithSystemApp() {
  if (!currentDocument || !currentDocument.path) {
    alert(t('当前没有可打开的文档'));
    return;
  }
  const filePath = currentDocument.path;
  // Folders have no "open with" concept: open directly with the system default (explorer shows folder contents)
  if (currentDocument.type === 'folder') {
    openFileWithSystemApp(filePath);
    return;
  }
  try {
    if (window.electronAPI && window.electronAPI.openWithDialog) {
      const result = await window.electronAPI.openWithDialog(filePath);
      if (result && !result.success) {
        alert(t('无法弹出打开方式对话框: {0}', result.error || t('未知错误')));
      }
    } else {
      const response = await fetch(`${API_BASE}/open-with-dialog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
      const data = await response.json();
      if (!data || !data.success) {
        alert(t('无法弹出打开方式对话框: {0}', (data && data.error) || ('HTTP ' + response.status)));
      }
    }
  } catch (error) {
    console.error('打开方式对话框失败:', error);
    alert(t('打开失败: {0}', error.message));
  }
}

// Open a file with the system default program (Electron goes through main process shell.openPath; browser falls back to server endpoint)
async function openFileWithSystemApp(filePath) {
  if (!filePath) return;
  try {
    if (window.electronAPI && window.electronAPI.openExternalFile) {
      const result = await window.electronAPI.openExternalFile(filePath);
      if (result && !result.success) {
        alert(t('无法用系统程序打开文件: {0}', result.error || t('未知错误')));
      }
    } else {
      const response = await fetch(`${API_BASE}/open-external`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
      const data = await response.json();
      if (!data || !data.success) {
        alert(t('无法用系统程序打开文件: {0}', (data && data.error) || ('HTTP ' + response.status)));
      }
    }
  } catch (error) {
    console.error('打开文件失败:', error);
    alert(t('打开文件失败: {0}', error.message));
  }
}

// ===== Render mode switch tabs (markdown/text, html/text) =====
// Show the render mode switch tabs: modes is an array of tab names, active is the currently active tab name
// Each button has a title tooltip (bilingual zh/en, follows UI language): explains the current render mode
const RENDER_MODE_TITLES = {
  markdown: '渲染方式：Markdown 渲染',
  text: '渲染方式：纯文本（语法高亮）',
  'html-text': '渲染方式：Markdown 转 HTML 源码',
  html: '渲染方式：HTML 渲染'
};
function setupRenderModeTabs(modes, active) {
  const tabs = document.getElementById('renderModeTabs');
  if (!tabs) return;
  tabs.classList.remove('hidden');
  tabs.innerHTML = modes.map(m =>
    `<button type="button" class="render-mode-tab${m === active ? ' active' : ''}" title="${t(RENDER_MODE_TITLES[m] || m)}" onclick="switchRenderMode('${m}')">${m}</button>`
  ).join('');
}

function hideRenderModeTabs() {
  const tabs = document.getElementById('renderModeTabs');
  if (tabs) tabs.classList.add('hidden');
}

// Click a render mode tab: re-render by current document type and selected mode (using cached currentRenderData)
function switchRenderMode(mode) {
  const tabs = document.getElementById('renderModeTabs');
  if (tabs) {
    tabs.querySelectorAll('.render-mode-tab').forEach(t =>
      t.classList.toggle('active', t.textContent === mode));
  }
  const data = currentRenderData;
  if (!data) return;
  const tocToggleBtn = document.getElementById('tocToggleBtn');
  const docType = data.type || (currentDocument ? currentDocument.type : '');
  const raw = data.rawContent || data.content;
  if (docType === 'html') {
    if (mode === 'html') {
      renderHtmlContent(data.content);
    } else {
      renderTextFile(raw, 'html');
    }
    tocToggleBtn.classList.add('hidden');
    return;
  }
  // markdown document
  if (mode === 'markdown') {
    renderMarkdown(raw);
    tocToggleBtn.classList.remove('hidden');
  } else if (mode === 'html-text') {
    // Show the markdown-rendered HTML content as text format (highlighted)
    renderTextFile(renderMarkdownHtml(raw), 'html', 'xml');
    tocToggleBtn.classList.add('hidden');
  } else {
    renderTextFile(raw, 'markdown');
    tocToggleBtn.classList.add('hidden');
  }
}

// Render html content to the preview iframe (external http/https links open via <a target="_blank">, plus Ctrl+F find support)
function renderHtmlContent(content) {
  const contentDiv = getActiveContentEl();
  const htmlWithInterceptor = `
    <!DOCTYPE html>
    <html>
    <head>
      <script>
  // http/https 链接是互联网资源：给它们加上 target="_blank"，让浏览器/Electron 默认行为直接打开
  // （纯浏览器模式新开标签页；Electron 下主进程 setWindowOpenHandler 转到系统默认浏览器），不再走服务端
        document.addEventListener('DOMContentLoaded', function() {
          document.querySelectorAll('a[href]').forEach(function(a) {
            var href = a.getAttribute('href') || '';
            if (href.indexOf('http://') === 0 || href.indexOf('https://') === 0) {
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
            }
          });
        });
  // Ctrl+F opens the main window find bar (key presses inside the iframe don't bubble to the main window)
        document.addEventListener('keydown', function(e) {
          if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
            e.preventDefault();
            if (window.parent.showFindBar) window.parent.showFindBar();
          }
        });
      <\/script>
    </head>
    <body>
      ${content}
    </body>
    </html>
  `;
  const blob = new Blob([htmlWithInterceptor], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(blob);
  contentDiv.innerHTML = `<iframe id="htmlPreviewFrame" src="${blobUrl}" style="width:100%; height:100%; border:none;"></iframe>`;
}

// ===== Image viewer (zoom/drag/thumbnail nav, refer to docreader's img-viewer) =====
let imgState = null;       // {img, vp, zoom, minZoom, nw, nh, tx, ty}
let imgDrag = null;        // drag state {sx, sy, tx, ty}

function initImageViewer() {
  const img = document.getElementById('img-main');
  const vp = document.getElementById('img-viewport');
  if (!img || !vp) return;
  imgState = {
    img: img, vp: vp,
    zoom: 1, minZoom: 0.02, nw: 1, nh: 1, tx: 0, ty: 0,
  };
  img.onload = function () {
    imgState.nw = img.naturalWidth || imgState.nw;
    imgState.nh = img.naturalHeight || imgState.nh;
    imgState.minZoom = Math.min(
      vp.clientWidth / imgState.nw,
      vp.clientHeight / imgState.nh,
      1
    );
    imgState.zoom = imgState.minZoom;
    centerImg();
    applyImgTransform();
    drawImgNav();
  };
  if (img.complete && img.naturalWidth > 0) {
    imgState.nw = img.naturalWidth;
    imgState.nh = img.naturalHeight;
    imgState.minZoom = Math.min(
      vp.clientWidth / imgState.nw,
      vp.clientHeight / imgState.nh,
      1
    );
    imgState.zoom = imgState.minZoom;
    centerImg();
    applyImgTransform();
    drawImgNav();
  }

  // drag to view different parts
  vp.addEventListener('mousedown', function (e) {
    if (!imgState) return;
    imgDrag = { sx: e.clientX, sy: e.clientY, tx: imgState.tx, ty: imgState.ty };
    vp.classList.add('dragging');
    e.preventDefault();
  });
  // wheel zoom
  vp.addEventListener('wheel', function (e) {
    if (!imgState) return;
    e.preventDefault();
    imgZoom(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  // thumbnail nav click -> jump to the displayed region
  const navWrap = document.getElementById('img-nav-wrap');
  if (navWrap) {
    navWrap.addEventListener('click', function (e) {
      if (!imgState) return;
      const canvas = document.getElementById('img-nav-canvas');
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const scale = canvas.width / imgState.nw;
      // target natural coordinates -> center the viewport on that point
      const nx = px / scale;
      const ny = py / scale;
      imgState.tx = imgState.vp.clientWidth / 2 - nx * imgState.zoom;
      imgState.ty = imgState.vp.clientHeight / 2 - ny * imgState.zoom;
      clampImg();
      applyImgTransform();
    });
  }
}

document.addEventListener('mousemove', function (e) {
  if (!imgDrag || !imgState) return;
  imgState.tx = imgDrag.tx + (e.clientX - imgDrag.sx);
  imgState.ty = imgDrag.ty + (e.clientY - imgDrag.sy);
  clampImg();
  applyImgTransform();
});
document.addEventListener('mouseup', function () {
  if (imgDrag && imgState) {
    imgState.vp.classList.remove('dragging');
  }
  imgDrag = null;
});

// Center: center the image when smaller than the viewport
function centerImg() {
  if (!imgState) return;
  const vw = imgState.vp.clientWidth, vh = imgState.vp.clientHeight;
  const dw = imgState.nw * imgState.zoom, dh = imgState.nh * imgState.zoom;
  imgState.tx = (vw - dw) / 2;
  imgState.ty = (vh - dh) / 2;
}

// Constrain pan range: no gaps allowed when the image is larger than the viewport
function clampImg() {
  if (!imgState) return;
  const vw = imgState.vp.clientWidth, vh = imgState.vp.clientHeight;
  const dw = imgState.nw * imgState.zoom, dh = imgState.nh * imgState.zoom;
  if (dw <= vw) {
    imgState.tx = (vw - dw) / 2;
  } else {
    imgState.tx = Math.min(0, Math.max(vw - dw, imgState.tx));
  }
  if (dh <= vh) {
    imgState.ty = (vh - dh) / 2;
  } else {
    imgState.ty = Math.min(0, Math.max(vh - dh, imgState.ty));
  }
}

// Zoom (anchored at viewport center)
function imgZoom(dir) {
  if (!imgState) return;
  const old = imgState.zoom;
  const factor = dir > 0 ? 1.25 : 0.8;
  let next = old * factor;
  next = Math.max(imgState.minZoom, Math.min(8, next));
  if (next === old) return;
  // keep the image point corresponding to the viewport center fixed
  const cx = imgState.vp.clientWidth / 2;
  const cy = imgState.vp.clientHeight / 2;
  const imgX = (cx - imgState.tx) / old;
  const imgY = (cy - imgState.ty) / old;
  imgState.zoom = next;
  imgState.tx = cx - imgX * next;
  imgState.ty = cy - imgY * next;
  clampImg();
  applyImgTransform();
}

// Apply zoom/pan transform and update the percentage
function applyImgTransform() {
  if (!imgState) return;
  const z = imgState.zoom;
  imgState.img.style.width = (imgState.nw * z) + 'px';
  imgState.img.style.height = (imgState.nh * z) + 'px';
  imgState.img.style.transform = 'translate(' + imgState.tx + 'px,' + imgState.ty + 'px)';
  const pct = document.getElementById('img-zoom-pct');
  if (pct) pct.textContent = Math.round(z * 100) + '%';
  drawImgNav();
}

// Draw the thumbnail nav: small image + current visible-area rectangle
function drawImgNav() {
  if (!imgState) return;
  const nav = document.getElementById('img-nav');
  if (!nav || nav.classList.contains('hidden')) return;
  const canvas = document.getElementById('img-nav-canvas');
  const rectBox = document.getElementById('img-nav-rect');
  if (!canvas || !rectBox) return;

  const NAV_W = 160;
  const scale = NAV_W / imgState.nw;
  const navH = Math.round(imgState.nh * scale);
  canvas.width = NAV_W;
  canvas.height = navH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, NAV_W, navH);
  try {
    ctx.drawImage(imgState.img, 0, 0, NAV_W, navH);
  } catch (e) { /* ignore when the image isn't fully loaded */ }

  // visible area (natural coordinates)
  const vw = imgState.vp.clientWidth, vh = imgState.vp.clientHeight;
  const vx = -imgState.tx / imgState.zoom;
  const vy = -imgState.ty / imgState.zoom;
  const vw2 = vw / imgState.zoom;
  const vh2 = vh / imgState.zoom;
  const rx = Math.max(0, vx) * scale;
  const ry = Math.max(0, vy) * scale;
  const rw = Math.min(vx + vw2, imgState.nw) * scale - rx;
  const rh = Math.min(vy + vh2, imgState.nh) * scale - ry;
  rectBox.style.left = rx + 'px';
  rectBox.style.top = ry + 'px';
  rectBox.style.width = rw + 'px';
  rectBox.style.height = rh + 'px';
}

// Show/hide the thumbnail nav
function toggleImgNav() {
  const nav = document.getElementById('img-nav');
  const btn = document.getElementById('img-nav-toggle');
  if (!nav || !btn) return;
  nav.classList.toggle('hidden');
  btn.classList.toggle('active');
  if (!nav.classList.contains('hidden')) {
    drawImgNav();
  }
}

// Re-adapt on window size change
window.addEventListener('resize', function () {
  if (!imgState) return;
  clampImg();
  applyImgTransform();
});

// Back button: find the previous document of the current one in history order and open preview (not added to history)
document.getElementById('backBtn').addEventListener('click', goBackHistory);

// Document list button: return to the library's file list display (shown in the main page tab)
document.getElementById('docListBtn').addEventListener('click', () => {
  hideMdHistory();
  if (activeTabId !== 'main') {
    saveActiveTab();
    activeTabId = 'main';
    activeViewId = 'view-main';
    viewActive['view-main'] = 'main';
    renderTabView();
  }
  document.getElementById('documentView').classList.add('hidden');
  document.getElementById('libraryView').classList.remove('hidden');
  updateNavBars(); // active page is the library list: show library control area, hide document nav area
});

document.getElementById('sidebarToggleBtn').addEventListener('click', () => {
  const sidebar = document.querySelector('.sidebar');
  const btn = document.getElementById('sidebarToggleBtn');
  sidebar.classList.toggle('hidden');
  btn.classList.toggle('active');
  btn.title = sidebar.classList.contains('hidden') ? '显示书库列表' : '隐藏书库列表';
});

// Fullscreen button state sync: icon button (.toolbar-btn inner svg, refer to docreader) toggles highlight and expand/collapse icons; text button updates text
function setFullscreenBtnState(btn, active) {
  if (!btn) return;
  const icon = btn.querySelector('svg');
  if (icon) {
    btn.classList.toggle('active', active);
    icon.innerHTML = active
      ? '<polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line>'
      : '<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line>';
  } else {
    btn.textContent = active ? '⛶ 退出全屏' : '⛶ 全屏';
  }
}

// Document content area fullscreen/exit fullscreen (shared by top toolbar button + library-header button)
function toggleContentFullscreen(btnId) {
  const mainArea = document.querySelector('.main-area');
  const btn = document.getElementById(btnId);
  if (!document.fullscreenElement) {
    mainArea.requestFullscreen().then(() => {
      setFullscreenBtnState(btn, true);
    }).catch(err => {
      console.log('无法进入全屏:', err);
    });
  } else {
    document.exitFullscreen().then(() => {
      setFullscreenBtnState(btn, false);
    });
  }
}

document.getElementById('topFullscreenBtn').addEventListener('click', () => toggleContentFullscreen('topFullscreenBtn'));
document.getElementById('contentFullscreenBtn').addEventListener('click', () => toggleContentFullscreen('contentFullscreenBtn'));

document.addEventListener('fullscreenchange', () => {
  const active = !!document.fullscreenElement;
  setFullscreenBtnState(document.getElementById('topFullscreenBtn'), active);
  setFullscreenBtnState(document.getElementById('contentFullscreenBtn'), active);
  // The fullscreen element is at the top layer; overlays that aren't its descendants (even with larger z-index) are covered,
  // so when entering fullscreen, move the context menu into the fullscreen container, and move it back to body when exiting
  const navMenu = document.getElementById('navContextMenu');
  const mainArea = document.getElementById('mainArea') || document.querySelector('.main-area');
  if (navMenu && mainArea) {
    hideNavContextMenu();
    if (active && navMenu.parentElement !== mainArea) mainArea.appendChild(navMenu);
    else if (!active && navMenu.parentElement !== document.body) document.body.appendChild(navMenu);
  }
});

document.getElementById('exportBtn').addEventListener('click', async () => {
  const response = await fetch(`${API_BASE}/export`, { method: 'POST' });
  const data = await response.json();
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `doc_library_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      
      const response = await fetch(`${API_BASE}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        await fetchLibraries();
        alert(t('导入成功！'));
      } else {
        const error = await response.json();
        alert(t(error.error));
      }
    } catch (error) {
      alert(t('导入失败：JSON格式不正确'));
    }
  };
  reader.readAsText(file);
});

let searchResults = [];
let selectedDocIds = new Set();

document.getElementById('searchBtn').addEventListener('click', () => {
  // Keep the last search condition and results, only reset the dialog position and sync the dropdown options
  resetSearchModalPosition();
  populateSearchConditionSelects();
  document.getElementById('selectAllDocs').checked =
    searchResults.length > 0 && selectedDocIds.size === searchResults.length;
  updateSelectedCount();
  renderSearchResults();
  showModal('searchModal');
});

  // Fill the search condition dropdowns: library name / document type / tag set (first item is "all")
function populateSearchConditionSelects() {
  // library name
  const libSelect = document.getElementById('searchLibrarySelect');
  if (libSelect) {
    libSelect.innerHTML = '<option value="">所有书库</option>';
    libraries.forEach(lib => {
      const opt = document.createElement('option');
      opt.value = lib.name;
      opt.textContent = lib.name;
      libSelect.appendChild(opt);
    });
  }

  // document type (dedupe and sort)
  const typeSelect = document.getElementById('searchDocTypeSelect');
  if (typeSelect) {
    const typeSet = new Set();
    libraries.forEach(lib => (lib.documents || []).forEach(d => typeSet.add(d.type)));
    typeSelect.innerHTML = '<option value="">所有类型</option>';
    Array.from(typeSet).sort((a, b) => a.localeCompare(b, 'zh-CN')).forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = getTypeName(type);
      typeSelect.appendChild(opt);
    });
  }

  // tag set (dedupe across all libraries)
  const tagSelect = document.getElementById('searchTagSelect');
  if (tagSelect) {
    const tagSet = new Set();
    libraries.forEach(lib => (lib.documents || []).forEach(d => (d.tags || []).forEach(t => tagSet.add(t))));
    tagSelect.innerHTML = '<option value="">所有标签</option>';
    Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN')).forEach(tag => {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = tag;
      tagSelect.appendChild(opt);
    });
  }
}

// After a dropdown selection, auto-fill the corresponding input box
function applySearchSelect(inputId, value) {
  const input = document.getElementById(inputId);
  if (input) input.value = value;
}

// ===== Search window: drag the title bar to move =====
let searchDragState = null;

// Reset the search window position (re-center when reopened)
function resetSearchModalPosition() {
  const content = document.querySelector('#searchModal .search-modal-content');
  if (!content) return;
  content.style.position = '';
  content.style.left = '';
  content.style.top = '';
  content.style.margin = '';
}

function initSearchModalDrag() {
  const modal = document.getElementById('searchModal');
  if (!modal) return;
  const header = modal.querySelector('.modal-header');
  const content = modal.querySelector('.search-modal-content');
  if (!header || !content) return;

  header.addEventListener('mousedown', (e) => {
    // close button doesn't trigger drag
    if (e.target.closest('.modal-close')) return;
    const rect = content.getBoundingClientRect();
    searchDragState = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top
    };
    // detach from flex centering, switch to fixed positioning for free movement
    content.style.position = 'fixed';
    content.style.left = rect.left + 'px';
    content.style.top = rect.top + 'px';
    content.style.margin = '0';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!searchDragState) return;
    const dx = e.clientX - searchDragState.startX;
    const dy = e.clientY - searchDragState.startY;
    content.style.left = Math.max(0, searchDragState.origLeft + dx) + 'px';
    content.style.top = Math.max(0, searchDragState.origTop + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    searchDragState = null;
  });
}

initSearchModalDrag();

// ===== Editor selection window: drag the title bar to move =====
let editorDragState = null;

// Reset the editor selection window position (re-center when reopened)
function resetEditorPickerModalPosition() {
  const content = document.querySelector('#editorPickerModal .editor-picker-modal');
  if (!content) return;
  content.style.position = '';
  content.style.left = '';
  content.style.top = '';
  content.style.margin = '';
}

function initEditorPickerModalDrag() {
  const modal = document.getElementById('editorPickerModal');
  if (!modal) return;
  const header = modal.querySelector('.modal-header');
  const content = modal.querySelector('.editor-picker-modal');
  if (!header || !content) return;

  header.addEventListener('mousedown', (e) => {
    // close button doesn't trigger drag
    if (e.target.closest('.modal-close')) return;
    const rect = content.getBoundingClientRect();
    editorDragState = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top
    };
    // detach from flex centering, switch to fixed positioning for free movement
    content.style.position = 'fixed';
    content.style.left = rect.left + 'px';
    content.style.top = rect.top + 'px';
    content.style.margin = '0';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!editorDragState) return;
    const dx = e.clientX - editorDragState.startX;
    const dy = e.clientY - editorDragState.startY;
    content.style.left = Math.max(0, editorDragState.origLeft + dx) + 'px';
    content.style.top = Math.max(0, editorDragState.origTop + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    editorDragState = null;
  });
}

initEditorPickerModalDrag();

function isEmptyCondition(value) {
  const trimmed = value.trim();
  return trimmed === '' || trimmed === '*' || trimmed.toLowerCase() === 'all' || trimmed === '所有';
}

function patternMatch(pattern, text) {
  if (isEmptyCondition(pattern)) {
    return true;
  }
  const regexPattern = pattern
    .trim()
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(regexPattern, 'i');
  return regex.test(text);
}

function performSearch() {
  const libraryPattern = document.getElementById('searchLibraryInput').value;
  const docNamePattern = document.getElementById('searchDocNameInput').value;
  const docTypePattern = document.getElementById('searchDocTypeInput').value;
  const tagPattern = document.getElementById('searchTagInput').value;
  
  const results = [];
  
  libraries.forEach(library => {
    if (!patternMatch(libraryPattern, library.name)) {
      return;
    }
    
    library.documents.forEach(doc => {
      if (patternMatch(docNamePattern, doc.name) && patternMatch(docTypePattern, doc.type)) {
        // Tag matching: if the tag condition is empty/all, skip; otherwise the document's tags must contain the tag (supports * wildcard)
        if (!isEmptyCondition(tagPattern)) {
          const docTags = doc.tags || [];
          const tagMatched = docTags.some(t => patternMatch(tagPattern, t));
          if (!tagMatched) return;
        }
        results.push({
          ...doc,
          libraryName: library.name,
          libraryId: library.id
        });
      }
    });
  });
  
  searchResults = results;
  selectedDocIds.clear();
  document.getElementById('selectAllDocs').checked = false;
  updateSelectedCount();
  renderSearchResults();
}

function renderSearchResults() {
  const list = document.getElementById('searchResults');
  list.innerHTML = '';
  
  if (searchResults.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>没有找到匹配的文档</p></div>';
    return;
  }
  
  // Document icons are uniformly provided by getTypeIcon (see DOC_TYPE_DEFS)
  
  searchResults.forEach(doc => {
    const item = document.createElement('div');
    item.className = `search-result-item ${selectedDocIds.has(doc.id) ? 'selected' : ''}`;
    item.dataset.id = doc.id;
    
    const isSelected = selectedDocIds.has(doc.id);
    
    item.innerHTML = `
      <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleDocSelect('${doc.id}')">
      <span class="search-doc-icon">${getTypeIcon(doc.type)}</span>
      <div class="search-doc-info">
        <h4>${doc.name}</h4>
        <p title="${doc.path}">${truncatePath(doc.path)}</p>
      </div>
      <div class="search-doc-meta">
        <span class="search-doc-type">${getTypeName(doc.type)}</span>
        <span class="search-doc-library">${doc.libraryName}</span>
      </div>
      <div class="search-doc-actions">
        <button class="search-action-btn search-view-btn" title="查看" onclick="viewSearchResult('${doc.id}','${doc.libraryId}')">👁️</button>
        <button class="search-action-btn search-edit-btn" title="属性编辑" onclick="editSearchResult('${doc.id}','${doc.libraryId}')">✏️</button>
        <button class="search-action-btn search-delete-btn" title="删除" onclick="deleteSearchResult('${doc.id}','${doc.libraryId}')">🗑️</button>
      </div>
    `;
    
    item.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT' && !e.target.closest('.search-doc-actions')) {
        const checkbox = item.querySelector('input[type="checkbox"]');
        checkbox.checked = !checkbox.checked;
        toggleDocSelect(doc.id);
      }
    });
    
    list.appendChild(item);
  });
}

// Find library (by id)
function findLibraryById(libId) {
  return libraries.find(l => l.id === libId);
}

// View: switch to the library the document belongs to and open its content (similar to clicking open in the document list)
function viewSearchResult(docId, libraryId) {
  const lib = findLibraryById(libraryId);
  const doc = lib && lib.documents.find(d => d.id === docId);
  if (!lib || !doc) {
    alert(t('文档或书库不存在'));
    return;
  }
  closeModal('searchModal');
  selectLibrary(lib);
  openDocument(doc);
}

// Property edit: switch to the library the document belongs to and pop up the edit dialog (similar to the document list edit button)
function editSearchResult(docId, libraryId) {
  const lib = findLibraryById(libraryId);
  if (!lib || !lib.documents.find(d => d.id === docId)) {
    alert(t('文档或书库不存在'));
    return;
  }
  closeModal('searchModal');
  selectLibrary(lib);
  editDocument(docId);
}

// Delete: switch to the library the document belongs to and go through the delete confirmation flow (similar to the document list delete button)
function deleteSearchResult(docId, libraryId) {
  const lib = findLibraryById(libraryId);
  if (!lib || !lib.documents.find(d => d.id === docId)) {
    alert(t('文档或书库不存在'));
    return;
  }
  closeModal('searchModal');
  selectLibrary(lib);
  deleteDocument(docId);
}

function toggleDocSelect(docId) {
  if (selectedDocIds.has(docId)) {
    selectedDocIds.delete(docId);
  } else {
    selectedDocIds.add(docId);
  }
  
  const item = document.querySelector(`.search-result-item[data-id="${docId}"]`);
  if (item) {
    item.classList.toggle('selected', selectedDocIds.has(docId));
  }
  
  document.getElementById('selectAllDocs').checked = 
    searchResults.length > 0 && selectedDocIds.size === searchResults.length;
  
  updateSelectedCount();
}

function toggleSelectAll() {
  const selectAll = document.getElementById('selectAllDocs').checked;
  
  if (selectAll) {
    searchResults.forEach(doc => {
      selectedDocIds.add(doc.id);
      const item = document.querySelector(`.search-result-item[data-id="${doc.id}"]`);
      if (item) {
        item.classList.add('selected');
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = true;
      }
    });
  } else {
    selectedDocIds.clear();
    document.querySelectorAll('.search-result-item').forEach(item => {
      item.classList.remove('selected');
      const checkbox = item.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = false;
    });
  }
  
  updateSelectedCount();
}

function updateSelectedCount() {
  document.getElementById('selectedCount').textContent = t('已选择: {0} 个文档', selectedDocIds.size);
}

function saveSelectedToLibrary() {
  if (selectedDocIds.size === 0) {
    alert(t('请先选择要保存的文档'));
    return;
  }
  
  document.getElementById('saveCountNum').textContent = selectedDocIds.size;
  document.getElementById('saveLibraryNameInput').value = '';
  showModal('saveToLibraryModal');
}

async function confirmSaveToLibrary() {
  const libraryName = document.getElementById('saveLibraryNameInput').value.trim();
  
  if (!libraryName) {
    alert(t('请输入书库名称'));
    return;
  }
  
  let library = libraries.find(l => l.name === libraryName);
  
  if (!library) {
    const response = await fetch(`${API_BASE}/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: libraryName })
    });
    
    if (!response.ok) {
      const error = await response.json();
      alert(t(error.error));
      return;
    }
    
    const newLibrary = await response.json();
    library = newLibrary;
  }
  
  const selectedDocs = searchResults.filter(doc => selectedDocIds.has(doc.id));
  
  for (const doc of selectedDocs) {
    const existingDoc = library.documents.find(d => d.path === doc.path);
    if (!existingDoc) {
      await fetch(`${API_BASE}/library/${library.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: doc.name, path: doc.path })
      });
    }
  }
  
  await fetchLibraries();
  
  closeModal('saveToLibraryModal');
  closeModal('searchModal');
  
  alert(t('成功保存 {0} 个文档到书库 "{1}"', selectedDocIds.size, libraryName));
}

initTabs();

fetchLibraries();

document.addEventListener('DOMContentLoaded', () => {
  const contentDiv = getActiveContentEl();
  if (contentDiv) {
    contentDiv.addEventListener('click', handleExternalLinkClick);
  }
});