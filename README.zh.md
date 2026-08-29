# 📚 本地文档管理器（文档管理器）

一款基于 **Electron** 的本地文档管理桌面应用，用于集中管理本地书籍、文档与各类文本文件。它管理的是文档与本地路径的对应关系，方便分类、查找、打开它们——文档再多，也不用记具体保存路径。

Web 界面同时支持**纯浏览器模式**运行（`node server.js`），浏览器模式支持打印预览（Electron 应用本身不支持，详见帮助文档）。

---

## ✨ 功能特性

- **书库分类管理** —— 把分散的本地文档按「书库」分门别类，拖拽排序、一键切换
- **直接预览** —— 无需打开其他软件：
  - **Markdown**：增强渲染引擎，支持 KaTeX 数学公式、mermaid 图形、JSXGraph 数学图像、代码高亮、行号、复制按钮、front-matter 元信息、可点击的目录
  - **纯文本 / 代码**（多种语言）：语法高亮 + 行号
  - **HTML**（隔离 iframe）、**PDF**（pdf.js 查看器）、**图片**（缩放 + 缩略导航图）
  - **文件夹**：以文件列表方式浏览目录内容
- **标签体系** —— 为文档打标签，按标签过滤与检索；一个文档可设置多个标签
- **全文关键字搜索** —— 按 书库 / 文档类型 / 文档名 / 标签 组合搜索，支持 `*` 通配符，结果可批量保存到书库
- **文档内查找** —— <kbd>Ctrl+F</kbd> 查找栏，命中位置高亮跳转（Markdown / 纯文本 / 代码 / HTML）
- **分页与多视图** —— 将预览内容锁定为分页（标签页），分页可拖拽排序，也可拖到右侧/下方形成并列视图，同时浏览多个文档
- **导出 / 导入备份** —— 数据保存在本地 `library.json`，可导出全部书库为单个 JSON 文件，随时导入恢复
- **系统软件打开** —— 系统「打开方式」对话框，以及可扫描本机已装编辑器的编辑器选择器
- **功能区自动隐藏** —— 右键导航区可开关自动隐藏，获得更大阅读区域
- **🌐 中英文界面** —— 在设置窗口切换语言，或手动编辑 `config.json`；首次启动按系统 locale 自动选择（中文系统 → 中文，其余 → 英文）

---

## 🖥️ 环境要求

- **Node.js** ≥ 18（开发环境）
- **npm**（随 Node.js 自带）
- Windows / macOS / Linux（打包目标在 `package.json` 中配置）

---

## 🚀 快速开始

### 作为桌面应用运行（Electron）

```bash
npm install
npm run electron
```

### 作为网页应用运行（浏览器模式）

```bash
npm start
# 或
node server.js
```

然后浏览器打开输出中的地址（如 `http://localhost:3081`）。浏览器模式支持打印预览；Electron 应用不支持（详见帮助文档）。

### 打包安装程序

```bash
npm run dist
```

通过 electron-builder 生成 Windows NSIS 安装包（输出在 `dist/` 目录）。

---

## ⚙️ 配置说明

设置存放在 **`config.json`** 中：打包安装后位于 exe 同目录（方便手动编辑），开发模式下位于项目根目录。

```json
{
  "listenAddress": "127.0.0.1",
  "listenPort": 0,
  "language": "zh"
}
```

| 配置项 | 说明 |
|-----|-------------|
| `listenAddress` | HTTP 监听地址。**默认 `127.0.0.1`** —— 仅本机（安装后首次启动写入的默认值）；改为 `0.0.0.0` 可监听所有网卡（局域网访问）。也支持其他本机 IPv4 地址。 |
| `listenPort` | HTTP 监听端口。**默认 `0`** = 随机空闲端口。范围 `3000–65535`。 |
| `language` | 界面语言：`"zh"`（中文，默认）或 `"en"`（英文）。若首次启动时配置文件缺失或没有 `language` 字段，将按系统 locale 自动检测并回写。 |

也可在运行时切换语言：**帮助 → 设置 → 界面语言**，保存后立即生效（监听地址/端口仍需重启后生效）。

> 设置窗口会显示配置文件的具体路径。

---

## 📖 帮助文档

应用内置两份帮助文档（中英文版本），从**帮助**菜单打开：

| 文档 | 说明 |
|----------|-------------|
| `public/bookmgr_usage.md` / `_en.md` | 软件使用帮助（书库、文档、预览、分页、搜索、快捷键…） |
| `public/markdown_katex_tool.md` / `_en.md` | Markdown 扩展语法帮助：基础语法、LaTeX/KaTeX 公式、数学图像（JSXGraph）、mermaid 图形、页面属性（front-matter / YAML）、CSS 样式修饰 |

---

## 🗂️ 数据存储

- **`library.json`** —— 所有书库/文档/标签记录。打包后位于应用数据目录，开发模式下位于项目根目录。**删除书库/文档只删除记录，磁盘上的原文件不会被删除。**
- **`config.json`** —— 服务器与语言设置（见上文）。

---

## 🏗️ 项目结构

```
book-mgr/
├── main.js              # Electron 主进程：窗口、菜单、对话框、设置 IPC、配置读写
├── preload.js           # contextBridge：向渲染进程暴露打印 / 打开 / 设置 API
├── server.js            # Express 后端：静态文件、REST API、打印预览暂存
├── settings.html        # 设置窗口（监听地址/端口、界面语言）
├── config.json          # 服务器 + 语言设置（可手动编辑）
├── public/              # Web 界面（由 server.js 提供）
│   ├── index.html       # 主页面
│   ├── app.js           # 界面逻辑（书库、文档、预览、分页、搜索…）
│   └── js/i18n.js       # 中英文国际化（字典 + DOM 自动翻译）
├── tools/               # 开发工具（i18n 审计/测试、文档翻译生成）
├── package.json
└── LICENSE              # MIT 协议
```

### REST API（部分）

| 接口 | 用途 |
|----------|---------|
| `GET /api/library` · `POST /api/library` · `PUT/DELETE /api/library/:id` | 书库增删改查 |
| `POST /api/library/:id/documents` · `PUT/DELETE …/:docId` | 文档增删改查 |
| `GET /api/document/content` | 读取文档内容 |
| `POST /api/pdf/convert` | PDF 渲染管线 |
| `GET /api/export` · `POST /api/import` | 备份导出 / 导入 |
| `GET /api/browse/list` · `GET /api/drives` | 文件 / 磁盘浏览 |
| `GET /api/editors` · `POST /api/editors/scan` | 本机编辑器发现 |
| `GET /api/config` | 语言配置（浏览器模式） |
| `/fs/*` | 按 web root 提供文件 |

---

## 🛠️ 开发相关

- 可用 `node --check` 检查各 JS 文件语法；`tools/` 下的 Electron 无头 UI 测试（如 `tools/i18n_test.js`）可用于回归检查中英文界面。
- `tools/audit_i18n.py`：审计界面字符串是否都有 i18n 字典条目。
- `tools/gen_mdtool_en.py`：根据中文版 Markdown 扩展语法帮助生成英文版（译文对照在 `tools/trans_pairs_a.py`）。

---

## 📄 开源协议

[MIT](LICENSE) © 2026 sw
