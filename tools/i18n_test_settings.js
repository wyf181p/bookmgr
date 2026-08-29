// 设置窗口 i18n 实测：加载 settings.html?lang=<TEST_LANG>，检查语言下拉选项不被翻译、其余标签已翻译
const { app, BrowserWindow } = require('electron');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LANG = process.env.TEST_LANG || 'en';

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 460, height: 460 });
  await win.loadFile(path.join(ROOT, 'settings.html'), { query: { lang: LANG } });
  await new Promise(r => setTimeout(r, 800));
  const result = await win.webContents.executeJavaScript(`
    (function () {
      const CJK = /[\\u4e00-\\u9fff]/;
      const out = [];
      const langOpts = Array.from(document.querySelectorAll('#lang option')).map(o => o.value + '=' + o.textContent);
      out.push('lang options: ' + langOpts.join(', '));
      document.querySelectorAll('body *').forEach(el => {
        const t = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? el.childNodes[0].nodeValue.trim() : '';
        if (t && CJK.test(t)) out.push('TEXT[' + el.tagName + '#' + el.id + '] ' + t.slice(0, 40));
        ['title', 'placeholder'].forEach(a => {
          const v = el.getAttribute(a);
          if (v && CJK.test(v)) out.push('ATTR ' + a + '[' + el.tagName + '#' + el.id + '] ' + v.slice(0, 40));
        });
      });
      out.push('title: ' + document.title);
      return out;
    })()
  `);
  console.log('=== SETTINGS WINDOW (en) ===');
  result.forEach(r => console.log(r));
  app.exit(0);
}).catch(e => { console.error('ERR', e); app.exit(1); });
setTimeout(() => { console.error('TIMEOUT'); app.exit(2); }, 15000);
