// 分页命名实测：加载 ?lang=<TEST_LANG>，模拟锁定文档为分页，检查分页标签名
const { app, BrowserWindow } = require('electron');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LANG = process.env.TEST_LANG || 'en';
const PORT = 3197;

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
      // 模拟：打开了一个文档，然后锁定为分页（连点 3 次）
      currentDocument = { name: 'demo.md', path: '/demo.md', type: 'markdown' };
      document.getElementById('documentView').classList.remove('hidden');
      for (let i = 0; i < 3; i++) lockCurrentAsTab();
      out.push('tab names = ' + tabPages.filter(t => !t.isMain).map(t => t.name).join(', '));
      // 分页标签在 DOM 中的实际显示
      out.push('tab DOM = ' + Array.from(document.querySelectorAll('.tab-name')).map(e => e.textContent).join(', '));
      return out;
    })()
  `);
  console.log('=== TAB NAME (' + LANG + ') ===');
  result.forEach(r => console.log(r));
  app.exit(0);
}

app.whenReady().then(main).catch(e => { console.error('ERR', e); app.exit(1); });
setTimeout(() => { console.error('TIMEOUT'); app.exit(2); }, 20000);
