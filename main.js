const { app, BrowserWindow, Menu, ipcMain, shell, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { execFile } = require('child_process');

// Force light native theme: Electron's built-in PDF viewer background follows nativeTheme;
// in dark mode the PDF page background would render black; fix to light to keep it light (consistent with the app UI)
nativeTheme.themeSource = 'light';

let mainWindow;
let server;
let logWindow;
let logMessages = [];
let currentPort = null; // Current server port (used by the menu to open a browser)
let currentHost = '127.0.0.1'; // Current server listen address (used to load pages / open a browser)

const appDataDir = app.getPath('userData');
console.log(`App data directory: ${appDataDir}`);
process.env.APP_DATA_DIR = appDataDir;

if (!fs.existsSync(appDataDir)) {
  fs.mkdirSync(appDataDir, { recursive: true });
}

// Load the web server module (must be after APP_DATA_DIR is set, since server.js relies on it to locate library.json);
// module-level import makes startServer / getLocalIPv4Addresses available globally to the startup flow and settings-window IPC
const { startServer, getLocalIPv4Addresses } = require('./server.js');

// ===== Server listen configuration (config file is located only under the install path and can be manually edited by the user) =====
const DEFAULT_LISTEN_ADDRESS = '127.0.0.1';
const DEFAULT_LISTEN_PORT = 0; // 0 = random free port
const DEFAULT_LANGUAGE = 'zh'; // Default Chinese; 'zh' | 'en'
let currentLang = DEFAULT_LANGUAGE; // Current UI language (updated when config is read / settings are saved)
// Language helper: returns English when currentLang === 'en', otherwise returns Chinese
function L(zh, en) {
  return currentLang === 'en' ? en : zh;
}
// Fixed selectable listen addresses; the remaining address entries are auto-detected by the system (getLocalIPv4Addresses, see server.js)
const FIXED_LISTEN_ADDRESSES = ['127.0.0.1', '0.0.0.0'];
const MIN_LISTEN_PORT = 3000;
const MAX_LISTEN_PORT = 65535;

// After packaging, the config file is placed in the same directory as the exe (install path) for easy manual editing;
// in development mode (electron .) it is placed in the project root
const CONFIG_FILE = app.isPackaged
  ? path.join(path.dirname(process.execPath), 'config.json')
  : path.join(__dirname, 'config.json');

// Read the config file: use defaults when missing/corrupted; limit port to 3000 - 65535 when it is non-zero
// languageConfigured=true means the language was explicitly set in the config file (including manual edits); on first launch this decides whether to auto-set based on system locale
function loadConfig() {
  const defaults = { listenAddress: DEFAULT_LISTEN_ADDRESS, listenPort: DEFAULT_LISTEN_PORT, language: DEFAULT_LANGUAGE, languageConfigured: false };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      const address = typeof raw.listenAddress === 'string' ? raw.listenAddress : DEFAULT_LISTEN_ADDRESS;
      const p = parseInt(raw.listenPort, 10);
      const port = (p === DEFAULT_LISTEN_PORT || (p >= MIN_LISTEN_PORT && p <= MAX_LISTEN_PORT))
        ? p : DEFAULT_LISTEN_PORT;
      const configured = raw.language === 'en' || raw.language === 'zh';
      const language = configured ? raw.language : DEFAULT_LANGUAGE;
      return { listenAddress: address, listenPort: port, language, languageConfigured: configured };
    }
  } catch (e) {
    console.error(`读取配置文件失败（使用默认参数）: ${e.message}`);
  }
  return defaults;
}

// Auto-select the UI language based on system locale: Chinese systems (starting with zh) → Chinese, others → English
function detectSystemLanguage() {
  const locale = String(app.getLocale ? app.getLocale() : '').toLowerCase();
  return locale.startsWith('zh') ? 'zh' : 'en';
}

