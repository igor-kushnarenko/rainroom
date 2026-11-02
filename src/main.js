// Комната с дождём за окном. Слои — PNG (база OFF + слои включённых устройств), эффекты — в шейдерах.
import * as THREE from 'three';
import { SCENE, DEVICE_IDS, hitDevice } from './config.js';
import { SOUND_LAYERS, loadSettings, saveSettings, toggleDevice, setAll, setRainLevel, rainParams } from './settings.js';
import { clockText, weatherUrl, parseWeather } from './clock.js';
import { Ambience } from './audio.js';
import { Tuner } from './radio.js';

const { W, H } = SCENE;
const params = new URLSearchParams(location.search);
const LOW = params.get('q') === 'low';         // слабые ТВ: всё в 480x270 и растягивается ближайшим соседом
const PIX = W / 480;                            // «пиксель» эффектов в координатах мира
let RW = 480, RH = 270;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
const rt = new THREE.WebGLRenderTarget(RW, RH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
const scene = new THREE.Scene();
const CROP_X = 6, CROP_Y = CROP_X * H / W;
const cam = new THREE.OrthographicCamera(CROP_X, W - CROP_X, H - CROP_Y, CROP_Y, -10, 10);

const loader = new THREE.TextureLoader();
function loadTex(path, nearest = false) {
  const t = loader.load(path); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false;
  t.minFilter = t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter; return t;
}
const layerPath = (n) => (LOW ? `./layers/half/${n}.png` : `./layers/aligned/${n}.png`);
const vert = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const common = `varying vec2 vUv; uniform float uTime; const vec2 WH=vec2(${W}.,${H}.); const float PIX=${PIX.toFixed(4)};
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
  vec4 tex(sampler2D t, vec2 p){ return texture2D(t, vec2(p.x/WH.x, 1.-p.y/WH.y)); }
  vec2 world(){ return vec2(vUv.x*WH.x, (1.-vUv.y)*WH.y); }`;
const shared = { uTime: { value: 0 } };
const plane = new THREE.PlaneGeometry(W, H);
let order = 0;
function fullPlane(frag, uniforms, blending = THREE.NormalBlending) {
  const m = new THREE.Mesh(plane, new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: common + frag, transparent: true, depthTest: false, depthWrite: false, blending, uniforms: { ...shared, ...uniforms } }));
  m.position.set(W / 2, H / 2, 0); m.renderOrder = order++; scene.add(m); return m;
}

// ---------- 1. база (всё выключено) ----------
const baseTex = loadTex(layerPath('01_base'));
fullPlane(`uniform sampler2D map; uniform float uDim; void main(){ gl_FragColor=vec4(tex(map,world()).rgb*uDim,1.); }`, { map: { value: baseTex }, uDim: { value: 1 } });

// ---------- 2. слои включённых устройств (мягкие маски по области устройства) ----------
const devFrag = `uniform sampler2D map; uniform float uOn; void main(){ vec4 t=tex(map,world()); float a=t.a*uOn; if(a<.003) discard; gl_FragColor=vec4(t.rgb,a); }`;
const dev = {};
for (const id of DEVICE_IDS) dev[id] = { mesh: fullPlane(devFrag, { map: { value: loadTex(layerPath(SCENE.devices[id].layer)) }, uOn: { value: 0 } }), shown: 0, hover: 0 };

// ---------- 3. экран ноутбука: живые часы/дата/погода пиксельным шрифтом ----------
const S = SCENE.screen;
const scr = document.createElement('canvas'); scr.width = S.w; scr.height = S.h;
const sctx = scr.getContext('2d');
const scrTex = new THREE.CanvasTexture(scr); scrTex.minFilter = scrTex.magFilter = THREE.NearestFilter; scrTex.generateMipmaps = false; scrTex.colorSpace = THREE.NoColorSpace;
const scrMesh = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), new THREE.ShaderMaterial({ vertexShader: vert, transparent: true, depthTest: false, depthWrite: false,
  uniforms: { map: { value: scrTex }, uOn: { value: 0 }, uTime: shared.uTime },
  fragmentShader: `varying vec2 vUv; uniform sampler2D map; uniform float uOn,uTime; void main(){ vec4 t=texture2D(map,vUv);
    float scan=.92+.08*step(.5,fract(vUv.y*${(S.h / 2).toFixed(1)})); gl_FragColor=vec4(t.rgb*scan*(.96+.04*sin(uTime*7.)), t.a*uOn); }` }));
