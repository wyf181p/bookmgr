// i18n 实测脚本：隐藏窗口加载 ?lang=en 页面，收集仍含中文的可见文本与属性
const { app, BrowserWindow } = require('electron');
const path = require('path');

const PORT = 3199;
let server;

const ROOT = path.join(__dirname, '..');

async function main() {
  const { startServer } = require(path.join(ROOT, 'server.js'));
  server = await startServer('127.0.0.1', PORT);
  const win = new BrowserWindow({ show: false, width: 1200, height: 800 });
  await win.loadURL(`http://127.0.0.1:${PORT}/?lang=en`);
  // 等待 app.js 初始渲染完成
  await new Promise(r => setTimeout(r, 2500));
  const result = await win.webContents.executeJavaScript(`
    (function () {
      const CJK = /[\\u4e00-\\u9fff]/;
      const out = [];
      // 收集含中文的文本节点（跳过 script/style/textarea/隐藏容器里已被翻译的）
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const v = n.nodeValue;
        if (v && CJK.test(v)) {
          const p = n.parentElement;
          out.push('TEXT[' + (p ? p.tagName + '.' + p.className + '#' + p.id : '?') + '] ' + JSON.stringify(v.slice(0, 60)));
        }
      }
      // 收集含中文的 title/placeholder/alt/aria-label
      document.querySelectorAll('*').forEach(el => {
        ['title', 'placeholder', 'alt', 'aria-label'].forEach(a => {
          const v = el.getAttribute(a);
          if (v && CJK.test(v)) {
            out.push('ATTR ' + a + '[' + el.tagName + '.' + el.className + '#' + el.id + '] ' + JSON.stringify(v.slice(0, 60)));
          }
        });
      });
      // 收集 iframe（markdown 渲染帧）内残留中文
      document.querySelectorAll('iframe').forEach(f => {
        try {
          const idoc = f.contentDocument;
          if (!idoc) return;
          idoc.querySelectorAll('*').forEach(el => {
            ['title', 'placeholder', 'alt'].forEach(a => {
              const v = el.getAttribute(a);
              if (v && CJK.test(v)) out.push('IFRAME-ATTR ' + a + '[' + el.tagName + '] ' + JSON.stringify(v.slice(0, 50)));
            });
          });
          const walk = idoc.createTreeWalker(idoc.body, NodeFilter.SHOW_TEXT);
          let nn;
          while ((nn = walk.nextNode())) {
            if (nn.nodeValue && CJK.test(nn.nodeValue) && nn.nodeValue.trim().length < 80) {
              out.push('IFRAME-TEXT ' + JSON.stringify(nn.nodeValue.trim().slice(0, 50)));
            }
          }
        } catch (e) { /* 跨域 iframe 忽略 */ }
      });
      return out;
    })()
  `);
  console.log('=== REMAINING CHINESE (%d) ===', result.length);
  const seen = {};
  result.forEach(r => { seen[r] = (seen[r] || 0) + 1; });
  Object.keys(seen).forEach(r => console.log(seen[r] > 1 ? seen[r] + 'x ' + r : r));
  app.exit(0);
}

app.whenReady().then(main).catch(e => { console.error('ERR', e); app.exit(1); });
setTimeout(() => { console.error('TIMEOUT'); app.exit(2); }, 20000);
