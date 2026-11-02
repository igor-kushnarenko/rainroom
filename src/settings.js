// Настройки: устройства, дождь, радио, громкости. Хранятся в localStorage.
import { DEVICE_IDS } from './config.js';
export const SETTINGS_KEY = 'rainroom.settings.v1';
export const SOUND_LAYERS = [{ id: 'rain', name: 'дождь' }, { id: 'thunder', name: 'гром' }, { id: 'room', name: 'комната' }, { id: 'fx', name: 'щелчки' }];
export const DEFAULT_SETTINGS = {
  devices: { lamp: false, lantern: false, radio: false, laptop: false },
  rainLevel: 0.5, thunder: true, fill: false, weather: true, radioVol: 0.5, radioStation: '',
  volumes: { rain: 0.8, thunder: 0.7, room: 0.6, fx: 0.8 },
};
const clamp01 = (x, d) => (x !== null && x !== '' && Number.isFinite(+x) ? Math.min(1, Math.max(0, +x)) : d);
export function loadSettings(storage = globalThis.localStorage) {
  let raw = null; try { raw = JSON.parse(storage?.getItem(SETTINGS_KEY) || 'null'); } catch {}
  const D = DEFAULT_SETTINGS, devices = {}, volumes = {};
  for (const id of DEVICE_IDS) devices[id] = !!raw?.devices?.[id];
  for (const { id } of SOUND_LAYERS) volumes[id] = clamp01(raw?.volumes?.[id], D.volumes[id]);
  return {
    devices, volumes, rainLevel: clamp01(raw?.rainLevel, D.rainLevel), radioVol: clamp01(raw?.radioVol, D.radioVol),
    thunder: raw?.thunder === undefined ? D.thunder : !!raw.thunder, weather: raw?.weather === undefined ? D.weather : !!raw.weather,
    fill: !!raw?.fill,
    radioStation: typeof raw?.radioStation === 'string' ? raw.radioStation : '',
  };
}
export function saveSettings(s, storage = globalThis.localStorage) { try { storage?.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }
export function toggleDevice(s, id) { if (!DEVICE_IDS.includes(id)) return s; return { ...s, devices: { ...s.devices, [id]: !s.devices[id] } }; }
export function setAll(s, on) { return { ...s, devices: Object.fromEntries(DEVICE_IDS.map((id) => [id, !!on])) }; }
export function setRainLevel(s, v) { return { ...s, rainLevel: clamp01(v, DEFAULT_SETTINGS.rainLevel) }; }
const lerp = (a, b, t) => a + (b - a) * t;
/** Сила дождя 0..1 → параметры эффектов и звука (всё монотонно, громкость держим низкой). */
export function rainParams(level) {
  const l = clamp01(level, DEFAULT_SETTINGS.rainLevel);
  return {
    // параметры штрихов дождя — как в campfire (rainParams оттуда)
    density: lerp(0.012, 0.62, l ** 1.3), speed: lerp(0.75, 1.3, l), length: lerp(0.55, 1.7, l), slant: lerp(0.1, 0.34, l), alpha: lerp(0.65, 1.15, l),
    drops: lerp(0.15, 0.85, l),          // доля ячеек с каплями на стекле
    slide: lerp(0.08, 0.5, l),           // доля стекающих дорожек
    streaks: lerp(0.05, 0.6, l),         // косые струи за окном
    soundGain: lerp(0.02, 0.09, l),      // шум дождя по стеклу
    soundCutoff: lerp(2500, 6500, l),
    tickInterval: lerp(0.35, 0.04, l),   // средний интервал отдельных капель по стеклу, с
    thunderEvery: lerp(150, 45, l),      // средний интервал грома, с
  };
}
