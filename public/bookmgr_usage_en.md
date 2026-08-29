# 📚 Local Document Manager — User Guide

> An Electron-based local document management tool that centrally manages local books, documents, and various text files, with library categories, tag management, full-content preview, and keyword search. It manages the mapping between documents and their local paths, making it easy to classify, find, and open them.

---

## 1. Introduction

Local Document Manager is a desktop application (Electron) that lets you:

- **Centralized management**: organize scattered local documents into "libraries" by category, so you can easily find any document on your computer. When you have many documents, you no longer need to remember where each file is saved;
- **Direct preview**: Markdown, plain text, code, HTML, PDF, images and more, without opening other software;
- **Fast search**: keyword search inside document content with instant results;
- **Tag system**: tag documents, filter and search by tag; a document can have multiple tags;
- **Export/Import backup**: data is stored in the local `library.json`; you can **export/import backups** of all libraries to a single JSON file for later import.
- **Wide document type support**: it detects document types from file extensions — txt/md/Markdown/html/json/JavaScript js/CSS/Python py/Rust rs/other programming languages/PDF/Office documents (docx/xlsx/pptx)/web links/folders and more — and opens them with a click. It works like a browser bookmark manager, but is more powerful: instead of only web links, it manages most local documents.
- **Markdown document reader**: it renders Markdown documents beautifully and can serve as a Markdown reader, with Markdown syntax rendering, syntax highlighting, KaTeX formula rendering, mermaid diagram rendering, JSXGraph math figure rendering, etc.
- **Tabs & multi-view**: lock a previewed document as a **tab**; tabs can be drag-sorted, or **dragged to the right/bottom to form side-by-side views** to browse multiple documents at once; the toolbar (nav area) **right-click menu** can enable auto-hide for a larger reading area.

> Note: importing a new library clears all current library records; it is best to export a backup before importing.

> Note: the print preview feature is not supported inside the Electron application. A workaround is to open the app's backend service in a browser instead: click **Manage Library in Browser** in the Help menu to open the library UI in a browser, open the document you want to print, click the print button — the print dialog in a browser supports preview. (Alternatively, open the **Debug Log** menu item under the View menu, find the backend listen address in the log window, e.g. http://localhost:33453, select the text, press <kbd>Ctrl+C</kbd> to copy the URL, and open it in a browser to see the same library UI.) **Why**: Electron reuses the Chromium rendering engine but does not include Chrome's print-preview WebUI, so preview is unavailable; most browsers do support it.

---

