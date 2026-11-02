"""Убирает «кольца» в небе: в самом арте неба есть слабые (±3–5 уровней) контурные разводы.
Coring-фильтр: деталь d = img − blur(σ=4); слабая деталь (|d|<~8) гасится, сильная (капли, город, края) остаётся.
Только внутри маски стекла. Источник — art_src/presky (оригиналы), повторный запуск идемпотентен."""
import os, shutil, numpy as np, cv2
R = 'public/layers'; SRC = 'art_src/presky'
glass = cv2.imread(f'{R}/masks/glass.png', cv2.IMREAD_GRAYSCALE)
for sub in ('aligned', 'half'):
    os.makedirs(f'{SRC}/{sub}', exist_ok=True)
    for n in sorted(os.listdir(f'{R}/{sub}')):
        src = f'{SRC}/{sub}/{n}'
        if not os.path.exists(src): shutil.copy(f'{R}/{sub}/{n}', src)
        im = cv2.imread(src, cv2.IMREAD_UNCHANGED); a = im[..., :3].astype(np.float32); s = im.shape[1] / 1672
        b = cv2.GaussianBlur(a, (0, 0), 4 * s); d = a - b
        mag = np.abs(d).max(2, keepdims=True); k = np.clip((mag - 4) / 8, 0, 1); k = k * k * (3 - 2 * k)
        m = cv2.resize(glass, (im.shape[1], im.shape[0]), interpolation=cv2.INTER_AREA).astype(np.float32)[..., None] / 255
        m = cv2.GaussianBlur(m, (0, 0), 3)[..., None] if m.ndim == 2 else cv2.GaussianBlur(m[..., 0], (0, 0), 3)[..., None]
        out = a + m * (b + d * k - a); im[..., :3] = np.clip(out + .5, 0, 255).astype(np.uint8); cv2.imwrite(f'{R}/{sub}/{n}', im)
        print(sub, n)
