// Все координаты сцены — в пикселях кадра 1672x941 (y вниз). Хотспоты: [x0, y0, x1, y1].
export const SCENE = {
  W: 1672, H: 941,
  glass: [196, 99, 1481, 774],                // проём окна (точная форма — альфа интерьера, masks/glass.png)
  // слои снизу вверх: город (с параллаксом от мыши, px максимального сдвига), затем интерьер (без сдвига)
  layers: [
    { id: 'sky', parallax: 2, fx: false },
    { id: 'far', parallax: 5, fx: true },
    { id: 'mid', parallax: 9, fx: true },
    { id: 'near', parallax: 14, fx: true },
  ],
  devices: {
    lamp: { name: 'Лампа', hot: [[1525, 60, 1665, 245]], fade: 0.18 },
    lantern: { name: 'Фонарь', hot: [[18, 270, 122, 452], [15, 562, 92, 642]], fade: 0.7 },
    radio: { name: 'Радио', hot: [[432, 576, 684, 822]], fade: 0.3 },
    laptop: { name: 'Ноутбук', hot: [[1215, 600, 1632, 882]], fade: 0.45 },
  },
  lanternFlame: [70, 380], candle: [50, 605],
  steam: [1133, 736],                          // верх кружки
  // панель часов/погоды на экране ноутбука: четырёхугольник панели в арте (TL, TR, BR, BL) и размер холста текста
  screen: { quad: [[1468, 618], [1611, 621], [1604, 727], [1462, 725]], w: 140, h: 104 },
  // дороги в каньоне слоя mid (координаты слоя, по светящимся трассам фар), cars — число огоньков
  roadLayer: 'mid',
  roads: [
    { pts: [[1040, 700], [1026, 711], [997, 727], [970, 744], [951, 763], [945, 772]], cars: 9 },
    { pts: [[1046, 704], [1041, 721], [1031, 739], [1019, 759], [1015, 772]], cars: 7 },
  ],
  weather: { lat: 44.89, lon: 37.32, city: 'Анапа' },
};
/** Сдвиг слоя от мыши: nx, ny ∈ [-1, 1] (центр экрана = 0) → [dx, dy] в px; слои дальше сдвигаются меньше. */
export function parallaxOffset(layer, nx, ny) {
  const k = layer.parallax || 0; const c = (v) => Math.max(-1, Math.min(1, v));
  return [-c(nx) * k, -c(ny) * k * 0.6];
}
export const DEVICE_IDS = Object.keys(SCENE.devices);
/** Какое устройство под точкой мира (x, y), или null. */
export function hitDevice(x, y, scene = SCENE) {
  for (const [id, d] of Object.entries(scene.devices))
    for (const [x0, y0, x1, y1] of d.hot) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return id;
  return null;
}
