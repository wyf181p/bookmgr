# -*- coding: utf-8 -*-
import re, sys

files = [
    'public/js/sw_mathgraph.js',
    'public/js/sw_mdtool_jjwai.js',
    'public/css/mdstyle.css',
    'public/css/tech-blog-dark.css',
    'public/css/tech-blog-light.css',
]
for fn in files:
    lines = open(fn, encoding='utf-8').read().split('\n')
    print("=" * 20, fn, "=" * 20)
    for i, l in enumerate(lines, 1):
        if re.search(r'[\u4e00-\u9fff]', l):
            print(i, l)
    print()
