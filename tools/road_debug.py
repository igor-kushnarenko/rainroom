# Наложение путей машин (SCENE.roads из src/config.js) на арт: python3 tools/road_debug.py → shots/roads_debug.png
import json, re
from PIL import Image, ImageDraw
src = open('src/config.js').read()
block = src[src.index('roads: ['):src.index('],\n  weather')]
roads = [json.loads(m) for m in re.findall(r'pts: (\[\[.*?\]\])', block)]
im = Image.open('public/layers/aligned/01_base.png').convert('RGB'); d = ImageDraw.Draw(im)
for i, pts in enumerate(roads):
    d.line([tuple(p) for p in pts], fill=[(0, 255, 0), (255, 255, 0), (0, 200, 255), (255, 120, 0)][i % 4], width=1)
    for p in pts: d.ellipse((p[0] - 2, p[1] - 2, p[0] + 2, p[1] + 2), outline=(255, 255, 255))
im.crop((560, 480, 1000, 775)).resize((1320, 885), Image.NEAREST).save('shots/roads_debug.png')
print(len(roads), 'дорог')
