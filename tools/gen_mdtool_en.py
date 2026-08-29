# -*- coding: utf-8 -*-
# 生成 markdown_katex_tool_en.md：代码块原样保留，顶格正文/标题按译文对照翻译
import re, json, sys
sys.path.insert(0, 'tools')
from trans_pairs_a import PAIRS

manifest = json.load(open('/tmp/prose_manifest.json', encoding='utf-8'))
# 校验：对照顺序与清单一致，防止错位
assert len(PAIRS) == len(manifest), f"pair count {len(PAIRS)} != manifest {len(manifest)}"
for i, (zh, en) in enumerate(PAIRS):
    assert zh == manifest[i], f"mismatch at {i}: {zh!r} != {manifest[i]!r}"
TRANS = dict(PAIRS)

src = open('public/markdown_katex_tool.md', encoding='utf-8').read().split('\n')
out = []
in_fence = False
missing = []
for i, l in enumerate(src, 1):
    stripped = l.strip()
    if stripped.startswith('```'):
        in_fence = not in_fence
        out.append(l)
        continue
    if in_fence:
        out.append(l)
        continue
    if l.startswith(' '):
        out.append(l)  # 缩进代码内容原样保留
        continue
    if re.search(r'[\u4e00-\u9fff]', l):
        en = TRANS.get(l)
        if en is not None:
            out.append(en)
        else:
            out.append(l)  # 兜底：保留中文，不丢内容
            missing.append((i, l))
    else:
        out.append(l)

with open('public/markdown_katex_tool_en.md', 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(out) + ('\n' if src[-1] != '' else ''))

print("lines:", len(out), "| untranslated top-level chinese lines:", len(missing))
for m in missing[:30]:
    print("  MISS", m[0], repr(m[1][:80]))
