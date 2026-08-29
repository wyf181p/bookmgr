// 复现测试：模拟 main.js 的 createWindow —— 以 ?lang=zh 加载页面，检查渲染端语言判定
const { app, BrowserWindow } = require('electron');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const LANG = process.env.TEST_LANG || 'zh'; // 模拟 currentLang
const PORT = 3198;

async function main() {
  const { startServer } = require(path.join(ROOT, 'server.js'));
  const server = await startServer('127.0.0.1', PORT);
  const win = new BrowserWindow({ show: false, width: 1200, height: 800 });
  // 与 main.js 一致：pageUrl(host, port) + '?lang=' + currentLang（config 为 0.0.0.0 时用 localhost）
  const url = `http://localhost:${PORT}/?lang=${LANG}`;
  console.log('LOAD URL:', url);
  await win.loadURL(url);
  await new Promise(r => setTimeout(r, 2500));
  const result = await win.webContents.executeJavaScript(`
    (function () {
      const out = [];
      out.push('location.href = ' + location.href);
      out.push('I18N.lang = ' + (window.I18N ? I18N.lang : 'UNDEFINED'));
      out.push('html lang = ' + document.documentElement.lang);
      out.push('document.title = ' + document.title);
      const pick = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim().slice(0, 30) : '(none)'; };
      out.push('top-bar-title = ' + pick('.top-bar-title'));
      out.push('sidebar h2 = ' + pick('.sidebar-header h2'));
      out.push('docSort option0 = ' + pick('#docSortSelect option'));
      out.push('tagPanel title = ' + pick('.tag-panel-title'));
      out.push('addLibraryBtn title = ' + (document.getElementById('addLibraryBtn') || {}).title);
      out.push('searchBtn title = ' + (document.getElementById('searchBtn') || {}).title);
      out.push('findInput placeholder = ' + (document.getElementById('findInput') || {}).placeholder);
      return out;
    })()
  `);
  console.log('=== RESULT (' + LANG + ') ===');
  result.forEach(r => console.log(r));
  app.exit(0);
}

app.whenReady().then(main).catch(e => { console.error('ERR', e); app.exit(1); });
setTimeout(() => { console.error('TIMEOUT'); app.exit(2); }, 20000);
