// Комната с дождём за окном. Слои — PNG (база OFF + слои включённых устройств), эффекты — в шейдерах.
import * as THREE from 'three';
import { SCENE, DEVICE_IDS, hitDevice } from './config.js';
import { SOUND_LAYERS, loadSettings, saveSettings, toggleDevice, setAll, setRainLevel, rainParams } from './settings.js';
import { clockText, weatherUrl, parseWeather, wttrUrl, parseWttr } from './clock.js';
import { Ambience } from './audio.js';
import { Tuner } from './radio.js';
import { fitRect } from './fit.js';

const { W, H } = SCENE;
const params = new URLSearchParams(location.search);
const LOW = params.get('q') === 'low';         // слабые ТВ: всё в 480x270 и растягивается ближайшим соседом
const NOFX = new Set((params.get('nofx') || '').split(',').filter(Boolean));
const FX = new Set((params.get('fx') || '').split(',').filter(Boolean)); // ?fx=clouds,fog — включить (по умолчанию выключены) // ?nofx=clouds,fog,rain,drops,city,steam,pixel
const PIX = W / 480;                            // «пиксель» эффектов в координатах мира
let RW = 480, RH = 270;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', precision: params.get('prec') || 'highp' }) // ?prec=mediump — проверка точности;
renderer.setPixelRatio(1);
const rt = new THREE.WebGLRenderTarget(RW, RH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
const scene = new THREE.Scene();
const CROP_X = 6, CROP_Y = 3; // целые: буфер сцены = арт 1:1 (1660x935), текселы ровно в пикселях
const cam = new THREE.OrthographicCamera(CROP_X, W - CROP_X, H - CROP_Y, CROP_Y, -10, 10);

const loader = new THREE.TextureLoader();
function loadTex(path, nearest = false) {
  // Мип-карты обязательны: при уменьшении кадра (contain на экранах меньше 1672 px) линейная выборка без них
  // даёт алиасинг мелких деталей арта — на реальных экранах это выглядело как «кольца/отпечатки пальцев» в облаках.
  const t = loader.load(path); t.colorSpace = THREE.NoColorSpace;
  if (nearest) { t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.NearestFilter; }
  else { t.generateMipmaps = !params.has('nomip'); t.minFilter = t.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.magFilter = THREE.LinearFilter; }
  return t;
}
const layerPath = (n) => (LOW ? `./layers/half/${n}.png` : `./layers/aligned/${n}.png`);
const vert = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const common = `varying vec2 vUv; uniform float uTime; const vec2 WH=vec2(${W}.,${H}.); const float PIX=${PIX.toFixed(4)};
  float hash(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); } // без sin — нет муара/колец
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

// ---------- 1–2. комната: OFF + Σ доля_i·(ON−OFF) — свет каждого прибора по своей карте влияния ----------
// Карты (masks/light_rgb: r=лампа, g=фонарь+свеча, b=радио; masks/light_laptop) строит tools/make_layers.py;
// предметы-источники — жёсткие маски, поэтому экран ноутбука светится только от ноутбука. Всё вкл = ON-кадр.
const baseTex = loadTex(layerPath('01_base'));
const roomU = fullPlane(`uniform sampler2D map,uOnTex,uShare,uShareL; uniform vec4 uOn; // lamp, lantern, radio, laptop
  void main(){ vec2 p=world(); vec3 b=tex(map,p).rgb, o=tex(uOnTex,p).rgb; vec3 s=tex(uShare,p).rgb; float sl=tex(uShareL,p).r;
    float k=clamp(dot(vec4(s,sl),uOn),0.,1.); gl_FragColor=vec4(b+(o-b)*k,1.); }`,
{ map: { value: baseTex }, uOnTex: { value: loadTex(layerPath('06_on')) }, uShare: { value: loadTex('./layers/masks/light_rgb.png') },
  uShareL: { value: loadTex('./layers/masks/light_laptop.png') }, uOn: { value: new THREE.Vector4() } }).material.uniforms;
const dev = {}; for (const id of DEVICE_IDS) dev[id] = { shown: 0, hover: 0 };

// ---------- 3. экран ноутбука: живые часы/дата/погода пиксельным шрифтом ----------
const S = SCENE.screen;
const scr = document.createElement('canvas'); scr.width = S.w; scr.height = S.h;
const sctx = scr.getContext('2d');
const scrTex = new THREE.CanvasTexture(scr); scrTex.minFilter = scrTex.magFilter = THREE.NearestFilter; scrTex.generateMipmaps = false; scrTex.colorSpace = THREE.NoColorSpace;
// четырёхугольник панели из арта (наклон экрана): холст текста натягивается на него, как исходная панель
const scrGeo = new THREE.BufferGeometry(); const Q = S.quad.map(([x, y]) => [x, H - y, 0]);
scrGeo.setAttribute('position', new THREE.Float32BufferAttribute([...Q[3], ...Q[2], ...Q[1], ...Q[0]], 3));
scrGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); scrGeo.setIndex([0, 1, 2, 0, 2, 3]);
const scrMesh = new THREE.Mesh(scrGeo, new THREE.ShaderMaterial({ vertexShader: vert, transparent: true, depthTest: false, depthWrite: false,
  uniforms: { map: { value: scrTex }, uOn: { value: 0 }, uTime: shared.uTime },
  fragmentShader: `varying vec2 vUv; uniform sampler2D map; uniform float uOn,uTime; void main(){ vec4 t=texture2D(map,vUv);
    float scan=.92+.08*step(.5,fract(vUv.y*${(S.h / 2).toFixed(1)})); gl_FragColor=vec4(t.rgb*scan*(.96+.04*sin(uTime*7.)), t.a*uOn); }` }));
scrMesh.renderOrder = order++; scene.add(scrMesh);
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
  sctx.strokeStyle = 'rgba(90,230,255,.35)'; sctx.strokeRect(1.5, 1.5, S.w - 3, S.h - 3); sctx.beginPath(); sctx.moveTo(3, 68.5); sctx.lineTo(S.w - 3, 68.5); sctx.stroke();
  pixelText(c.colon ? c.time : c.time.replace(':', ' '), 0, 6, 34, '#7ff4ff', 'center');
  pixelText(c.date, 0, 44, 16, '#5fd6ea', 'center');
  if (settings.weather && weather) {
    pixelText(`${SCENE.weather.city} ${weather.temp}`, 0, 72, 15, '#7ff4ff', 'center');
    pixelText(weather.label + (weather.old ? ' · ранее' : ''), 0, 88, 12, '#4fb8cc', 'center');
  } else if (settings.weather) { pixelText(SCENE.weather.city, 0, 72, 15, '#7ff4ff', 'center'); pixelText(weatherBusy ? 'загрузка…' : 'нет связи', 0, 88, 12, '#4fb8cc', 'center'); }
  scrTex.needsUpdate = true;
}
const WKEY = 'rainroom.weather.v1';
try { const c = JSON.parse(localStorage.getItem(WKEY) || 'null'); if (c?.temp) weather = { ...c, old: true }; } catch {} // последняя известная погода
async function getJSON(u) { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 8000); try { return await (await fetch(u, { signal: ac.signal })).json(); } finally { clearTimeout(t); } }
async function refreshWeather(now) {
  if (!settings.weather || weatherBusy || !settings.devices.laptop || now - weatherAt < (weather && !weather.old ? 900 : 120)) return;
  weatherBusy = true; weatherAt = now; drawScreen(true);
  let w = null;
  try { w = parseWeather(await getJSON(weatherUrl(SCENE.weather))); } catch {}
  if (!w) try { w = parseWttr(await getJSON(wttrUrl(SCENE.weather))); } catch {} // запасной источник
  if (w) { weather = w; try { localStorage.setItem(WKEY, JSON.stringify(w)); } catch {} }
  weatherBusy = false; drawScreen(true);
}

// ---------- 4. стекло: неон и молния (только по маске стекла — предметы на подоконнике впереди) ----------
const glassTex = loadTex('./layers/masks/glass.png');
const glassMat = fullPlane(`uniform sampler2D uBase,uGlass,uNeon,uCity; uniform float uFlash,uNeonF,uRun,uBeads,uCityFx;
  float fbm(vec2 q){ return noise(q)*.55+noise(q*2.03+7.1)*.3+noise(q*4.1+3.3)*.15; }
  const float GT=92., GB=771.;
  // стекающая капля в колонке: у каждой колонки и каждого «захода» свои размер, путь, скорость; движение рывками (задержка-срыв)
  void runner(vec2 p, float cw, float k, inout vec2 off, inout float wet, inout float hi){
    float xs = p.x + k*23.7; float c = floor(xs/cw);
    if (hash(vec2(c, k)) > uRun) return;
    float period = 7. + 9.*hash(vec2(c, k+1.));
    float tt = uTime/period + hash(vec2(c, k+2.)); float cyc = floor(tt), ph = fract(tt);
    vec2 id = vec2(c, cyc + k*17.);
    float r = mix(1.8, 5.5, hash(id)*hash(id+.3));
    float n = 2. + floor(4.*hash(id+3.)); float g = ph - .85*sin(6.2832*ph*n)/(6.2832*n); // монотонно, с остановками
    float y0 = mix(GT - 40., GT + 300., hash(id+4.)); float yh = mix(y0, GB + 30., g);
    float x0 = (c + .25 + .5*hash(id+5.))*cw - k*23.7;
    float mw = cw*.35*hash(id+6.);
    #define XM(y) (x0 + (noise(vec2((y)*.013, c*3.1 + cyc)) - .5)*2.*mw)
    float dx = p.x - XM(p.y);
    vec2 d = vec2(dx, (p.y - yh)*.85); float dl = length(d);
    float fade = smoothstep(0., .04, ph);
    if (dl < r) { vec2 nn = d/r; off += -nn*r*1.8*fade; hi = max(hi, fade*max(0., 1. - length(nn - vec2(-.3, -.45))*1.4)); }
    float tl = mix(80., 380., hash(id+7.));
    float above = yh - p.y;
    if (above > 0. && above < tl) { float wdt = max(.45, r*.3*(1. - above/tl)); float a = smoothstep(wdt + .6, wdt*.5, abs(dx)) * (1. - above/tl) * fade;
      wet = max(wet, a); off.x += dx*.25*a; }
  }
  void main(){
    vec2 p=world(); float gm=tex(uGlass,p).r; if(gm<.01) discard;
    vec2 off=vec2(0.); float wet=0., hi=0.;
    if (uRun > 0.) { runner(p, 52., 0., off, wet, hi); runner(p, 77., 1., off, wet, hi); runner(p, 113., 2., off, wet, hi); }
    // мелкие неподвижные капли: плавно растут и высыхают (без мерцания)
    vec2 cs = vec2(17.); vec2 cc = floor((p + vec2(0., 7.)*floor(p.x/17.))/cs);
    float hb = hash(cc + 9.1);
    if (uBeads > 0. && hb < uBeads) { vec2 ctr = (cc + .5 + (vec2(hash(cc+1.3), hash(cc+2.9)) - .5)*.7)*cs - vec2(0., 7.)*floor(p.x/17.);
      float life = .5 + .5*sin(uTime*(.05 + .05*hash(cc+4.4)) + hb*40.); float r = (0.7 + 1.8*hash(cc+5.7))*smoothstep(.15, .6, life);
      vec2 d = p - ctr; float dl = length(d); if (dl < r) { off += -d*1.6; hi = max(hi, .5*(1. - dl/r)); } }
    vec2 cp=p+off; vec3 bg=tex(uBase,cp).rgb; vec4 cm=tex(uCity,cp);
    // окна домов: кластеры 7x5 px включаются/выключаются медленно и плавно
    vec2 wc=floor(cp/vec2(7.,5.)); float wh=hash(wc+.7), per=100.+280.*hash(wc+1.9); /* в 4 раза реже */ float tt=uTime/per+wh*9.;
    float onA=step(.2,hash(wc+floor(tt)*1.37)), onB=step(.2,hash(wc+(floor(tt)-1.)*1.37)); float on=mix(onB,onA,smoothstep(0.,.04,fract(tt)));
    cm*=uCityFx; bg=mix(bg,bg*.22,cm.r*(1.-on));
    // красные огни на шпилях: мигают, у каждого своя фаза
    vec2 rc=floor(cp/14.); float ph=fract(uTime*(.45+.2*hash(rc))+hash(rc+3.)); float blink=smoothstep(0.,.08,ph)*(1.-smoothstep(.3,.5,ph));
    bg*=1.+cm.g*(mix(-.65,.7,blink));
    // неон: у каждой вывески своё мягкое «дыхание» и редкие короткие провалы
    // неон: каждая вывеска мягко «дышит» в своём темпе; редкие провалы — общие (uNeonF); только по ядру маски вывесок
    float nm=smoothstep(.35,.9,tex(uNeon,cp).r); float nh=noise(cp*.012+5.);
    float nf=uNeonF*(1.+.08*sin(uTime*(.6+1.4*nh)+nh*30.));
    bg*=1.+nm*(nf-1.);
    bg = bg*(1. + wet*.18) + wet*vec3(.02,.03,.04) + hi*vec3(.55,.65,.8)*.3;
    float lum=dot(bg,vec3(.3,.5,.2));
    gl_FragColor=vec4(bg+uFlash*(vec3(.30,.34,.48)*.35+bg*1.1+lum*.6),gm);        // молния
  }`, { uBase: { value: baseTex }, uGlass: { value: glassTex }, uNeon: { value: loadTex('./layers/masks/neon.png') }, uCity: { value: loadTex('./layers/masks/city.png', true) }, uFlash: { value: 0 }, uCityFx: { value: NOFX.has('city') ? 0 : 1 }, uNeonF: { value: 1 }, uRun: { value: 0.3 }, uBeads: { value: 0.3 } }).material.uniforms;
// ---------- облака и туман: готовые мягкие спрайты (без процедурного шума в пикселях) ----------
// Несколько больших спрайтов медленно плывут, чуть «дышат» масштабом/поворотом и плавно сменяют друг друга по прозрачности.
const cloudTex = [0, 1, 2, 3].map((i) => loadTex(`./layers/fx/cloud${i}.png`)), fogTex = [0, 1, 2].map((i) => loadTex(`./layers/fx/fog${i}.png`));
const spriteMat = (map, color) => new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false,
  uniforms: { map: { value: map }, uA: { value: 0 }, uGlass: { value: glassTex }, uColor: { value: new THREE.Color(...color) } },
  vertexShader: `varying vec2 vUv; varying vec2 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xy; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform sampler2D map,uGlass; uniform float uA; uniform vec3 uColor; varying vec2 vUv; varying vec2 vW;
    void main(){ float gm=texture2D(uGlass, vW/vec2(${W}.,${H}.)).r; float a=texture2D(map,vUv).a*uA*gm; if(a<.002) discard; gl_FragColor=vec4(uColor,a); }` });
const [GX0, GY0, GX1, GY1] = SCENE.glass; const puffs = [];
function puff(kind, i, first) {
  const fog = kind === 'fog', tex = fog ? fogTex : cloudTex;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spriteMat(tex[i % tex.length], fog ? [0.42, 0.48, 0.58] : [0.55, 0.62, 0.74]));
  m.renderOrder = order++; scene.add(m);
  const P = { m, fog, i, w: 0, h: 0, x: 0, y: 0, v: 0, age: 0, life: 1, ph: Math.random() * 6.28 };
  P.reset = (start) => { P.w = fog ? 520 + Math.random() * 420 : 420 + Math.random() * 380; P.h = P.w * (fog ? 0.22 : 0.45);
    P.x = GX0 + Math.random() * (GX1 - GX0); P.y = fog ? 600 + Math.random() * 150 : 130 + Math.random() * 230;
    P.v = (fog ? 2 + Math.random() * 3 : 3 + Math.random() * 4) * (Math.random() < 0.8 ? 1 : -1);
    P.life = 50 + Math.random() * 70; P.age = start ? Math.random() * P.life : 0; P.amax = fog ? 0.16 + Math.random() * 0.1 : 0.12 + Math.random() * 0.1; };
  P.reset(first); puffs.push(P);
}
if (FX.has('clouds') && !NOFX.has('clouds')) for (let i = 0; i < 7; i++) puff('cloud', i, true);
if (FX.has('fog') && !NOFX.has('fog')) for (let i = 0; i < 6; i++) puff('fog', i, true);
function updatePuffs(dt) {
  for (const P of puffs) {
    P.age += dt; if (P.age > P.life) P.reset(false); P.x += P.v * dt;
    const t = P.age / P.life, fade = Math.min(1, t / 0.25, (1 - t) / 0.25);          // плавное появление/исчезание
    const br = 1 + 0.06 * Math.sin(clock * 0.05 + P.ph);                               // медленное «дыхание»
    P.m.position.set(P.x, H - P.y, 0); P.m.scale.set(P.w * br, P.h * (2 - br), 1); P.m.rotation.z = 0.04 * Math.sin(clock * 0.03 + P.ph * 2);
    P.m.material.uniforms.uA.value = P.amax * fade * fade * (3 - 2 * fade);
  }
}
// ---------- машины: огоньки по дорогам (SCENE.roads), оба направления; маска стекла ----------
import { buildPath, pointAt } from './traffic.js';
const roads = SCENE.roads.map(buildPath); const cars = [];
for (const [ri, r] of roads.entries()) for (let i = 0; i < r.cars; i++) cars.push({ r: ri, s: Math.random() * r.len, v: (7 + Math.random() * 6) * (i % 2 ? 1 : -1), tw: Math.random() * 6 }); // 7–13 px/с: сдвиг заметен за 2–3 с
const carGeo = new THREE.BufferGeometry(); const carPos = new Float32Array(cars.length * 3), carCol = new Float32Array(cars.length * 3);
carGeo.setAttribute('position', new THREE.BufferAttribute(carPos, 3)); carGeo.setAttribute('aColor', new THREE.BufferAttribute(carCol, 3));
const carPx = { value: 1 };
const carPts = new THREE.Points(carGeo, new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uGlass: { value: glassTex }, uPx: carPx },
  vertexShader: `attribute vec3 aColor; varying vec3 vC; varying vec2 vW; uniform float uPx; void main(){ vC=aColor; vW=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=max(3.,4.*uPx); }`,
  fragmentShader: `uniform sampler2D uGlass; varying vec3 vC; varying vec2 vW; void main(){ float gm=texture2D(uGlass, vec2(vW.x/${W}., vW.y/${H}.)).r; vec2 c=gl_PointCoord*2.-1.; float r2=dot(c,c); float a=(smoothstep(.3,0.,r2)*1.6+smoothstep(1.,0.,r2)*.35)*gm; if(a<.02) discard; gl_FragColor=vec4(vC*a,1.); /* точка + лёгкое свечение */ }` }));
carPts.frustumCulled = false; carPts.renderOrder = order++; scene.add(carPts);
function updateCars(dt) {
  cars.forEach((c, i) => { const r = roads[c.r]; c.s = (c.s + c.v * dt + r.len) % r.len; const [x, y] = pointAt(r, c.s);
    carPos[i * 3] = x; carPos[i * 3 + 1] = H - y; const k = 1.1 + 0.1 * Math.sin(clock * 0.7 + c.tw);
    const col = c.v > 0 ? [1.0, 0.95, 0.75] : [1.0, 0.25, 0.12]; // фары / стоп-сигналы
    carCol[i * 3] = col[0] * k; carCol[i * 3 + 1] = col[1] * k; carCol[i * 3 + 2] = col[2] * k; });
  carGeo.attributes.position.needsUpdate = true; carGeo.attributes.aColor.needsUpdate = true;
}
// дождь: тонкие (~1 px) штрихи, у каждой колонки свои случайные скорость, фаза, длина, позиция и прозрачность;
// колонки независимы (нет пар и решётки), 3 слоя глубины, лёгкий наклон. Только по маске стекла.
const rainU = { uRainDen: { value: 0.2 }, uRainLen: { value: 1 }, uRainSlant: { value: 0.04 }, uRainA: { value: 1 }, uRainT: { value: 0 }, uGlass: { value: glassTex } };
const rainFrag = `uniform float uLayer,uRainDen,uRainLen,uRainSlant,uRainA,uRainT; uniform sampler2D uGlass; varying vec2 vUv;
  float h2(vec2 p){ vec3 p3=fract(vec3(p.xyx+uLayer*17.17)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
  float h1(float n){ return h2(vec2(n, 7.7)); }
  void main(){
    float gm = texture2D(uGlass, vUv).r; if (gm < .01) discard;
    vec2 p = vec2(vUv.x*${W}., (1.-vUv.y)*${H}.);
    float L = uLayer;                                   // 0 — дальний, 2 — ближний
    float cw = mix(3., 7., L*.5);                       // ширина колонки (в ней одна тонкая линия)
    float slant = uRainSlant*(.6+.4*L);
    float x = p.x + p.y*slant; float c = floor(x/cw); float fx = fract(x/cw);
    float speed = mix(520., 1100., L*.5) * (.75 + .5*h1(c));
    float per = mix(260., 520., h1(c+31.7));            // своя «длина цикла» у колонки
    float yy = p.y - uRainT*speed + h1(c+7.3)*per*13.;
    float cyc = floor(yy/per); float m = mod(yy, per);
    if (h2(vec2(c, cyc)) > uRainDen*mix(.9, .55, L*.5)) discard;
    float len = mix(10., 34., L*.5) * uRainLen * (.6 + .8*h2(vec2(c, cyc+.5)));
    float start = h2(vec2(c+.3, cyc)) * (per - len);    // капля в случайном месте цикла
    float k = (m - start)/len; if (k < 0. || k > 1.) discard;
    float cx = .2 + .6*h2(vec2(c, cyc+1.7));            // позиция линии внутри колонки
    float d = abs(fx - cx)*cw; float wpx = mix(.5, .9, L*.5);
    float a = (1. - smoothstep(wpx*.4, wpx, d)) * k * mix(.14, .3, L*.5) * (.5 + .7*h2(vec2(c+.9, cyc))) * uRainA;
    if (a < .004) discard;
    gl_FragColor = vec4(.74,.8,.92, a*gm);
  }`;
for (const L of NOFX.has('rain') ? [] : [0, 1, 2]) {
  const m = new THREE.Mesh(plane, new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: rainFrag, transparent: true, depthTest: false, depthWrite: false, uniforms: { ...rainU, uLayer: { value: L } } }));
  m.position.set(W / 2, H / 2, 0); m.renderOrder = order++; scene.add(m);
}
let rainShown = null;

// ---------- 5. пар над кружкой ----------
const [sx0, sy0] = SCENE.steam;
const steamMesh = fullPlane(`uniform vec2 uMug; uniform float uWarm;
  float plume(vec2 l, float seed, float drift){ float up=-l.y/260.; if(up<0.||up>1.) return 0.;
    float x=l.x-drift*up*up-up*18.+sin(up*5.-uTime*(.9+seed*.3)+seed*4.)*12.*up+(noise(vec2(up*3.-uTime*.3,seed*7.))-.5)*34.*up;
    float n=noise(vec2(x*.06+seed*9.,l.y*.04+uTime*.7)); float n2=noise(vec2(x*.13,l.y*.09+uTime*1.1+seed));
    float w=10.+34.*up; return smoothstep(w,0.,abs(x))*smoothstep(0.,.06,up)*(1.-up)*smoothstep(.2,.7,n*.7+n2*.3); }
  void main(){ vec2 p=world(); vec2 l=p-uMug; if(l.x<-60.||l.x>160.||l.y>8.) discard;
    // дрейф вправо — туда, где пар нарисован в арте
    float a=(plume(l,0.,70.)*.55+plume(l-vec2(14.,0.),1.,95.)*.4+plume(l+vec2(16.,0.),2.,50.)*.3)*.75;
    if(a<.01) discard; gl_FragColor=vec4(mix(vec3(.74,.8,.9),vec3(1.,.84,.66),uWarm*.6),min(a,.6)); }`,
{ uMug: { value: new THREE.Vector2(sx0, sy0) }, uWarm: { value: 0 } }); steamMesh.visible = !NOFX.has('steam'); const steamU = steamMesh.material.uniforms;

// ---------- пост-проход: буфер сцены (арт 1:1) → экран бикубикой (Catmull-Rom) + лёгкая виньетка ----------
// Раньше арт сразу масштабировался билинейно с дробным коэффициентом (×1.157 при 1920): резкость «плавала» с периодом
// 1/(k−1) ≈ 6.4 px, на облаках это давало муар-«кольца». Теперь сцена рисуется 1:1, а масштаб — один раз и ровной бикубикой.
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; uniform sampler2D t; uniform vec2 uSz; uniform float uCubic;
    vec3 cubic(vec2 uv){ vec2 p=uv*uSz-.5, f=fract(p), i=floor(p);
      vec2 w0=f*(-.5+f*(1.-.5*f)), w1=1.+f*f*(-2.5+1.5*f), w2=f*(.5+f*(2.-1.5*f)), w3=f*f*(-.5+.5*f);
      vec2 s0=w0+w1, s1=w2+w3, o0=(i-.5+w1/s0)/uSz, o1=(i+1.5+w3/s1)/uSz;
      return (texture2D(t,vec2(o0.x,o0.y)).rgb*s0.x+texture2D(t,vec2(o1.x,o0.y)).rgb*s1.x)*s0.y+(texture2D(t,vec2(o0.x,o1.y)).rgb*s0.x+texture2D(t,vec2(o1.x,o1.y)).rgb*s1.x)*s1.y; }
    void main(){ vec3 c=uCubic>.5?cubic(vUv):texture2D(t,vUv).rgb; vec2 d=vUv-.5; c*=1.-dot(d,d)*.45; gl_FragColor=vec4(max(c,0.),1.); }`,
  uniforms: { t: { value: rt.texture }, uSz: { value: new THREE.Vector2(1, 1) }, uCubic: { value: 1 } }, depthTest: false })));