scrMesh.position.set(S.x + S.w / 2, H - (S.y + S.h / 2), 0); scrMesh.renderOrder = order++; scene.add(scrMesh);
let weather = null, weatherAt = -1e9, weatherBusy = false, lastScr = '';
function pixelText(text, x, y, size, color, align = 'left') { // текст без сглаживания — «пиксельный шрифт»
  const c = document.createElement('canvas'); c.width = S.w; c.height = size * 2; const g = c.getContext('2d');
  g.font = `bold ${size}px "Courier New", monospace`; g.textBaseline = 'top'; g.textAlign = align; g.fillStyle = color; g.fillText(text, align === 'center' ? S.w / 2 : x, 2);
  const d = g.getImageData(0, 0, c.width, c.height); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 100 ? 255 : 0;
  g.putImageData(d, 0, 0); sctx.drawImage(c, 0, y);
}
function drawScreen(force = false) {
  const c = clockText(new Date()); const key = c.time + c.date + c.colon + JSON.stringify(weather) + settings.weather;
  if (!force && key === lastScr) return; lastScr = key;
  sctx.clearRect(0, 0, S.w, S.h);
  sctx.fillStyle = 'rgb(1,19,27)'; sctx.fillRect(0, 0, S.w, S.h);
  sctx.strokeStyle = 'rgba(90,230,255,.35)'; sctx.strokeRect(1.5, 1.5, S.w - 3, S.h - 3); sctx.beginPath(); sctx.moveTo(3, 72.5); sctx.lineTo(S.w - 3, 72.5); sctx.stroke();
  pixelText(c.colon ? c.time : c.time.replace(':', ' '), 0, 6, 34, '#7ff4ff', 'center');
  pixelText(c.date, 0, 44, 16, '#5fd6ea', 'center');
  if (settings.weather && weather) {
    pixelText(`${SCENE.weather.city} ${weather.temp}`, 0, 77, 15, '#7ff4ff', 'center');
    pixelText(weather.label, 0, 94, 13, '#4fb8cc', 'center');
  } else pixelText(settings.weather ? '…' : '', 0, 82, 15, '#4fb8cc', 'center');
  scrTex.needsUpdate = true;
}
async function refreshWeather(now) {
  if (!settings.weather || weatherBusy || !settings.devices.laptop || now - weatherAt < (weather ? 900 : 300)) return;
  weatherBusy = true; weatherAt = now;
  try { const r = await fetch(weatherUrl(SCENE.weather)); weather = parseWeather(await r.json()) || weather; } catch {}
  weatherBusy = false; drawScreen(true);
}

