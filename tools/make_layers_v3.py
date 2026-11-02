# Слои сцены v3: город (art_src/v3: sky, far, mid, near) + интерьер с прозрачным стеклом (art_src/v2).
# Запуск: python3 tools/align_v2.py && python3 tools/make_layers_v3.py
# Выход: public/layers/v3/{aligned,half}/{sky,far,mid,near,room_off,room_on}.png,
#        public/layers/v3/masks/{glass,light_rgb,light_laptop,far_fx,mid_fx,near_fx}.png
import os, numpy as np
from PIL import Image, ImageDraw, ImageFilter
W, H = 1672, 941
OUT = 'public/layers/v3'
for k in ['aligned', 'half', 'masks']: os.makedirs(f'{OUT}/{k}', exist_ok=True)
def save(im, name):
    im.save(f'{OUT}/aligned/{name}.png'); im.resize((W // 2, H // 2), Image.LANCZOS).save(f'{OUT}/half/{name}.png')
def mask(arr, name): Image.fromarray(np.clip(arr * 255 + .5, 0, 255).astype(np.uint8)).save(f'{OUT}/masks/{name}.png')

# ---------- город ----------
for n in ['sky', 'far', 'mid', 'near']:
    im = Image.open(f'art_src/v3/{n}.png').convert('RGB' if n == 'sky' else 'RGBA'); assert im.size == (W, H); save(im, n)
    if n == 'sky': continue
    A = np.asarray(im, float); r, g, b, a = [A[..., i] for i in range(4)]; op = a > 200
    mx, mn = A[..., :3].max(2), A[..., :3].min(2); lum = A[..., :3].mean(2)
    neon = (mx - mn > 90) & (mx > 140) & ((b > r + 20) | ((r > 150) & (b > 120) & (g < r - 50))) & op   # розовые/голубые вывески
    nm = np.asarray(Image.fromarray((neon * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.5)), float) / 255
    win = (lum > 70) & (r > b + 25) & (g > b) & (r < 250 + 10) & op & ~neon                              # тёплые окна (оранжевые)
    red = (r > 170) & (g < 70) & (b < 70) & (r > g * 3) & op                                               # красные огни
    if n == 'near':  # у ближних домов синий фасад/крыша ловятся как неон: оставляем только две вывески и маячок
        yy, xx = np.mgrid[0:H, 0:W]; nm = nm * ((xx > 1420) & (xx < 1560) & (yy > 560) & (yy < 670)); red &= (yy < 140) & (xx > 1540)
    if n == 'mid':  # дорога в каньоне — сплошные трассы фар, это не окна
        yy, xx = np.mgrid[0:H, 0:W]; road = (yy > 690) & (xx > 900) & (xx < 1110); win &= ~road; red &= ~road
    mask(np.dstack([win, np.asarray(Image.fromarray((red * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)), float) / 255, nm]), f'{n}_fx')
    print(n, 'окон', int(win.sum()), 'красных', int(red.sum()), 'неона', int(neon.sum()))

# ---------- интерьер ----------
off = Image.open('art_src/v2/room_off_layer.png').convert('RGBA'); on = Image.open('art_src/v2/room_on_aligned.png').convert('RGBA')
save(off, 'room_off'); save(on, 'room_on')
A = np.asarray(off, float)[..., :3]; B = np.asarray(on, float)[..., :3]; alpha = np.asarray(off, float)[..., 3] / 255
glass = 1 - alpha; mask(glass, 'glass')
yy, xx = np.mgrid[0:H, 0:W].astype(float)
diff = B - A
cyan = np.clip((B[..., 2] - B[..., 0]) / 120, 0, 1); warm = np.clip((B[..., 0] - B[..., 2]) / 120, 0, 1)
def fall(cx, cy, r): return 1 / (1 + ((xx - cx) ** 2 + (yy - cy) ** 2) / r ** 2)
w = {
  'lamp': 1.0 * fall(1592, 212, 420) * (0.3 + warm),
  'lantern': 0.8 * np.maximum(fall(70, 380, 260), fall(50, 605, 200)) * (0.3 + warm),
  'radio': 0.5 * fall(555, 745, 150) * (0.3 + warm),
  'laptop': 1.2 * fall(1420, 720, 260) * (0.15 + 2 * cyan),
}
tot = sum(w.values()) + 1e-6; share = {k: v / tot for k, v in w.items()}
def hard(fn):
    m = Image.new('L', (W, H), 0); fn(ImageDraw.Draw(m)); return np.asarray(m.filter(ImageFilter.GaussianBlur(1.5)), float) / 255
HARD = {
  'laptop': hard(lambda d: d.polygon([(1312, 605), (1622, 612), (1610, 805), (1600, 812), (1640, 868), (1228, 878), (1240, 822), (1305, 800)], 255)),
  'radio': hard(lambda d: (d.rectangle((438, 648, 678, 815), 255), d.line((612, 700, 650, 590), 255, 12), d.ellipse((640, 578, 662, 600), 255))),
  'lamp': hard(lambda d: d.polygon([(1538, 222), (1556, 150), (1598, 128), (1640, 145), (1656, 228)], 255)),
  'lantern': hard(lambda d: (d.rectangle((28, 275, 112, 445), 255), d.rectangle((22, 570, 82, 636), 255))),
}
# растение и кружка подсвечены в ON слева (фонарь/радио) — лампе справа достаётся только их правая сторона
for (x0, y0, x1, y1) in [(885, 665, 1060, 835), (1072, 728, 1212, 848)]:
    reg = np.zeros((H, W)); reg[y0:y1, x0:x1] = 1; reg = np.asarray(Image.fromarray((reg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)), float) / 255
    side = np.clip((xx - (x0 + x1) / 2) / ((x1 - x0) / 2), 0, 1) * 0.7
    gain = share['lamp'] * (1 - side) * reg
    share['lamp'] = share['lamp'] * side * reg + share['lamp'] * (1 - reg)
    share['lantern'] = share['lantern'] + gain * 0.55; share['radio'] = share['radio'] + gain * 0.45
for k, m in HARD.items():
    for j in share: share[j] = share[j] * (1 - m) + (m if j == k else 0)
mask(np.dstack([share['lamp'], share['lantern'], share['radio']]), 'light_rgb'); mask(share['laptop'], 'light_laptop')
S8 = {k: np.round(v * 255) / 255 for k, v in share.items()}
allon = A + diff * sum(S8.values())[..., None]; m = alpha > 0.99
print('всё вкл vs ON, mean |diff| в интерьере:', round(np.abs(allon - B)[m].mean(), 2), ' OFF vs ON:', round(np.abs(A - B)[m].mean(), 2))
lamp_on = A + diff * S8['lamp'][..., None]
print('лампа одна: экран ноутбука, отличие от OFF:', round(np.abs(lamp_on - A)[620:730, 1330:1600].mean(), 2))
print('фон панели часов ON:', B[700, 1500].astype(int), B[660, 1590].astype(int))