const postU = postScene.children[0].material.uniforms;

// ---------- состояние, звук, радио ----------
let settings = loadSettings();
const rainOverride = params.has('rain') ? Math.min(1, Math.max(0, +params.get('rain'))) : null;
if (params.has('fill')) settings = { ...settings, fill: params.get('fill') === '1' };
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
let clock = Number(params.get('t0')) || 0, // ?t0=900 — начать с «прожитого» времени (отладка эффектов, зависящих от времени)
  nextThunder = 20 + Math.random() * 40, flashes = [];
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
const fillBtn = document.getElementById('fillbtn');
fillBtn.addEventListener('click', () => { settings.fill = !settings.fill; saveSettings(settings); resize(); renderUI(); });
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
  thBtn.classList.toggle('on', settings.thunder); fillBtn.classList.toggle('on', settings.fill); wBtn.classList.toggle('on', settings.weather);
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
  const vw = innerWidth, vh = innerHeight; const { w, h, left, top } = fitRect(vw, vh, settings.fill ? 'cover' : 'contain');
  const dpr = devicePixelRatio || 1; let bw = Math.round(w * dpr), bh = Math.round(h * dpr); const cap = Math.min(1, 1920 / bw, 1080 / bh);
  bw = Math.round(bw * cap); bh = Math.round(bh * cap); renderer.setSize(bw, bh, false);
  if (LOW) { RW = 480; RH = 270; } else { RW = W - 2 * CROP_X; RH = H - 2 * CROP_Y; } rt.setSize(RW, RH);
  rt.texture.minFilter = rt.texture.magFilter = LOW ? THREE.NearestFilter : THREE.LinearFilter; rt.texture.needsUpdate = true; postU.uSz.value.set(RW, RH); postU.uCubic.value = LOW || NOFX.has('pixel') ? 0 : 1; carPx.value = RW / (W - 2 * CROP_X);
  Object.assign(canvas.style, { width: w + 'px', height: h + 'px', left: left + 'px', top: top + 'px' });
}
addEventListener('resize', resize); resize(); wake(); renderUI(); drawScreen(true);