// ---------- 4. стекло: дождь, капли, неон, молния (только по маске стекла — предметы на подоконнике впереди) ----------
const glassMat = fullPlane(`uniform sampler2D uBase,uGlass,uNeon; uniform float uDrops,uSlide,uStreaks,uFlash,uNeonF,uWarm;
  void main(){
    vec2 p=world(); float gm=tex(uGlass,p).r; if(gm<.01) discard;
    vec2 q=(floor(p/PIX)+.5)*PIX; vec2 off=vec2(0.); float hi=0., trail=0.;
    // неподвижные капли: появляются и медленно исчезают
    vec2 cs=vec2(24.); vec2 c=floor(q/cs); float h=hash(c);
    if(h<uDrops){ vec2 ctr=(c+.5+(vec2(hash(c+3.1),hash(c+7.3))-.5)*.55)*cs; float r=2.5+4.5*hash(c+11.7);
      float life=fract(uTime*.04+hash(c+5.5)); r*=smoothstep(0.,.08,life)*smoothstep(1.,.85,life);
      vec2 d=q-ctr; float dd=length(d); if(dd<r){ vec2 n=d/max(r,1.); off=-n*r*2.4; hi=max(0.,1.-length(n-vec2(-.35,-.4))*1.6); } }
    // стекающие капли с дорожкой
    float col=floor(q.x/34.); float hc=hash(vec2(col,1.7));
    if(hc<uSlide){ float sp=30.+90.*hash(vec2(col,2.3)); float y0=mod(uTime*sp+hash(vec2(col,3.9))*977.,820.)+40.;
      float x0=(col+.5)*34.+sin(q.y*.035+col)*5.; float dx=abs(q.x-x0), dy=q.y-y0;
      if(length(vec2(dx,dy*.8))<5.){ off=vec2(x0-q.x,y0-q.y)*2.2; hi=max(hi,.7); }
      else if(dx<2. && dy<0. && dy>-160.) trail=(1.+dy/160.)*.6; }
    // струи дождя за окном (косые, быстрые)
    vec2 s=q; s.x+=s.y*.16; vec2 sc=vec2(8.,64.); float ys=(s.y-uTime*950.)/sc.y; vec2 sg=floor(vec2(s.x/sc.x,ys));
    float sx=fract(s.x/sc.x), sy=fract(ys);
    float streak=step(hash(sg),uStreaks)*step(abs(sx-.5),.14)*smoothstep(0.,.35,sy)*smoothstep(1.,.65,sy);
    vec3 bg=tex(uBase,p+off).rgb;
    float nm=tex(uNeon,p+off).r; bg*=1.+nm*(uNeonF-1.);       // мерцание неона
    float lum=dot(bg,vec3(.3,.5,.2));
    vec3 colr=bg*(1.+trail*.35)+streak*vec3(.55,.68,.85)*.22+hi*vec3(.65,.8,.95)*.35;
    colr+=hi*vec3(1.,.6,.3)*.25*uWarm;                       // тёплые блики от лампы
    colr+=uFlash*(vec3(.30,.34,.48)*.35+bg*1.1+lum*.6);      // молния
    gl_FragColor=vec4(colr,gm);
  }`, { uBase: { value: baseTex }, uGlass: { value: loadTex('./layers/masks/glass.png') }, uNeon: { value: loadTex('./layers/masks/neon.png') },
  uDrops: { value: 0.4 }, uSlide: { value: 0.2 }, uStreaks: { value: 0.2 }, uFlash: { value: 0 }, uNeonF: { value: 1 }, uWarm: { value: 0 } }).material.uniforms;

// ---------- 5. пар над кружкой ----------
const [sx0, sy0] = SCENE.steam;
const steamU = fullPlane(`uniform vec2 uMug; uniform float uWarm;
  void main(){ vec2 p=world(); vec2 q=(floor(p/PIX)+.5)*PIX; vec2 l=q-uMug; float up=-l.y/200.;
    if(up<0.||up>1.||abs(l.x)>70.) discard;
    float x=l.x+sin(up*6.-uTime*1.1)*9.*up+(noise(vec2(up*3.-uTime*.35,1.7))-.5)*26.*up;
    float n=noise(vec2(x*.07,l.y*.045+uTime*.8)); float w=7.+26.*up;
    float a=smoothstep(w,0.,abs(x))*smoothstep(0.,.07,up)*(1.-up)*smoothstep(.3,.75,n)*.32;
    if(a<.01) discard; gl_FragColor=vec4(mix(vec3(.72,.8,.92),vec3(1.,.82,.62),uWarm*.6),a); }`,
{ uMug: { value: new THREE.Vector2(sx0, sy0) }, uWarm: { value: 0 } }).material.uniforms;

