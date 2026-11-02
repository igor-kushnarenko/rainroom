# Выравнивание room_on_layer по room_off_layer (tools/align_v2.py → art_src/v2/room_on_aligned.png).
# Корреляция градиентов log-яркости (не зависит от освещения) по горизонтальным полосам: верх кадра совпадает,
# а подоконник/стол в ON нарисован на ~5 px выше — поэтому сдвиг по вертикали подбирается для каждой полосы
# и сглаживается (вертикальная деформация), по горизонтали — общий сдвиг.
import numpy as np; from PIL import Image
A = np.asarray(Image.open('art_src/v2/room_off_layer.png'), float); B = np.asarray(Image.open('art_src/v2/room_on_layer.png'), float)
H, W = A.shape[:2]
def feat(X):
    gy, gx = np.gradient(np.log1p(X[..., :3].mean(2))); return np.hypot(gx, gy) * (X[..., 3] > 250)
fa, fb = feat(A), feat(B)
def sample_rows(img, ys):  # img[ys] с дробными ys (линейно)
    y0 = np.clip(np.floor(ys).astype(int), 0, H - 1); y1 = np.clip(y0 + 1, 0, H - 1); f = (ys - np.floor(ys))
    f = f.reshape((-1,) + (1,) * (img.ndim - 1)); return img[y0] * (1 - f) + img[y1] * f
# общий сдвиг (для отчёта)
def gerr(dy): return np.abs(sample_rows(fb, np.arange(H) - dy) - fa)[40:-40, 40:-40].mean()
g = min((gerr(d), d) for d in np.arange(-6, 6.01, 0.1)); print('лучший общий сдвиг dy =', round(g[1], 1), 'err', round(g[0], 4), '(0:', round(gerr(0), 4), ')')
centers = np.arange(20, H - 20, 12); shifts = []; wts = []
for c in centers:
    sl = slice(max(0, c - 24), min(H, c + 24)); a = fa[sl]
    if a.sum() < 50: shifts.append(np.nan); wts.append(0); continue
    best = min((np.abs(sample_rows(fb, np.arange(sl.start, sl.stop) - d) - a).sum(), d) for d in np.arange(-8, 8.01, 0.25))
    shifts.append(-best[1]); wts.append(a.sum())
shifts = np.array(shifts); ok = ~np.isnan(shifts)
sm = np.interp(centers, centers[ok], shifts[ok])
sm = np.array([np.median(sm[max(0, i - 3):i + 4]) for i in range(len(sm))])  # медиана по 7 полосам
k = np.ones(5) / 5; sm = np.convolve(np.pad(sm, 2, mode='edge'), k, 'valid')
dyrow = np.interp(np.arange(H), centers, sm)  # ON[y + dyrow] ↔ OFF[y]
print('вертикальный сдвиг ON относительно OFF по высоте (y: px):', {int(y): round(float(dyrow[y]), 1) for y in range(0, H, 80)})
out = sample_rows(B, np.clip(np.arange(H) + dyrow, 0, H - 1)); out[..., 3] = A[..., 3]  # силуэт стекла — как у OFF
print('err до', round(np.abs(fb - fa)[40:-40].mean(), 4), 'после', round(np.abs(feat(out) - fa)[40:-40].mean(), 4))
Image.fromarray(np.clip(out + .5, 0, 255).astype(np.uint8), 'RGBA').save('art_src/v2/room_on_aligned.png')
