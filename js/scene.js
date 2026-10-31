/* Peiron Race — pseudo-3D renderer of Nagasaki Harbour.
   World coordinates are metres on a real map: x = east, y = north, origin = the front of the
   Matsugae cruise pier (松が枝国際観光船ふ頭, ≈32.7344N 129.8673E).
   The course leaves the pier heading down the harbour toward the Megami Bridge (bearing ≈222°),
   each boat rounds its own buoy, and comes back toward Matsugae (≈42°). Shorelines were traced
   from a Google Maps screenshot of the real course.
   Out 630 m, back 520 m, as in the real 長崎ペーロン選手権大会. See AUTHENTICITY.md. */
'use strict';
const Scene = (() => {
  const W = 1280, H = 395, HOR = 150, CAMH = 3.4, F = 640, L = 13.6, D2R = Math.PI / 180;
  const PXD = F * D2R;
  const fwd = b => [Math.sin(b * D2R), Math.cos(b * D2R)];
  const rgt = b => [Math.cos(b * D2R), -Math.sin(b * D2R)];
  const angDiff = (a, b) => ((a - b + 540) % 360) - 180;
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  let cv, ctx, RES = 1, sky, PRES = 1;
  const cam = { x: 0, y: 0, h: 285, fx: 0, fy: 1, rx: 1, ry: 0, shake: 0 };
  const S = { time: 0, boats: [], parts: [], boostFx: 0, labelA: 0, labelT: 0, travelled: 0 };

  /* ---------------- course geometry ---------------- */
  const Course = {
    H1: 222.5, C0: [-94, -3], LANE: 8, R: 2.2, lanes: [-12, -4, 4, 12], out: 630, back: 520,
    setup(scale) { this.out = 630 * scale; this.back = 520 * scale; },
    get total() { return this.out + this.back - L; },           // bow travel from start line to finish line
    get finishAxis() { return this.out - this.back; },
    u() { return fwd(this.H1); }, r() { return rgt(this.H1); },
    // axis/lateral (course frame) -> world
    w(axis, lat) { const u = this.u(), r = this.r(); return [this.C0[0] + u[0] * axis + r[0] * lat, this.C0[1] + u[1] * axis + r[1] * lat]; },
    // boat pose from its race state
    pose(b) {
      const o = this.lanes[b.lane]; let axis, lat, h;
      if (b.leg === 1) { axis = b.a - L / 2; lat = o; h = this.H1; }
      else if (b.leg === 'turn') { const ca = this.out - L / 2, cl = o - this.R; axis = ca + this.R * Math.sin(b.phi); lat = cl + this.R * Math.cos(b.phi); h = this.H1 - b.phi / D2R; }
      else { axis = this.out - L / 2 - b.a; lat = o - 2 * this.R; h = this.H1 - 180; }
      const p = this.w(axis, lat); b.px = p[0]; b.py = p[1]; b.hd = (h + 360) % 360; return b;
    },
    progress(b) { return b.leg === 1 ? b.a : b.leg === 'turn' ? this.out + b.phi / Math.PI * 0.5 : this.out + b.a; },
  };

  /* ---------------- projection ---------------- */
  function setCam(x, y, h) { cam.x = x; cam.y = y; cam.h = (h + 360) % 360; const f = fwd(cam.h), r = rgt(cam.h); cam.fx = f[0]; cam.fy = f[1]; cam.rx = r[0]; cam.ry = r[1]; }
  function rel(X, Y) { const dx = X - cam.x, dy = Y - cam.y; return [dx * cam.rx + dy * cam.ry, dx * cam.fx + dy * cam.fy]; }
  function P(lx, y, z) { if (z < 1.0) return null; const s = F / z; return { x: W / 2 + lx * s, y: HOR + (CAMH - y) * s, s, z }; }
  function PW(X, Y, h) { const r = rel(X, Y); return P(r[0], h, r[1]); }
  function depth(X, Y) { return rel(X, Y)[1]; }
  function poly(pts, fill, stroke, lw) {
    if (!pts || pts.length < 3) return; for (const p of pts) if (!p) return;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function seg(a, b, col, w) { if (!a || !b) return; ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.7, w); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  function dot(p, r, col) { if (!p) return; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.6, r), 0, 6.283); ctx.fillStyle = col; ctx.fill(); }
  // local frame of any object with centre (px,py) and heading hd: lx = right, lz = forward from the stern/back
  function LF(o, len) { const f = fwd(o.hd), r = rgt(o.hd); return (lx, ly, lz) => PW(o.px + r[0] * lx + f[0] * (lz - len / 2), o.py + r[1] * lx + f[1] * (lz - len / 2), ly); }

  /* cached text sprites (fillText is slow on Chromebooks) */
  const SPR = new Map();
  function sprite(key, w, h, draw) { let c = SPR.get(key); if (c) return c; c = document.createElement('canvas'); c.width = Math.ceil(w * 2); c.height = Math.ceil(h * 2);
    const x = c.getContext('2d'); x.scale(2, 2); draw(x); c.lw = w; c.lh = h; SPR.set(key, c); return c; }
  function measure(font, txt) { ctx.font = font; return ctx.measureText(txt).width; }

  /* ---------------- the real harbour (metres from the start line) ---------------- */
  // hills: [x, y, height, radius]  (east side = city / Minamiyamate / Tomachi, west side = Inasa / Tategami / Kiba)
  const HILLS = [
    [-1667, 2030, 333, 420], [-1300, 2600, 250, 420], [-1450, 1200, 230, 420], [-1400, 400, 190, 420], [-1500, -300, 180, 420], [-1900, -1100, 200, 480], [-2500, -2200, 220, 600],
    [187, 3684, 366, 520], [-500, 3200, 260, 450], [1000, 3100, 300, 480],
    [1470, 2397, 160, 380], [2000, 1800, 230, 420], [3156, 1398, 386, 650], [2300, 300, 330, 600], [1300, -200, 220, 420],
    [118, -749, 169, 300], [90, -260, 55, 200], [700, -700, 160, 380], [-200, -1300, 120, 330], [-700, -1900, 200, 420], [300, -1800, 250, 480], [-1400, -2600, 200, 500]];
  // each hill keeps one colour layer (by its distance from the middle of the course) so colours never pop
  const HLAYER = HILLS.map(([x, y]) => { const d = Math.hypot(x + 330, y + 230); return d > 2600 ? 0 : d > 1300 ? 1 : 2; });
  const LANDNAME = [ // landmark labels: [x, y, height, text]
    [-1667, 2030, 333, 'いなさやま'], [-860, 1150, 75, 'せかいいさんの クレーン'], [-1562, -1706, 175, 'めがみおおはし'],
    [180, -180, 70, 'おおうらてんしゅどう'], [40, -330, 70, 'グラバーえん'], [118, -749, 169, 'なべかんむりやま'],
    [300, 900, 25, 'でじまワーフ'], [225, 1997, 40, 'ながさきえき'], [80, 60, 30, 'まつがえターミナル'], [187, 3684, 366, 'こんぴらさん'], [3156, 1398, 386, 'ひこさん'],
    [-550, -1474, 40, 'とまちしょうがっこう']];
  const hillAt = (X, Y) => { let m = 0; for (const [x, y, h, w] of HILLS) { const d2 = ((X - x) ** 2 + (Y - y) ** 2) / (w * w); m = Math.max(m, h * Math.exp(-d2)); } return m; };
  // shorelines, traced from the real course map (south → north)
  const EAST = [[-1314, -2041], [-1305, -1863], [-1188, -1762], [-1055, -1671], [-861, -1623], [-621, -1608], [-596, -1442], [-581, -1223], [-565, -1004], [-498, -776],
    [-359, -644], [-199, -481], [-60, -348], [-43, -176], [26, 5], [60, 200], [150, 450], [300, 800], [400, 1050], [380, 1300], [300, 1700], [250, 2100], [150, 2600]];
  const WEST = [[-1998, -1608], [-1872, -1558], [-1724, -1478], [-1539, -1378], [-1414, -1167], [-1283, -915], [-1106, -694], [-981, -483], [-913, -256], [-876, -6],
    [-907, 245], [-921, 553], [-880, 900], [-820, 1300], [-700, 1700], [-600, 2100], [-450, 2600]];
  const PIER_A = [-40, -165], PIER_B = [60, 200];   // the Matsugae quay
  const BUILD = [], HOUSES = [], CRANES = [[-860, 1150, 'giant'], [-930, 420, 'jib'], [-940, 120, 'jib'], [-960, -330, 'jib'], [-830, 1500, 'jib'], [-1150, -760, 'jib']];
  const nearPier = (x, y) => x > -80 && x < 140 && y > -220 && y < 260;
  (function genWorld() {
    let k = 0;
    const CITY = ['#eef1f3', '#dde4e9', '#cfd8de', '#f3ece0', '#e7d9c9', '#c9d3dc', '#f6f3ee'];
    const along = (pts, side, fn) => { for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], len = Math.hypot(x1 - x0, y1 - y0);
      const dx = (x1 - x0) / len, dy = (y1 - y0) / len, nx = dy * side, ny = -dx * side;   // n points inland
      for (let d = 0; d < len; d += 30) fn(x0 + dx * d, y0 + dy * d, nx, ny, Math.atan2(dx, dy) / D2R, k++); } };
    along(EAST, 1, (x, y, nx, ny, ang, i) => { const off = 14 + hash(i, 2) * 20, X = x + nx * off, Y = y + ny * off; if (nearPier(X, Y)) return;
      const city = Y > 300, h = city ? 10 + hash(i, 1) * (Y > 1500 ? 45 : 30) : 6 + hash(i, 1) * 14;
      BUILD.push({ x: X, y: Y, ang, w: 12 + hash(i, 3) * 14, d: 10 + hash(i, 4) * 8, h, c: CITY[i % CITY.length], r: ['#5d7486', '#8a5a44', '#4f6b5a', '#6d6d7a'][i % 4] }); });
    along(WEST, -1, (x, y, nx, ny, ang, i) => { const yard = y > -800 && y < 1600, off = 14 + hash(i, 2) * 20;
      BUILD.push({ x: x + nx * off, y: y + ny * off, ang, w: yard ? 30 + hash(i, 3) * 30 : 12 + hash(i, 3) * 12, d: yard ? 18 + hash(i, 4) * 10 : 10, h: yard ? 14 + hash(i, 1) * 16 : 7 + hash(i, 1) * 12,
        c: yard ? (i % 3 ? '#a9b7c1' : '#8aa0ae') : CITY[i % CITY.length], r: yard ? '#6f8796' : '#7a5a48' }); });
    for (let i = 0; i < 1500; i++) {
      const hi = Math.floor(hash(i, 5) * HILLS.length), hl = HILLS[hi], a = hash(i, 6) * 6.283, rr = Math.sqrt(hash(i, 7)) * hl[3] * 1.2;
      const X = hl[0] + Math.cos(a) * rr, Y = hl[1] + Math.sin(a) * rr, e = hillAt(X, Y); if (e < 8) continue;
      const tree = hash(i, 8) < 0.45 || e > hl[2] * 0.75;
      HOUSES.push({ x: X, y: Y, e, L: HLAYER[hi], hi, tree, c: tree ? 'rgba(48,104,70,0.55)' : CITY[i % CITY.length] });
    }
  })();

  /* ---------------- sky (painted once, follows compass heading) ---------------- */
  function paintSky() {
    sky = sky || document.createElement('canvas'); PRES = Math.min(1.5, RES);
    const SW = Math.round(360 * PXD); sky.width = Math.round(SW * PRES); sky.height = Math.round((HOR + 2) * PRES);
    const c = sky.getContext('2d'); c.setTransform(PRES, 0, 0, PRES, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, HOR); g.addColorStop(0, '#3d9cf0'); g.addColorStop(0.6, '#8fcdf7'); g.addColorStop(1, '#dff3fb');
    c.fillStyle = g; c.fillRect(0, 0, SW, HOR + 2);
    for (let i = 0; i < 26; i++) { const x0 = hash(i, 1) * SW, y = 18 + hash(i, 2) * 52, k = 0.6 + hash(i, 3) * 0.9;
      [x0, x0 - SW, x0 + SW].forEach(x => { c.fillStyle = 'rgba(255,255,255,0.93)';
        for (let j = 0; j < 6; j++) { c.beginPath(); c.ellipse(x + (j - 2.5) * 16 * k, y - Math.sin(j / 5 * Math.PI) * 12 * k, 20 * k, 14 * k, 0, 0, 6.3); c.fill(); }
        c.fillStyle = 'rgba(205,228,245,0.7)'; c.beginPath(); c.ellipse(x, y + 8 * k, 46 * k, 6 * k, 0, 0, 6.3); c.fill(); }); }
    // very distant haze ridge all round
    c.fillStyle = '#b5ccd8'; c.beginPath(); c.moveTo(0, HOR + 2);
    for (let x = 0; x <= SW; x += 8) c.lineTo(x, HOR - 10 - 5 * Math.sin(x * 0.004) - 4 * Math.sin(x * 0.011 + 2));
    c.lineTo(SW, HOR + 2); c.fill();
  }
  function drawSky() {
    const SW = Math.round(360 * PXD), off = ((cam.h * PXD - W / 2) % SW + SW) % SW, sw = Math.min(W, SW - off);
    ctx.drawImage(sky, off * PRES, 0, sw * PRES, (HOR + 2) * PRES, 0, 0, sw, HOR + 2);
    if (sw < W) ctx.drawImage(sky, 0, 0, (W - sw) * PRES, (HOR + 2) * PRES, sw, 0, W - sw, HOR + 2);
  }

  /* ---------------- hills, houses, shore buildings, landmarks ---------------- */
  const COLS = W / 4 + 1, LAYERS = [new Float32Array(COLS), new Float32Array(COLS), new Float32Array(COLS)];
  const layerOf = z => z > 2600 ? 0 : z > 1100 ? 1 : 2;
  const LAYER_COL = ['#98bccc', '#6f9f8b', '#5b9169'];
  function drawLand() {
    LAYERS.forEach(a => a.fill(0));
    HILLS.forEach(([X, Y, h, w], hi) => {
      const [lx, z] = rel(X, Y); if (z < 60) return;
      const cx = W / 2 + F * lx / z, hp = F * h / z, wp = F * w / z, La = LAYERS[HLAYER[hi]];
      const i0 = Math.max(0, Math.floor((cx - 2.6 * wp) / 4)), i1 = Math.min(COLS - 1, Math.ceil((cx + 2.6 * wp) / 4));
      for (let i = i0; i <= i1; i++) { const d = (i * 4 - cx) / wp, v = hp * Math.exp(-d * d); if (v > La[i]) La[i] = v; }
    });
    const hb = [[], [], []], hillZ = HILLS.map(([X, Y]) => rel(X, Y)[1]);
    for (const o of HOUSES) { if (hillZ[o.hi] < 60) continue; const [lx, z] = rel(o.x, o.y); if (z < 150) continue; const s = F / z, x = W / 2 + lx * s; if (x < -10 || x > W + 10) continue;
      hb[o.L].push([x, HOR - o.e * s, Math.max(1.2, 9 * s), Math.max(1, 6 * s), o]); }
    for (let k = 0; k < 3; k++) {
      const La = LAYERS[k]; ctx.fillStyle = LAYER_COL[k]; ctx.beginPath(); ctx.moveTo(0, HOR + 3);
      for (let i = 0; i < COLS; i++) ctx.lineTo(i * 4, HOR + 1 - La[i]); ctx.lineTo(W, HOR + 3); ctx.closePath(); ctx.fill();
      for (const [x, y, w, h, o] of hb[k]) { ctx.fillStyle = o.c; if (o.tree) { ctx.beginPath(); ctx.arc(x, y, w * 0.45, 0, 6.3); ctx.fill(); } else ctx.fillRect(x, y - h, w, h); }
      if (k === 0) drawInasaTowers();
    }
  }
  // flat land between the shore and the hills, clipped at the camera so nothing floats on the water
  function clipNear(pts) {   // pts: [lx, h, z] in camera space; Sutherland-Hodgman against z = 2
    const out = [], NZ = 2;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], ai = a[2] >= NZ, bi = b[2] >= NZ;
      if (ai) out.push(a); if (ai !== bi) { const t = (NZ - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NZ]); } }
    return out;
  }
  function landPoly(pts, side, fill) {
    const inland = []; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[Math.max(0, i - 1)], [x1, y1] = pts[Math.min(pts.length - 1, i + 1)], len = Math.hypot(x1 - x0, y1 - y0);
      inland.push([pts[i][0] + (y1 - y0) / len * side * 1500, pts[i][1] - (x1 - x0) / len * side * 1500]); }
    const ring = [...pts, ...inland.reverse()].map(([x, y]) => { const [lx, z] = rel(x, y); return [lx, 1.4, z]; });
    const c = clipNear(ring); if (c.length < 3) return;
    ctx.beginPath(); c.forEach(([lx, h, z], i) => { const sx = W / 2 + lx * F / z, sy = HOR + (CAMH - h) * F / z; i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    // quay wall along the water's edge
    for (let i = 1; i < pts.length; i++) { const A = rel(...pts[i - 1]), B = rel(...pts[i]); if (A[1] < 3 || B[1] < 3) continue;
      poly([P(A[0], 0, A[1]), P(B[0], 0, B[1]), P(B[0], 1.4, B[1]), P(A[0], 1.4, A[1])], '#9a958a'); }
  }
  function drawInasaTowers() {
    const [lx, z] = rel(-1667, 2030); if (z < 100) return; const s = F / z, x = W / 2 + lx * s;
    [[-40, 110], [-12, 140], [18, 105], [42, 80]].forEach(([dx, h]) => { const top = HOR - (333 + h) * s, bx = x + dx * s;
      ctx.fillStyle = '#e23b2e'; ctx.fillRect(bx - 1.5, top, 3, h * s); ctx.fillStyle = '#fff'; for (let j = 0; j < h * s; j += 6) ctx.fillRect(bx - 1.5, top + j, 3, 3); });
    ctx.fillStyle = '#e6ecef'; ctx.fillRect(x - 30 * s, HOR - 345 * s, 60 * s, 12 * s);
  }
  // a building as a flat facade facing the camera (cheap, fine at a distance)
  function obox(o) {   // oriented box (building) sitting on the land
    const f = fwd(o.ang), r = rgt(o.ang), hw = o.w / 2, hd = o.d / 2, base = 1.4;
    const c = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [o.x + r[0] * a + f[0] * b, o.y + r[1] * a + f[1] * b]);
    for (let i = 0; i < 4; i++) { const A = c[i], B = c[(i + 1) % 4], mx = (A[0] + B[0]) / 2 - o.x, my = (A[1] + B[1]) / 2 - o.y;
      if ((cam.x - o.x - mx) * mx + (cam.y - o.y - my) * my <= 0) continue;
      poly([PW(A[0], A[1], base), PW(B[0], B[1], base), PW(B[0], B[1], base + o.h), PW(A[0], A[1], base + o.h)], i % 2 ? o.c : shade(o.c), 'rgba(0,0,0,.1)', 1); }
    poly(c.map(([x, y]) => PW(x, y, base + o.h)), o.r);
  }
  const SHADE = {}; function shade(c) { if (SHADE[c]) return SHADE[c]; const n = parseInt(c.slice(1), 16), f = 0.86;
    return SHADE[c] = '#' + [16, 8, 0].map(sh => Math.round(((n >> sh) & 255) * f).toString(16).padStart(2, '0')).join(''); }
  function facade(o) {
    const [lx, z] = rel(o.x, o.y); if (z < 30) return; if (z < 500) return obox(o); const s = F / z, x = W / 2 + lx * s, w = o.w * s, h = o.h * s, base = HOR + (CAMH - 1.4) * s;
    if (x + w < 0 || x - w > W) return;
    ctx.fillStyle = o.c; ctx.fillRect(x - w / 2, base - h, w, h);
    if (h > 6) { ctx.fillStyle = 'rgba(70,110,140,0.32)'; for (let yy = base - h + 3; yy < base - 2; yy += Math.max(3, 4 * s)) ctx.fillRect(x - w / 2 + 1, yy, w - 2, Math.max(1, 1.2 * s)); }
  }
  function shoreStrip(pts) {   // grey quay line where land meets water
    let prev = null; ctx.strokeStyle = '#8e9a9f';
    for (const [x, y] of pts) { const [lx, z] = rel(x, y); const p = z > 20 ? { x: W / 2 + lx * F / z, y: HOR + CAMH * F / z } : null;
      if (p && prev) { ctx.lineWidth = Math.max(1, F / z * 1.5); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); } prev = p; }
  }
  function crane(x, y, kind) {
    const [lx, z] = rel(x, y); if (z < 40) return; const s = F / z, cx = W / 2 + lx * s, base = HOR + CAMH * s;
    if (kind === 'giant') {   // the 1909 Giant Cantilever Crane (hammerhead), 61.7 m
      ctx.fillStyle = '#2d3a44'; ctx.fillRect(cx - 6 * s, base - 50 * s, 12 * s, 50 * s);
      ctx.fillRect(cx - 45 * s, base - 62 * s, 75 * s, 8 * s); ctx.fillRect(cx - 45 * s, base - 58 * s, 14 * s, 10 * s); ctx.fillRect(cx + 24 * s, base - 54 * s, 2 * s, 18 * s);
      ctx.strokeStyle = '#2d3a44'; ctx.lineWidth = Math.max(0.7, s); for (let k = 0; k < 8; k++) { ctx.beginPath(); ctx.moveTo(cx - 6 * s, base - k * 6 * s); ctx.lineTo(cx + 6 * s, base - (k + 1) * 6 * s); ctx.stroke(); }
    } else {
      ctx.fillStyle = '#d8392b'; ctx.fillRect(cx - 1.5 * s, base - 40 * s, 3 * s, 40 * s);
      ctx.strokeStyle = '#d8392b'; ctx.lineWidth = Math.max(1.2, 2.5 * s); ctx.beginPath(); ctx.moveTo(cx, base - 38 * s); ctx.lineTo(cx + 30 * s, base - 50 * s); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.6, 1 * s); ctx.stroke();
    }
  }
  function megami() {  // Megami Bridge: 880 m cable-stayed, H-shaped 170 m towers, deck 65 m, crossing the harbour mouth
    const C = [-1562, -1706], d = fwd(312.5), at = t => [C[0] + d[0] * t, C[1] + d[1] * t];
    const d0 = PW(...at(-440), 65), d1 = PW(...at(440), 65); if (!d0 || !d1) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.8;
    [-240, 240].forEach(tt => { for (let k = 1; k <= 9; k++) [-1, 1].forEach(sd => { const e = PW(...at(tt + sd * k * 24), 65), t2 = PW(...at(tt), 165 - k * 4);
      if (t2 && e) { ctx.beginPath(); ctx.moveTo(t2.x, t2.y); ctx.lineTo(e.x, e.y); ctx.stroke(); } }); });
    seg(d0, d1, '#f7f9fb', Math.max(1.5, 4 * Math.min(d0.s, d1.s)));
    [-240, 240].forEach(tt => { const b = PW(...at(tt), 0), t = PW(...at(tt), 170); if (!b || !t) return; const w = Math.max(1.2, 6 * t.s);
      ctx.fillStyle = '#f2f5f7'; ctx.fillRect(b.x - w * 1.6, t.y, w, b.y - t.y); ctx.fillRect(b.x + w * 0.6, t.y, w, b.y - t.y);
      ctx.fillRect(b.x - w * 1.6, t.y + (b.y - t.y) * 0.08, w * 3.2, w * 0.7); ctx.fillRect(b.x - w * 1.6, t.y + (b.y - t.y) * 0.55, w * 3.2, w * 0.7); });
  }
  function ouraCathedral() { const p = PW(180, -180, 26); if (!p || p.z < 50) return; const s = p.s;
    ctx.fillStyle = '#f7f5ef'; ctx.fillRect(p.x - 14 * s, p.y - 16 * s, 28 * s, 16 * s);
    ctx.fillStyle = '#6b7a85'; ctx.beginPath(); ctx.moveTo(p.x - 16 * s, p.y - 16 * s); ctx.lineTo(p.x, p.y - 26 * s); ctx.lineTo(p.x + 16 * s, p.y - 16 * s); ctx.fill();
    ctx.fillStyle = '#f7f5ef'; ctx.fillRect(p.x - 4 * s, p.y - 36 * s, 8 * s, 20 * s);
    ctx.fillStyle = '#4c5a64'; ctx.beginPath(); ctx.moveTo(p.x - 5 * s, p.y - 36 * s); ctx.lineTo(p.x, p.y - 50 * s); ctx.lineTo(p.x + 5 * s, p.y - 36 * s); ctx.fill();
    ctx.fillStyle = '#d8b74a'; ctx.fillRect(p.x - 0.6 * s, p.y - 57 * s, 1.2 * s, 7 * s); ctx.fillRect(p.x - 2.5 * s, p.y - 55 * s, 5 * s, 1.2 * s); }
  function gloverHouse() { const p = PW(40, -330, 45); if (!p || p.z < 50) return; const s = p.s;
    ctx.fillStyle = '#5b5f63'; ctx.beginPath(); ctx.moveTo(p.x - 26 * s, p.y - 8 * s); ctx.lineTo(p.x - 18 * s, p.y - 15 * s); ctx.lineTo(p.x + 18 * s, p.y - 15 * s); ctx.lineTo(p.x + 26 * s, p.y - 8 * s); ctx.fill();
    ctx.fillStyle = '#fbfaf5'; ctx.fillRect(p.x - 24 * s, p.y - 8 * s, 48 * s, 9 * s); }
  function dejimaWharf() { const p = PW(300, 900, 1.4); if (!p || p.z < 40) return; const s = p.s;
    ctx.fillStyle = '#9a6a43'; ctx.fillRect(p.x - 40 * s, p.y - 10 * s, 80 * s, 10 * s); ctx.fillStyle = '#c99666'; ctx.fillRect(p.x - 40 * s, p.y - 12 * s, 80 * s, 2.5 * s); }

  /* ---------------- Matsugae pier: stand, tents, terminal rooftop crowd ---------------- */
  const CROWD_C = ['#e63946', '#2c6ed5', '#ffb703', '#2a9d8f', '#f4a3c0', '#ffffff', '#7b5cd6', '#ff7b00'];
  function box(x0, x1, y0, y1, h0, h1, top, side, front) {  // axis-aligned box in world coords, draw visible faces
    const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const faces = [[0, 1, [0, -1]], [1, 2, [1, 0]], [2, 3, [0, 1]], [3, 0, [-1, 0]]];
    for (const [a, b, n] of faces) { const mx = (c[a][0] + c[b][0]) / 2, my = (c[a][1] + c[b][1]) / 2; if ((cam.x - mx) * n[0] + (cam.y - my) * n[1] <= 0) continue;
      poly([PW(c[a][0], c[a][1], h0), PW(c[b][0], c[b][1], h0), PW(c[b][0], c[b][1], h1), PW(c[a][0], c[a][1], h1)], n[0] ? side : front, 'rgba(0,0,0,.08)', 1); }
    if (top) poly(c.map(([x, y]) => PW(x, y, h1)), top);
  }
  function pierItems() {
    const items = [], A = PIER_A, len = Math.hypot(PIER_B[0] - A[0], PIER_B[1] - A[1]);
    const d = [(PIER_B[0] - A[0]) / len, (PIER_B[1] - A[1]) / len], n = [d[1], -d[0]];    // n points inland (east)
    const Q = (t, off) => [A[0] + d[0] * t + n[0] * off, A[1] + d[1] * t + n[1] * off];
    const PQ = (t, off, h) => PW(...Q(t, off), h);
    const quad = (t0, t1, o0, o1, h0, h1, col) => poly([PQ(t0, o0, h0), PQ(t1, o0, h0), PQ(t1, o1, h1), PQ(t0, o1, h1)], col);
    const at = (t, off) => depth(...Q(t, off));
    // terminal building with its green rooftop deck — people watch the race from up here
    items.push([at(170, 45), () => { quad(80, 260, 30, 30, 1.4, 14, '#e4e9ec'); quad(80, 260, 30, 60, 14, 14, '#7fb069');
      for (let i = 0; i < 70; i++) { const p = PQ(84 + i * 2.5, 32 + hash(i, 4) * 4, 15.4 + Math.max(0, Math.sin(S.time * 5 + i)) * 0.3); if (p) dot(p, 0.6 * p.s, CROWD_C[i % 8]); } }]);
    // special viewing stand with awning and banner, facing the course
    items.push([at(120, 10), () => {
      for (let r = 0; r < 5; r++) { quad(70, 170, 4 + r * 2, 4 + r * 2, 1.4, 2.4 + r * 1.2, '#bdb6a7'); quad(70, 170, 4 + r * 2, 6 + r * 2, 2.4 + r * 1.2, 2.4 + r * 1.2, '#e9e4d8'); }
      for (let r = 0; r < 5; r++) for (let i = 0; i < 38; i++) { const p = PQ(72 + i * 2.6, 5 + r * 2, 3.2 + r * 1.2 + Math.max(0, Math.sin(S.time * 6 + i + r)) * 0.25); if (p) dot(p, 0.42 * p.s, CROWD_C[(i * 3 + r) % 8]); }
      quad(68, 172, 3, 16, 11, 12.5, '#ffffff');
      const b = PQ(120, 3, 9.5); if (b) { const c = sprite('stand', 260, 34, g => { g.fillStyle = '#c81d25'; g.fillRect(0, 0, 260, 34); g.fillStyle = '#fff'; g.font = '900 20px "M PLUS Rounded 1c",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('長崎ペーロン選手権大会', 130, 18); });
        const w = 70 * b.s; ctx.drawImage(c, b.x - w / 2, b.y - w * 34 / 260 / 2, w, w * 34 / 260); } }]);
    // tents along the quay
    for (let k = 0; k < 8; k++) { const t = k < 4 ? 10 + k * 14 : 190 + (k - 4) * 16; items.push([at(t, 8), () => {
      quad(t, t + 10, 4, 4, 1.4, 4.4, k % 2 ? '#e8f1fb' : '#fff3e6');
      poly([PQ(t - 0.5, 3.5, 4.4), PQ(t + 10.5, 3.5, 4.4), PQ(t + 10.5, 8, 6.4), PQ(t - 0.5, 8, 6.4)], k % 2 ? '#2c6ed5' : '#e63946'); }]); }
    // the crowd along the quay edge
    items.push([at(180, 1), () => { for (let i = 0; i < 150; i++) { const t = i * 2.55, b = Math.max(0, Math.sin(S.time * 6 + i * 1.3)) * 0.3;
      const p = PQ(t, 1 + (i % 2), 2.3 + b), hd = PQ(t, 1 + (i % 2), 3.0 + b); if (p) { dot(p, 0.45 * p.s, CROWD_C[i % 8]); dot(hd, 0.28 * hd.s, '#2a1c12'); } } }]);
    return items;
  }

  /* ---------------- course furniture: buoys, finish, spectator boats ---------------- */
  function buoy(x, y, r, col, band) { const p = PW(x, y, 0); if (!p) return; const s = p.s;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - r * 0.55 * s, r * s, r * 0.85 * s, 0, 0, 6.3); ctx.fillStyle = col; ctx.fill();
    if (band) { ctx.beginPath(); ctx.ellipse(p.x, p.y - r * 0.7 * s, r * s, r * 0.25 * s, 0, 0, 6.3); ctx.fillStyle = band; ctx.fill(); } }
  function flagPole(x, y, h, col, txt) { const b = PW(x, y, 0.4), t = PW(x, y, h); if (!b || !t) return; seg(b, t, '#555', Math.max(0.6, 0.08 * t.s));
    poly([t, { x: t.x + 1.4 * t.s, y: t.y + 0.45 * t.s }, { x: t.x, y: t.y + 0.9 * t.s }], col);
    if (txt && t.s > 6) { const c = sprite('fl' + txt, 80, 26, g => { g.fillStyle = col; g.fillRect(0, 0, 80, 26); g.fillStyle = '#fff'; g.font = '900 17px "M PLUS Rounded 1c",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 40, 14); });
      const w = 3.2 * t.s; ctx.drawImage(c, t.x - w / 2, t.y - w * 26 / 80 - 2, w, w * 26 / 80); } }
  function courseItems() {
    const items = [], C = Course, add = (axis, lat, fn) => { const [x, y] = C.w(axis, lat); items.push([depth(x, y), () => fn(x, y)]); };
    // start line (bows on axis 0) and finish line, red/white buoys across the course
    for (let lat = -18; lat <= 18; lat += 3) add(0, lat, (x, y) => buoy(x, y, 0.35, (lat / 3) % 2 ? '#e63946' : '#fff'));
    for (let lat = -20; lat <= 16; lat += 3) add(C.finishAxis, lat, (x, y) => buoy(x, y, 0.42, (lat / 3) % 2 ? '#fff' : '#e63946'));
    add(C.finishAxis, -22, (x, y) => flagPole(x, y, 5, '#e63946', 'ゴール')); add(C.finishAxis, 18, (x, y) => flagPole(x, y, 5, '#e63946', 'ゴール'));
    add(0, 20, (x, y) => flagPole(x, y, 4.5, '#2c6ed5', 'スタート'));
    // one turn buoy per lane, at the centre of that boat's turning circle
    C.lanes.forEach(o => add(C.out - L / 2, o - C.R, (x, y) => { buoy(x, y, 0.9, '#ffb703', '#ff7b00'); flagPole(x, y, 3.2, '#e63946'); }));
    add(C.out + 6, -18, (x, y) => flagPole(x, y, 5, '#ff7b00', 'ターン'));
    // distance buoys every 50 m along both course edges
    for (let a = 50; a < C.out; a += 50) [-21, 18].forEach(lat => add(a, lat, (x, y) => buoy(x, y, a % 100 ? 0.3 : 0.45, a % 100 ? '#ff8a1f' : '#ffd23f')));
    // spectator boats: a sightseeing boat (遊覧船), safety boats and fishing boats with tairyō-bata
    add(C.out * 0.55, 42, (x, y) => yuransen(x, y));
    [[C.out * 0.3, -34], [C.out * 0.8, 30], [C.out * 0.15, 30]].forEach(([a, lat], k) => add(a, lat, (x, y) => smallBoat(x, y, k, k === 0)));
    [[C.out * 0.45, -48], [C.out * 0.7, -44], [C.out * 0.95, 45]].forEach(([a, lat], k) => add(a, lat, (x, y) => smallBoat(x, y, k + 3, false)));
    return items;
  }
  function yuransen(x, y) { const o = { px: x, py: y, hd: Course.H1 }, B = LF(o, 26);
    poly([B(-2.6, 0, 0), B(2.6, 0, 0), B(2.6, 2.4, 0), B(-2.6, 2.4, 0)], '#f5f8fb', '#7a8c99', 1);
    poly([B(2.6, 0, 0), B(2.6, 0, 22), B(0, 0, 26), B(0, 2.4, 26), B(2.6, 2.4, 22), B(2.6, 2.4, 0)], '#fbfdff', '#7a8c99', 1);
    poly([B(-2.6, 2.4, 0), B(2.6, 2.4, 0), B(2.6, 4.6, 3), B(-2.6, 4.6, 3)], '#e8eef3'); poly([B(2.6, 2.4, 2), B(2.6, 2.4, 18), B(2.4, 4.6, 16), B(2.4, 4.6, 3)], '#e8eef3', '#7a8c99', 1);
    for (let i = 0; i < 10; i++) { const p = B(2.6, 3.4, 3.5 + i * 1.3); if (p) dot(p, 0.35 * p.s, CROWD_C[i % 8]); }
    seg(B(2.6, 1.0, 0), B(2.6, 1.0, 22), '#1f56b0', 3); }
  function smallBoat(x, y, k, safety) { const o = { px: x, py: y, hd: Course.H1 + (k % 2 ? 8 : -8) }, B = LF(o, 7);
    poly([B(-1.2, 0, 0), B(1.2, 0, 0), B(1.2, 0.9, 0.3), B(-1.2, 0.9, 0.3)], '#f4f1e8', '#5a6b75', 1);
    poly([B(1.2, 0, 0), B(1.2, 0, 5.5), B(0, 0, 7), B(0, 0.9, 7), B(1.2, 0.9, 5.5), B(1.2, 0.9, 0.3)], safety ? '#ff7b00' : '#f8f6ef', '#5a6b75', 1);
    poly([B(-0.6, 0.9, 1.2), B(0.6, 0.9, 1.2), B(0.6, 2, 1.2), B(-0.6, 2, 1.2)], '#e8edf0');
    if (!safety) { const cols = ['#e63946', '#1d6fe0', '#ffb703', '#2a9d8f', '#ff7b00'];
      for (let j = 0; j < 3; j++) { const zf = 1 + j * 2; seg(B(0, 0.9, zf), B(0, 4, zf), '#666', 1);
        poly([B(0, 4, zf), B(0, 4, zf + 1.2), B(0, 3, zf + 1.2), B(0, 3, zf)], cols[(k + j) % 5]); } } }

  /* ---------------- peiron boats ---------------- */
  // 13.6 m cedar hull, bow-shaped (弓形): rises at both bow and stern
  const hullW = t => { let w = 0.66; if (t < 0.08) w *= 0.6 + t / 0.08 * 0.4; if (t > 0.78) w *= Math.max(0.05, (1 - t) / 0.22); return w; };
  const hullH = t => 0.5 + 0.55 * Math.pow(Math.abs(t - 0.45) / 0.55, 2.2);
  function wake(b, B) {
    const k = Math.min(1, b.v / 12) * 0.5 + 0.12; ctx.globalAlpha = k; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    for (const sd of [-1, 1]) { let prev = null; for (let i = 0; i <= 8; i++) { const p = B(sd * (0.6 + i * 0.24), 0, -i * 0.9); if (p && prev) { ctx.lineWidth = Math.max(1, p.s * 0.16); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); } prev = p; }
      seg(B(sd * 0.15, 0, L * 0.99), B(sd * 0.75, 0, L * 0.82), '#fff', 2); }
    ctx.globalAlpha = 1;
  }
  function paddler(b, B, t, sd, ph, bob) {
    const z = t * L, h0 = hullH(t) - 0.2 + bob, lean = Math.cos(ph), sn = Math.sin(ph);
    const hip = B(sd * 0.32, h0, z); if (!hip) return; const s = hip.s;
    const sh = B(sd * 0.3, h0 + 0.68, z + 0.18 + lean * 0.22), hd = B(sd * 0.3, h0 + 0.98, z + 0.24 + lean * 0.28);
    // short ~1 m paddle (櫂): longer near bow/stern where the hull is higher
    const plen = 1.0 + Math.abs(t - 0.45) * 0.7, inWater = sn > 0;
    const grip = B(sd * 0.36, h0 + 0.95, z + lean * 0.45), tipY = inWater ? -0.18 : 0.15 + 0.35 * (-sn);
    const tip = B(sd * (0.78 + plen * 0.12), tipY, z + lean * 0.75 + 0.1), bl = B(sd * (0.72 + plen * 0.1), tipY + 0.32, z + lean * 0.72 + 0.1);
    const hand = B(sd * 0.55, h0 + 0.5, z + lean * 0.6);
    ctx.lineCap = 'round'; seg(grip, tip, '#d9b47a', s * 0.07); seg(bl, tip, '#b98a48', s * 0.15);
    seg(hip, sh, b.color, s * 0.4); seg(sh, hand, '#e8b98f', s * 0.1);
    if (hd) { dot(hd, s * 0.16, '#2a1c12'); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.6, s * 0.055); ctx.beginPath();
      ctx.moveTo(hd.x - s * 0.16, hd.y - s * 0.02); ctx.lineTo(hd.x + s * 0.16, hd.y - s * 0.02); ctx.lineTo(hd.x + s * 0.24, hd.y + s * 0.08); ctx.stroke(); }
  }
  function standing(B, x, t, bob, shirt, band, arm) {    // a standing crew member; arm(h0,z) draws their tool
    const z = t * L, h0 = hullH(t) - 0.15 + bob, hip = B(x, h0 + 0.45, z); if (!hip) return; const s = hip.s;
    const sh = B(x, h0 + 1.25, z), hd = B(x, h0 + 1.55, z); seg(hip, sh, shirt, s * 0.38); if (arm) arm(sh, h0, z, s);
    if (hd) { dot(hd, s * 0.16, '#2a1c12'); ctx.strokeStyle = band; ctx.lineWidth = Math.max(0.6, s * 0.06); ctx.beginPath(); ctx.moveTo(hd.x - s * 0.16, hd.y - s * 0.03); ctx.lineTo(hd.x + s * 0.16, hd.y - s * 0.03); ctx.stroke(); }
  }
  function boat(b) {
    const B0 = LF({ px: b.px, py: b.py, hd: b.hd }, L), bob = Math.sin(S.time * 1.7 + b.lane * 1.3) * 0.04;
    const B = (x, y, z) => B0(x, y + (y > 0.01 ? bob : 0), z);
    const N = 20, GL = [], GR = [], WLp = [], WRp = [], IL = [], IR = [];
    for (let i = 0; i <= N; i++) { const t = i / N, z = t * L, w = hullW(t), h = hullH(t);
      GL.push(B(-w, h, z)); GR.push(B(w, h, z)); WLp.push(B(-w * 0.8, 0, z)); WRp.push(B(w * 0.8, 0, z)); IL.push(B(-w * 0.55, h - 0.08, z)); IR.push(B(w * 0.55, h - 0.08, z)); }
    const ok = a => a.filter(Boolean);
    wake(b, B);
    const wood = '#c9965a', woodD = '#9c6c38';
    poly(ok([...GL, ...WLp.slice().reverse()]), woodD); poly(ok([...GR, ...WRp.slice().reverse()]), woodD);
    poly(ok([GL[0], GR[0], WRp[0], WLp[0]]), wood, 'rgba(0,0,0,.2)', 1);
    poly(ok([...GL, ...GR.slice().reverse()]), '#7a4e26'); poly(ok([...IL, ...IR.slice().reverse()]), '#a8753f');
    ctx.lineCap = 'round';
    for (let i = 1; i <= N; i++) { if (GL[i - 1] && GL[i]) seg(GL[i - 1], GL[i], b.color, GL[i].s * 0.12); if (GR[i - 1] && GR[i]) seg(GR[i - 1], GR[i], b.color, GR[i].s * 0.12); }
    // team crest painted on both sides of the bow
    [-1, 1].forEach(sd => { const c = B(sd * hullW(0.9) * 0.95, hullH(0.9) * 0.55, 0.9 * L); if (c) { dot(c, c.s * 0.26, '#fff'); dot(c, c.s * 0.2, b.color); } });
    const items = [];
    // 13 pairs of paddlers = 26 (seats from bow to stern, gap amidships for the drum & gong)
    const seats = []; for (let i = 0; i < 13; i++) seats.push(0.88 - i * 0.056 - (i >= 6 ? 0.07 : 0));
    seats.forEach(t => items.push([t, () => { paddler(b, B, t, -1, b.phase, bob); paddler(b, B, t, 1, b.phase, bob); }]));
    const up = Math.sin(b.phase * 2) > 0;
    // 太鼓 (drum) and its drummer
    items.push([0.52, () => { const dc = B(0, hullH(0.53) + 0.45, 0.53 * L); if (dc) { const s = dc.s;
      ctx.beginPath(); ctx.ellipse(dc.x, dc.y, s * 0.4, s * 0.34, 0, 0, 6.3); ctx.fillStyle = '#8b2a1d'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(dc.x, dc.y - s * 0.2, s * 0.38, s * 0.11, 0, 0, 6.3); ctx.fillStyle = '#ead6ae'; ctx.fill(); }
      standing(B, -0.05, 0.5, bob, '#fff', b.color, (sh, h0, z) => { seg(sh, B(-0.3, h0 + (up ? 1.7 : 1.0), z + 0.4), '#e8b98f', sh.s * 0.1); seg(sh, B(0.25, h0 + (up ? 1.0 : 1.7), z + 0.4), '#e8b98f', sh.s * 0.1); }); }]);
    // ドラ (gong) and its player
    items.push([0.47, () => { const g = B(0.35, hullH(0.47) + 1.0, 0.47 * L), f0 = B(0.35, hullH(0.47), 0.47 * L), f1 = B(0.35, hullH(0.47) + 1.5, 0.47 * L);
      seg(f0, f1, '#5a3a1a', (f1 || { s: 1 }).s * 0.06); if (g) { dot(g, g.s * 0.28, '#c9962a'); dot(g, g.s * 0.19, '#e9c25a'); dot(g, g.s * 0.06, '#a57a1c'); }
      standing(B, 0.0, 0.44, bob, '#fff', b.color, (sh, h0, z) => seg(sh, B(0.3, h0 + (up ? 1.0 : 1.35), z + 0.2), '#e8b98f', sh.s * 0.1)); }]);
    // 采振り: stands near the bow waving the 采配 to the beat
    items.push([0.93, () => standing(B, 0, 0.93, bob, b.dark, '#fff', (sh, h0, z, s) => { const tip = B(Math.sin(b.phase) * 0.5, h0 + 2.2, z + 0.2);
      seg(sh, tip, '#e8b98f', s * 0.1); if (tip) for (let k = 0; k < 5; k++) seg(tip, { x: tip.x + (k - 2) * s * 0.06, y: tip.y + s * 0.35 }, '#fff', s * 0.05); })]);
    // centre post with the team flag
    items.push([0.5, () => { const p0 = B(0, hullH(0.5), 0.5 * L), p1 = B(0, hullH(0.5) + 2.6, 0.5 * L); if (!p0 || !p1) return; seg(p0, p1, '#eee', p1.s * 0.06);
      const wv = u => Math.sin(S.time * 6 + u * 4 + b.lane) * 0.1 * u * (1 + b.v / 10), pts = [];
      for (let i = 0; i <= 5; i++) { const u = i / 5; pts.push(B(u * 1.0 + wv(u), hullH(0.5) + 2.55, 0.5 * L - u * 0.3)); }
      for (let i = 5; i >= 0; i--) { const u = i / 5; pts.push(B(u * 1.0 + wv(u), hullH(0.5) + 1.95, 0.5 * L - u * 0.3)); }
      poly(ok(pts), b.color, '#fff', Math.max(0.5, p1.s * 0.03));
      const c = B(0.5, hullH(0.5) + 2.25, 0.5 * L - 0.15); if (c) { const k = sprite('k' + b.kanji, 40, 40, g => { g.fillStyle = '#fff'; g.font = '900 32px "M PLUS Rounded 1c",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.kanji, 20, 22); });
        const sz = Math.max(6, c.s * 0.5); ctx.drawImage(k, c.x - sz / 2, c.y - sz / 2, sz, sz); } }]);
    // あか汲み (bailer) scooping with a bucket, and the 舵取り with the long steering oar at the stern
    items.push([0.1, () => { const z = 0.1 * L, h0 = hullH(0.1) - 0.2 + bob, hip = B(0.15, h0 + 0.2, z); if (!hip) return; const s = hip.s;
      const dip = Math.max(0, Math.sin(S.time * 3 + b.lane)); const sh = B(0.15, h0 + 0.75 - dip * 0.25, z + 0.2), hd = B(0.15, h0 + 1.0 - dip * 0.3, z + 0.3);
      seg(hip, sh, b.dark, s * 0.34); const bk = B(0.4, h0 + 0.3 + dip * 0.2, z + 0.3); seg(sh, bk, '#e8b98f', s * 0.09); if (bk) { ctx.fillStyle = '#6b8fb3'; ctx.fillRect(bk.x - s * 0.12, bk.y - s * 0.1, s * 0.24, s * 0.2); } if (hd) dot(hd, s * 0.15, '#2a1c12'); }]);
    items.push([0.02, () => standing(B, 0.3, 0.03, bob, b.dark, '#fff', (sh, h0, z, s) => { const hand = B(0.6, h0 + 0.85, z - 0.2), end = B(0.95, -0.1, z - 3.0); seg(hand, end, '#b98a48', s * 0.09); seg(sh, hand, '#e8b98f', s * 0.09); })]);
    items.sort((a, c) => c[0] - a[0]).forEach(([, fn]) => fn());
    // team name tag
    const lp = B(0, 3.3, L * 0.18);
    if (lp) { const font = '800 24px "M PLUS Rounded 1c",sans-serif', tw = measure(font, b.name) + 28, th = 38;
      const c = sprite('tag' + b.name + b.isPlayer, tw + 4, th + 12, g => {
        g.fillStyle = b.isPlayer ? '#ffd23f' : 'rgba(0,0,0,.62)'; g.strokeStyle = '#fff'; g.lineWidth = 3;
        g.beginPath(); g.roundRect ? g.roundRect(2, 2, tw, th, 19) : g.rect(2, 2, tw, th); g.fill(); if (b.isPlayer) g.stroke();
        if (b.isPlayer) { g.beginPath(); g.moveTo(tw / 2 - 6, th + 1); g.lineTo(tw / 2 + 2, th + 10); g.lineTo(tw / 2 + 10, th + 1); g.fill(); }
        g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = b.isPlayer ? '#3a2a00' : '#fff'; g.fillText(b.name, tw / 2 + 2, th / 2 + 3); });
      const k = Math.max(0.45, Math.min(1, lp.s / 55)); ctx.drawImage(c, lp.x - c.lw * k / 2, lp.y - th * k / 2, c.lw * k, c.lh * k); }
  }

  /* ---------------- water & particles ---------------- */
  function drawWater() {
    const g = ctx.createLinearGradient(0, HOR, 0, H); g.addColorStop(0, '#8fc6dc'); g.addColorStop(0.07, '#4f9fc3'); g.addColorStop(1, '#155d8c');
    ctx.fillStyle = g; ctx.fillRect(0, HOR, W, H - HOR);
    const rg = ctx.createLinearGradient(0, HOR, 0, HOR + 26); rg.addColorStop(0, 'rgba(110,160,130,0.35)'); rg.addColorStop(1, 'rgba(110,160,130,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, HOR, W, 26);
    const pan = cam.h * 0.35, base = Math.floor(S.travelled / 2.6), frac = S.travelled - base * 2.6;
    for (let i = 52; i >= 1; i--) { const zi = base + i, z = i * 2.6 - frac; if (z < 1.2) continue; const s = F / z;
      ctx.fillStyle = '#fff'; ctx.globalAlpha = Math.min(0.3, s / 120) * (s > 40 ? 0.6 : 1);
      for (let k = -11; k <= 11; k++) { const x = k * 2.8 + (hash(zi, k) - 0.5) * 2 + Math.sin(S.time * 0.9 + zi + k) * 0.18 + (pan % 2.8);
        const px = W / 2 + x * s, w = Math.min(36, (0.35 + hash(zi, k + 50) * 0.9) * s); ctx.fillRect(px - w / 2, HOR + CAMH * s, w, Math.max(1, 0.05 * s)); } }
    ctx.globalAlpha = 1;
  }
  function splash(b, n, force = 1, gold) {
    const f = fwd(b.hd), r = rgt(b.hd);
    for (let i = 0; i < n; i++) { const sd = Math.random() < 0.5 ? -1 : 1, t = 0.12 + Math.random() * 0.74, lz = t * L - L / 2, lx = sd * (0.95 + Math.random() * 0.3);
      S.parts.push({ x: b.px + r[0] * lx + f[0] * lz, y: b.py + r[1] * lx + f[1] * lz, h: 0.05, vx: r[0] * sd * Math.random() * 1.2 - f[0] * 1.5, vy: r[1] * sd * Math.random() * 1.2 - f[1] * 1.5,
        vh: (1.5 + Math.random() * 2) * force, life: 0.5 + Math.random() * 0.4, gold }); }
  }
  function bowSpray(b) { const f = fwd(b.hd), r = rgt(b.hd);
    for (let i = 0; i < 3; i++) { const sd = Math.random() < 0.5 ? -1 : 1;
      S.parts.push({ x: b.px + f[0] * L * 0.48 + r[0] * sd * 0.3, y: b.py + f[1] * L * 0.48 + r[1] * sd * 0.3, h: 0.2, vx: r[0] * sd * 2.5, vy: r[1] * sd * 2.5, vh: 2 + Math.random() * 2.5, life: 0.6, gold: true }); } }
  function drawParts(dt) {
    for (const p of S.parts) { p.vh -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.h += p.vh * dt; p.life -= dt; }
    S.parts = S.parts.filter(p => p.life > 0 && p.h > -0.2);
    for (const p of S.parts) { const q = PW(p.x, p.y, p.h); if (!q) continue; ctx.globalAlpha = Math.min(1, p.life * 2) * 0.9; dot(q, Math.max(0.8, q.s * (p.gold ? 0.09 : 0.07)), p.gold ? '#fff7c2' : '#fff'); }
    ctx.globalAlpha = 1;
  }
  function speedLines() {
    if (S.boostFx <= 0.01) return;
    ctx.save(); ctx.globalAlpha = Math.min(0.55, S.boostFx); ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    for (let i = 0; i < 24; i++) { const a = hash(i, Math.floor(S.time * 14)) * Math.PI * 2, r0 = 240 + hash(i, 3) * 200, len = 60 + hash(i, 5) * 120;
      const x0 = W / 2 + Math.cos(a) * r0 * 1.6, y0 = HOR + 60 + Math.sin(a) * r0 * 0.7; if (y0 < HOR - 20) continue;
      ctx.lineWidth = 2 + hash(i, 9) * 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a) * len * 1.6, y0 + Math.sin(a) * len * 0.7); ctx.stroke(); }
    ctx.restore();
  }
  function drawLabels() {
    if (S.labelA <= 0.02) return;
    ctx.save(); ctx.globalAlpha = S.labelA;
    const font = '800 14px "M PLUS Rounded 1c", sans-serif', placed = [];
    for (const [x, y, h, txt] of LANDNAME) {
      const p = PW(x, y, h); if (!p || p.z < 60 || p.x < 40 || p.x > W - 40) continue;
      const w = measure(font, txt) + 16; let ly = Math.max(16, p.y - 16);
      for (const q of placed) if (Math.abs(q[0] - p.x) < (q[1] + w) / 2 && Math.abs(q[2] - ly) < 22) ly = q[2] - 24;
      placed.push([p.x, w, ly]);
      const c = sprite('lab' + txt, w, 30, g => { g.fillStyle = 'rgba(255,255,255,0.93)'; g.beginPath(); g.roundRect ? g.roundRect(0, 0, w, 22, 11) : g.rect(0, 0, w, 22); g.fill();
        g.beginPath(); g.moveTo(w / 2 - 5, 22); g.lineTo(w / 2, 28); g.lineTo(w / 2 + 5, 22); g.fill();
        g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#21435e'; g.fillText(txt, w / 2, 12); });
      ctx.drawImage(c, p.x - w / 2, ly - 11, w, 30);
    }
    ctx.restore();
  }

  /* ---------------- public API ---------------- */
  function resize(scale) {
    RES = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * scale));
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) RES = Math.min(RES, 1.25);
    cv.width = Math.round(W * RES); cv.height = Math.round(H * RES); paintSky(); SPR.clear();
  }
  function init(canvas) { cv = canvas; ctx = cv.getContext('2d'); }
  function setRace(o) { S.boats = o.boats; S.parts = []; S.boostFx = 0; S.labelT = 0; S.travelled = 0; cam.smoothH = Course.H1; }
  // camera: behind the player's boat, heading lags behind the boat so you SEE it swing round at the turn
  function update(dt, player, opts = {}) {
    S.time += dt; S.travelled += player.v * dt;
    if (cam.smoothH === undefined) cam.smoothH = player.hd;
    let target = player.hd;
    if (opts.idle) target = Course.H1 + Math.sin(S.time * 0.12) * 32;
    cam.smoothH += angDiff(target, cam.smoothH) * Math.min(1, dt * (opts.idle ? 3 : 1.8));
    const f = fwd(cam.smoothH), r = rgt(cam.smoothH), back = 9.9 + L / 2;
    setCam(player.px - f[0] * back + r[0] * 1.6, player.py - f[1] * back + r[1] * 1.6, cam.smoothH);
    S.boostFx += ((player.boost > 0 ? 1 : 0) - S.boostFx) * Math.min(1, dt * 4);
    if (player.boost > 0 && Math.random() < 0.6) bowSpray(player);
    cam.shake = Math.max(0, cam.shake - dt * 3);
    S.labelT += dt; const wantL = opts.labels || (!opts.idle && S.labelT < 6) ? 1 : 0;
    S.labelA += (wantL - S.labelA) * Math.min(1, dt * 2);
  }
  function showLabels() { S.labelT = 0; }
  function render(dt) {
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    if (cam.shake > 0) ctx.translate((Math.random() - 0.5) * cam.shake * 6, (Math.random() - 0.5) * cam.shake * 4);
    drawSky(); drawLand(); drawWater();
    landPoly(EAST, 1, '#c3c7b8'); landPoly(WEST, -1, '#b9c2b4');
    // shore buildings + landmarks, far to near (drawn after the water so their bases sit on it)
    const far = [];
    for (const o of BUILD) { const z = depth(o.x, o.y); if (z > 30 && z < 4000) far.push([z, () => facade(o)]); }
    for (const [x, y, k] of CRANES) far.push([depth(x, y), () => crane(x, y, k)]);
    far.push([depth(-1562, -1706), megami], [depth(180, -180), ouraCathedral], [depth(40, -330), gloverHouse], [depth(300, 900), dejimaWharf]);
    far.sort((a, b) => b[0] - a[0]).forEach(([z, fn]) => { if (z > 30) fn(); });
    drawLabels();
    const list = [...pierItems(), ...courseItems()];
    // other crews that slide right past the camera (e.g. during the turn) are skipped so they don't fill the screen
    for (const b of S.boats) { const z = depth(b.px, b.py); if (b.isPlayer || z > 9) list.push([z, () => boat(b)]); }
    list.filter(([z]) => z > -20 && z < 900).sort((a, b) => b[0] - a[0]).forEach(([, fn]) => fn());
    drawParts(dt); speedLines();
  }
  function screenOf(b, y = 3.2) { return PW(b.px, b.py, y); }
  return { init, resize, setRace, update, render, splash, screenOf, Course, L, showLabels, shake: v => cam.shake = Math.max(cam.shake, v), cam, S };
})();
