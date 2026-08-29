// 渲染方式按钮 title 实测：加载 ?lang=<TEST_LANG>，触发 markdown/html 文档的渲染方式标签，读取各按钮 title
const { app, BrowserWindow } = require('electron');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LANG = process.env.TEST_LANG || 'en';
const PORT = 3196;

async function main() {
  const { startServer } = require(path.join(ROOT, 'server.js'));
  const server = await startServer('127.0.0.1', PORT);
  const win = new BrowserWindow({ show: false, width: 1200, height: 800 });
  await win.loadURL(`http://localhost:${PORT}/?lang=${LANG}`);
  await new Promise(r => setTimeout(r, 2500));
  const result = await win.webContents.executeJavaScript(`
    (function () {
      const out = [];
      out.push('I18N.lang = ' + (window.I18N ? I18N.lang : '?'));
      // markdown 文档的三个渲染模式按钮
      setupRenderModeTabs(['markdown', 'text', 'html-text'], 'markdown');
      out.push('markdown buttons:');
      document.querySelectorAll('#renderModeTabs .render-mode-tab').forEach(b =>
        out.push('  [' + b.textContent + '] title="' + b.title + '"'));
      // html 文档的两个渲染模式按钮
      setupRenderModeTabs(['html', 'text'], 'html');
      out.push('html buttons:');
      document.querySelectorAll('#renderModeTabs .render-mode-tab').forEach(b =>
        out.push('  [' + b.textContent + '] title="' + b.title + '"'));
      return out;
    })()
  `);
  console.log('=== RENDER MODE TITLES (' + LANG + ') ===');
  result.forEach(r => console.log(r));
  app.exit(0);
}

app.whenReady().then(main).catch(e => { console.error('ERR', e); app.exit(1); });
setTimeout(() => { console.error('TIMEOUT'); app.exit(2); }, 20000);
