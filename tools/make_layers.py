# Слои rainroom из двух кадров (OFF/ON, выровнены по пикселям).
# Запуск: python3 tools/make_layers.py   (исходники в art_src/off.png, art_src/on.png)
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
W, H = 1672, 941
def load(p):
    im = Image.open(p).convert('RGB')
    if im.size != (W, H):  # OFF на 1 px уже — дублируем крайний столбец (сдвига нет, проверено diff)
        a = np.asarray(im); pad = np.repeat(a[:, -1:], W - a.shape[1], 1); im = Image.fromarray(np.concatenate([a, pad], 1)[:H])
    return im
off, on = load('art_src/off.png'), load('art_src/on.png')
A, B = np.asarray(off, float), np.asarray(on, float)
d = np.abs(A - B).sum(2); dy, dx = 0, 0
print('diff mean', round(d.mean(), 1), 'shift', dx, dy)

def soft(draw_fn, blur):
    m = Image.new('L', (W, H), 0); draw_fn(ImageDraw.Draw(m)); return m.filter(ImageFilter.GaussianBlur(blur))

GLASS = (198, 92, 1485, 771)
def objects(dr):  # силуэты предметов на подоконнике поверх стекла
    dr.rectangle((436, 698, 676, 800), 255); dr.rectangle((489, 652, 606, 670), 255); dr.rectangle((489, 652, 505, 702), 255); dr.rectangle((590, 652, 606, 702), 255)
    dr.line((609, 702, 652, 585), 255, 10); dr.ellipse((644, 578, 660, 594), 255)
    dr.rectangle((924, 750, 1036, 800), 255)
    dr.rounded_rectangle((1084, 737, 1188, 800), 8, 255); dr.rectangle((1186, 752, 1214, 800), 255)
    dr.polygon([(1343, 603), (1500, 603), (1500, 790), (1314, 790)], 255)
obj = Image.new('L', (W, H), 0); objects(ImageDraw.Draw(obj)); o = np.asarray(obj) > 0
# листья растения — по цвету в рамке (зелёное/светлое на тёмном стекле)
x0, y0, x1, y1 = 880, 655, 1068, 780
sub = A[y0:y1, x0:x1]; leaf = (sub[..., 1] > sub[..., 2] + 4) & (sub[..., 1] > 35)
L = Image.fromarray((leaf * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(3))
o[y0:y1, x0:x1] |= np.asarray(L) > 0
g = np.zeros((H, W), bool); g[GLASS[1]:GLASS[3], GLASS[0]:GLASS[2]] = True; g &= ~o
glass = Image.fromarray((g * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
gl = np.asarray(glass, float) / 255
# неон: насыщенные яркие пиксели внутри стекла
mx, mn = A.max(2), A.min(2); neon = ((mx - mn > 80) & (mx > 120) & g)
neonm = Image.fromarray((neon * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3))

masks = {
  'lantern': soft(lambda d: (d.ellipse((-80, 200, 240, 540), 255), d.ellipse((-60, 520, 190, 690), 255)), 28),
  'lamp': soft(lambda d: (d.ellipse((1400, -60, 1780, 420), 255), d.rectangle((1500, 0, 1672, 760), 200)), 45),
  'radio': soft(lambda d: d.ellipse((350, 560, 760, 900), 255), 24),
  'laptop': soft(lambda d: d.polygon([(1205, 600), (1640, 590), (1650, 885), (1190, 885)], 255), 16),
}
import os
for k in ['aligned', 'half', 'masks']: os.makedirs(f'public/layers/{k}', exist_ok=True)
def save(im, name, mask=False):
    if mask: im.save(f'public/layers/masks/{name}.png'); return
    im.save(f'public/layers/aligned/{name}.png'); im.resize((W // 2, H // 2), Image.LANCZOS).save(f'public/layers/half/{name}.png')
save(off, '01_base')
for i, k in enumerate(['lantern', 'lamp', 'radio', 'laptop']):
    m = np.asarray(masks[k], float) / 255
    if k in ('lantern', 'lamp'): m = m * (1 - 0.92 * gl)  # стекло рисует шейдер дождя
    m = np.clip(m * np.clip(d / 40, 0.25, 1) * 1.15, 0, 1)  # где кадры почти совпадают — слой прозрачнее
    rgba = np.dstack([B, m * 255]).astype(np.uint8); save(Image.fromarray(rgba, 'RGBA'), f'0{i+2}_{k}_on')
save(glass, 'glass', True); save(neonm, 'neon', True)
# фон экрана ноутбука (для живых часов)
print('screen bg', B[700, 1470].astype(int), B[650, 1470].astype(int), B[725, 1590].astype(int))
