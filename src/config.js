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
  roads: [ // обведены по нарисованным улицам (проверка: python3 tools/road_debug.py → shots/roads_debug.png)
    { pts: [[743, 614], [762, 621], [781, 630], [798, 642], [811, 654], [814, 663], [809, 673], [801, 682], [792, 693], [786, 706], [783, 721], [781, 738], [779, 755]], cars: 20 },
    { pts: [[811, 665], [792, 676], [771, 686], [749, 697], [728, 708], [706, 718], [689, 731], [682, 746]], cars: 14 },
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
