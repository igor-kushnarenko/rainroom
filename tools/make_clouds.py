# Спрайты облаков и тумана (офлайн): мягкие крупные клубы из размытых гауссиан, дизеринг запечён.
# python3 tools/make_clouds.py → public/layers/fx/cloud0..3.png, fog0..2.png (RGBA, белый с альфой)
import numpy as np
from PIL import Image, ImageFilter
rng = np.random.default_rng(7)
def sprite(w, h, blobs, flat, blur):
    yy, xx = np.mgrid[0:h, 0:w].astype(float); a = np.zeros((h, w))
    for _ in range(blobs):
        cx = rng.uniform(.2, .8) * w; cy = rng.uniform(.35, .65) * h if flat else rng.uniform(.3, .7) * h
        r = rng.uniform(.08, .2) * w; ry = r * (0.45 if flat else rng.uniform(.6, 1.0))
        a += rng.uniform(.4, 1.) * np.exp(-(((xx - cx) / r) ** 2 + ((yy - cy) / ry) ** 2))
    a = np.asarray(Image.fromarray((np.clip(a / a.max(), 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur)), float) / 255
    edge = np.minimum.reduce([xx / (w * .18), (w - 1 - xx) / (w * .18), yy / (h * .2), (h - 1 - yy) / (h * .2), np.ones_like(xx)])
    a *= np.clip(edge, 0, 1) ** 2                                   # к краям спрайта — точно ноль
    a = np.clip(a ** 1.3 * 255 + rng.uniform(-0.5, 0.5, a.shape), 0, 255)  # дизеринг против ступенек
    return Image.fromarray(np.dstack([np.full((h, w, 3), 255), a]).astype(np.uint8), 'RGBA')
for i in range(4): sprite(512, 256, 18, False, 9).save(f'public/layers/fx/cloud{i}.png')
for i in range(3): sprite(512, 128, 14, True, 7).save(f'public/layers/fx/fog{i}.png')
print('ok')