// ---------- пост-проход: буфер → экран ближайшим соседом + лёгкая виньетка ----------
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; uniform sampler2D t; void main(){ vec3 c=texture2D(t,vUv).rgb; vec2 d=vUv-.5; c*=1.-dot(d,d)*.45; gl_FragColor=vec4(c,1.); }`,
  uniforms: { t: { value: rt.texture } }, depthTest: false })));

// ---------- состояние, звук, радио ----------
let settings = loadSettings();
const rainOverride = params.has('rain') ? Math.min(1, Math.max(0, +params.get('rain'))) : null;
if (params.has('devices')) { const on = params.get('devices').split(','); settings = { ...settings, devices: Object.fromEntries(DEVICE_IDS.map((id) => [id, on.includes(id) || on.includes('all')])) }; }
const rainLevel = () => rainOverride ?? settings.rainLevel;
const audio = new Ambience(); audio.setVolumes(settings.volumes); audio.setRain(rainLevel());
const stationEl = document.getElementById('station');
const tuner = new Tuner({ audio, onName: (name) => { stationEl.textContent = name || (settings.devices.radio ? 'нет сигнала' : '—'); const s = tuner.cur(); if (name && s) { settings.radioStation = s.id; saveSettings(settings); hint('📻 ' + name); } } });
tuner.load(); tuner.setVolume(settings.radioVol);
let audioUnlocked = false;
function syncTuner() {
  if (!audioUnlocked) return; const on = settings.devices.radio;
  audio.setRadio(on, settings.radioVol); tuner.setVolume(settings.radioVol);
  if (on !== tuner.on) { tuner.setOn(on, settings.radioStation); if (!on) stationEl.textContent = '—'; }
}
function setDevice(id, on) {
  if (!!settings.devices[id] === !!on) return;
  settings = toggleDevice(settings, id); saveSettings(settings); audio.click();
  if (id === 'radio') syncTuner(); if (id === 'laptop') { drawScreen(true); weatherAt = -1e9; }
  renderUI();
}

// ---------- гроза: вспышки и далёкий гром ----------
let clock = 0, nextThunder = 20 + Math.random() * 40, flashes = [];
function thunder(power = 0.4 + Math.random() * 0.6) {
  const t = clock; flashes.push({ t, a: 0.5 + 0.5 * power }); if (Math.random() < 0.7) flashes.push({ t: t + 0.12 + Math.random() * 0.1, a: 0.35 * power + 0.2 });
  if (Math.random() < 0.4) flashes.push({ t: t + 0.4, a: 0.25 });
  audio.thunder(1.5 + (1 - power) * 4, power);
}
if (params.has('thunder')) nextThunder = 3;

// ---------- интерфейс ----------
const toast = document.getElementById('toast'); let toastT;
function hint(text) { toast.textContent = text; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 2600); }
const devRow = document.getElementById('devrow'), devBtn = {};
for (const id of DEVICE_IDS) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'icon'; b.innerHTML = `<span class="led"></span><span>${SCENE.devices[id].name}</span>`;
  b.addEventListener('click', () => setDevice(id, !settings.devices[id])); devRow.appendChild(b); devBtn[id] = b;
}
document.getElementById('allon').addEventListener('click', () => { for (const id of DEVICE_IDS) setDevice(id, true); });
document.getElementById('alloff').addEventListener('click', () => { for (const id of DEVICE_IDS) setDevice(id, false); });
const thBtn = document.getElementById('thunderbtn'), wBtn = document.getElementById('weatherbtn');
thBtn.addEventListener('click', () => { settings.thunder = !settings.thunder; saveSettings(settings); renderUI(); });
wBtn.addEventListener('click', () => { settings.weather = !settings.weather; saveSettings(settings); weatherAt = -1e9; drawScreen(true); renderUI(); });
const rainInp = document.getElementById('rainlvl');
rainInp.addEventListener('input', () => { settings = setRainLevel(settings, rainInp.value / 100); saveSettings(settings); audio.setRain(rainLevel()); });
const radioInp = document.getElementById('radiovol');
radioInp.addEventListener('input', () => { settings.radioVol = radioInp.value / 100; saveSettings(settings); syncTuner(); });
document.getElementById('stprev').addEventListener('click', () => tuner.turn(-1));
document.getElementById('stnext').addEventListener('click', () => tuner.turn(1));
const volPanel = document.getElementById('volumes'), volBtn = document.getElementById('volbtn');
for (const { id, name } of SOUND_LAYERS) {
  const row = document.createElement('label'); row.className = 'vol'; row.innerHTML = `<span>${name}</span><input type="range" min="0" max="100" step="5">`;
  const inp = row.querySelector('input'); inp.value = Math.round(settings.volumes[id] * 100);
  inp.addEventListener('input', () => { settings.volumes[id] = inp.value / 100; audio.setVolumes({ [id]: settings.volumes[id] }); saveSettings(settings); });
  volPanel.appendChild(row);
}
volBtn.addEventListener('click', () => { volPanel.hidden = !volPanel.hidden; volBtn.setAttribute('aria-expanded', String(!volPanel.hidden)); });
function renderUI() {
  for (const id of DEVICE_IDS) { devBtn[id].classList.toggle('on', settings.devices[id]); devBtn[id].setAttribute('aria-pressed', String(settings.devices[id])); }
  thBtn.classList.toggle('on', settings.thunder); wBtn.classList.toggle('on', settings.weather);
  rainInp.value = Math.round(rainLevel() * 100); radioInp.value = Math.round(settings.radioVol * 100);
  document.querySelector('.radiovol').classList.toggle('collapsed', !settings.devices.radio);
}
const muteBtn = document.getElementById('mute');
function toggleMute() { audio.setMuted(!audio.muted); muteBtn.querySelector('span').textContent = audio.muted ? 'Звук выкл' : 'Звук'; muteBtn.classList.toggle('off', audio.muted); }
muteBtn.addEventListener('click', toggleMute);
function toggleFs() { const d = document, el = d.documentElement; if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d); else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); }
document.getElementById('fs').addEventListener('click', toggleFs);

let idleTimer = 0;
function wake() { document.body.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => document.body.classList.add('idle'), 6000); }
const overlay = document.getElementById('overlay'); let started = false;
function firstInteraction() { audio.start(); if (!audioUnlocked) { audioUnlocked = true; syncTuner(); } if (!started) { started = true; overlay.classList.add('gone'); } }
for (const ev of ['pointerdown', 'touchend', 'click']) window.addEventListener(ev, () => { firstInteraction(); wake(); }, { capture: true });
// меню в круглой кнопке: раскрывается при наведении/нажатии, сворачивается через 5 с
const hud = document.getElementById('hud'), menuBtn = document.getElementById('menubtn');
let menuTimer = 0, overMenu = false;
function openMenu() { clearTimeout(menuTimer); hud.classList.remove('closed'); menuBtn.setAttribute('aria-expanded', 'true'); }
function scheduleClose(ms = 5000) { clearTimeout(menuTimer); menuTimer = setTimeout(() => { if (overMenu) return; hud.classList.add('closed'); menuBtn.setAttribute('aria-expanded', 'false'); if (hud.contains(document.activeElement)) document.activeElement.blur(); }, ms); }
for (const el of [hud, menuBtn]) {
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { overMenu = true; openMenu(); } });
  el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { overMenu = false; scheduleClose(); } });
}
menuBtn.addEventListener('click', () => { openMenu(); if (!overMenu) scheduleClose(); });
hud.addEventListener('pointerdown', () => { if (!overMenu) scheduleClose(); });
const focusables = () => [...document.querySelectorAll('#hud button, #hud input')].filter((el) => el.offsetParent !== null && !el.closest('.collapsed') && !el.closest('.closed'));
window.addEventListener('keydown', (e) => {
  firstInteraction(); wake(); const k = e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(k)) {
    const wasClosed = hud.classList.contains('closed'); openMenu(); if (!overMenu) scheduleClose();
    if (wasClosed) { devBtn.lamp.focus(); e.preventDefault(); return; }
  }
  const list = focusables(), i = list.indexOf(document.activeElement), onRange = document.activeElement?.type === 'range';
  if (onRange && (k === 'ArrowLeft' || k === 'ArrowRight')) { /* стрелки двигают ползунок */ }
  else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
    const dir = k === 'ArrowDown' || k === 'ArrowRight' ? 1 : -1; const n = i < 0 ? 0 : (i + dir + list.length) % list.length; list[n].focus(); e.preventDefault();
  } else if (k >= '1' && k <= '4') { const id = DEVICE_IDS[+k - 1]; setDevice(id, !settings.devices[id]); }
  else if ('mMьЬ'.includes(k)) toggleMute(); else if ('fFаА'.includes(k)) toggleFs();
}, { capture: true });

// клики/hover по устройствам — через window, чтобы ничего не перебивало
function toWorld(e) { const r = canvas.getBoundingClientRect(); return [CROP_X + (e.clientX - r.left) / r.width * (W - 2 * CROP_X), CROP_Y + (e.clientY - r.top) / r.height * (H - 2 * CROP_Y)]; }
let hoverId = null;
window.addEventListener('pointermove', (e) => { wake(); if (e.target !== canvas) { hoverId = null; return; } hoverId = hitDevice(...toWorld(e)); canvas.style.cursor = hoverId ? 'pointer' : ''; });
canvas.addEventListener('click', (e) => { const id = hitDevice(...toWorld(e)); if (id) setDevice(id, !settings.devices[id]); });
canvas.addEventListener('wheel', (e) => {
  const [x, y] = toWorld(e), id = hitDevice(x, y), s = Math.sign(e.deltaY); e.preventDefault();
  if (id === 'radio' && settings.devices.radio) tuner.turn(s);
  else { settings = setRainLevel(settings, settings.rainLevel - s * 0.05); saveSettings(settings); audio.setRain(rainLevel()); renderUI(); }
}, { passive: false });

function resize() {
  const vw = innerWidth, vh = innerHeight, sc = Math.max(vw / 16, vh / 9); const w = Math.ceil(sc * 16), h = Math.ceil(sc * 9);
  const dpr = devicePixelRatio || 1; let bw = Math.round(w * dpr), bh = Math.round(h * dpr); const cap = Math.min(1, 1920 / bw, 1080 / bh);
  bw = Math.round(bw * cap); bh = Math.round(bh * cap); renderer.setSize(bw, bh, false);
  if (LOW) { RW = 480; RH = 270; } else { RW = bw; RH = bh; } rt.setSize(RW, RH);
  Object.assign(canvas.style, { width: w + 'px', height: h + 'px', left: Math.floor((vw - w) / 2) + 'px', top: Math.floor((vh - h) / 2) + 'px' });
}
addEventListener('resize', resize); resize(); wake(); renderUI(); drawScreen(true);

// ---------- цикл ----------
let last = performance.now(), neonF = 1, neonT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt; shared.uTime.value = clock;
  for (const id of DEVICE_IDS) { // плавное вкл/выкл + лёгкая подсветка при наведении
    const d = dev[id], f = SCENE.devices[id].fade, on = settings.devices[id] ? 1 : 0;
    d.shown += Math.sign(on - d.shown) * Math.min(Math.abs(on - d.shown), dt / f); d.hover += ((hoverId === id ? 1 : 0) - d.hover) * Math.min(1, dt * 8);
    let a = d.shown;
    if (id === 'lantern') a *= 0.86 + 0.1 * Math.sin(clock * 9.1) * Math.sin(clock * 3.3 + 1) + 0.04 * Math.sin(clock * 23);
    if (id === 'laptop' && on && d.shown < 1) a *= Math.random() < 0.3 ? 0.4 : 1; // экран «загорается» с миганием
    d.mesh.material.uniforms.uOn.value = Math.max(a, d.hover * 0.2 * (1 - d.shown));
  }
  scrMesh.material.uniforms.uOn.value = dev.laptop.shown;
  if (settings.devices.laptop) { drawScreen(); refreshWeather(clock); }
  const R = rainParams(rainLevel());
  glassMat.uDrops.value = R.drops; glassMat.uSlide.value = R.slide; glassMat.uStreaks.value = R.streaks;
  glassMat.uWarm.value = dev.lamp.shown * 0.8 + dev.lantern.shown * 0.2; steamU.uWarm.value = dev.lamp.shown;
  neonT -= dt; if (neonT <= 0) { neonF = Math.random() < 0.12 ? 0.55 + Math.random() * 0.3 : 1 + (Math.random() - 0.5) * 0.08; neonT = neonF < 0.9 ? 0.05 + Math.random() * 0.1 : 0.3 + Math.random() * 1.5; }
  glassMat.uNeonF.value += (neonF - glassMat.uNeonF.value) * Math.min(1, dt * 30);
  if (settings.thunder && clock >= nextThunder) { thunder(); nextThunder = clock + R.thunderEvery * (0.5 + Math.random()); }
  let fl = 0; flashes = flashes.filter((f) => clock - f.t < 1); for (const f of flashes) { const k = clock - f.t; if (k >= 0) fl = Math.max(fl, f.a * Math.exp(-k / 0.09)); }
  glassMat.uFlash.value = fl;
  tuner.update(dt);
  renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__rainroom = { audio, tuner, thunder, setDevice, state: () => ({ devices: { ...settings.devices }, shown: Object.fromEntries(DEVICE_IDS.map((id) => [id, +dev[id].shown.toFixed(2)])), rainLevel: rainLevel(), weather, flash: glassMat.uFlash.value, tuner: { state: tuner.state, name: tuner.cur()?.name } }) };
