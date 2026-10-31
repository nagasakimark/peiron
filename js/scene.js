/* Peiron Race — pseudo-3D renderer of Nagasaki Harbour.
   World coordinates are metres on a real map: x = east, y = north, origin = the front of the
   Matsugae cruise pier (松が枝国際観光船ふ頭, ≈32.7344N 129.8673E).
   The course leaves the pier heading down the harbour toward the Megami Bridge (bearing ≈222°),
   each boat rounds its own buoy, and comes back toward Matsugae (≈42°). Shorelines were traced
   from a Google Maps screenshot of the real course.
   Out 630 m, back 520 m, as in the real 長崎ペーロン選手権大会. See AUTHENTICITY.md. */
'use strict';
const Scene = (() => {
  const W = 1280, H = 395, HOR = 150, F = 640, L = 13.6, D2R = Math.PI / 180;
  const PXD = F * D2R;
  const fwd = b => [Math.sin(b * D2R), Math.cos(b * D2R)];
  const rgt = b => [Math.cos(b * D2R), -Math.sin(b * D2R)];
  const angDiff = (a, b) => ((a - b + 540) % 360) - 180;
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  let cv, ctx, RES = 1, sky, PRES = 1, CAMH = 3.4;   // camera height (m) — the boat view uses 3.4
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
    [-1667, 2030, 333, 420], [-1300, 2600, 250, 420], [-1450, 1200, 230, 420], [-1350, 450, 200, 380], [-1450, -250, 190, 380], [-1700, -900, 210, 420], [-2073, -1237, 150, 347],
    [187, 3684, 366, 520], [-500, 3200, 260, 450], [1000, 3100, 300, 480],
    [1470, 2397, 160, 380], [2000, 1800, 230, 420], [3156, 1398, 386, 650], [2300, 300, 330, 600], [1300, -200, 220, 420],
    [118, -749, 169, 300], [90, -260, 55, 200], [700, -700, 160, 380], [-200, -1300, 120, 330], [-1051, -2175, 150, 347], [300, -1800, 250, 480], [-650, -1950, 140, 300]];
  // each hill keeps one colour layer (by its distance from the middle of the course) so colours never pop
  const URBAN = new Set([0, 1, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  const HLAYER = HILLS.map(([x, y]) => { const d = Math.hypot(x + 330, y + 230); return d > 4500 ? 0 : d > 2200 ? 1 : 2; });
  const LANDNAME = [ // landmark labels: [x, y, height, text]
    [-1667, 2030, 333, 'いなさやま'], [-860, 1150, 75, 'せかいいさんの クレーン'], [-1562, -1706, 175, 'めがみおおはし'],
    [180, -180, 70, 'おおうらてんしゅどう'], [40, -330, 70, 'グラバーえん'], [118, -749, 169, 'なべかんむりやま'],
    [300, 900, 25, 'でじまワーフ'], [225, 1997, 40, 'ながさきえき'], [80, 60, 30, 'まつがえターミナル'], [187, 3684, 366, 'こんぴらさん'], [3156, 1398, 386, 'ひこさん'],
    [-550, -1474, 40, 'とまちしょうがっこう']];
  const prof = q => q >= 1 ? 0 : (1 - q) * (1 - q);          // q = (d / w)^2 ; hills have a firm edge
  let HW = HILLS.map(h => h[3] * 1.25);                        // effective radius, trimmed to the shoreline below
  const hillAt = (X, Y) => { let m = 0; HILLS.forEach(([x, y, h], i) => { m = Math.max(m, h * prof(((X - x) ** 2 + (Y - y) ** 2) / (HW[i] * HW[i]))); }); return m; };
  // shorelines, traced from the real course map (south → north)
  const EAST = [[-1314, -2041], [-1305, -1863], [-1188, -1762], [-1055, -1671], [-861, -1623], [-621, -1608], [-596, -1442], [-581, -1223], [-565, -1004], [-498, -776],
    [-359, -644], [-199, -481], [-60, -348], [-43, -176], [26, 5], [60, 200], [150, 450], [300, 800], [400, 1050], [380, 1300], [300, 1700], [250, 2100], [150, 2600]];
  const WEST = [[-1998, -1608], [-1872, -1558], [-1724, -1478], [-1539, -1378], [-1414, -1167], [-1283, -915], [-1106, -694], [-981, -483], [-913, -256], [-876, -6],
    [-907, 245], [-921, 553], [-880, 900], [-820, 1300], [-700, 1700], [-600, 2100], [-450, 2600]];
  const PIER_A = [-40, -165], PIER_B = [60, 200];   // the Matsugae quay
  const BUILD = [], HOUSES = [];
  // Mitsubishi shipyard cranes along the west shore (red-white lattice, mint-green, red gantry frames), the 1909 Giant
  // Cantilever Crane at Akunoura, and the small repair dockyard below Glover Garden on the east shore.
  const CRANES = [[-860, 1150, 'giant'], [-905, 820, 'lattice'], [-920, 640, 'green'], [-930, 470, 'gantry'], [-925, 330, 'lattice'], [-915, 180, 'green'],
    [-905, 40, 'lattice'], [-905, -100, 'gantry'], [-930, -250, 'lattice'], [-965, -400, 'green'], [-1030, -560, 'lattice'], [-1120, -720, 'green'],
    [-830, 1450, 'lattice'], [-760, 1750, 'green'],
    [-30, -230, 'lattice'], [-60, -300, 'green'], [-120, -400, 'lattice'], [-175, -455, 'green']];
  const MOORED = [[-75, -265, 1], [-150, -430, 1], [-880, 300, -1], [-870, -40, -1], [-940, -330, -1], [-880, 700, -1]];   // work ships alongside the yards
  const nearPier = (x, y) => x > -80 && x < 140 && y > -220 && y < 260;
  (function genWorld() {
    // a hill may not spill over the water: its radius ends just past the nearest shoreline
    const segDist = (px, py, pts) => { let m = 1e9; for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); m = Math.min(m, Math.hypot(px - ax - dx * t, py - ay - dy * t)); } return m; };
    const BRIDGE_HILLS = new Set([6, 19]);
    HW = HILLS.map(([x, y, , w], i) => BRIDGE_HILLS.has(i) ? w * 1.25 : Math.min(w * 1.25, Math.min(segDist(x, y, EAST), segDist(x, y, WEST)) + 40));
    let k = 0;
    const CITY = ['#eef1f3', '#dde4e9', '#cfd8de', '#f3ece0', '#e7d9c9', '#c9d3dc', '#f6f3ee'];
    const along = (pts, side, fn) => { for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], len = Math.hypot(x1 - x0, y1 - y0);
      const dx = (x1 - x0) / len, dy = (y1 - y0) / len, nx = dy * side, ny = -dx * side;   // n points inland
      for (let d = 0; d < len; d += 30) fn(x0 + dx * d, y0 + dy * d, nx, ny, Math.atan2(dx, dy) / D2R, k++); } };
    const backed = (X, Y, nx, ny) => hillAt(X + nx * 150, Y + ny * 150) > 20;
    along(EAST, 1, (x, y, nx, ny, ang, i) => { const off = 14 + hash(i, 2) * 20, X = x + nx * off, Y = y + ny * off; if (nearPier(X, Y)) return; if (Y < 300 && !backed(X, Y, nx, ny)) return;
      const city = Y > 300, h = city ? 10 + hash(i, 1) * (Y > 1500 ? 45 : 30) : 6 + hash(i, 1) * 14;
      BUILD.push({ x: X, y: Y, ang, w: 12 + hash(i, 3) * 14, d: 10 + hash(i, 4) * 8, h, c: CITY[i % CITY.length], r: ['#5d7486', '#8a5a44', '#4f6b5a', '#6d6d7a'][i % 4] }); });
    along(WEST, -1, (x, y, nx, ny, ang, i) => { const yard = y > -800 && y < 1600, off = 14 + hash(i, 2) * 20; if (!yard && !backed(x, y, nx, ny)) return;
      BUILD.push({ x: x + nx * off, y: y + ny * off, ang, w: yard ? 30 + hash(i, 3) * 30 : 12 + hash(i, 3) * 12, d: yard ? 18 + hash(i, 4) * 10 : 10, h: yard ? 14 + hash(i, 1) * 16 : 7 + hash(i, 1) * 12,
        c: yard ? (i % 3 ? '#a9b7c1' : '#8aa0ae') : CITY[i % CITY.length], r: yard ? '#6f8796' : '#7a5a48' }); });
    for (let i = 0; i < 2200; i++) {
      const hi = Math.floor(hash(i, 5) * HILLS.length), hl = HILLS[hi], a = hash(i, 6) * 6.283, rr = Math.sqrt(hash(i, 7)) * HW[hi] * 0.9;
      const X = hl[0] + Math.cos(a) * rr, Y = hl[1] + Math.sin(a) * rr, e = hillAt(X, Y); if (e < 8) continue;
      const tree = !URBAN.has(hi) || hash(i, 8) < 0.4 || e > hl[2] * (hi === 0 ? 0.55 : 0.75);
      HOUSES.push({ x: X, y: Y, e, L: HLAYER[hi], hi, tree, c: tree ? (i % 2 ? 'rgba(30,80,48,0.55)' : 'rgba(70,130,80,0.45)') : CITY[i % CITY.length] });
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
    for (let x = 0; x <= SW; x += 8) { const b = x / PXD, gap = Math.abs(angDiff(b, 221)) < 26;
      const e = Math.abs(angDiff(b, 221)), far = 2 + 1.2 * Math.sin(b * 0.7) + Math.max(0, (e - 9) / 17) * 9;   // low far shores slope down into the mouth
      c.lineTo(x, gap ? HOR - far : HOR - 10 - 5 * Math.sin(x * 0.004) - 4 * Math.sin(x * 0.011 + 2)); }
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
  const LAYER_COL = ['#7d9ea2', '#457c52', '#3b7449'];
  function drawLand() {
    LAYERS.forEach(a => a.fill(0));
    HILLS.forEach(([X, Y, h, w], hi) => {
      const [lx, z] = rel(X, Y); if (z < 60) return;
      const cx = W / 2 + F * lx / z, hp = F * (h - CAMH) / z, wp = F * HW[hi] / z, La = LAYERS[HLAYER[hi]];
      const i0 = Math.max(0, Math.floor((cx - wp) / 4)), i1 = Math.min(COLS - 1, Math.ceil((cx + wp) / 4));
      for (let i = i0; i <= i1; i++) { const d = (i * 4 - cx) / wp, v = hp * prof(d * d); if (v > La[i]) La[i] = v; }
    });
    const hb = [[], [], []], hillZ = HILLS.map(([X, Y]) => rel(X, Y)[1]);
    for (const o of HOUSES) { if (hillZ[o.hi] < 60) continue; const [lx, z] = rel(o.x, o.y); if (z < 150) continue; const s = F / z, x = W / 2 + lx * s; if (x < -10 || x > W + 10) continue;
      hb[o.L].push([x, HOR + (CAMH - o.e) * s, Math.max(1.2, 9 * s), Math.max(1, 6 * s), o]); }
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
    [[-40, 60], [-12, 80], [18, 55], [42, 45]].forEach(([dx, h]) => { const top = HOR + (CAMH - 333 - h) * s, bx = x + dx * s;
      ctx.fillStyle = '#f1f4f6'; ctx.fillRect(bx - 1.2, top, 2.4, h * s); ctx.fillStyle = '#e46a5c'; ctx.fillRect(bx - 1.2, top, 2.4, Math.max(1, h * s * 0.12)); });
    ctx.fillStyle = '#e6ecef'; ctx.fillRect(x - 30 * s, HOR + (CAMH - 345) * s, 60 * s, 12 * s);
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
    const [lx, z] = rel(x, y); if (z < 40) return; const s = F / z, cx = W / 2 + lx * s, base = HOR + (CAMH - 1.4) * s;
    if (cx < -100 || cx > W + 100) return;
    const lw = Math.max(0.8, 1.2 * s);
    if (kind === 'giant') {   // 1909 Giant Cantilever Crane (hammerhead), 61.7 m, dark steel
      ctx.fillStyle = '#2d3a44'; ctx.fillRect(cx - 6 * s, base - 50 * s, 12 * s, 50 * s);
      ctx.fillRect(cx - 45 * s, base - 62 * s, 75 * s, 8 * s); ctx.fillRect(cx - 45 * s, base - 58 * s, 14 * s, 10 * s); ctx.fillRect(cx + 24 * s, base - 54 * s, 2 * s, 18 * s);
      ctx.strokeStyle = '#2d3a44'; ctx.lineWidth = lw; for (let k = 0; k < 8; k++) { ctx.beginPath(); ctx.moveTo(cx - 6 * s, base - k * 6 * s); ctx.lineTo(cx + 6 * s, base - (k + 1) * 6 * s); ctx.stroke(); }
    } else if (kind === 'lattice') {   // tall red-and-white lattice tower with a long angled jib
      const h = 55 * s, j = 60 * s, sd = hash(x, y) < 0.5 ? -1 : 1;
      for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#f4f4f2' : '#d8392b'; ctx.fillRect(cx - 2 * s, base - h + k * h / 6, 4 * s, h / 6 + 0.5); }
      ctx.strokeStyle = '#d8392b'; ctx.lineWidth = Math.max(1, 2.2 * s); ctx.beginPath(); ctx.moveTo(cx, base - h * 0.9); ctx.lineTo(cx + sd * j * 0.55, base - h - j * 0.75); ctx.stroke();
      ctx.strokeStyle = '#f4f4f2'; ctx.lineWidth = Math.max(0.6, 0.8 * s); ctx.beginPath(); ctx.moveTo(cx, base - h); ctx.lineTo(cx + sd * j * 0.55, base - h - j * 0.75); ctx.stroke();
      ctx.fillStyle = '#d8392b'; ctx.fillRect(cx - 5 * s, base - h - 3 * s, 10 * s, 5 * s);
    } else if (kind === 'green') {     // mint-green level-luffing crane
      const h = 40 * s, sd = hash(y, x) < 0.5 ? -1 : 1;
      ctx.fillStyle = '#9fd8bf'; ctx.fillRect(cx - 3 * s, base - h, 6 * s, h); ctx.fillRect(cx - 7 * s, base - h - 6 * s, 14 * s, 8 * s);
      ctx.strokeStyle = '#86c7ab'; ctx.lineWidth = Math.max(1, 2.5 * s); ctx.beginPath(); ctx.moveTo(cx, base - h); ctx.lineTo(cx + sd * 34 * s, base - h - 14 * s); ctx.stroke();
      ctx.strokeStyle = '#5b6b70'; ctx.lineWidth = Math.max(0.5, 0.5 * s); ctx.beginPath(); ctx.moveTo(cx + sd * 34 * s, base - h - 14 * s); ctx.lineTo(cx + sd * 34 * s, base - h + 12 * s); ctx.stroke();
    } else {                           // red gantry (goliath) frame over a dock
      ctx.fillStyle = '#c9362a'; ctx.fillRect(cx - 30 * s, base - 42 * s, 60 * s, 6 * s); ctx.fillRect(cx - 30 * s, base - 42 * s, 4 * s, 42 * s); ctx.fillRect(cx + 26 * s, base - 42 * s, 4 * s, 42 * s);
      ctx.fillStyle = '#e9e4da'; ctx.fillRect(cx - 6 * s, base - 46 * s, 12 * s, 5 * s);
    }
  }
  function moored(x, y, side) {     // work ship tied up at a yard: dark hull, white superstructure
    const [lx, z] = rel(x, y); if (z < 40) return; const s = F / z, cx = W / 2 + lx * s, wl = HOR + CAMH * s;
    if (cx < -150 || cx > W + 150) return;
    const len = 70 * s * (0.6 + 0.4 * Math.abs(Math.sin((cam.h - 40) * D2R)));
    ctx.fillStyle = side > 0 ? '#2f5d8a' : '#3a4f63'; ctx.fillRect(cx - len / 2, wl - 6 * s, len, 6 * s);
    ctx.fillStyle = '#f2f4f5'; ctx.fillRect(cx - len * 0.15, wl - 16 * s, len * 0.35, 10 * s); ctx.fillRect(cx + len * 0.05, wl - 22 * s, len * 0.12, 6 * s);
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

  /* ================= peiron boats & crew =================
     Each crew member is a posed 3D body (hips, leaning spine, shoulders, 2-bone arms, legs, head)
     in the boat's local frame (x right, y up, z forward from the stern). It is projected and drawn
     as a rounded silhouette with an ink outline and hard cel shading, so it reads correctly from
     behind, side-on at the turn, and face-on when the leaders come back toward you. */
  const INK = '#12121e', SKIN = '#f3bf92', SKIN_S = '#c98a64', HAIR = '#1c1c33', HAIR_HI = '#5660a8', NAVY = '#232846',
    WOOD = '#dba465', WOOD_S = '#a26a37', WOOD_D = '#5e3a1c', WOOD_IN = '#8a5a2e', BLADE = '#efc583';
  const _cc = new Map();
  function mix(a, b, k) { const key = a + b + k; let r = _cc.get(key); if (r) return r;
    const A = parseInt(a.slice(1), 16), Bc = parseInt(b.slice(1), 16), m = s => Math.round(((A >> s) & 255) * (1 - k) + ((Bc >> s) & 255) * k);
    r = 'rgb(' + m(16) + ',' + m(8) + ',' + m(0) + ')'; _cc.set(key, r); return r; }
  const shadeOf = c => mix(c, '#1a1c48', 0.4);
  const vA = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], vS = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    vM = (a, k) => [a[0] * k, a[1] * k, a[2] * k], vD = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    vN = a => vM(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1)), vX = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    vLerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  function hull2(p) {     // convex hull of screen points (monotone chain)
    p = p.filter(Boolean).sort((a, b) => a.x - b.x || a.y - b.y); if (p.length < 3) return p;
    const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], up = [];
    for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  function path(pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); }
  function inkFill(pts, fill, lw) { if (!pts || pts.length < 3) return; for (const p of pts) if (!p) return;
    path(pts); ctx.fillStyle = fill; ctx.fill(); ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke(); }
  function limb(a, b, col, w) { if (!a || !b) return; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = INK; ctx.lineWidth = w + Math.max(1.6, w * 0.38); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); }
  function polyline(pts, col, w, ink) { pts = pts.filter(Boolean); if (pts.length < 2) return; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const p of pts) ctx.lineTo(p.x, p.y);
    if (ink) { ctx.strokeStyle = INK; ctx.lineWidth = w + Math.max(1.6, w * 0.45); ctx.stroke(); } ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); }
  // visible runs of a sampled ring (null = facing away) drawn as an inked band
  function ringArc(pts, col, w) { const n = pts.length, st = pts.findIndex(p => !p); if (st < 0) return; let cur = [];
    for (let k = 1; k <= n; k++) { const p = pts[(st + k) % n]; if (p) cur.push(p); else { if (cur.length > 1) polyline(cur, col, w, true); cur = []; } } }
  const fontsOK = () => (document.fonts && document.fonts.status === 'loaded') ? 1 : 0;
  function crestSprite(kanji, col) {
    return sprite('cr' + kanji + col + fontsOK(), 44, 44, g => { g.beginPath(); g.arc(22, 22, 19.5, 0, 6.283); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.arc(22, 22, 15, 0, 6.283); g.lineWidth = 1.6; g.strokeStyle = col; g.stroke();
      g.font = '900 22px "M PLUS Rounded 1c",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(kanji, 22, 24); });
  }
  function splashStar(p, r, seed) { if (!p || r < 1.5) return; ctx.beginPath(); const n = 7;
    for (let i = 0; i <= n * 2; i++) { const a = Math.PI + i / (n * 2) * Math.PI, rr = i % 2 ? r * (0.4 + 0.2 * hash(seed, i)) : r * (0.75 + 0.5 * hash(seed + 3, i));
      ctx.lineTo(p.x + Math.cos(a) * rr * 1.25, p.y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f2f5a'; ctx.lineWidth = Math.max(1, r * 0.1); ctx.stroke(); }

  // per-boat view context: projection, camera position and a viewer-relative key light in boat space
  function boatCtx(b, B) {
    const f = fwd(b.hd), r = rgt(b.hd), ox = b.px - f[0] * L / 2, oy = b.py - f[1] * L / 2;
    const toL = (wx, wy, wz) => [wx * r[0] + wy * r[1], wz, wx * f[0] + wy * f[1]];
    const c = toL(cam.x - ox, cam.y - oy, CAMH);
    const lw = [-0.6 * cam.rx - 0.4 * cam.fx, -0.6 * cam.ry - 0.4 * cam.fy, 0.7];   // from the viewer's upper left
    return { B, Bv: v => B(v[0], v[1], v[2]), cam: c, lt: vN(toL(lw[0], lw[1], lw[2])) };
  }
  // 2-bone arm: shoulder -> elbow -> hand, elbow pushed outward and down
  function ik(sh, hand, side, rt, fw) {
    const a = 0.3, c = 0.29; let d = vS(hand, sh), l = Math.hypot(d[0], d[1], d[2]) || 1e-3;
    if (l > a + c - 0.005) { hand = vA(sh, vM(d, (a + c - 0.005) / l)); d = vS(hand, sh); l = a + c - 0.005; }
    const dn = vM(d, 1 / l), bias = vA(vA(vM(rt, side), [0, -0.9, 0]), vM(fw, -0.25)), pp = vN(vS(bias, vM(dn, vD(bias, dn))));
    const x = (a * a - c * c + l * l) / (2 * l), h = Math.sqrt(Math.max(0, a * a - x * x));
    return { sh, el: vA(vA(sh, vM(dn, x)), vM(pp, h)), hand };
  }
  // paddle / oar from top (u=0) to tip (u=1); draws the part between u0 and u1 that is above the water
  function shaft(K, top, tip, u0, u1, o) {
    const Bv = K.Bv, at = u => vLerp(top, tip, u), ub = o.ub || 0.6, uw = tip[1] < 0 ? top[1] / (top[1] - tip[1]) : 1.001;
    const e = Math.min(u1, uw); if (e > u0) {
      const p0 = Bv(at(u0)); if (!p0) return; const s = p0.s;
      if (u0 < ub) { if (s > 26 * DET) limb(p0, Bv(at(Math.min(e, ub))), WOOD, s * (o.w || 0.05)); else { ctx.lineCap = 'round'; seg(p0, Bv(at(Math.min(e, ub))), WOOD_S, s * 0.06); } if (u0 === 0 && o.grip && s > 40) limb(Bv(vA(top, [-0.07, 0, 0])), Bv(vA(top, [0.07, 0, 0])), WOOD_S, s * 0.05); }
      if (e > ub) { const ua = Math.max(u0, ub), hw = u => (o.bw || 0.08) * (1 - 0.25 * (u - ub) / (1 - ub)), X = o.bx || [1, 0, 0];
        const q = [Bv(vA(at(ua), vM(X, -hw(ua)))), Bv(vA(at(e), vM(X, -hw(e)))), Bv(vA(at(e), vM(X, hw(e)))), Bv(vA(at(ua), vM(X, hw(ua))))];
        if (e >= 1) q.splice(2, 0, Bv(vA(tip, vM(vN(vS(tip, top)), 0.05))));
        inkFill(q, o.blade || BLADE, Math.max(1.2, s * 0.028)); }
    }
    if (u1 >= uw && uw < 1 && o.splash !== undefined) {           // where it enters the water
      const w = Bv(at(uw)); if (!w) return; const s = w.s;
      ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(w.x, w.y, s * 0.2, s * 0.06, 0, 0, 6.283); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.stroke(); ctx.globalAlpha = 1;
      if (o.splash > 0) splashStar(w, s * 0.32 * o.splash, o.seed || 1);
    }
  }

  /* P: hip, yaw (0 = faces the bow), lean, twist, spine, shirt, crest, kanji, hair, hands [L,R], legs(side)->[knee,foot] | seated,
        shout, spd, band, extra: [[localPoint, fn]] */
  function figure(K, P, parts) {
    const Bv = K.Bv, yaw = P.yaw || 0, cy = Math.cos(yaw), sy = Math.sin(yaw), fw0 = [sy, 0, cy], rt = [cy, 0, -sy];
    const ln = P.lean || 0, up = vA([0, Math.cos(ln), 0], vM(fw0, Math.sin(ln))), fw = vX(rt, up);
    const H = P.hip, sp = P.spine || 0.55, tw = P.twist || 0, hp = Bv(H); if (!hp) return; const s = hp.s, hi = s > 26 * DET;
    const C1 = vA(H, vM(up, 0.03)), C2 = vA(H, vM(up, sp * 0.58)), C3 = vA(H, vM(up, sp)), C4 = vA(H, vM(up, sp + 0.05));
    const hc = vA(C4, [fw0[0] * 0.03, 0.15, fw0[2] * 0.03]), shirt = P.shirt, shirtS = shadeOf(shirt);
    (P.extra || []).forEach(([p, fn]) => { const q = Bv(p); if (q) parts.push([q.z, fn]); });
    if (s < 11 * DET) {                                                          // far away: quick silhouette
      parts.push([hp.z, () => { const t3 = Bv(C3), h = Bv(hc); limb(hp, t3, shirt, s * 0.34); if (h) { dot(h, s * 0.15, HAIR); seg({ x: h.x - s * 0.15, y: h.y - s * 0.03 }, { x: h.x + s * 0.15, y: h.y - s * 0.03 }, '#fff', s * 0.07); } }]);
      return;
    }
    const n = s > 45 * DET ? 10 : s > 20 * DET ? 7 : 6, ring = (c, rx, rz) => { const o = []; for (let i = 0; i < n; i++) { const a = i / n * 6.283, ca = Math.cos(a), sa = Math.sin(a);
      const p = vA(c, vA(vM(rt, rx * ca), vM(fw, rz * sa))); o.push([p, vA(vM(rt, ca / rx), vM(fw, sa / rz)), Bv(p)]); } return o; };
    const R1 = ring(C1, 0.15, 0.11), R2 = ring(C2, 0.205, 0.13), R3 = ring(C3, 0.2, 0.105), R4 = ring(C4, 0.11, 0.07);
    const seen = q => q[2] && vD(q[1], vS(K.cam, q[0])) > 0;
    const torso = () => {
      const all = R1.concat(R2, R3, R4), hp2 = hull2(all.map(q => q[2])); if (hp2.length < 3) return;
      path(hp2); ctx.fillStyle = shirt; ctx.fill();
      const dark = []; for (const q of all) if (seen(q) && vD(vN(q[1]), K.lt) < 0.12) dark.push(q[2]);
            if (dark.length > 2) { path(hull2(dark)); ctx.fillStyle = shirtS; ctx.fill(); }
      // back crest, or the happi's white lapels from the front
      const pb = vA(C2, vM(fw, -0.13)), vb = vD(vN(vS(K.cam, pb)), vM(fw, -1));
      if (vb > 0.25 && P.kanji) { const c = Bv(pb); if (c) { const r = s * 0.105 * (0.55 + 0.45 * vb); if (r > 3.5) ctx.drawImage(crestSprite(P.kanji, P.crest), c.x - r, c.y - r, r * 2, r * 2); else dot(c, r, '#fff'); } }
      if (vb < -0.2) { const a = Bv(vA(C3, vA(vM(fw, 0.1), vM(rt, -0.07)))), m = Bv(vA(C1, vM(fw, 0.12))), a2 = Bv(vA(C3, vA(vM(fw, 0.1), vM(rt, 0.07))));
        if (a && m && a2) { ctx.lineCap = 'round'; seg(a, m, '#fff', s * 0.05); seg(a2, m, '#fff', s * 0.05); } }
      if (hi) ringArc(R1.map(q => seen(q) ? q[2] : null), '#f4f4f8', s * 0.075);   // white sash
      path(hp2); ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.3, s * 0.036); ctx.stroke();
    };
    const tz = Bv(C2); parts.push([tz ? tz.z : hp.z, torso]);
    // legs (standing) or thighs (seated)
    [-1, 1].forEach(side => {
      const hj = vA(H, vM(rt, side * 0.09));
      if (P.legs) { const [kn, ft] = P.legs(side), a = Bv(hj), b = Bv(kn), c = Bv(ft); if (!b) return;
        parts.push([b.z + 0.05, () => { limb(b, c, NAVY, s * 0.11); limb(a, b, NAVY, s * 0.13); if (c) { ctx.beginPath(); ctx.ellipse(c.x, c.y, s * 0.08, s * 0.04, 0, 0, 6.283); ctx.fillStyle = INK; ctx.fill(); } }]); }
      else if (s > 1e9) { const kn = vA(vA(hj, vM(fw0, 0.4)), [0, 0.07, 0]), a = Bv(hj), b = Bv(kn); if (b) parts.push([b.z + 0.05, () => limb(a, b, NAVY, s * 0.14)]); }
    });
    // arms
    const hands = P.hands || [], sl = [vA(vA(C3, vM(rt, -0.19)), vM(fw, -tw)), vA(vA(C3, vM(rt, 0.19)), vM(fw, tw))];
    [-1, 1].forEach((side, i) => {
      const A = ik(sl[i], hands[i] || vA(vA(sl[i], [0, -0.52, 0]), vM(fw0, 0.05)), side, rt, fw0), p0 = Bv(A.sh), p1 = Bv(A.el), p2 = Bv(A.hand); if (!p0 || !p1 || !p2) return;
      const far = tz && p0.z > tz.z, sk = far ? SKIN_S : SKIN, sv = far ? shirtS : shirt;
      parts.push([p1.z, () => { polyline([p0, p1, p2], sk, s * 0.08, hi); const m = { x: p0.x + (p1.x - p0.x) * 0.5, y: p0.y + (p1.y - p0.y) * 0.5 };
        if (hi) limb(p0, m, sv, s * 0.13); else { ctx.lineCap = 'round'; seg(p0, m, sv, s * 0.13); } }]);
    });
    // head
    const head = () => {
      const c = Bv(hc); if (!c) return; const R = c.s * 0.125, tc = vN(vS(K.cam, hc)), fv = vD(fw0, tc), lw = Math.max(1.2, R * 0.13);
      const knot = vA(hc, [-fw0[0] * 0.13, 0.035, -fw0[2] * 0.13]), kp = Bv(knot), knotFront = kp && kp.z < c.z;
      const tails = () => { if (!kp || R < 4.5 * DET) return; const sp2 = 1 + Math.min(1.2, (P.spd || 0) / 10);
        [-1, 1].forEach(k => { const pts = []; for (let i = 0; i <= 4; i++) pts.push(Bv(vA(knot, [
          -fw0[0] * 0.035 * i * sp2 + rt[0] * (k * 0.025 * i + Math.sin(S.time * 13 + i * 1.3 + k) * 0.012 * i), -0.035 * i / sp2,
          -fw0[2] * 0.035 * i * sp2 + rt[2] * (k * 0.025 * i + Math.sin(S.time * 13 + i * 1.3 + k) * 0.012 * i)])));
          polyline(pts, k > 0 ? (P.band || '#fff') : '#fff', R * 0.26, R > 9); }); };
      if (!knotFront) tails();
      if (P.hair === 2) { const bn = Bv(vA(hc, [-fw0[0] * 0.12, 0.05, -fw0[2] * 0.12])); if (bn && bn.z > c.z) { dot(bn, R * 0.42, INK); dot(bn, R * 0.32, HAIR); } }
      ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, 6.283); ctx.fillStyle = HAIR; ctx.fill();
      const big = R > 6 * DET; if (big) { ctx.save(); ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, 6.283); ctx.clip(); }
      else if (fv > 0.35) dot({ x: c.x, y: c.y + R * 0.2 }, R * 0.72, SKIN);
      if (big && fv > -0.2) { const pf = Bv(vA(hc, vM(fw0, 0.125))), o = pf ? { x: pf.x - c.x, y: pf.y - c.y } : { x: 0, y: 0 }, k = (fv + 0.2) / 1.2;
        ctx.beginPath(); ctx.ellipse(c.x + o.x * 0.45, c.y + o.y * 0.45 + R * 0.24, R * (0.22 + 0.58 * k), R * 0.8, Math.atan2(o.y, o.x), 0, 6.283); ctx.fillStyle = SKIN; ctx.fill();
        if (fv > 0.2) { ctx.fillStyle = HAIR; ctx.beginPath(); for (let i = 0; i < 5; i++) { const x0 = c.x + o.x * 0.45 + (i - 2) * R * 0.36; ctx.moveTo(x0 - R * 0.2, c.y - R * 0.3); ctx.lineTo(x0 + R * 0.05, c.y - R * 0.04 + (i % 2) * R * 0.08); ctx.lineTo(x0 + R * 0.2, c.y - R * 0.3); } ctx.fill(); } }
      if (big) { ctx.strokeStyle = HAIR_HI; ctx.lineWidth = R * 0.16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(c.x, c.y, R * 0.72, 3.5, 4.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x, c.y, R * 1.2, 0, 6.283); ctx.arc(c.x - R * 0.4, c.y - R * 0.45, R * 1.05, 0, 6.283); ctx.fillStyle = 'rgba(16,14,60,0.32)'; ctx.fill('evenodd');
      ctx.restore(); }
      if (P.hair === 1) { ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = -2.4 + i * 0.5, a2 = a + 0.28; ctx.moveTo(c.x + Math.cos(a) * R * 0.92, c.y + Math.sin(a) * R * 0.92);
        ctx.lineTo(c.x + Math.cos(a + 0.05) * R * 1.45, c.y + Math.sin(a + 0.05) * R * 1.45); ctx.lineTo(c.x + Math.cos(a2) * R * 0.92, c.y + Math.sin(a2) * R * 0.92); }
        ctx.fillStyle = HAIR; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.8; ctx.lineJoin = 'round'; ctx.stroke(); }
      [-1, 1].forEach(k => { if (vD(vM(rt, k), tc) > 0.2) { const e = Bv(vA(hc, vA(vM(rt, k * 0.125), [0, -0.01, 0]))); if (e) { ctx.beginPath(); ctx.arc(e.x, e.y, R * 0.2, 0, 6.283); ctx.fillStyle = SKIN; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = INK; ctx.stroke(); } } });
      ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, 6.283); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
      // hachimaki round the head, knotted at the back
      const nb = R > 6 ? 14 : 8, band = []; for (let i = 0; i < nb; i++) { const a = i / nb * 6.283, d = vA(vM(rt, Math.cos(a)), vM(fw0, Math.sin(a))); band.push(vD(d, tc) > 0 ? Bv(vA(hc, vA(vM(d, 0.13), [0, 0.04, 0]))) : null); }
      ringArc(band, '#fff', R * 0.3);
      if (knotFront) { tails(); if (R > 5) dot(kp, R * 0.2, '#fff'); }
      if (P.hair === 2) { const bn = Bv(vA(hc, [-fw0[0] * 0.12, 0.05, -fw0[2] * 0.12])); if (bn && bn.z <= c.z) { dot(bn, R * 0.42, INK); dot(bn, R * 0.32, HAIR); } }
      if (fv > 0.3 && R > 4.5) {                         // face: determined eyes, fierce brows, shouting mouth
        const ey = [-1, 1].map(k => Bv(vA(hc, vA(vM(fw0, 0.11), vA(vM(rt, k * 0.046), [0, -0.014, 0])))));
        const mo = Bv(vA(hc, vA(vM(fw0, 0.108), [0, -0.064, 0])));
        ctx.fillStyle = INK; ey.forEach(p => { if (p) { ctx.beginPath(); ctx.ellipse(p.x, p.y, R * 0.085, R * 0.15, 0, 0, 6.283); ctx.fill(); } });
        if (ey[0] && ey[1]) { const mx = (ey[0].x + ey[1].x) / 2; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, R * 0.11);
          ey.forEach(p => { const d = p.x < mx ? 1 : -1; ctx.beginPath(); ctx.moveTo(p.x - d * R * 0.17, p.y - R * 0.32); ctx.lineTo(p.x + d * R * 0.11, p.y - R * 0.2); ctx.stroke(); }); }
        if (mo) { ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, R * 0.08);
          if (P.shout) { ctx.beginPath(); ctx.moveTo(mo.x - R * 0.17, mo.y - R * 0.05); ctx.lineTo(mo.x + R * 0.17, mo.y - R * 0.05); ctx.lineTo(mo.x, mo.y + R * 0.17); ctx.closePath(); ctx.fillStyle = '#6a1424'; ctx.fill(); ctx.stroke(); }
          else { ctx.beginPath(); ctx.moveTo(mo.x - R * 0.12, mo.y); ctx.lineTo(mo.x + R * 0.12, mo.y - R * 0.03); ctx.stroke(); } }
      }
    };
    const hz = Bv(hc); parts.push([(hz ? hz.z : hp.z) - 0.12, head]);
  }

  /* ---------------- the boat ---------------- */
  // 13.6 m cedar hull, bow-shaped (弓形): rises at both bow and stern
  const hullW = t => { let w = 0.66; if (t < 0.12) w *= 0.12 + 0.88 * Math.pow(t / 0.12, 0.55); if (t > 0.78) w *= Math.max(0.05, (1 - t) / 0.22); return w; };
  const hullH = t => 0.5 + 0.55 * Math.pow(Math.abs(t - 0.45) / 0.55, 2.2);
  function wake(b, B) {
    const k = Math.min(1, b.v / 12) * 0.5 + 0.12; ctx.globalAlpha = k; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    for (const sd of [-1, 1]) { let prev = null; for (let i = 0; i <= 8; i++) { const p = B(sd * (0.6 + i * 0.24), 0, -i * 0.9); if (p && prev) { ctx.lineWidth = Math.max(1, p.s * 0.16); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); } prev = p; }
      seg(B(sd * 0.15, 0, L * 0.99), B(sd * 0.75, 0, L * 0.82), '#fff', 2); }
    ctx.globalAlpha = 1;
  }
  function rower(K, b, t, sd, ph, bob, parts, low, idx) {
    const z = t * L, gH = hullH(t), hw = hullW(t), seat = gH - 0.13 + bob, lf = Math.cos(ph), sn = Math.sin(ph);
    const x = sd * Math.min(0.3, hw * 0.5), plen = 1.7 + Math.abs(t - 0.45) * 0.7, dip = Math.max(-1, Math.min(1, sn * 2.6)), lift = Math.max(0, -dip);
    // the paddle always passes over a point just outside the gunwale, so it can never cut through the hull
    const top = [sd * 0.2, gH + 0.55 + 0.16 * lift + bob, z + 0.05 + 0.45 * lf];
    const pv = [sd * (hw + 0.06), gH + 0.04 + 0.14 * lift + bob, z + 0.12 + 0.62 * lf];
    const dP = vS(pv, top), lP = Math.hypot(dP[0], dP[1], dP[2]), tip = vA(top, vM(dP, plen / lP));
    const lowH = vLerp(top, pv, 0.8), hands = sd > 0 ? [top, lowH] : [lowH, top], ug = Math.min(1, lP / plen);
    const spl = sn > 0 && lf > 0.3 ? Math.min(1, (1 - sn) * 1.6) * (0.5 + Math.min(0.5, b.v / 20)) : 0, seed = idx * 7 + sd;
    figure(K, { hip: [x, seat, z], lean: 0.16 + 0.34 * (lf * 0.5 + 0.5), twist: 0.08 * lf * sd, spine: 0.54, shirt: b.color, crest: b.dark, kanji: b.kanji,
      hair: (idx * 2 + (sd > 0 ? 1 : 0)) % 3, hands, shout: lf > 0.5 && sn > -0.2, spd: b.v, band: b.color,
      extra: [[vLerp(top, tip, ug * 0.5), () => shaft(K, top, tip, 0, ug, { grip: 1 })]] }, parts);
    low[sd].push(() => shaft(K, top, tip, ug, 1, { splash: spl, seed }));
  }
  function stander(K, b, x, t, bob, o, parts) {
    const z = t * L, deck = hullH(t) - 0.33 + bob + (o.raise || 0), yaw = o.yaw || 0, cy = Math.cos(yaw), sy = Math.sin(yaw), hipH = o.crouch === true ? 0.42 : o.crouch ? 0.62 : 0.82;
    const legs = side => { const rx = cy * side * 0.12, rz = -sy * side * 0.12, kf = o.crouch ? 0.32 : 0.08;
      return [[x + rx + sy * kf, deck + (o.crouch ? 0.34 : 0.47), z + rz + cy * kf], [x + rx * 1.25, deck + 0.03, z + rz * 1.25]]; };
    figure(K, Object.assign({ hip: [x, deck + hipH, z], spine: 0.58, legs, band: b.color, crest: b.dark, kanji: b.kanji, spd: b.v }, o), parts);
    return deck;
  }
  function boat(b) {
    const B0 = LF({ px: b.px, py: b.py, hd: b.hd }, L), bob = Math.sin(S.time * 1.7 + b.lane * 1.3) * 0.04;
    const B = (x, y, z) => B0(x, y + (y > 0.01 ? bob : 0), z), K = boatCtx(b, B), Bv = K.Bv;
    const near = K.cam[0] >= 0 ? 1 : -1, behind = K.cam[2] < L * 0.5;
    const N = 22, G = { '-1': [], 1: [] }, W = { '-1': [], 1: [] }, I = { '-1': [], 1: [] }, Bd = { '-1': [], 1: [] }, Pn = { '-1': [], 1: [] };
    for (let i = 0; i <= N; i++) { const t = i / N, z = t * L, w = hullW(t), h = hullH(t);
      for (const sd of [-1, 1]) { G[sd].push(B(sd * w, h, z)); W[sd].push(B(sd * w * 0.8, 0, z)); I[sd].push(B(sd * w * 0.82, h - 0.06, z)); Bd[sd].push(B(sd * w * 0.985, h - 0.17, z)); Pn[sd].push(B(sd * w * 0.97, h - 0.22, z)); } }
    const ok = a => a.filter(Boolean), mid = B(0, 0.5, L / 2), lw = Math.max(1.4, (mid ? mid.s : 20) * 0.04);
    wake(b, B);
    // soft shadow on the water
    const shp = []; for (let i = 0; i <= 12; i++) { const t = i / 12; shp.push(B(hullW(t) * 1.15, 0, t * L)); } for (let i = 12; i >= 0; i--) { const t = i / 12; shp.push(B(-hullW(t) * 1.15, 0, t * L)); }
    ctx.globalAlpha = 0.28; poly(ok(shp), '#04203f'); ctx.globalAlpha = 1;
    const plank = sd => {
      const g = ok(G[sd]), w = ok(W[sd]); if (g.length < 2 || w.length < 2) return;
      const lit = vD([sd, 0, 0], K.lt) > 0, s0 = mid ? mid.s : 20;
      inkFill([...g, ...w.slice().reverse()], lit ? WOOD : WOOD_S, lw);
      ctx.globalAlpha = 0.45; for (const k of [0.45, 0.72]) { const pts = []; for (let i = 0; i <= N; i++) { const t = i / N; pts.push(B(sd * hullW(t) * (1 - 0.18 * k), hullH(t) * (1 - k), t * L)); } polyline(pts, WOOD_D, Math.max(0.8, s0 * 0.02)); } ctx.globalAlpha = 1;
      poly(ok([...g, ...ok(Bd[sd]).reverse()]), b.color);                                        // team band under the gunwale
      polyline(ok(Bd[sd]), INK, Math.max(1, s0 * 0.022)); polyline(ok(Pn[sd]), '#fff', Math.max(0.8, s0 * 0.018));
      polyline(g, INK, lw * 1.1);
      const c = B(sd * hullW(0.88) * 1.0, hullH(0.88) * 0.55, 0.88 * L);                         // team mark painted on the bow
      if (c && c.s > 6) { const r = c.s * 0.27; ctx.drawImage(crestSprite(b.kanji, b.dark), c.x - r, c.y - r, r * 2, r * 2); }
      ctx.globalAlpha = 0.7; polyline(w, '#fff', Math.max(1, s0 * 0.045)); ctx.globalAlpha = 1;   // foam line at the waterline
    };
    const transom = () => inkFill([G[-1][0], G[1][0], W[1][0], W[-1][0]], WOOD_S, lw);
    const low = { '-1': [], 1: [] }, parts = [];
    // crew: 13 pairs of paddlers, a gap amidships for the drum and gong
    const seats = []; for (let i = 0; i < 13; i++) seats.push(0.88 - i * 0.056 - (i >= 6 ? 0.07 : 0));
    seats.forEach((t, i) => { const ph = b.phase - (12 - i) * 0.035; rower(K, b, t, -1, ph, bob, parts, low, i); rower(K, b, t, 1, ph, bob, parts, low, i); });
    const up = Math.sin(b.phase * 2) > 0, beat = Math.sin(b.phase * 2);
    // 太鼓 on its stand, and the drummer behind it
    const tD = 0.535, zD = tD * L, yD = hullH(tD) - 0.33 + 0.62 + bob;
    parts.push([(Bv([0, yD, zD]) || { z: 0 }).z, () => {
      const n = 10, r1 = [], r2 = [], top = []; for (let i = 0; i < n; i++) { const a = i / n * 6.283, ca = Math.cos(a), sa = Math.sin(a);
        r1.push(B(ca * 0.27, yD + 0.2, zD + sa * 0.27)); r2.push(B(ca * 0.24, yD - 0.2, zD + sa * 0.24)); top.push(B(ca * 0.25, yD + 0.22, zD + sa * 0.25)); }
      const s0 = (r1[0] || { s: 20 }).s; [-0.2, 0.2].forEach(x => limb(B(x, yD - 0.2, zD), B(x * 1.2, yD - 0.62, zD), WOOD_D, s0 * 0.05));
      inkFill(hull2(r1.concat(r2)), '#8e2a1b', Math.max(1.2, s0 * 0.035)); polyline(ok(r2.slice(0, 6)), '#d8a12a', s0 * 0.03);
      inkFill(ok(top), '#f1dfb6', Math.max(1, s0 * 0.03)); }]);
    stander(K, b, 0, tD - 0.045, bob, { shirt: '#ffffff', crest: b.color, hair: 1, lean: 0.15, shout: up,
      hands: [[-0.17, yD + (up ? 0.75 : 0.3), zD - 0.18], [0.17, yD + (up ? 0.3 : 0.75), zD - 0.18]],
      extra: [[[0, yD + 0.5, zD - 0.15], () => { [-1, 1].forEach(k => { const hy = yD + ((k < 0) === up ? 0.75 : 0.3), a = B(k * 0.17, hy, zD - 0.18), c = B(k * 0.12, hy + ((k < 0) === up ? 0.28 : -0.12), zD + 0.05); limb(a, c, '#f2e2bd', (a || { s: 20 }).s * 0.035); }); }]] }, parts);
    // ドラ on a frame, and its player
    const tG = 0.455, zG = tG * L, dG = hullH(tG) - 0.33 + bob, gc = [0.3, dG + 1.1, zG], swing = Math.max(0, beat) * 0.1;
    parts.push([(Bv(gc) || { z: 0 }).z, () => {
      const s0 = (Bv(gc) || { s: 20 }).s; [0.02, 0.58].forEach(x => limb(B(x, dG, zG), B(x, dG + 1.42, zG), WOOD_D, s0 * 0.05)); limb(B(0.02, dG + 1.42, zG), B(0.58, dG + 1.42, zG), WOOD_D, s0 * 0.05);
      const disc = (r) => { const o = []; for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; o.push(Bv([gc[0] + Math.cos(a) * r, gc[1] + Math.sin(a) * r, gc[2] + Math.sin(a) * swing])); } return ok(o); };
      seg(B(0.2, dG + 1.42, zG), Bv([0.22, gc[1] + 0.25, zG]), INK, 1.2); seg(B(0.4, dG + 1.42, zG), Bv([0.38, gc[1] + 0.25, zG]), INK, 1.2);
      inkFill(disc(0.26), '#d7a32e', Math.max(1.2, s0 * 0.035)); inkFill(disc(0.18), '#efc552', Math.max(0.8, s0 * 0.02)); inkFill(disc(0.07), '#b8841c', Math.max(0.8, s0 * 0.02)); }]);
    stander(K, b, -0.08, tG - 0.04, bob, { shirt: '#ffffff', crest: b.color, hair: 0, lean: 0.1, yaw: 0.35,
      hands: [[0.12, dG + 1.15 + (up ? 0.2 : 0), zG - 0.12], null],
      extra: [[[0.2, dG + 1.2, zG - 0.1], () => { const h = B(0.12, dG + 1.15 + (up ? 0.2 : 0), zG - 0.12), m = B(0.27, dG + 1.12, zG - 0.06 - (up ? 0.12 : 0)); limb(h, m, WOOD_D, (h || { s: 20 }).s * 0.04); if (m) dot(m, m.s * 0.06, '#f2e2bd'); }]] }, parts);
    // 采振り at the bow, facing the crew and swinging the 采配 to the beat
    const tS = 0.925, dS = hullH(tS) - 0.33 + bob, wv = Math.sin(b.phase), hS = [-0.05 + wv * 0.35, dS + 1.95, tS * L - 0.25];
    stander(K, b, 0, tS, bob, { shirt: b.dark, crest: b.color, hair: 1, yaw: Math.PI, lean: 0.12, shout: true, hands: [null, hS],
      extra: [[hS, () => { const h = Bv(hS), t2 = Bv([hS[0] + wv * 0.1, hS[1] + 0.32, hS[2]]); if (!h || !t2) return; limb(h, t2, WOOD_D, h.s * 0.035);
        for (let k = 0; k < 6; k++) { const e = Bv([hS[0] + wv * 0.1 + (k - 2.5) * 0.045 - wv * 0.12, hS[1] - 0.05, hS[2]]); limb(t2, e, '#fff', h.s * 0.04); } }]] }, parts);
    // centre post with the team flag
    parts.push([(Bv([0, 1.5, 0.49 * L]) || { z: 0 }).z, () => { const h0 = hullH(0.49) - 0.3, p0 = B(0, h0, 0.49 * L), p1 = B(0, h0 + 2.9, 0.49 * L); if (!p0 || !p1) return; limb(p0, p1, '#f4f4f4', p1.s * 0.05);
      const wvf = u => Math.sin(S.time * 6 + u * 4 + b.lane) * 0.12 * u * (1 + b.v / 10), pts = [];
      for (let i = 0; i <= 6; i++) { const u = i / 6; pts.push(B(u * 1.15 + wvf(u), h0 + 2.85, 0.49 * L - u * 0.35)); }
      for (let i = 6; i >= 0; i--) { const u = i / 6; pts.push(B(u * 1.15 + wvf(u), h0 + 2.15, 0.49 * L - u * 0.35)); }
      inkFill(ok(pts), b.color, Math.max(1.2, p1.s * 0.03));
      const c = B(0.55, h0 + 2.5, 0.49 * L - 0.17); if (c) { const k = sprite('k' + b.kanji + fontsOK(), 40, 40, g => { g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 5; g.lineJoin = 'round'; g.font = '900 32px "M PLUS Rounded 1c",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeText(b.kanji, 20, 22); g.fillText(b.kanji, 20, 22); });
        const sz = Math.max(6, c.s * 0.55); ctx.drawImage(k, c.x - sz / 2, c.y - sz / 2, sz, sz); } }]);
    // あか汲み (bailer) scooping water out with a bucket
    const tB = 0.115, dB = hullH(tB) - 0.33 + bob, scoop = Math.max(0, Math.sin(S.time * 3 + b.lane)), bk = [0.16, dB + 0.12 + scoop * 0.45, tB * L + 0.3];
    stander(K, b, 0.05, tB, bob, { shirt: b.dark, crest: b.color, hair: 2, crouch: true, lean: 0.75 - scoop * 0.35, hands: [vA(bk, [-0.1, 0.08, 0]), vA(bk, [0.1, 0.08, 0])],
      extra: [[bk, () => { const r1 = [], r2 = []; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; r1.push(Bv([bk[0] + Math.cos(a) * 0.12, bk[1] + 0.1, bk[2] + Math.sin(a) * 0.12])); r2.push(Bv([bk[0] + Math.cos(a) * 0.09, bk[1] - 0.1, bk[2] + Math.sin(a) * 0.09])); }
        const h = hull2(r1.concat(r2)); if (h.length > 2) inkFill(h, '#4f86c6', Math.max(1, (r1[0] || { s: 20 }).s * 0.03)); }]] }, parts);
    // 舵取り standing on the stern deck with the long steering oar
    // the oar rests on the starboard stern quarter: handle in front of the steersman, blade trailing behind the boat
    const tR = 0.07, dR = hullH(tR) - 0.33 + bob, sweep = Math.sin(S.time * 0.7 + b.lane) * 0.12;
    const oP = [hullW(0.02) + 0.04, hullH(0.02) + 0.1 + bob, 0.02 * L], oE = [1.1 + sweep, -0.3, -2.8];
    const oD = vS(oP, oE), oL = Math.hypot(oD[0], oD[1], oD[2]), oT = vA(oP, vM(oD, 1.2 / oL)), oU = 1.2 / (1.2 + oL);
    stander(K, b, -0.1, tR, bob, { shirt: b.dark, crest: b.color, hair: 0, yaw: 0.3, lean: 0.25, crouch: 0.5, hands: [oT, vLerp(oT, oP, 0.3)],
      extra: [[vLerp(oT, oP, 0.5), () => shaft(K, oT, oE, 0, oU, { ub: 0.78, w: 0.06 })]] }, parts);
    low[1].push(() => shaft(K, oT, oE, oU, 1, { ub: 0.78, bw: 0.1, w: 0.06, splash: 0, bx: [0, 1, 0] }));

    // draw order: far side of the hull, far paddles, inside, crew (by depth), near side, near paddles
    plank(-near); if (!behind) transom();
    low[-near].forEach(f => f());
    inkFill(ok([...I[-1], ...I[1].slice().reverse()]), WOOD_IN, lw);
    const s1 = mid ? mid.s : 20;
    seats.forEach(t => polyline([B(-hullW(t) * 0.8, hullH(t) - 0.12, t * L), B(hullW(t) * 0.8, hullH(t) - 0.12, t * L)], WOOD, Math.max(1, s1 * 0.07), true));
    inkFill(ok([B(-hullW(0.03) * 0.8, hullH(0.03) - 0.05, 0.03 * L), B(hullW(0.03) * 0.8, hullH(0.03) - 0.05, 0.03 * L), B(hullW(0.075) * 0.8, hullH(0.075) + 0.02, 0.075 * L), B(-hullW(0.075) * 0.8, hullH(0.075) + 0.02, 0.075 * L)]), WOOD, lw * 0.8);
    polyline(ok(G[-1]), '#f0c487', Math.max(1, s1 * 0.05), true); polyline(ok(G[1]), '#f0c487', Math.max(1, s1 * 0.05), true);
    parts.sort((a, c) => c[0] - a[0]).forEach(p => p[1]());
    plank(near); if (behind) transom();
    low[near].forEach(f => f());
    // team name tag
    const lp = B(0, 3.6, L * 0.18);
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
    const g = ctx.createLinearGradient(0, HOR, 0, H); g.addColorStop(0, '#6d97c2'); g.addColorStop(0.07, '#3d6fa6'); g.addColorStop(1, '#1d4f86');
    ctx.fillStyle = g; ctx.fillRect(0, HOR, W, H - HOR);
    const rg = ctx.createLinearGradient(0, HOR, 0, HOR + 26); rg.addColorStop(0, 'rgba(80,130,100,0.3)'); rg.addColorStop(1, 'rgba(80,130,100,0)');
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
    setCam(player.px - f[0] * back + r[0] * 1.6, player.py - f[1] * back + r[1] * 1.6, cam.smoothH); CAMH = 3.4;
    if (S.debugCam) { setCam(S.debugCam.x, S.debugCam.y, S.debugCam.h); CAMH = S.debugCam.height; }
    S.boostFx += ((player.boost > 0 ? 1 : 0) - S.boostFx) * Math.min(1, dt * 4);
    if (player.boost > 0 && Math.random() < 0.6) bowSpray(player);
    cam.shake = Math.max(0, cam.shake - dt * 3);
    S.labelT += dt; const wantL = opts.labels || (!opts.idle && S.labelT < 6) ? 1 : 0;
    S.labelA += (wantL - S.labelA) * Math.min(1, dt * 2);
  }
  function showLabels() { S.labelT = 0; }
  let DET = 1, _ema = 16, _lastT = 0, _detT = 0;
  function render(dt) {
    const now = performance.now(); if (_lastT) { const f = Math.min(100, now - _lastT); _ema = _ema * 0.94 + f * 0.06; } _lastT = now;
    if (now - _detT > 1500) { _detT = now; if (_ema > 24 && DET < 2.2) DET = Math.min(2.2, DET + 0.4); else if (_ema < 15 && DET > 1) DET = Math.max(1, DET - 0.2); }
    if (window.PEIRON_FIXDET) DET = window.PEIRON_FIXDET;
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    if (cam.shake > 0) ctx.translate((Math.random() - 0.5) * cam.shake * 6, (Math.random() - 0.5) * cam.shake * 4);
    drawSky(); drawLand(); drawWater();
    landPoly(EAST, 1, '#c3c7b8'); landPoly(WEST, -1, '#b9c2b4');
    // shore buildings + landmarks, far to near (drawn after the water so their bases sit on it)
    const far = [];
    for (const o of BUILD) { const z = depth(o.x, o.y); if (z > 30 && z < 4000) far.push([z, () => facade(o)]); }
    for (const [x, y, k] of CRANES) far.push([depth(x, y), () => crane(x, y, k)]);
    for (const [x, y, sd] of MOORED) far.push([depth(x, y), () => moored(x, y, sd)]);
    far.push([depth(-1562, -1706), megami], [depth(180, -180), ouraCathedral], [depth(40, -330), gloverHouse], [depth(300, 900), dejimaWharf]);
    far.sort((a, b) => b[0] - a[0]).forEach(([z, fn]) => { if (z > 30) fn(); });
    drawLabels();
    const list = [...pierItems(), ...courseItems()];
    // other crews that slide right past the camera (e.g. during the turn) are skipped so they don't fill the screen
    for (const b of S.boats) { const z = depth(b.px, b.py); if (b.isPlayer || z > 9) list.push([z, () => boat(b)]); }
    list.filter(([z]) => z > -20 && z < 900).sort((a, b) => b[0] - a[0]).forEach(([, fn]) => fn());
    drawParts(dt); speedLines();
  }
  // debug: view from any point/height, e.g. Scene.viewFrom(40, -330, 255, 50) = Glover Garden
  function viewFrom(x, y, h, height) { S.debugCam = { x, y, h, height }; }
  function screenOf(b, y = 3.2) { return PW(b.px, b.py, y); }
  return { viewFrom, init, resize, setRace, update, render, splash, screenOf, Course, L, showLabels, shake: v => cam.shake = Math.max(cam.shake, v), cam, S };
})();