// Save config: only write the passed fields, keep existing values for omitted fields (language won't be accidentally cleared)
function saveConfig(patch = {}) {
  try {
    const cfg = loadConfig();
    const next = {
      listenAddress: patch.listenAddress !== undefined ? patch.listenAddress : cfg.listenAddress,
      listenPort: patch.listenPort !== undefined ? patch.listenPort : cfg.listenPort,
      language: patch.language !== undefined ? patch.language : cfg.language
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
    console.log('监听配置已保存');
    return true;
  } catch (e) {
    console.error(`写入配置文件失败: ${e.message}`);
    return false;
  }
}

// Generate the page access URL based on the listen address: use localhost when bound to 0.0.0.0
function pageUrl(host, port) {
  const h = (host === '0.0.0.0' || host === '::') ? 'localhost' : host;
  return `http://${h}:${port}`;
}

const originalLog = console.log;
console.log = function(...args) {
  originalLog.apply(console, args);
  
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  logMessages.push({ time: timestamp, message });
  
  if (logMessages.length > 1000) {
    logMessages = logMessages.slice(-1000);
  }
  
  addLogToWindow(timestamp, message);
};

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    title: L('文档管理器', 'Document Manager')
  });

  mainWindow.loadURL(pageUrl(currentHost, port) + '?lang=' + currentLang);

  // <a target="_blank"> / window.open 打开的 http(s) 链接: 转到系统默认浏览器打开，
  // 而不是新建一个 Electron 窗口（weblink 文档即用这种方式在前端打开）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function createLogWindow() {
  if (logWindow) {
    logWindow.focus();
    return;
  }

  logWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: L('调试日志', 'Debug Log'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  });

  logWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: monospace; background: #1e1e1e; color: #d4d4d4; padding: 10px; margin: 0; }
        .log-entry { margin-bottom: 2px; display: flex; }
        .log-time { color: #6a9955; margin-right: 10px; flex-shrink: 0; }
        .log-message { color: #d4d4d4; margin: 0; flex: 1; white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <div id="log-container"></div>
    </body>
    </html>
  `)}`);

  logWindow.on('closed', function () {
    logWindow = null;
  });
}

function addLogToWindow(time, message) {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.webContents.executeJavaScript(`
      const container = document.getElementById('log-container');
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      
      const timeSpan = document.createElement('span');
      timeSpan.className = 'log-time';
      timeSpan.textContent = '${time}';
      
      const messagePre = document.createElement('pre');
      messagePre.className = 'log-message';
      messagePre.textContent = ${JSON.stringify(message)};
      
      entry.appendChild(timeSpan);
      entry.appendChild(messagePre);
      container.appendChild(entry);
      container.scrollTop = container.scrollHeight;
    `).catch(() => {});
  }
}

function initLogWindow() {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.webContents.executeJavaScript(`
      const container = document.getElementById('log-container');
      container.innerHTML = '';
      
      const messages = ${JSON.stringify(logMessages)};
      messages.forEach(log => {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = log.time;
        
        const messagePre = document.createElement('pre');
        messagePre.className = 'log-message';
        messagePre.textContent = log.message;
        
        entry.appendChild(timeSpan);
        entry.appendChild(messagePre);
        container.appendChild(entry);
      });
      
      container.scrollTop = container.scrollHeight;
    `).catch(() => {});
  }
}

