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

# ---------- карты влияния света (v2): ON = OFF + Σ share_i·(ON−OFF) ----------
# Каждый пиксель разницы ON−OFF отдаётся ближайшему/сильнейшему источнику; предметы-источники — жёсткие маски.
yy, xx = np.mgrid[0:H, 0:W].astype(float)
diff = B - A; dl = np.clip(diff.mean(2), 0, None)
cyan = np.clip((B[..., 2] - B[..., 0]) / 120, 0, 1)         # голубизна ON-пикселя (свет ноутбука)
warm = np.clip((B[..., 0] - B[..., 2]) / 120, 0, 1)
def fall(cx, cy, r): return 1 / (1 + ((xx - cx) ** 2 + (yy - cy) ** 2) / r ** 2)
w = {
  'lamp': 1.0 * fall(1590, 200, 420) * (0.3 + warm),
  'lantern': 0.8 * np.maximum(fall(62, 372, 260), fall(50, 600, 200)) * (0.3 + warm),
  'radio': 0.5 * fall(555, 745, 150) * (0.3 + warm),
  'laptop': 1.2 * fall(1420, 720, 260) * (0.15 + 2 * cyan),
}
tot = sum(w.values()) + 1e-6; share = {k: v / tot for k, v in w.items()}
def hard(poly_or_fn):
    m = Image.new('L', (W, H), 0); poly_or_fn(ImageDraw.Draw(m)); return np.asarray(m.filter(ImageFilter.GaussianBlur(1.5)), float) / 255
H_ = {
  'laptop': hard(lambda d: d.polygon([(1312, 600), (1625, 594), (1622, 800), (1600, 812), (1640, 870), (1215, 875), (1240, 820), (1305, 800)], 255)),
  'radio': hard(lambda d: (d.rectangle((432, 650, 680, 805), 255), d.line((609, 702, 652, 585), 255, 12), d.ellipse((640, 574, 664, 598), 255))),
  'lamp': hard(lambda d: d.polygon([(1525, 90), (1600, 70), (1660, 120), (1660, 240), (1520, 240)], 255)),
  'lantern': hard(lambda d: (d.rectangle((20, 285, 115, 450), 255), d.rectangle((15, 565, 90, 640), 255))),
}
# Растение и кружка в ON-кадре подсвечены слева (фонарь/радио). Лампа справа получает только их правую сторону.
for (x0, y0, x1, y1) in [(880, 655, 1068, 832), (1075, 722, 1225, 838)]:
    reg = np.zeros((H, W)); reg[y0:y1, x0:x1] = 1; reg = np.asarray(Image.fromarray((reg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)), float) / 255
    cx = (x0 + x1) / 2; side = np.clip((xx - cx) / ((x1 - x0) / 2), 0, 1) * 0.7   # 0 слева … 0.7 у правого края
    newlamp = share['lamp'] * side * reg + share['lamp'] * (1 - reg)
    gain = share['lamp'] * (1 - side) * reg  # снятое с лампы → фонарю и радио пропорционально
    share['lantern'] = share['lantern'] + gain * 0.55
    share['radio'] = share['radio'] + gain * 0.45
    share['lamp'] = newlamp
for k, m in H_.items():  # предмет-источник: его пиксели только у него (экран ноутбука не светится от лампы)
    for j in share: share[j] = share[j] * (1 - m) + (m if j == k else 0)
share = {k: v * (1 - gl) for k, v in share.items()}           # стекло рисует свой шейдер
rgb = np.dstack([share['lamp'], share['lantern'], share['radio']])
Image.fromarray((rgb * 255).round().astype(np.uint8)).save('public/layers/masks/light_rgb.png')
Image.fromarray((share['laptop'] * 255).round().astype(np.uint8)).save('public/layers/masks/light_laptop.png')
save(on, '06_on')
for i, k in enumerate(['lantern', 'lamp', 'radio', 'laptop']):  # справочные слои устройств (ON с альфой = доля)
    save(Image.fromarray(np.dstack([B, share[k] * 255]).astype(np.uint8), 'RGBA'), f'0{i+2}_{k}_on')
S8 = {k: np.round(v * 255) / 255 for k, v in share.items()}
allon = A + diff * sum(S8.values())[..., None]
mask = gl < 0.01
print('all-on vs ON, mean |diff| (0..255) вне стекла:', round(np.abs(allon - B)[mask].mean(), 2), ' база OFF vs ON:', round(np.abs(A - B)[mask].mean(), 2))
lamp_on = A + diff * S8['lamp'][..., None]
scr = (slice(612, 740), slice(1330, 1600))
for nm, (x0, y0, x1, y1) in [('растение', (880, 655, 1068, 832)), ('кружка', (1075, 722, 1225, 838))]:
    cx = (x0 + x1) // 2; L_ = np.abs(lamp_on - A)[y0:y1, x0:cx].mean(); R_ = np.abs(lamp_on - A)[y0:y1, cx:x1].mean()
    print(f'лампа одна: {nm} слева {L_:.1f} / справа {R_:.1f}')
print('лампа одна: экран ноутбука, среднее отличие от OFF:', round(np.abs(lamp_on - A)[scr].mean(), 2))

# ---------- город (v5): маска окон (r) и красных огней (g) внутри стекла ----------
lum = A.mean(2); r_, g_, b_ = A[..., 0], A[..., 1], A[..., 2]
nz = np.asarray(neonm.point(lambda v: 255 if v > 20 else 0).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(15))) > 0  # только крупные вывески (точки-огни остаются)
win = (lum > 95) & (r_ > b_ + 10) & (g_ > b_ - 5) & (mx - mn < 110) & g & (yy > 120) & ~nz              # тёплые светящиеся окна
red = (r_ > 100) & (g_ < 80) & (b_ < 90) & (r_ > g_ * 1.8) & g & (yy < 600)
for (x0, y0, x1, y1) in [(685, 365, 740, 445), (985, 395, 1045, 475)]: red[y0:y1, x0:x1] = False  # красные вывески — не огни   # красные огоньки на шпилях
red_m = Image.fromarray((red * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
city = np.dstack([win * 255, np.asarray(red_m), np.zeros((H, W))]).astype(np.uint8)
Image.fromarray(city).save('public/layers/masks/city.png')
print('окон-пикселей', int(win.sum()), 'красных огней-пикселей', int(red.sum()))
