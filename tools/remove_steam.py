# Убирает нарисованный пар над кружкой из art_src/off.png и on.png; остаётся только анимированный пар.
# Принцип: низкие частоты — inpaint всей «оболочки» пара от краёв (без дымки), детали города — из соседнего участка выше.
# Запуск ДО make_layers.py: python3 tools/remove_steam.py && python3 tools/make_layers.py  (повторно не запускать — исходники уже очищены)
import cv2, numpy as np
ENV = np.array([[1150, 738], [1112, 700], [1105, 640], [1130, 590], [1175, 565], [1215, 575], [1225, 620], [1205, 690], [1185, 738]], np.int32)
SHIFT = 175  # откуда брать детали: тот же x, на SHIFT px выше
for n in ['off', 'on']:
    im = cv2.imread(f'art_src/{n}.png').astype(np.float32); H, W = im.shape[:2]
    env = np.zeros((H, W), np.uint8); cv2.fillPoly(env, [ENV], 255)
    low = cv2.GaussianBlur(im, (0, 0), 6)
    low_f = cv2.inpaint(np.clip(low, 0, 255).astype(np.uint8), cv2.dilate(env, np.ones((9, 9), np.uint8)), 12, cv2.INPAINT_TELEA).astype(np.float32)
    src = np.roll(im, SHIFT, axis=0); detail = src - cv2.GaussianBlur(src, (0, 0), 6)
    fill = np.clip(low_f + detail, 0, 255)
    a = cv2.GaussianBlur(env.astype(np.float32) / 255, (0, 0), 7)[..., None]
    a[738:] = 0  # кружку не трогаем
    out = im * (1 - a) + fill * a
    cv2.imwrite(f'art_src/{n}.png', np.clip(out, 0, 255).astype(np.uint8)); print(n, 'ok')
