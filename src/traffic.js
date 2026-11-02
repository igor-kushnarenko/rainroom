// Пути машин: ломаная → длины отрезков; pointAt(path, s) — точка на расстоянии s от начала.
export function buildPath({ pts, cars = 8 }) {
  const seg = []; let len = 0;
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const l = Math.hypot(x1 - x0, y1 - y0); seg.push({ x0, y0, x1, y1, l, s: len }); len += l; }
  return { seg, len, cars };
}
export function pointAt(path, s) {
  const { seg, len } = path; s = ((s % len) + len) % len;
  for (const g of seg) if (s <= g.s + g.l) { const t = (s - g.s) / g.l; return [g.x0 + (g.x1 - g.x0) * t, g.y0 + (g.y1 - g.y0) * t]; }
  const g = seg[seg.length - 1]; return [g.x1, g.y1];
}
