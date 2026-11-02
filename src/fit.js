// Вписывание кадра 16:9 в окно. contain — весь кадр виден (поля по краям), cover — заполнить экран (края обрезаются).
export function fitRect(vw, vh, mode = 'contain', aw = 16, ah = 9) {
  const sc = mode === 'cover' ? Math.max(vw / aw, vh / ah) : Math.min(vw / aw, vh / ah);
  const w = Math.round(sc * aw), h = Math.round(sc * ah);
  return { w, h, left: Math.floor((vw - w) / 2), top: Math.floor((vh - h) / 2) };
}
