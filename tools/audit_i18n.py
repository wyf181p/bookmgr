# -*- coding: utf-8 -*-
import re

# 1) 解析 i18n.js 字典键（还原 JS 转义 → 运行时值）
i18n_src = open('public/js/i18n.js', encoding='utf-8').read()
keys = set()
for m in re.finditer(r"^\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)',?\s*$", i18n_src, re.M):
    k = m.group(1)
    k = re.sub(r"\\(.)", r"\1", k)  # 还原 \\ 等转义
    keys.add(k)
print("dict keys:", len(keys))

def unesc(s):
    return re.sub(r"\\(.)", r"\1", s)

# 2) index.html 文本节点与属性
html = open('public/index.html', encoding='utf-8').read()
missing_html = []
texts = set(m.group(1).strip() for m in re.finditer(r'>([^<>]*[\u4e00-\u9fff][^<>]*)<', html) if m.group(1).strip())
for s in sorted(texts):
    if s not in keys:
        missing_html.append(('TEXT', s))
attrs = set(m.group(1) for m in re.finditer(r'(?:title|placeholder|alt)="([^"]*[\u4e00-\u9fff][^"]*)"', html))
for s in sorted(attrs):
    if s not in keys:
        missing_html.append(('ATTR', s))
print("=== index.html missing (%d) ===" % len(missing_html))
for t, s in missing_html:
    print(" ", t, repr(s))

# 3) app.js 字面量：未在 t( 调用内的中文串需有字典键（observer 依赖）
src = open('public/app.js', encoding='utf-8').read()
lines = src.split('\n')
missing_js = []
checked = set()
for i, l in enumerate(lines, 1):
    for m in re.finditer(r"(['\"])((?:(?!\1).)*?[\u4e00-\u9fff](?:(?!\1).)*?)\1", l):
        lit = unesc(m.group(2))
        if lit in checked:
            continue
        checked.add(lit)
        before = l[:m.start()]
        if re.search(r"\bt\(\s*$", before):  # 已被 t('...') 包裹
            continue
        if lit not in keys:
            missing_js.append((i, lit))
print("=== app.js literals without dict key and not wrapped (%d) ===" % len(missing_js))
for i, s in missing_js:
    print(" ", i, repr(s[:110]))
