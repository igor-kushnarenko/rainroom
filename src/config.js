// Все координаты сцены — в пикселях кадра 1672x941 (y вниз). Хотспоты: [x0, y0, x1, y1].
export const SCENE = {
  W: 1672, H: 941,
  glass: [198, 92, 1485, 771],                // стекло окна (точная форма — маска masks/glass.png)
  devices: {
    lamp: { name: 'Лампа', layer: '03_lamp_on', hot: [[1515, 60, 1665, 245]], fade: 0.18 },
    lantern: { name: 'Фонарь', layer: '02_lantern_on', hot: [[8, 280, 125, 465], [8, 560, 95, 645]], fade: 0.7 },
    radio: { name: 'Радио', layer: '04_radio_on', hot: [[430, 578, 682, 820]], fade: 0.3 },
    laptop: { name: 'Ноутбук', layer: '05_laptop_on', hot: [[1215, 598, 1640, 880]], fade: 0.45 },
  },
  lanternFlame: [62, 372], candle: [50, 600],
  steam: [1145, 735],                          // верх кружки
  // панель часов/погоды на экране ноутбука: четырёхугольник исходной панели в арте (TL, TR, BR, BL) и размер холста текста
  screen: { quad: [[1470, 621], [1608, 623], [1600, 726], [1461, 724]], w: 140, h: 104 },
  // дороги в городе (по светящимся трассам арта): ломаные [x, y], cars — число огоньков
  roads: [
    { pts: [[800, 540], [785, 590], [770, 615], [795, 640], [810, 660], [800, 680], [785, 710], [775, 740], [765, 770]], cars: 16 },
    { pts: [[770, 615], [750, 618], [725, 640], [700, 675], [685, 710], [672, 745]], cars: 8 },
  ],
  weather: { lat: 44.89, lon: 37.32, city: 'Анапа' },
};
export const DEVICE_IDS = Object.keys(SCENE.devices);
/** Какое устройство под точкой мира (x, y), или null. */
export function hitDevice(x, y, scene = SCENE) {
  for (const [id, d] of Object.entries(scene.devices))
    for (const [x0, y0, x1, y1] of d.hot) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return id;
  return null;
}