// ---------- цикл ----------
let fpsN = 0, fpsT = 0, fps = 0;
let last = performance.now(), neonF = 1, neonT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); fpsN++; fpsT += (now - last) / 1000; if (fpsT > 2) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; } last = now; clock += dt; shared.uTime.value = clock;
  for (const id of DEVICE_IDS) { // плавное вкл/выкл + лёгкая подсветка при наведении
    const d = dev[id], f = SCENE.devices[id].fade, on = settings.devices[id] ? 1 : 0;
    d.shown += Math.sign(on - d.shown) * Math.min(Math.abs(on - d.shown), dt / f); d.hover += ((hoverId === id ? 1 : 0) - d.hover) * Math.min(1, dt * 8);
    let a = d.shown;
    if (id === 'lantern') a *= 0.95 + 0.04 * Math.sin(clock * 9.1) * Math.sin(clock * 3.3 + 1) + 0.01 * Math.sin(clock * 23); // среднее ≈ ON-кадр
    if (id === 'laptop' && on && d.shown < 1) a *= Math.random() < 0.3 ? 0.4 : 1; // экран «загорается» с миганием
    roomU.uOn.value.setComponent(DEVICE_IDS.indexOf(id), Math.max(a, d.hover * 0.2 * (1 - d.shown)));
  }
  scrMesh.material.uniforms.uOn.value = dev.laptop.shown;
  if (settings.devices.laptop) { drawScreen(); refreshWeather(clock); }
  const R = rainParams(rainLevel());
  rainShown = rainShown ?? rainLevel(); rainShown += (rainLevel() - rainShown) * (1 - Math.exp(-dt * 1.2)); // плавно, как в campfire
  const RP = rainParams(rainShown);
  rainU.uRainDen.value = RP.density; rainU.uRainLen.value = RP.length; rainU.uRainSlant.value = 0.03 + RP.slant * 0.15; rainU.uRainA.value = RP.alpha; rainU.uRainT.value = (rainU.uRainT.value + dt * RP.speed) % 1800; // ограничиваем фазу — без потери точности float
  steamU.uWarm.value = dev.lamp.shown; glassMat.uRun.value = NOFX.has('drops') ? 0 : RP.run; glassMat.uBeads.value = NOFX.has('drops') ? 0 : RP.drops * 0.5;
  neonT -= dt; if (neonT <= 0) { neonF = Math.random() < 0.06 ? 0.8 + Math.random() * 0.1 : 1 + (Math.random() - 0.5) * 0.04; neonT = neonF < 0.95 ? 0.12 + Math.random() * 0.15 : 0.8 + Math.random() * 2.5; }
  glassMat.uNeonF.value += (neonF - glassMat.uNeonF.value) * Math.min(1, dt * 10);
  if (settings.thunder && clock >= nextThunder) { thunder(); nextThunder = clock + R.thunderEvery * (0.5 + Math.random()); }
  let fl = 0; flashes = flashes.filter((f) => clock - f.t < 1); for (const f of flashes) { const k = clock - f.t; if (k >= 0) fl = Math.max(fl, f.a * Math.exp(-k / 0.09)); }
  glassMat.uFlash.value = fl;
  updatePuffs(dt); updateCars(dt); tuner.update(dt);
  renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__rainroom = { carPts, cars: () => cars.map((c) => pointAt(roads[c.r], c.s).map((v) => +v.toFixed(1))), audio, tuner, thunder, setDevice, fps: () => fps, state: () => ({ devices: { ...settings.devices }, shown: Object.fromEntries(DEVICE_IDS.map((id) => [id, +dev[id].shown.toFixed(2)])), rainLevel: rainLevel(), weather, flash: glassMat.uFlash.value, tuner: { state: tuner.state, name: tuner.cur()?.name } }) };
