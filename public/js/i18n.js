// i18n.js — 中英文国际化支持（必须在 app.js 之前加载）
// 语言来源优先级：URL ?lang= 参数（Electron 主窗口加载时注入）→ preload 同步 IPC（配置文件 language）→ 默认中文
(function (global) {
  'use strict';

  // ========== 语言检测 ==========
  function detectLang() {
    try {
      const q = new URLSearchParams(global.location.search).get('lang');
      if (q === 'zh' || q === 'en') return q;
    } catch (e) { /* ignore */ }
    if (global.electronAPI && global.electronAPI.getSettingsSync) {
      try {
        const s = global.electronAPI.getSettingsSync();
        if (s && (s.language === 'zh' || s.language === 'en')) return s.language;
      } catch (e) { /* ignore */ }
    }
    return 'zh'; // 默认中文
  }

  const lang = detectLang();
  const isEn = lang === 'en';

  // ========== 字典：中文 → 英文（{0}/{1} 为参数占位符） ==========
  // 说明：未收录的字符串原样返回（中文），保证界面不因漏译而失效
  const DICT = {
    // ---- 通用按钮 / 常用词 ----
    '确定': 'OK',
    '取消': 'Cancel',
    '删除': 'Delete',
    '保存修改': 'Save Changes',
    '确定添加': 'Add',
    '添加': 'Add',
    '搜索': 'Search',
    '查找': 'Find',
    '查看': 'View',
    '继续': 'Continue',
    '继续打开': 'Continue Opening',
    '继续预览': 'Continue Preview',
    '复制': 'Copy',
    '全选': 'Select All',
    '浏览...': 'Browse...',
    '转到': 'Go',
    '向上': 'Up',
    '打开': 'Open',
    '名称': 'Name',
    '类型': 'Type',
    '大小': 'Size',
    '修改时间': 'Modified',
    '标签': 'Tags',
    '文档': 'Document',
    '文件': 'File',
    '文件夹': 'Folder',
    '其他': 'Other',
    '所有': 'All',
    '主页': 'Home',
    '分页': 'Tab',
    '上一页': 'Previous Page',
    '下一页': 'Next Page',
    '缩小': 'Zoom Out',
    '放大': 'Zoom In',
    '行号': 'Line Numbers',
    '未知错误': 'Unknown Error',
    '已复制': 'Copied',
    '复制失败': 'Copy Failed',
    '复制路径失败': 'Failed to Copy Path',
    '复制失败:': 'Copy failed:',
    '打开文件失败:': 'Failed to open file:',
    '打开外部链接失败:': 'Failed to open external link:',
    '打开方式对话框失败:': 'Failed to open "Open With" dialog:',
    '打开编辑器失败': 'Failed to open editor',
    '打开编辑器失败: ': 'Failed to open editor: ',
    '打开资源: ': 'Open resource: ',
    '读取目录失败': 'Failed to read directory',
    '打印请求失败:': 'Print request failed:',
    '无法打开打印窗口，请检查是否被浏览器拦截': 'Unable to open print window, please check that it is not blocked by the browser',
    '无法直接调用 iframe 打印:': 'Cannot call iframe print directly:',
    '无法进入全屏:': 'Failed to enter fullscreen:',
    '加载文档失败, 传入doc参数值不正确:': 'Failed to load document, the doc argument is invalid:',
    '加载帮助文档失败:': 'Failed to load help document:',
    '加载 Markdown 失败:': 'Failed to load Markdown:',
    '加载目录失败': 'Failed to load table of contents',
    '加载标签失败:': 'Failed to load tags:',
    '加载标签过滤列表失败:': 'Failed to load tag filter list:',
    '加载编辑软件列表失败:': 'Failed to load editor list:',
    '渲染 Markdown 为 HTML 失败:': 'Failed to render Markdown to HTML:',
    '生成行号失败:': 'Failed to generate line numbers:',
    'mermaid 渲染失败:': 'mermaid rendering failed:',
    'PDF 渲染失败:': 'PDF rendering failed:',
    'PDF 打印失败:': 'PDF printing failed:',
    'PDF 空白像素检测失败:': 'PDF blank-pixel detection failed:',
    'PDF 缩放重建失败:': 'PDF zoom rebuild failed:',
    'PDF 数据无效': 'Invalid PDF data',
    'PDF 页数为 0': 'PDF has 0 pages',
    'PDF 数据未就绪，请稍后重试': 'PDF data is not ready, please try again later',
    'PDF 文档': 'PDF Document',
    'PDF 文档请使用 PDF 查看器自带的打印功能（在预览区域的 PDF 工具栏点击打印按钮）。': 'For PDF documents, please use the print function built into the PDF viewer (click the print button on the PDF toolbar in the preview area).',
    '当前文档无法直接打印，请使用浏览器自带的打印功能（Ctrl+P）。': 'This document cannot be printed directly; please use the browser print function (Ctrl+P).',
    '当前没有可打开的文档': 'There is no document to open',
    '文档或书库不存在': 'Document or library does not exist',
    '保存排序失败': 'Failed to save sort order',
    '保存文档排序失败': 'Failed to save document sort order',
    '保存文档排序失败:': 'Failed to save document sort order:',
    '创建书库失败': 'Failed to create library',
    '创建临时收藏书库失败': 'Failed to create temporary favorites library',
    '加入临时收藏失败': 'Failed to add to temporary favorites',
    '添加文档失败': 'Failed to add document',
    '导入成功！': 'Import succeeded!',
    '导入失败：JSON格式不正确': 'Import failed: invalid JSON format',
    '该路径已在列表中': 'This path is already in the list',
    '请先选择一个书库或新建一个书库': 'Please select a library or create a new one first',
    '请选择书库': 'Please select a library',
    '请选择一个书库': 'Please select a library',
    '请输入书库名称': 'Please enter a library name',
    '请输入文档名称和路径': 'Please enter document name and path',
    '请输入标签名称': 'Please enter a tag name',
    '请输入自定义书库名称': 'Please enter a custom library name',
    '请输入要扫描的路径': 'Please enter a path to scan',
    '请先选择文件或目录': 'Please select a file or directory first',
    '请先选择要保存的文档': 'Please select documents to save first',
    '请先选择要清理的文档记录': 'Please select document records to clear first',
    '请先选择一个编辑软件': 'Please select an editor first',
    '请先打开一个文档，再锁定为分页': 'Please open a document first, then lock it as a tab',
    '标签只能包含字母、数字、_、- 和中文': 'Tags can only contain letters, digits, underscore (_), hyphen (-), and Chinese characters',
    '确定要删除这个文档记录吗？<span class="delete-warn">注：只删记录不删原文件！</span>': 'Are you sure you want to delete this document record?<span class="delete-warn">Note: only the record is deleted, the original file is kept!</span>',
    '确定要清除所有历史记录吗？此操作不可恢复。': 'Are you sure you want to clear all history? This cannot be undone.',
    '停止查找': 'Stop Search',
    '关闭分页': 'Close Tab',
    '分页1': 'Tab 1',
    '分页{0}': 'Tab {0}',
    '删除书库': 'Delete Library',
    '清理文档': 'Clear Documents',
    '排序编辑': 'Sort by Edit',
    '临时收藏': 'Temporary Favorites',
    '添加到书库': 'Add to Library',
    '添加书库': 'Add Library',
    '自定义书库': 'Custom Library',
    '属性编辑': 'Edit Properties',
    '文档属性编辑': 'Edit Document Properties',
    '删除标签': 'Delete Tag',
    '自动隐藏': 'Auto-hide',
    '向上一级': 'Up One Level',
    '原地导航': 'Navigate in Place',
    '打开文件夹': 'Open Folder',
    '打开方式': 'Open With',
    '返回文件夹列表: ': 'Back to folder list: ',
    '父目录链接': 'Parent Directory Link',
    '显示书库列表': 'Show Library List',
    '隐藏书库列表': 'Hide Library List',
    '拖动调整顺序': 'Drag to Reorder',
    '已丢失': 'Missing',
    '当前活动分页': 'Current Active Tab',
    '主视图自己的活动分页': 'Active Tab of Main View',
    '活动视图': 'Active View',
    '除主页外还有其它分页分布在各视图': 'There are other tabs besides Home distributed across views',
    '将选中的文件或目录添加到书库': 'Add the selected file or directory to a library',
    '将选中的文件或目录加入临时收藏书库（不弹窗）': 'Add the selected file or directory to temporary favorites (no dialog)',
    '在系统文件管理器中打开当前文件夹': 'Open the current folder in the system file manager',
    '复制当前文件夹路径': 'Copy Current Folder Path',
    '移除该路径': 'Remove This Path',
    '无目录': 'No Table of Contents',
    '配置': 'Settings',
    '配置文件': 'Config File',
    '应用程序': 'Application',
    '日志文件': 'Log File',
    '压缩文件': 'Archive',
    '图片': 'Image',
    '音频': 'Audio',
    '视频': 'Video',
    'Web链接': 'Web Link',
    '文本文档': 'Text Document',
    'Markdown 文档': 'Markdown Document',
    'Word 文档': 'Word Document',
    'Excel 表格': 'Excel Spreadsheet',
    'PowerPoint 演示': 'PowerPoint Presentation',
    'CSV 表格': 'CSV Spreadsheet',
    'PDF 第 ': 'PDF page ',
    // ---- 文件类型名称 ----
    'C 文件': 'C File',
    'C 头文件': 'C Header',
    'C++ 文件': 'C++ File',
    'C++ 头文件': 'C++ Header',
    'C# 文件': 'C# File',
    'Java 文件': 'Java File',
    'JavaScript 文件': 'JavaScript File',
    'TypeScript 文件': 'TypeScript File',
    'JSX 文件': 'JSX File',
    'Python 文件': 'Python File',
    'Rust 文件': 'Rust File',
    'Go 文件': 'Go File',
    'Ruby 文件': 'Ruby File',
    'PHP 文件': 'PHP File',
    'Swift 文件': 'Swift File',
    'Kotlin 文件': 'Kotlin File',
    'Scala 文件': 'Scala File',
    'Perl 文件': 'Perl File',
    'Lua 文件': 'Lua File',
    'R 文件': 'R File',
    'Shell 脚本': 'Shell Script',
    'BAT 脚本': 'BAT Script',
    'CMD 脚本': 'CMD Script',
    'PowerShell 脚本': 'PowerShell Script',
    'HTML 文件': 'HTML File',
    'CSS 文件': 'CSS File',
    'SCSS 样式': 'SCSS Style',
    'LESS 样式': 'LESS Style',
    'JSON 文件': 'JSON File',
    'YAML 文件': 'YAML File',
    'XML 文件': 'XML File',
    'TOML 文件': 'TOML File',
    'INI 文件': 'INI File',
    'Properties 文件': 'Properties File',
    'SQL 文件': 'SQL File',
    'Vue 文件': 'Vue File',
    'Gradle 文件': 'Gradle File',
    'EditorConfig 文件': 'EditorConfig File',
    'GitIgnore 文件': 'GitIgnore File',
    'Env 配置': 'Env Config',
    'SVG 图片': 'SVG Image',
    'PNG 图片': 'PNG Image',
    'JPEG 图片': 'JPEG Image',
    'JPG 图片': 'JPG Image',
    'GIF 图片': 'GIF Image',
    'WEBP 图片': 'WEBP Image',
    '⛶ 全屏': '⛶ Fullscreen',
    '⛶ 退出全屏': '⛶ Exit Fullscreen',
    '切换为浅色背景': 'Switch to Light Theme',
    '切换为深色背景': 'Switch to Dark Theme',
    // ---- app.js 其余字面量 ----
    ' 与 ': ' and ',
    '只有关闭标签列表，或在标签列表中选择"所有"时，才能编辑排序': 'Sort by Edit is only allowed when the tag list is closed or "All" is selected in the tag list',
    '请选择已有书库，或选择自定义书库输入新书库名': 'Select an existing library, or choose a custom library to enter a new library name',
    '自动填入右击项的路径': 'Auto-filled from the right-clicked item path',
    '自动分析路径得到': 'Automatically derived from the path',
    '输入新标签名称': 'Enter a new tag name',
    '输入新的书库名（不存在则自动新建）': 'Enter a new library name (auto-created if it does not exist)',
    '文档名称': 'Document Name',
    '文档路径': 'Document Path',
    '当前书库': 'Current Library',
    '书库名': 'Library Name',
    '书库名称': 'Library Name',
    '书库列表': 'Library List',
    '书库匹配': 'Library Match',
    '书库 · 文档管理': 'Library · Document Management',
    '所有书库': 'All Libraries',
    '所有标签': 'All Tags',
    '所有类型': 'All Types',
    '文档类型匹配': 'Document Type Match',
    '文档名匹配': 'Document Name Match',
    '标签匹配': 'Tag Match',
    '已选择: {0} 个文档': 'Selected: {0} docs',
    '已选择: 0 个文档': 'Selected: 0 docs',
    '个文档': 'docs',
    '将保存': 'Save',
    '将删除本书库以及书库中所有记录：': 'This will delete this library and all its records: ',
    '选中的文件记录将被删除': 'The selected document records will be deleted',
    '暂无书库，点击上方按钮创建': 'No libraries yet, click the button above to create one',
    '暂无文档，请点击上方按钮添加': 'No documents yet, click the button above to add one',
    '正在加载...': 'Loading...',
    '此文件夹为空': 'This folder is empty',
    '没有找到匹配的文档': 'No matching documents found',
    '暂无历史记录': 'No history yet',
    '加载中...': 'Loading...',
    '正在转换 PDF，请稍候...': 'Converting PDF, please wait...',
    '无文档记录': 'No document records',
    '未检测到编辑软件，请点击下方"查找软件..."选择': 'No editors detected, click "Find Software..." below to choose one',
    '正在停止查找...': 'Stopping search...',
    '请输入搜索条件并点击搜索': 'Enter search conditions and click Search',
    '搜索文档': 'Search Documents',
    '保存到书库': 'Save to Library',
    '修改书库名称': 'Rename Library',
    '新建书库': 'New Library',
    '清理书库': 'Clear Library',
    '确认删除': 'Confirm Delete',
    '确定要删除记录吗？': 'Are you sure you want to delete this record?',
    '添加文档': 'Add Document',
    '修改文档': 'Edit Document',
    '添加到书库': 'Add to Library',
    '选择编辑软件': 'Choose an Editor',
    '查找软件...': 'Find Software...',
    '选择用于打开当前文档的编辑软件，点击"确定"后调用该软件打开文档；点击"取消"放弃编辑。': 'Choose an editor to open the current document. Click "OK" to open the document with that editor, or "Cancel" to give up editing.',
    '查找时默认扫描 C:\\Program Files、C:\\Program Files (x86)、%LOCALAPPDATA%、%APPDATA% 及下方已添加的路径（指定目录会列出其中所有 .exe）；也可直接在输入框输入软件名（如 QoderCN）按名字模糊查找': 'By default, scanning covers C:\\Program Files, C:\\Program Files (x86), %LOCALAPPDATA%, %APPDATA% and the paths added below (all .exe files in a specified directory are listed); you can also type a software name directly (e.g. QoderCN) to fuzzy-search by name',
    '输入要扫描的路径添加，或输入软件名查找（如 QoderCN）': 'Enter a path to scan and add, or a software name to search (e.g. QoderCN)',
    '文档类型（如 pdf、md）': 'Document type (e.g. pdf, md)',
    '文档标签': 'Document tags',
    '文档名称': 'Document name',
    '默认排序': 'Default',
    '时间递增': 'Time Ascending',
    '时间递减': 'Time Descending',
    '名称递增': 'Name Ascending',
    '名称递减': 'Name Descending',
    '-- 选择或自定义标签 --': '-- Select or customize tags --',
    '✏️ 自定义标签...': '✏️ Custom tag...',
    '✏️ 自定义书库...': '✏️ Custom library...',
    '⬆ 向上': '⬆ Up',
    '分区:': 'Drive:',
    '点击排序': 'Click to Sort',
    '文件名(N):': 'File name(N):',
    '选择文件或输入完整路径': 'Select a file or enter a full path',
    '输入路径后回车跳转': 'Enter a path and press Enter to go',
    '请输入完整文件路径，如: C:\\Users\\test\\document.md': 'Enter the full file path, e.g. C:\\Users\\test\\document.md',
    '💡 可以直接输入完整路径（如 D:\\documents\\test.txt），或点击"浏览"选择文件': '💡 You can type a full path directly (e.g. D:\\documents\\test.txt), or click "Browse" to pick a file',
    '💡 提示：输入已存在的书库名会追加到该书库，输入新名称则创建新书库': '💡 Tip: entering an existing library name appends to it; entering a new name creates a new library',
    '请输入书库名称（新建或选择已存在）': 'Enter a library name (create new or pick existing)',
    '输入书库名或 * 匹配所有': 'Enter a library name or * to match all',
    '输入文档名或 * 匹配所有': 'Enter a document name or * to match all',
    '输入标签名或 * 匹配所有': 'Enter a tag name or * to match all',
    '输入类型(如pdf,md)或 * 匹配所有': 'Enter a type (e.g. pdf, md) or * to match all',
    '查找...': 'Find...',
    '查找下一个': 'Find Next',
    '返回上一个文档（按历史记录向前）': 'Back to previous document (history backward)',
    '返回书库文件列表': 'Back to library file list',
    '显示/隐藏内容目录': 'Show/Hide Table of Contents',
    '显示/隐藏标签过滤列表': 'Show/Hide Tag Filter List',
    '显示/隐藏缩略导航图': 'Show/Hide Thumbnail Navigator',
    '历史记录': 'History',
    '打印文档内容': 'Print Document Content',
    '打开文档所在文件夹': 'Open Document Folder',
    '锁定当前文档为分页': 'Lock Current Document as a Tab',
    '选择软件打开当前文档（系统打开方式对话框）': 'Open current document with a chosen app (system "Open With" dialog)',
    '切换浅色或深色背景主题': 'Switch between light and dark theme',
    '文档内容区域全屏/退出全屏': 'Fullscreen/exit fullscreen for the document area',
    '文档列表排序方式': 'Document list sort order',
    '拖动调整窗口大小': 'Drag to resize the window',
    '隐藏/显示书库列表': 'Hide/Show Library List',
    '上传导入书库': 'Import Library (upload)',
    '下载导出书库': 'Export Library (download)',
    '📚 本地文档管理器': '📚 Local Document Manager',
    '本地文档管理器': 'Local Document Manager',
    '🏷️ 标签过滤': '🏷️ Tag Filter',
    '📄 添加文档': '📄 Add Document',
    '📚 添加到书库': '📚 Add to Library',
    '📝 修改文档': '📝 Edit Document',
    '🔍 搜索文档': '🔍 Search Documents',
    '🔍 查找软件...': '🔍 Find Software...',
    '🧹 清理书库': '🧹 Clear Library',
    '✍️ 选择编辑软件': '✍️ Choose an Editor',
    '🔍 搜索': '🔍 Search',
    '文档标题': 'Document Title',
    '打开': 'Open',
    '类型': 'Type',
    '文档分类': 'Document Category',
    '文档': 'Document',
    // ---- PDF / 图片查看器 ----
    '滚轮滚动查看各页 按钮翻页 缩放自适应宽度': 'Scroll to view pages, use buttons to turn pages, zoom fits width',
    '滚轮缩放 拖动查看不同部分': 'Scroll to zoom, drag to view different parts',
    '拖动主图查看不同部分; 点击缩略图可跳转显示区域': 'Drag the main image to view different parts; click the thumbnail to jump to an area',
    '文件较大': 'Large File',
    '文件大小: <strong>{0}</strong>，超出 100MB，继续打开预览可能需要较长时间。': 'File size: <strong>{0}</strong>, over 100MB. Opening the preview may take a while.',
    '清除记录': 'Clear History',
    '打印 - {0}': 'Print - {0}',
    '预览空白': 'Blank Preview',
    '共 {0} 页': '{0} pages in total',
    '第 {0} 页': 'Page {0}',
    '页': 'page',
    ' 页': ' pages',
    ' | 具体类型 | ': ' | Specific Type | ',
    // ---- 主进程（main.js）对话框 / 菜单 ----
    '文档管理器': 'Document Manager',
    '视图': 'View',
    '调试日志': 'Debug Log',
    '窗口': 'Window',
    '帮助': 'Help',
    '软件帮助': 'Software Help',
    'Markdown扩展语法帮助': 'Markdown Extended Syntax Help',
    '浏览器管理书库': 'Manage Library in Browser',
    '设置': 'Settings',
    '关于': 'About',
    '打开方式': 'Open With',
    '打印预览': 'Print Preview',
    '内容为空': 'Content is empty',
    'PDF 数据为空': 'PDF data is empty',
    '文件不存在: ': 'File does not exist: ',
    '未知': 'Unknown',
    '随机空闲端口': 'random free port',
    '服务器启动失败': 'Server Failed to Start',
    '服务器未启动': 'Server Not Running',
    '服务器尚未启动，无法在浏览器中打开。': 'The server is not running, cannot open in the browser.',
    '监听地址必须是有效的 IPv4 地址': 'Listen address must be a valid IPv4 address',
    '监听端口必须是数字': 'Listen port must be a number',
    '监听设置已恢复默认': 'Listen Settings Reset to Defaults',
    '监听配置已保存': 'Listen config saved',
    '设置已保存': 'Settings Saved',
    '设置已保存，重启程序后生效。': 'Settings saved. They take effect after restarting the program.',
    '配置的监听地址或端口无法使用，已自动恢复为默认参数。': 'The configured listen address or port is unavailable and has been reset to defaults automatically.',
    '自动恢复默认参数 (127.0.0.1:0) 后重试…': 'Retrying with default parameters (127.0.0.1:0)…',
    '恢复默认参数 (127.0.0.1:0) 重试': 'Retry with default parameters (127.0.0.1:0)',
    '退出': 'Exit',
    // ---- 设置窗口（settings.html） ----
    '服务器设置': 'Server Settings',
    '监听地址': 'Listen Address',
    '监听端口': 'Listen Port',
    '0 表示随机空闲端口（默认）；范围 3000 - 65535': '0 means a random free port (default); range 3000 - 65535',
    '配置文件位置': 'Config File Location',
    '语言': 'Language',
    '界面语言': 'Interface Language',
    '中文': 'Chinese',
    '请输入监听端口': 'Please enter a listen port',
    '监听端口必须是整数': 'Listen port must be an integer',
    '监听端口范围：0（随机空闲端口）或 {0} - {1}': 'Listen port range: 0 (random free port) or {0} - {1}',
    '（配置文件中的值）': ' (value from config file)',
    '保存失败': 'Save failed',
    // ---- server.js 错误消息（客户端 t() 转译） ----
    '书库不存在': 'Library does not exist',
    '书库名称不能为空': 'Library name cannot be empty',
    '书库名称已存在': 'Library name already exists',
    '文档不存在': 'Document does not exist',
    '文档已存在': 'Document already exists',
    '文档名称和路径不能为空': 'Document name and path cannot be empty',
    '文件路径不能为空': 'File path cannot be empty',
    '标签不能为空': 'Tag cannot be empty',
    '指定路径不是文件': 'The specified path is not a file',
    '指定路径不是目录': 'The specified path is not a directory',
    '文件不存在或无法访问: ': 'File does not exist or cannot be accessed: ',
    '不支持该文档预览': 'This document type does not support preview',
    '仅支持 PDF 文件转换': 'Only PDF files can be converted',
    'PDF 转换失败: 未生成输出文件': 'PDF conversion failed: no output file was generated',
    '获取 PDF 失败': 'Failed to get PDF',
    '导入数据格式不正确': 'Import data format is incorrect',
    '加载失败: ': 'Load failed: ',
    '扫描出错:': 'Scan error:',
    '缺少 sessionId': 'Missing sessionId',
    '缺少文档 id 列表': 'Missing document id list',
    '缺少文件路径或编辑器路径': 'Missing file path or editor path',
    '远程不能调用系统软件': 'Remote clients cannot launch system software',
    '记事本 (Notepad)': 'Notepad',
    '启动超时': 'Startup timeout',
    '用系统软件打开文档': 'Open document with system software',
    '打印': 'Print',
    '打印预览已失效，请重新操作。': 'The print preview has expired, please try again.',
    // ---- app.js alert 模板键 ----
    '标签 "{0}" 已存在': 'Tag "{0}" already exists',
    '已加入临时收藏书库: {0}': 'Added to temporary favorites library: {0}',
    '打印失败: {0}': 'Print failed: {0}',
    '无法打开文件: {0}': 'Failed to open file: {0}',
    '打开文件失败: {0}': 'Failed to open file: {0}',
    '打开文件失败 (HTTP {0})': 'Failed to open file (HTTP {0})',
    '打开外部链接失败 (HTTP {0})': 'Failed to open external link (HTTP {0})',
    '无法弹出打开方式对话框: {0}': 'Failed to show the "Open With" dialog: {0}',
    '打开失败: {0}': 'Failed to open: {0}',
    '无法用系统程序打开文件: {0}': 'Failed to open file with the system program: {0}',
    '成功保存 {0} 个文档到书库 "{1}"': 'Successfully saved {0} docs to library "{1}"',
    // ---- app.js 模板（HTML 片段 / 状态提示） ----
    '<div class="empty-state"><p>标签 "{0}" 下暂无文档</p></div>': '<div class="empty-state"><p>No documents under tag "{0}"</p></div>',
    '将删除本书库及所有记录（<span class="delete-warn">不删除原始文件</span>）：<span class="delete-lib-name">{0}</span>': 'This will delete this library and all its records (<span class="delete-warn">the original files are NOT deleted</span>): <span class="delete-lib-name">{0}</span>',
    '将删除本书库（<span class="delete-lib-name">{0}</span>）中选中的 ': 'This will delete the selected records of library (<span class="delete-lib-name">{0}</span>): ',
    '<span class="delete-count">{0}</span> 条记录（<span class="delete-warn">不删除原始文件</span>）': '<span class="delete-count">{0}</span> records (<span class="delete-warn">the original files are NOT deleted</span>)',
    '正在查找编辑软件... 已用 {0} 秒': 'Searching for editors... {0}s elapsed',
    '已停止查找，用时 {0} 秒，已找到 {1} 个编辑软件并更新到列表': 'Search stopped after {0}s; found {1} editors and updated the list',
    '扫描完成，用时 {0} 秒，发现 {1} 个编辑软件，已更新到列表': 'Scan complete after {0}s; found {1} editors and updated the list',
    '扫描失败: {0}': 'Scan failed: {0}',
    '加载文档失败: {0}': 'Failed to load document: {0}',
    '加载帮助文档失败: {0}': 'Failed to load help document: {0}',
    'PDF 转换失败: {0}': 'PDF conversion failed: {0}',
    '共 {0} 项 · 目录 {1} 个 · 文件 {2} 个': '{0} items total · {1} folders · {2} files',
    '返回文件夹列表: {0}': 'Back to folder list: {0}',
    '打开资源: {0}': 'Open resource: {0}',
    '切换到 {0}': 'Switch to {0}',
    '🗺 导航': '🗺 Nav',
    '关闭': 'Close',
    '请输入文档名称': 'Please enter a document name',
    '选择已有书库，或选择自定义书库输入新书库名': 'Select an existing library, or choose custom library to enter a new name',
    'SVG预览': 'SVG Preview',
    '图片预览': 'Image Preview',
    '滚轮缩放 · 拖动查看不同部分': 'Scroll to zoom · drag to view different parts',
    // ---- 渲染方式（render mode）按钮 title ----
    '渲染方式：Markdown 渲染': 'Render mode: Markdown rendering',
    '渲染方式：纯文本（语法高亮）': 'Render mode: Plain text (syntax highlighted)',
    '渲染方式：Markdown 转 HTML 源码': 'Render mode: Markdown-to-HTML source',
    '渲染方式：HTML 渲染': 'Render mode: HTML rendering'
  };

  // ========== 翻译函数 ==========
  function t(s, ...args) {
    let out = (isEn && Object.prototype.hasOwnProperty.call(DICT, s)) ? DICT[s] : s;
    if (args && args.length) {
      args.forEach((a, i) => {
        out = out.split('{' + i + '}').join(String(a));
      });
    }
    return out;
  }

  // ========== DOM 静态文本翻译 ==========
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
  const TRANS_ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];

  function translateTextNode(node) {
    if (!isEn) return; // 仅英文模式才自动翻译 DOM（中文模式保持界面原文）
    const v = node.nodeValue;
    if (!v) return;
    const trimmed = v.trim();
    if (!trimmed) return;
    const trans = DICT[trimmed];
    if (trans === undefined) return;
    const leading = v.slice(0, v.indexOf(trimmed));
    const trailing = v.slice(v.indexOf(trimmed) + trimmed.length);
    node.nodeValue = leading + trans + trailing;
  }

  function translateNode(el) {
    if (!isEn) return; // 仅英文模式才自动翻译 DOM
    if (!el || el.nodeType !== 1) return;
    if (el.hasAttribute('data-no-i18n')) return; // 顶层跳过整棵子树（如设置窗口的语言下拉）
    // 一次遍历子树：元素节点翻译 title/placeholder/aria-label/alt，文本节点翻译内容
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) {
        const p = n.parentElement;
        if (p && (SKIP_TAGS.has(p.tagName) || p.closest('[data-no-i18n]'))) continue;
        translateTextNode(n);
      } else if (!n.hasAttribute('data-no-i18n')) {
        for (const attr of TRANS_ATTRS) {
          const val = n.getAttribute(attr);
          if (val) {
            const trimmed = val.trim();
            const trans = DICT[trimmed];
            if (trans !== undefined) n.setAttribute(attr, trans);
          }
        }
      }
    }
  }

  function translateDOM(root) {
    root = root || document;
    if (root.nodeType === 1) {
      translateNode(root);
    } else if (root.body) {
      translateNode(root.body);
    }
    // 页面标题（仅英文模式翻译；中文模式保持原样）
    if (isEn && document.title) {
      const t0 = document.title.trim();
      if (DICT[t0] !== undefined) document.title = DICT[t0];
    }
    document.documentElement.lang = isEn ? 'en' : 'zh-CN';
  }

  // ========== 动态插入内容的自动翻译（MutationObserver） ==========
  let observer = null;
  function startObserver() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver((mutations) => {
      if (!isEn) return; // 仅英文模式才自动翻译 DOM
      for (const m of mutations) {
        if (m.type === 'attributes') {
          if (TRANS_ATTRS.includes(m.attributeName) && m.target.nodeType === 1) {
            const attr = m.target.getAttribute(m.attributeName);
            if (attr) {
              const trimmed = attr.trim();
              const trans = DICT[trimmed];
              if (trans !== undefined) m.target.setAttribute(m.attributeName, trans);
            }
          }
          continue;
        }
        for (const node of m.addedNodes) {
          if (node.nodeType === 3) {
            const p = node.parentElement;
            if (p && !SKIP_TAGS.has(p.tagName)) translateTextNode(node);
          } else if (node.nodeType === 1) {
            translateNode(node);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: TRANS_ATTRS });
  }

  // ========== 初始化 ==========
  function init() {
    if (document.body) {
      translateDOM(document.body);
      startObserver();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        translateDOM(document.body);
        startObserver();
      });
    }
  }

  // 立即执行：脚本位于 body 末尾，此时 body 已就绪
  init();

  const I18N = { lang, isEn, t, translateDOM, dict: DICT };
  global.I18N = I18N;
  global.t = t; // 供 app.js 直接调用 t('中文') / t('中文 {0}', n)
})(window);
