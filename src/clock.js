// Часы и погода на экране ноутбука.
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const p2 = (n) => String(n).padStart(2, '0');
export function clockText(d = new Date()) {
  return { time: `${p2(d.getHours())}:${p2(d.getMinutes())}`, date: `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`, colon: d.getSeconds() % 2 === 0 };
}
// WMO-коды open-meteo → короткая подпись и значок
export function weatherLabel(code) {
  if (code === 0) return { t: 'ясно', i: 'sun' };
  if (code <= 3) return { t: 'облачно', i: 'cloud' };
  if (code === 45 || code === 48) return { t: 'туман', i: 'cloud' };
  if (code >= 51 && code <= 67) return { t: 'дождь', i: 'rain' };
  if (code >= 71 && code <= 77) return { t: 'снег', i: 'snow' };
  if (code >= 80 && code <= 82) return { t: 'ливень', i: 'rain' };
  if (code >= 85 && code <= 86) return { t: 'снег', i: 'snow' };
  if (code >= 95) return { t: 'гроза', i: 'storm' };
  return { t: '', i: 'cloud' };
}
export function weatherUrl({ lat, lon }) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=Europe%2FMoscow`;
}
/** Ответ open-meteo → { temp: '+12°C', label, icon } или null. */
export function parseWeather(j) {
  const c = j?.current; if (!c || !Number.isFinite(c.temperature_2m)) return null;
  const t = Math.round(c.temperature_2m); const w = weatherLabel(c.weather_code);
  return { temp: `${t > 0 ? '+' : ''}${t}°C`, label: w.t, icon: w.i };
}
// запасной источник погоды (без ключа): wttr.in
export function wttrUrl({ city }) { return `https://wttr.in/${encodeURIComponent(city === 'Анапа' ? 'Anapa' : city)}?format=j1`; }
export function parseWttr(j) {
  const c = j?.current_condition?.[0]; const t = Number(c?.temp_C); if (!c || !Number.isFinite(t)) return null;
  const code = Number(c.weatherCode); const map = { 113: 0, 116: 2, 119: 3, 122: 3, 143: 45, 248: 45, 260: 45, 200: 95, 386: 95, 389: 95 };
  const wmo = map[code] ?? (code >= 263 && code <= 359 ? 61 : code >= 362 ? 71 : 3);
  return parseWeather({ current: { temperature_2m: t, weather_code: wmo } });
}