## 2. Interface Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Top toolbar: show/hide library · fullscreen · search · export · import │
├──────────────┬───────────────────────────────────────────────┤
│              │ Toolbar (nav area): library controls / document nav │
│              │   (right-click toolbar → menu: auto-hide switch)     │
│  Library list │ Tab bar: Home Tab1 Tab2 …                 │
│  (left side)  ├───────────────────────┬───────────────────────┤
│              │  Main view            │ Sub view (right/bottom) │
│              │  doc list / preview   │ tab content (folders…)  │
└──────────────┴───────────────────────┴───────────────────────┘
```

- **Left library list**: shows all libraries; drag to reorder; click to switch the current library.
- **Toolbar (top nav area)**: shows the **library controls** or **document nav** depending on the active tab; **right-click** the toolbar to open a menu with the **auto-hide** option (see "7. Toolbar right-click menu & auto-hide").
- **Tab bar**: Home is fixed; locked documents become tabs that can be clicked to switch, drag-sorted, or dragged right/down to form side-by-side views (see "6. Tabs & multi-view").
- **Main / Sub view**: in multi-view mode, the main view shows the document list/preview area; the sub view (right or bottom) shows the dragged-in tab content.

---

## 3. Library Management

### 3.1 Create a Library
- Click the **`+ New Library`** button at the top of the left library list;
- Enter a library name and click **OK**.

### 3.2 Rename a Library
- Select a library, then click **`Rename Library`** in the top toolbar;
- Enter the new name and click **OK**.

### 3.3 Clear a Library (delete library / clear documents)
Select a library and click the **`🧹 Clear Library`** button in the library title bar. The clear-library window opens (you can **drag the title bar to move** it and **use the bottom-right handle to resize** it) with two modes:

- **Delete Library**: the info bar shows "This will delete this library and all its records: library name";
  - Click **OK** to open a confirmation window warning **this will delete the library and all its records (original files are NOT deleted): library name**; confirming deletes the library and all its document records (**local files are unaffected**), and the preview area returns to its initial state;
- **Clear Documents**: shows search conditions and a document list (the window auto-resizes to a fixed 800×600 for browsing):
  - **Search**: filters by **document type / document tag / document name** (AND combination); an input that is **empty or "All"** is ignored; `*` wildcards are supported (e.g. `*notes*`, `mark*`);
  - Each row has a checkbox; there is a **Select All** checkbox at the top, and the hint "The selected document records will be deleted";
  - Click **OK** to open a confirmation window warning **the selected N records of the library (library name) will be deleted (original files are NOT deleted)**; confirming deletes only the selected records (**local files are NOT deleted**).

> In the confirmation windows, the **library name**, **record count**, and the "**original files are NOT deleted**" warning are highlighted in bold colors — verify carefully before confirming.

### 3.4 Reorder Libraries
- Simply drag a library item with the mouse and release to finish reordering.

---

## 4. Document Management

### 4.1 Add a Document
- First **select a library** (if none is selected you will be prompted to create/select one);
- Click **`+ Add Document`**;
- Fill in:
  - **Document Name**: the display name;
  - **Document Path**: enter the full path manually, or click **Browse...** to pick a file;
  - **Tags** (optional): see "Tag Management" below;
- Click **Add**.

> Any type of local file can be added; the type is detected automatically from the extension
> (e.g. `.md` → Markdown, `.doc/.docx` → Word, `.xls/.xlsx` → Excel, `.ppt/.pptx` → PowerPoint, `.pdf` → PDF, `.py/.js/.java` etc. → corresponding code types).

### 4.2 Edit a Document (property editing)
- Click the **`✏️`** (property edit) button on the right side of a document list item;
- In the dialog you can modify: **Document Name**, **Document Path**, **Tags**;
- **Library Name** and **Type** are read-only;
- Click **Save Changes**.

### 4.3 Delete a Document
- Click the **`🗑️`** (delete) button on the right side of a document list item and confirm (only the record is removed; the local file is not deleted).

### 4.4 Document Tag Management (inside add/edit dialogs)
The first item of the tag dropdown is **✏️ Custom tag**, followed by **all existing tags of the current library**:

- **Select an existing tag**: choose a tag from the dropdown; it is added to the document's tag set automatically;
- **Create a custom tag**: choose "✏️ Custom tag...", type a new tag name in the input, then click **Add**;
  - Tag names may only contain: **letters (a-zA-Z), digits (0-9), underscore (_), hyphen (-), and Chinese characters**;
  - Illegal characters (spaces, punctuation, etc.) are rejected with a warning;
- Each tag in the document's tag set has an **oval background**; click the **✕** on its right to remove it.

### 4.5 Folder Documents (file list management)
A library can contain **folder-type** documents. Double-clicking one shows the folder's directory and file list in the content area:

- **Single-click** selects a file/directory in the list; **double-click a directory** to enter it (use the **`⬆ Up`** toolbar button to go back); **double-click a file** opens a preview according to its type;
- Two shortcut buttons act on the **currently selected** file/directory (if nothing is selected you are prompted to "select a file or directory first"):
  - **`📚 Add Document`**: opens the "Add to Library" dialog to add the selected file/directory to a library:
    - **Library Name**: choose an existing library from the dropdown (the current library is auto-selected), or choose "✏️ Custom library..." and enter a new library name (auto-created if it does not exist);
    - **Document Path / Category / Name**: auto-filled from the selected item (category is derived from the extension; directories are "Folder");
    - **Tags**: all tags of the chosen library are listed for selection or customization;
  - **`⭐ Temp Favorites`**: no dialog — automatically adds the selected file/directory to the **Temporary Favorites** library (auto-created if missing), without tags.

> **💡 Browsing tip (folder tab + dual view)**: pin the folder document as a **right-view tab**, narrow the **right view width**, then browse the directory and files in the tab and double-click a file — its content opens in the main view. This lets you **browse the folder's file list and view the opened document content at the same time**. Steps are in "6. Tabs & multi-view", section 5.

---

## 5. Document Preview

Double-click a document in the list (or select it and click) to open it in the preview area.

### 5.1 Markdown Documents
- Enhanced rendering engine: **syntax highlighting, line numbers, copy button, KaTeX formulas, mermaid charts, front-matter metadata**;
- **Table of contents**: click the **`📋`** button at the top of the preview area to show/hide the left TOC; click a TOC entry to smooth-scroll and highlight;
- **Theme switch**: click the **`🌓 Theme`** button to toggle light/dark (only affects the preview area).

### 5.2 Text / Code Documents
- Displayed directly in a monospace font; long text scrolls.

### 5.3 HTML / PDF / Images
- HTML is previewed in a separate iframe; PDF uses a built-in viewer; images are displayed directly.

### 5.4 Keyword Search in a Document (<kbd>Ctrl+F</kbd>)
- Press **<kbd>Ctrl+F</kbd>** to open the find bar;
- Type a keyword and click **Find** or press **Enter** to jump to and highlight each match;
- Supported types: **Markdown, plain text, programming language files, HTML**;
- Press **<kbd>ESC</kbd>** or click **✕** to close and clear highlights. (ESC only works while focus is in the search bar.)

### 5.5 Printing
- Click **`🖨️`** to print the current document;
- Markdown/HTML prints directly from the preview area (styles preserved); for PDFs use the print button inside the PDF viewer.

> Note: the print preview feature is not supported inside the Electron application.
> A workaround is to open the app's backend service in a browser instead: click **Manage Library in Browser** in the Help menu to open the library UI in a browser, open the document, click the print button — the browser print dialog supports preview. (Alternatively, open the **Debug Log** menu item under the View menu, find the backend listen address, e.g. http://localhost:33453, select the text, press <kbd>Ctrl+C</kbd> to copy the URL, and open it in a browser.) **Why**: Electron reuses the Chromium rendering engine but does not include Chrome's print-preview WebUI, so preview is unavailable; most browsers do support it.

### 5.6 Open Folder
- Click **`📂`** to open a browse dialog (defaults to the current document's directory);
- Select any file and it opens by type: text types display in the preview area; Office and other types open with the system software.

### 5.7 History
- Click **`🕘`** to view recently opened Markdown documents (name and path only, sorted by most recent);
- Click a history item to reopen that document.

### 5.8 Fullscreen Preview
- Click **`⛶ Fullscreen`** to show the document content area fullscreen; click again to exit.

---

## 6. Tabs & Multi-View

**Home** is fixed in the main view and is the default workspace: document lists and folder contents open in Home. After opening a document, you can **lock the current preview as a tab**; multiple tabs can coexist for multi-document browsing and side-by-side views.

### 6.1 Lock a Tab
- After opening any document (including folder documents), click the **`🔒 Lock`** button on the right of the document nav area; the current preview is pinned as a new tab, auto-named "Tab 1, Tab 2…";
- Each tab has its **own content node**: scroll position, iframe state, and render mode are independent;
- After locking from Home, Home returns to the library file list while the new tab keeps the document content; opening a document again shows it in Home by default.

### 6.2 Switch & Close Tabs
- Click a tab label to switch; each view highlights its own active tab;
- Click the **✕** on the right of a tab label to close it (Home cannot be closed);
- When all tabs are closed, the view automatically returns to single-view (Home only).

### 6.3 Drag-sort Tabs
- Drag a tab label to reorder tabs within the same view.

### 6.4 Multi-View (side-by-side)
- **Drag a tab label to the right half** of the main view content area (a right dashed frame appears) and release to create a side-by-side view on the right, pinning the tab there;
- **Drag a tab label to the bottom half** (a bottom dashed frame appears) and release to create a bottom side-by-side view;
- At most two views are kept at once (main view + one sub view);
- When you drag a tab from one sub view to the other orientation (between right and bottom areas), all tabs of the old sub view migrate to the new one;
- Drag the **splitter** between views to adjust widths/heights (minimum 60px); currently only vertical dragging to change the right view's width is supported;
- Clicking anywhere inside a view makes it the active view, and the top toolbar follows its active tab;
- When all tabs in a sub view are closed, the view hides automatically and the main view fills the whole area.

### 6.5 Typical Use: Folder Tab + Dual View
1. Open a **folder document** in Home; the content area shows the folder's directory and file list;
2. Click **`🔒 Lock`** to pin the folder list as a tab, then **drag the tab to the right of the main view** — the folder list is now pinned in the right-view tab;
3. Drag the **splitter** to narrow the right view to a comfortable width (e.g. 300–400px);
4. In the right-view tab: **single-click** selects a file/directory, **double-click a directory** navigates inside the tab, **double-click a file** switches back to Home and opens a preview there;
5. Now you can **browse the folder's directory and file list while viewing the opened document content in Home**, without switching back and forth.

> Note: in the folder view, double-clicking a directory navigates only within the current view (Home or its tab); double-clicking a file always opens in Home and does not affect other tabs' content.

---

## 7. Toolbar Right-click Menu & Auto-hide

The top **toolbar (nav area)** includes the library controls (library title bar) and the document nav (document title bar), switching automatically with the active tab. **Right-clicking** the toolbar opens the toolbar menu:

- The menu item **`✓ Auto-hide`** has a check mark showing whether auto-hide is enabled; click to **toggle** it;
- **When auto-hide is on**: the toolbar collapses by default; when the mouse moves to the **top ~20 pixels** of the main area (or hovers over the slid-out toolbar), it slides out; moving away collapses it again — giving more room for reading;
- **When auto-hide is off**: the toolbar stays fixed and always visible;
- Clicking elsewhere, pressing <kbd>ESC</kbd>, or losing window focus closes the right-click menu.

---

## 8. Searching Documents

Click the **`🔍 Search Documents`** button in the top toolbar to open the search dialog with four conditions:

| Condition | Description |
|------|------|
| Library match | library name; `*` or empty = all |
| Document type match | e.g. `pdf`, `md`; `*` or empty = all |
| Document name match | document name keyword |
| Tag match | tag name; `*` wildcard supported |

- Below the library/type/tag inputs there are dropdowns whose first item is "All"; selecting one auto-fills the input;
- Click **Search** to show results; each result row provides **👁️ View / ✏️ Edit properties / 🗑️ Delete** actions;
- Check result rows, then click **Save to Library** to batch-add them to a chosen library;
- Reopening the search dialog keeps your previous conditions and results.

---

## 9. Tag Filtering the Document List

1. Select a library, then click the **`🏷️ Tags`** button in the library title bar;
2. A tag panel appears on the left of the document list: first item **All**, followed by all tags of the library;
3. Click a tag to show only documents with that tag;
4. Click **All** to restore the full document list;
5. Click the **`🏷️ Tags`** button again to collapse the panel and restore all documents.

---

## 10. Show/Hide the Library List

- Click the **`📚 Library`** button in the top toolbar to hide/show the left library list for a larger preview area.

---

## 11. Data Backup

- **Export libraries**: click **`Export`** to download a JSON backup file;
- **Import libraries**: click **`Import`** and choose a previously exported JSON file to restore.

---

## 12. Common Shortcuts

| Shortcut | Function |
|--------|------|
| <kbd>Ctrl+F</kbd> | find keywords in document content (text/Markdown/code/HTML) |
| <kbd>ESC</kbd> | close find bar / close history dropdown / exit fullscreen / close toolbar right-click menu |
| <kbd>Ctrl+P</kbd> | browser printing (main window). Note: not supported in the Electron app. |
| mouse drag | reorder libraries / reorder tabs / drag tabs right or down for side-by-side views / drag the splitter to resize views |
| toolbar right-click | open the toolbar menu to set nav auto-hide |

---

## 13. Notes

- Document records (libraries, documents, tags) are stored in the local data directory; **deleting a library/document does not delete the original files on disk**;
- Opening external types (Word/Excel/PPT/web links/folders, etc.) launches the system default software;
- If a local file cannot be opened, check that the path exists and the app has read permission.