ipcMain.handle('open-external-file', async (event, filePath) => {
  try {
    console.log(`Opening external file: ${filePath}`);
    const result = await shell.openPath(filePath);
    console.log(`Open result: ${result}`);
    if (result === '') {
      return { success: true };
    } else {
      return { success: false, error: result };
    }
  } catch (error) {
    console.error(`Failed to open file: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Open the system "Open with" dialog: no app specified; the system lists available programs and lets the user choose (Windows uses rundll32 OpenAs_RunDLL)
ipcMain.handle('open-with-dialog', async (event, filePath) => {
  try {
    console.log(`Open-with dialog for: ${filePath}`);
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在: ' + filePath };
    }
    if (process.platform === 'win32') {
      // rundll32.exe shell32.dll,OpenAs_RunDLL <path> opens the Windows "Open with" selection dialog
      await new Promise((resolve, reject) => {
        execFile('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', filePath], { windowsHide: true }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return { success: true };
    }
    // On non-Windows platforms, fall back to opening with the system default program
    const result = await shell.openPath(filePath);
    return result === '' ? { success: true } : { success: false, error: result };
  } catch (error) {
    console.error(`Failed to open with dialog: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Print HTML: generate a PDF then preview it in a new window (Electron has no built-in print preview; the preview page is rendered with pdf.js)
ipcMain.handle('print-html', async (event, { html, title }) => {
  try {
    if (!html) return { success: false, error: '内容为空' };

    // Load HTML in a hidden window
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false
      }
    });
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    // Wait for content and resources to finish loading, then convert to PDF
    const pdf = await printWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'default' }
    });
    printWin.destroy();

    // The preview window is rendered with pdf.js (data:application/pdf cannot be displayed in Electron)
    return await openPdfPreview(pdf, title || '打印预览');
  } catch (error) {
    console.error(`打印失败: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Print PDF: raw PDF bytes go directly to the pdf.js preview (preserves vector text for clear preview/printing)
ipcMain.handle('print-pdf', async (event, { base64, title }) => {
  try {
    const buf = Buffer.from(base64 || '', 'base64');
    if (!buf.length) return { success: false, error: 'PDF 数据为空' };
    return await openPdfPreview(buf, title || '打印预览');
  } catch (error) {
    console.error(`PDF 打印失败: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Open the pdf.js-rendered print preview window (PDF bytes are temporarily stored on the server and retrieved by the preview page via token)
async function openPdfPreview(pdfBuffer, title) {
  const token = server.storePrintPreview(pdfBuffer);
  const previewWin = new BrowserWindow({
    width: 900,
    height: 700,
    title: title || L('打印预览', 'Print Preview')
  });
  await previewWin.loadURL(`${pageUrl(currentHost, currentPort)}/print-preview?token=${token}&title=${encodeURIComponent(title || L('打印预览', 'Print Preview'))}&lang=${currentLang}`);
  return { success: true };
}

// Open the "Settings" window: configure the web server listen address and port
let settingsWindow = null;
function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 460,
    height: 460,
    resizable: false,
    title: L('设置', 'Settings'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'), { query: { lang: currentLang } });

  settingsWindow.on('closed', function () {
    settingsWindow = null;
  });
}

// Read the listen config (for echoing back in the settings window);
// the dropdown address list = fixed items (127.0.0.1 / 0.0.0.0) + system-detected local IPv4 addresses (enumerated via ipconfig, etc.)
function settingsPayload() {
  const cfg = loadConfig();
  const local = getLocalIPv4Addresses();
  const allowedAddresses = [
    DEFAULT_LISTEN_ADDRESS,
    ...local.filter((a) => a !== DEFAULT_LISTEN_ADDRESS && a !== '0.0.0.0'),
    '0.0.0.0'
  ];
  return {
    listenAddress: cfg.listenAddress,
    listenPort: cfg.listenPort,
    language: cfg.language,
    allowedAddresses,
    minPort: MIN_LISTEN_PORT,
    maxPort: MAX_LISTEN_PORT,
    configPath: CONFIG_FILE
  };
}

ipcMain.handle('settings-get', () => settingsPayload());

// Synchronously read settings: the renderer process gets the UI language synchronously at startup (used by i18n.js detectLang)
ipcMain.on('settings-get-sync', (event) => {
  event.returnValue = settingsPayload();
});

// Save listen config: validate then write to config.json under the install path, and prompt to restart for it to take effect
ipcMain.handle('settings-save', (event, settings) => {
  const address = settings && settings.listenAddress;
  const portRaw = settings && settings.listenPort;
  const port = parseInt(portRaw, 10);
  const language = settings && settings.language;

  if (net.isIP(address) !== 4) {
    return { success: false, error: L('监听地址必须是有效的 IPv4 地址', 'Listen address must be a valid IPv4 address') };
  }
  if (isNaN(port)) {
    return { success: false, error: L('监听端口必须是数字', 'Listen port must be a number') };
  }
  if (port !== DEFAULT_LISTEN_PORT && (port < MIN_LISTEN_PORT || port > MAX_LISTEN_PORT)) {
    return { success: false, error: L('监听端口范围：0（随机空闲端口）或 3000 - 65535', 'Listen port range: 0 (random free port) or 3000 - 65535') };
  }
  const newLang = (language === 'en' || language === 'zh') ? language : loadConfig().language;

  const saved = saveConfig({ listenAddress: address, listenPort: port, language: newLang });
  if (!saved) {
    return { success: false, error: L('写入配置文件失败', 'Failed to write config file') };
  }

  // Language switch takes effect immediately: rebuild the menu + reload the main window (with the new language param)
  const langChanged = newLang !== currentLang;
  currentLang = newLang;
  if (langChanged) {
    setupMenu();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(pageUrl(currentHost, currentPort) + '?lang=' + currentLang);
    }
  }

  // Notify that settings are saved: UI language takes effect immediately, listen config takes effect after restarting
  const win = BrowserWindow.fromWebContents(event.sender);
  const options = {
    type: 'info',
    title: L('设置已保存', 'Settings Saved'),
    message: L('设置已保存。', 'Settings saved.'),
    detail: [
      L('监听地址: ', 'Listen address: ') + address,
      L('监听端口: ', 'Listen port: ') + (port === 0 ? L('随机空闲端口', 'random free port') : port),
      L('界面语言: ', 'Interface language: ') + (newLang === 'en' ? L('英文', 'English') : L('中文', 'Chinese')),
      '',
      L('界面语言已立即生效；监听地址与端口将在重启程序后生效。', 'The interface language takes effect immediately; listen address and port take effect after restarting the program.')
    ].join('\n'),
    buttons: [L('确定', 'OK')]
  };
  if (win && !win.isDestroyed()) {
    dialog.showMessageBox(win, options);
  } else {
    dialog.showMessageBox(options);
  }
  return { success: true };
});

// Show the "About" dialog, displaying basic app information
function showAboutDialog() {
  let author = '';
  let buildDate = '';
  try {
    const pkg = require('./package.json');
    author = pkg.author || '';
    buildDate = pkg.buildDate || '';
  } catch (e) {
    author = '';
    buildDate = '';
  }

  const info = {
    // name: app.getName(),
    name: "文档管理器",
    version: app.getVersion(),
    author,
    buildDate
  };

  const detail = [
    `${L('作者: ', 'Author: ')}${info.author || L('未知', 'Unknown')}`,
    `${L('版本: ', 'Version: ')}${info.version}`,
    `${L('软件日期: ', 'Build date: ')}${info.buildDate || L('未知', 'Unknown')}`,
    '',
    `${L('数据目录: ', 'Data directory: ')}${app.getPath('userData')}`
  ].join('\n');

  const options = {
    type: 'info',
    // title: `About ${info.name}`,
    title: `${L('关于', 'About')} - ${info.name}`,
    message: `${info.name}`,
    detail,
    buttons: [L('确定', 'OK')],
    defaultId: 0,
    noLink: true
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBox(mainWindow, options);
  } else {
    dialog.showMessageBox(options);
  }
}

function setupMenu() {
  const template = [
    {
      label: L('视图', 'View'),
      submenu: [
        {
          label: L('调试日志', 'Debug Log'),
          click: () => {
            createLogWindow();
            setTimeout(initLogWindow, 100);
          }
        },
        {
          label: 'Toggle Developer Tools',
          role: 'toggleDevTools'
        }
      ]
    },
    {
      role: 'window',
      label: L('窗口', 'Window'),
      submenu: [
        { role: 'minimize', label: L('最小化', 'Minimize') },
        { role: 'close', label: L('关闭', 'Close') }
      ]
    },
    {
      label: L('帮助', 'Help'),
      submenu: [
        {
          label: L('软件帮助', 'Software Help'),
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.executeJavaScript('window.showHelpDocument && window.showHelpDocument();').catch(() => {});
            }
          }
        },
        {
          label: L('Markdown扩展语法帮助', 'Markdown Extended Syntax Help'),
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.executeJavaScript('window.showHelpDocument && window.showHelpDocument({name: \'' + L('markdown_katex_tool.md', 'markdown_katex_tool_en.md') + '\', path: \'' + L('markdown_katex_tool.md', 'markdown_katex_tool_en.md') + '\', type: \'markdown\'});').catch(() => {});
            }
          }
        },
        {
          label: L('浏览器管理书库', 'Manage Library in Browser'),
          click: () => {
            if (currentPort) {
              shell.openExternal(pageUrl(currentHost, currentPort)).catch(() => {});
            } else {
              dialog.showMessageBox({
                type: 'warning',
                title: L('服务器未启动', 'Server Not Running'),
                message: L('服务器尚未启动，无法在浏览器中打开。', 'The server is not running, cannot open in the browser.'),
                buttons: [L('确定', 'OK')]
              });
            }
          }
        },
        {
          label: L('设置', 'Settings'),
          click: () => {
            openSettingsWindow();
          }
        },
        {
          label: L('关于', 'About'),
          click: () => {
            showAboutDialog();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  // Start using the listen address/port from the config file (config.json under the install path);
  // if listening fails (address doesn't exist, port in use, etc.), automatically restore defaults (127.0.0.1:0) and retry before starting
  let config = loadConfig();
  // First launch (config missing or language never set): auto-decide UI language by system locale and write it to config.json;
  // Chinese systems (zh) → Chinese, other systems → English; afterwards the config file is authoritative (can be manually edited or switched in settings)
  if (!config.languageConfigured) {
    config.language = detectSystemLanguage();
    saveConfig({ language: config.language });
  }
  currentLang = config.language; // Sync UI language at startup (menu/dialogs/window titles)
  let listenAddress = config.listenAddress;
  let listenPort = config.listenPort;
  try {
    server = await startServer(listenAddress, listenPort);
  } catch (err) {
    console.error(`监听 ${listenAddress}:${listenPort} 失败: ${err.message}`);
    console.error(L('自动恢复默认参数 (127.0.0.1:0) 后重试…', 'Retrying with default parameters (127.0.0.1:0)…'));
    listenAddress = DEFAULT_LISTEN_ADDRESS;
    listenPort = DEFAULT_LISTEN_PORT;
    saveConfig({ listenAddress, listenPort }); // Write back defaults synchronously to avoid failing again on next launch
    try {
      server = await startServer(listenAddress, listenPort);
    } catch (err2) {
      console.error(`恢复默认参数后监听仍失败: ${err2.message}`);
      dialog.showMessageBox({
        type: 'error',
        title: L('服务器启动失败', 'Server Failed to Start'),
        message: L('无法启动服务器: ', 'Failed to start server: ') + err2.message,
        buttons: [L('退出', 'Exit')]
      }).then(() => app.quit());
      return;
    }
    dialog.showMessageBox({
      type: 'warning',
      title: L('监听设置已恢复默认', 'Listen Settings Reset to Defaults'),
      message: L('配置的监听地址或端口无法使用，已自动恢复为默认参数。', 'The configured listen address or port is unavailable and has been reset to defaults automatically.'),
      detail: `${L('原参数: ', 'Original: ')}${config.listenAddress}:${config.listenPort}\n${L('已恢复: ', 'Restored: ')}${listenAddress}:${listenPort === 0 ? L('随机空闲端口', 'random free port') : listenPort}`,
      buttons: [L('确定', 'OK')]
    });
  }

  currentHost = listenAddress;
  currentPort = server.address().port;
  console.log(`Electron: Server listening on ${currentHost}:${currentPort}`);

  setupMenu();
  createWindow(currentPort);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(currentPort);
  });
});

app.on('window-all-closed', function () {
  if (server && server.close) {
    server.close();
  }
  if (process.platform !== 'darwin') app.quit();
});