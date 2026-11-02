// Сливает выгрузки radio-browser (JSON-массивы) в единую базу public/stations.json.
// Использование: node tools/merge_stations.mjs stations_in/*.json
import fs from 'node:fs';
const DB = 'public/stations.json';
const db = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : [];
const key = (s) => s.id || (s.url || '').replace(/\/+$/, '');
const seen = new Map(db.map((s) => [key(s), s])), urls = new Set(db.map((s) => s.url));
let added = 0;
for (const f of process.argv.slice(2)) {
  for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) {
    // сайт на https: http-потоки браузер заблокирует, пробуем тот же адрес по https (не заиграет — тюнер пропустит)
    const url = (r.url_resolved || r.url || '').trim().replace(/^http:\/\//, 'https://');
    if (!/^https:\/\//.test(url) || r.hls) continue; // сайт на https — только https, без HLS
    const s = { id: r.stationuuid || url, name: (r.name || '').trim(), url, tags: r.tags || '', country: r.countrycode || '', codec: r.codec || '', bitrate: r.bitrate || 0 };
    if (seen.has(key(s)) || urls.has(url)) continue;
    seen.set(key(s), s); urls.add(url); db.push(s); added++;
  }
}
fs.writeFileSync(DB, JSON.stringify(db, null, 1) + '\n');
console.log(`добавлено ${added}, всего ${db.length}`);
