/* Peiron Race — pseudo-3D harbour renderer.
   The race is set at the real course: Matsugae pier (松が枝), Nagasaki Harbour.
   Leg 1 heads NNW (bearing 345°) toward Inasayama and Mt Konpira,
   the crews turn around buoys, and Leg 2 heads SSW (210°) toward the Megami Bridge.
   Landmarks are painted onto a 360° panorama at their real compass bearings from the pier. */
'use strict';
const Scene = (() => {
  const W = 1280, H = 395, HOR = 150, CAMH = 3.4, F = 640, BOAT_L = 13;
  const LANES = [-6.9, -2.3, 2.3, 6.9];
  const ROPES = [-9.2, -4.6, 0, 4.6, 9.2];
  const PXD = F * Math.PI / 180;                 // pixels per degree near screen centre
  const PANO_W = Math.round(360 * PXD), PANO_H = HOR + 2;
  const LEG1 = 345, LEG2 = 210;
  let cv, ctx, RES = 1, pano, pctx, PRES = 1;
  const cam = { x: -1.0, z: -10, yaw: LEG1, shake: 0 };
  const S = { time: 0, leg: 1, turnZ: 1e9, buoyZ: 1e9, finishZ: 1e9, boats: [], parts: [], yawFrom: LEG1, yawT: 1, boostFx: 0, idlePan: false, labelA: 0, labelT: 0 };
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  const angDiff = (a, b) => ((a - b + 540) % 360) - 180;

  /* ---------------- projection & primitives ---------------- */
  function P(x, y, z) { const dz = z - cam.z; if (dz < 1.0) return null; const s = F / dz; return { x: W / 2 + (x - cam.x) * s, y: HOR + (CAMH - y) * s, s }; }
  function poly(pts, fill, stroke, lw) {
    for (const p of pts) if (!p) return;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function seg(a, b, col, w) { if (!a || !b) return; ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.7, w); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  function dot(p, r, col) { if (!p) return; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.6, r), 0, 6.283); ctx.fillStyle = col; ctx.fill(); }

  /* cached text sprites (fillText is slow on Chromebooks) */
  const SPR = new Map();
  function sprite(key, w, h, draw) {
    let c = SPR.get(key); if (c) return c;
    c = document.createElement('canvas'); c.width = Math.ceil(w * 2); c.height = Math.ceil(h * 2);
    const x = c.getContext('2d'); x.scale(2, 2); draw(x); c.lw = w; c.lh = h; SPR.set(key, c); return c;
  }
  function measure(font, txt) { ctx.font = font; return ctx.measureText(txt).width; }

  /* ---------------- 360° panorama ---------------- */
  function paintPanorama() {
    pano = pano || document.createElement('canvas');
    PRES = Math.min(1.5, RES);
    pano.width = Math.round(PANO_W * PRES); pano.height = Math.round(PANO_H * PRES);
    pctx = pano.getContext('2d');
    const c = pctx; c.setTransform(PRES, 0, 0, PRES, 0, 0);
    const X = b => ((b % 360) + 360) % 360 * PXD;
    const wrap = (b, fn) => { const x = X(b); fn(x); if (x < 300) fn(x + PANO_W); if (x > PANO_W - 300) fn(x - PANO_W); };
    // sky
    const g = c.createLinearGradient(0, 0, 0, HOR); g.addColorStop(0, '#3d9cf0'); g.addColorStop(0.6, '#8fcdf7'); g.addColorStop(1, '#d9f1fb');
    c.fillStyle = g; c.fillRect(0, 0, PANO_W, PANO_H);
    // clouds (big summer cumulus)
    for (let i = 0; i < 26; i++) {
      const b = hash(i, 1) * 360, y = 22 + hash(i, 2) * 55, k = 0.6 + hash(i, 3) * 0.9;
      wrap(b, x => {
        c.fillStyle = 'rgba(255,255,255,0.92)';
        for (let j = 0; j < 6; j++) { c.beginPath(); c.ellipse(x + (j - 2.5) * 16 * k, y - Math.sin(j / 5 * Math.PI) * 12 * k, 20 * k, 14 * k, 0, 0, 6.3); c.fill(); }
        c.fillStyle = 'rgba(200,225,245,0.7)'; c.beginPath(); c.ellipse(x, y + 8 * k, 46 * k, 6 * k, 0, 0, 6.3); c.fill();
      });
    }
    const bump = (b, ctr, h, w) => h * Math.exp(-((angDiff(b, ctr) / w) ** 2));
    const ridge = (hf, fill) => {
      c.fillStyle = fill; c.beginPath(); c.moveTo(-10, HOR + 2);
      for (let b = 0; b <= 360.5; b += 0.5) c.lineTo(X(b) + (b === 360.5 ? PANO_W : 0), HOR - hf(b));
      c.lineTo(PANO_W + 10, HOR + 2); c.closePath(); c.fill();
    };
    // far hazy mountains
    const farH = b => 14 + 6 * Math.sin(b * 0.09) + bump(b, 60, 46, 22) + bump(b, 100, 34, 25) + bump(b, 20, 30, 16) + bump(b, 270, 26, 30) + bump(b, 150, 24, 18);
    ridge(farH, '#9fbfd0');
    // main hills: Inasa ridge (west), Mt Konpira (north), eastern hills, Minamiyamate (south-east)
    const mouth = b => (b > 200 && b < 236) ? 1 : 0;   // harbour mouth: open water under Megami Bridge
    const midH = b => {
      let h = 8 + 3 * Math.sin(b * 0.31) + bump(b, 320, 84, 15) + bump(b, 300, 50, 10) + bump(b, 285, 40, 12) + bump(b, 262, 34, 12) + bump(b, 245, 22, 8)
        + bump(b, 346, 62, 9) + bump(b, 10, 34, 10) + bump(b, 32, 48, 13) + bump(b, 62, 60, 15) + bump(b, 95, 52, 16) + bump(b, 128, 46, 14) + bump(b, 160, 40, 12);
      if (mouth(b)) h = Math.min(h, 4 + Math.abs(angDiff(b, 218)) * 0.5);
      return h;
    };
    ridge(midH, '#6a9c86');
    // hillside houses (Nagasaki is a "slope city")
    const HC = ['#f3efe6', '#e7e2d6', '#cfd8de', '#f6e3d2', '#dfe7ea', '#e9d4c4', '#ffffff'];
    for (let i = 0; i < 2600; i++) {
      const b = hash(i, 7) * 360; if (mouth(b)) continue;
      const okArc = (b < 175) || (b > 280 && b < 345) || b > 345;
      if (!okArc) continue;
      const hTop = midH(b) * 0.82; const yy = HOR - 4 - hash(i, 8) * hTop;
      wrap(b, x => { c.fillStyle = HC[i % HC.length]; c.fillRect(x, yy, 2 + hash(i, 9) * 3, 1.5 + hash(i, 10) * 2.2); });
    }
    // dark green tree texture on hills
    for (let i = 0; i < 900; i++) {
      const b = hash(i, 17) * 360, yy = HOR - 3 - hash(i, 18) * midH(b) * 0.95;
      wrap(b, x => { c.fillStyle = 'rgba(60,110,80,0.35)'; c.beginPath(); c.arc(x, yy, 2 + hash(i, 19) * 3, 0, 6.3); c.fill(); });
    }
    // Inasayama TV towers (bearing 320)
    wrap(320, x => {
      [[-14, 26], [-4, 32], [7, 24], [16, 18]].forEach(([dx, h], k) => {
        const top = HOR - midH(320 + dx / PXD) - h;
        c.fillStyle = '#e23b2e'; c.fillRect(x + dx - 1.5, top, 3, h);
        c.fillStyle = '#fff'; for (let j = 0; j < h; j += 6) c.fillRect(x + dx - 1.5, top + j, 3, 3);
      });
      c.fillStyle = '#dfe6ea'; c.fillRect(x - 10, HOR - midH(320) - 6, 18, 6);
    });
    // near hill: Minamiyamate (Glover Garden / Oura Cathedral), very close to the pier
    const nearH = b => bump(b, 186, 58, 11) + bump(b, 168, 30, 9);
    ridge(nearH, '#4f8a5e');
    for (let i = 0; i < 260; i++) { const b = 160 + hash(i, 27) * 40, yy = HOR - 3 - hash(i, 28) * nearH(b) * 0.9;
      wrap(b, x => { c.fillStyle = i % 3 ? 'rgba(40,95,60,0.5)' : HC[i % HC.length]; c.beginPath(); c.arc(x, yy, i % 3 ? 3 + hash(i, 29) * 3 : 2, 0, 6.3); c.fill(); }); }
    // city along the north & east shore
    const BC = ['#e9edf0', '#d5dde3', '#c4ced6', '#f1ece2', '#b9c6d0', '#e0d6c8', '#a9b8c4'];
    for (let i = 0; i < 520; i++) {
      const b = (330 + hash(i, 31) * 95) % 360;
      const dense = Math.exp(-((angDiff(b, 2) / 22) ** 2));
      const h = 4 + hash(i, 32) * (8 + 18 * dense), w = 4 + hash(i, 33) * 9;
      wrap(b, x => { c.fillStyle = BC[i % BC.length]; c.fillRect(x, HOR - h, w, h); c.fillStyle = 'rgba(80,110,140,0.35)';
        for (let yy = HOR - h + 2; yy < HOR - 2; yy += 3) c.fillRect(x + 1, yy, w - 2, 1); });
    }
    // Nagasaki Station building (bearing ~356)
    wrap(356, x => { c.fillStyle = '#eef2f4'; c.fillRect(x - 18, HOR - 30, 36, 30); c.fillStyle = '#8fb3cf'; c.fillRect(x - 15, HOR - 26, 30, 3); c.fillRect(x - 15, HOR - 19, 30, 3); });
    // Dejima Wharf + Mizube no Mori park (bearing ~25-40, close)
    wrap(30, x => {
      c.fillStyle = '#5b9a4a'; c.fillRect(x + 20, HOR - 7, 60, 7);
      c.fillStyle = '#9a6a43'; c.fillRect(x - 30, HOR - 14, 50, 14); c.fillStyle = '#c99666'; c.fillRect(x - 30, HOR - 16, 50, 3);
      c.fillStyle = '#ffe9b0'; for (let k = 0; k < 6; k++) c.fillRect(x - 27 + k * 8, HOR - 10, 4, 4);
    });
    // west shore shipyard (Mitsubishi Nagasaki), bearings 240-305
    for (let i = 0; i < 40; i++) { const b = 242 + hash(i, 41) * 62, h = 5 + hash(i, 42) * 9, w = 10 + hash(i, 43) * 22;
      wrap(b, x => { c.fillStyle = i % 2 ? '#9fb0bc' : '#7f95a5'; c.fillRect(x, HOR - h, w, h); }); }
    // red & white jib cranes
    [[252, 34], [266, 42], [276, 30], [289, 36]].forEach(([b, h], k) => wrap(b, x => {
      c.fillStyle = '#d8392b'; c.fillRect(x - 1.5, HOR - h, 3, h);
      c.strokeStyle = '#d8392b'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x, HOR - h + 2); c.lineTo(x + (k % 2 ? 26 : -26), HOR - h - 10); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, HOR - h + 2); c.lineTo(x + (k % 2 ? 26 : -26), HOR - h - 10); c.stroke();
    }));
    // Giant Cantilever Crane (Akunoura, bearing ~300) — the World Heritage hammerhead crane
    wrap(300, x => {
      c.fillStyle = '#2d3a44'; c.fillRect(x - 4, HOR - 40, 8, 40);
      c.strokeStyle = '#2d3a44'; c.lineWidth = 1; for (let yy = HOR - 40; yy < HOR; yy += 6) { c.beginPath(); c.moveTo(x - 4, yy); c.lineTo(x + 4, yy + 6); c.stroke(); }
      c.fillRect(x - 34, HOR - 48, 62, 7); c.fillRect(x - 34, HOR - 44, 12, 9);
      c.fillRect(x + 16, HOR - 41, 2, 14);
    });
    // Megami Bridge across the harbour mouth (towers at ~212° and ~224°, H-shaped)
    {
      const deck = HOR - 13, top = HOR - 42;
      const t1 = 212, t2 = 224, e1 = 203, e2 = 233;
      c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 0.8;
      [t1, t2].forEach(t => { for (let k = 1; k <= 9; k++) { [-1, 1].forEach(s => { wrap(t, x => { c.beginPath(); c.moveTo(x, top + k * 1.6); c.lineTo(x + s * k * 7.5, deck); c.stroke(); }); }); } });
      c.fillStyle = '#f7f9fb'; wrap(e1, x => c.fillRect(x, deck, X(e2) - X(e1), 3.5));
      [t1, t2].forEach(t => wrap(t, x => { c.fillStyle = '#f2f5f7'; c.fillRect(x - 4, top, 2.5, HOR - top); c.fillRect(x + 1.5, top, 2.5, HOR - top);
        c.fillRect(x - 4, top + 6, 8, 2); c.fillRect(x - 4, deck - 8, 8, 2); }));
    }
    // Oura Cathedral (bearing ~176) on the hill slope
    wrap(176, x => {
      const y0 = HOR - 30;
      c.fillStyle = '#f7f5ef'; c.fillRect(x - 11, y0 - 14, 22, 14);
      c.fillStyle = '#6b7a85'; c.beginPath(); c.moveTo(x - 13, y0 - 14); c.lineTo(x, y0 - 22); c.lineTo(x + 13, y0 - 14); c.fill();
      c.fillStyle = '#f7f5ef'; c.fillRect(x - 3, y0 - 30, 6, 16);
      c.fillStyle = '#4c5a64'; c.beginPath(); c.moveTo(x - 4, y0 - 30); c.lineTo(x, y0 - 40); c.lineTo(x + 4, y0 - 30); c.fill();
      c.fillStyle = '#d8b74a'; c.fillRect(x - 0.5, y0 - 45, 1, 6); c.fillRect(x - 2, y0 - 43, 4, 1);
      c.fillStyle = '#7fa7c9'; c.fillRect(x - 7, y0 - 10, 3, 6); c.fillRect(x + 4, y0 - 10, 3, 6); c.fillRect(x - 1.5, y0 - 26, 3, 4);
    });
    // Glover House (bearing ~191): long white bungalow with dark roof
    wrap(191, x => {
      const y0 = HOR - 44;
      c.fillStyle = '#5b5f63'; c.beginPath(); c.moveTo(x - 20, y0 - 6); c.lineTo(x - 14, y0 - 12); c.lineTo(x + 14, y0 - 12); c.lineTo(x + 20, y0 - 6); c.fill();
      c.fillStyle = '#fbfaf5'; c.fillRect(x - 18, y0 - 6, 36, 8);
      c.fillStyle = '#b9c9b5'; for (let k = -16; k < 18; k += 5) c.fillRect(x + k, y0 - 5, 2, 6);
    });
    // quay line
    c.fillStyle = 'rgba(70,90,100,0.45)'; c.fillRect(0, HOR - 1.5, PANO_W, 1.5);
  }

  const LABELS = [[320, HOR - 136, 'いなさやま'], [346, HOR - 84, 'こんぴらさん'], [300, HOR - 66, 'せかいいさんの クレーン'], [356, HOR - 46, 'ながさきえき'],
    [30, HOR - 34, 'でじまワーフ'], [218, HOR - 60, 'めがみおおはし'], [176, HOR - 84, 'おおうらてんしゅどう'], [193, HOR - 66, 'グラバーえん']];
  function drawLabels() {
    if (S.labelA <= 0.02) return;
    ctx.save(); ctx.globalAlpha = S.labelA;
    for (const [b, y, txt] of LABELS) {
      const x = W / 2 + angDiff(b, cam.yaw) * PXD; if (x < -150 || x > W + 150) continue;
      const font = '800 14px "M PLUS Rounded 1c", sans-serif', w = measure(font, txt) + 16;
      const c = sprite('lab' + txt, w, 30, g => { g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.roundRect ? g.roundRect(0, 0, w, 22, 11) : g.rect(0, 0, w, 22); g.fill();
        g.beginPath(); g.moveTo(w / 2 - 5, 22); g.lineTo(w / 2, 28); g.lineTo(w / 2 + 5, 22); g.fill();
        g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#21435e'; g.fillText(txt, w / 2, 12); });
      ctx.drawImage(c, x - w / 2, y - 11, w, 30);
    }
    ctx.restore();
  }
  function drawSky() {
    const off = ((cam.yaw * PXD - W / 2) % PANO_W + PANO_W) % PANO_W;
    const sw = Math.min(W, PANO_W - off);
    ctx.drawImage(pano, off * PRES, 0, sw * PRES, PANO_H * PRES, 0, 0, sw, PANO_H);
    if (sw < W) ctx.drawImage(pano, 0, 0, (W - sw) * PRES, PANO_H * PRES, sw, 0, W - sw, PANO_H);
    // reflection of the skyline in the water
    ctx.save(); ctx.globalAlpha = 0.22; ctx.translate(0, HOR * 2 + 2); ctx.scale(1, -0.35); ctx.translate(0, HOR * (1 / 0.35 - 1) * 0 );
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.2; ctx.setTransform(RES, 0, 0, -RES * 0.4, 0, (HOR + HOR * 0.4) * RES);
    ctx.drawImage(pano, off * PRES, 0, sw * PRES, PANO_H * PRES, 0, 0, sw, PANO_H);
    if (sw < W) ctx.drawImage(pano, 0, 0, (W - sw) * PRES, PANO_H * PRES, sw, 0, W - sw, PANO_H);
    ctx.restore(); ctx.setTransform(RES, 0, 0, RES, 0, 0);
  }

  /* ---------------- water ---------------- */
  function drawWater() {
    const g = ctx.createLinearGradient(0, HOR, 0, H);
    g.addColorStop(0, 'rgba(120,190,215,0.85)'); g.addColorStop(0.08, 'rgba(60,150,190,0.92)'); g.addColorStop(1, '#155d8c');
    ctx.fillStyle = g; ctx.fillRect(0, HOR, W, H - HOR);
    // pan offset makes the water slide sideways while the camera turns
    const pan = cam.yaw * 0.35;
    const base = Math.floor(cam.z / 2.6);
    for (let i = 52; i >= 1; i--) {
      const zi = base + i, z = zi * 2.6, p0 = P(0, 0, z); if (!p0) continue;
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = Math.min(0.3, p0.s / 120) * (p0.s > 40 ? 0.6 : 1);
      for (let k = -11; k <= 11; k++) {
        const x = k * 2.8 + (hash(zi, k) - 0.5) * 2 + Math.sin(S.time * 0.9 + zi + k) * 0.18 + ((pan % 2.4));
        const p = P(x, 0, z); const w = (0.35 + hash(zi, k + 50) * 0.9) * p.s;
        ctx.fillRect(p.x - w / 2, p.y, w, Math.max(1, 0.05 * p.s));
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawRopes() {
    const far = cam.z + 150;
    ctx.globalAlpha = 0.55; for (const bx of ROPES) seg(P(bx, 0.08, cam.z + 1.6), P(bx, 0.08, far), '#eef7fb', 1.2); ctx.globalAlpha = 1;
    const start = Math.ceil((cam.z + 1.6) / 2.5);
    for (let i = Math.floor(far / 2.5); i >= start; i--) {
      const z = i * 2.5;
      for (const bx of ROPES) { const p = P(bx, 0.1, z); if (!p) continue; const big = i % 8 === 0;
        dot(p, Math.min(big ? 8 : 5, (big ? 0.26 : 0.15) * p.s), big ? '#ff8a1f' : (i % 2 ? '#ff4b3a' : '#ffffff')); }
    }
  }

  /* ---------------- props ---------------- */
  function drawTurnBuoys() {
    const z = S.buoyZ;
    for (const lx of LANES) {
      const p = P(lx, 0, z), t = P(lx, 2.2, z); if (!p) continue; const s = p.s;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 0.35 * s, 0.75 * s, 0.6 * s, 0, 0, 6.3); ctx.fillStyle = '#ffb703'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 0.5 * s, 0.75 * s, 0.18 * s, 0, 0, 6.3); ctx.fillStyle = '#ff7b00'; ctx.fill();
      seg(P(lx, 0.6, z), t, '#333', 0.06 * s);
      const f1 = P(lx, 2.2, z), f2 = P(lx + 1.2, 1.9, z), f3 = P(lx, 1.6, z); poly([f1, f2, f3], '#e63946');
    }
    const c = P(0, 4.2, z); if (c) bannerText(c, 'ターン！ TURN', '#ff7b00', c.s);
  }
  function bannerText(p, txt, col, s) {
    const fs = Math.max(8, 0.9 * s); ctx.font = `900 ${fs}px "Baloo 2","M PLUS Rounded 1c",sans-serif`;
    const w = ctx.measureText(txt).width + fs; ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, fs * 0.12);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(p.x - w / 2, p.y - fs * 0.75, w, fs * 1.5, fs * 0.4) : ctx.rect(p.x - w / 2, p.y - fs * 0.75, w, fs * 1.5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, p.x, p.y + fs * 0.05);
  }
  function drawGate(z, txt, col) {
    const L1 = P(-10.5, 0, z), L2 = P(-10.5, 5, z), R1 = P(10.5, 0, z), R2 = P(10.5, 5, z); if (!L1) return; const s = L1.s;
    for (let i = 0; i < 38; i++) { const x0 = -9.5 + i * 0.5;
      poly([P(x0, 0, z), P(x0 + 0.5, 0, z), P(x0 + 0.5, 0, z + 0.5), P(x0, 0, z + 0.5)], i % 2 ? '#222' : '#fff');
      poly([P(x0, 0, z + 0.5), P(x0 + 0.5, 0, z + 0.5), P(x0 + 0.5, 0, z + 1), P(x0, 0, z + 1)], i % 2 ? '#fff' : '#222'); }
    seg(L1, L2, col, s * 0.35); seg(R1, R2, col, s * 0.35);
    poly([P(-10.5, 5.2, z), P(10.5, 5.2, z), P(10.5, 3.9, z), P(-10.5, 3.9, z)], col, '#fff', Math.max(1, s * 0.07));
    const c = P(0, 4.55, z); ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.max(7, s * 0.95)}px "Baloo 2","M PLUS Rounded 1c",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, c.x, c.y);
  }
  function drawStartLine() {
    const z = BOAT_L + 0.5;
    for (let i = 0; i < 20; i++) { const p = P(-9.5 + i, 0.1, z); if (p) dot(p, Math.min(6, 0.2 * p.s), i % 2 ? '#e63946' : '#fff'); }
  }
  // fishing boats with colourful tairyō-bata flags, moored outside the course
  function fishingBoat(x, z, k) {
    const a = P(x - 1.6, 0, z), b = P(x + 1.6, 0, z), c = P(x + 1.3, 0.9, z), d = P(x - 1.3, 0.9, z); if (!a) return; const s = a.s;
    poly([a, b, c, d], '#f4f1e8', '#5a6b75', Math.max(0.5, s * 0.04));
    poly([P(x - 0.4, 0.9, z), P(x + 0.6, 0.9, z), P(x + 0.6, 1.8, z), P(x - 0.4, 1.8, z)], '#e8edf0');
    const cols = ['#e63946', '#1d6fe0', '#ffb703', '#2a9d8f', '#ff7b00'];
    for (let j = 0; j < 3; j++) { const fx = x - 1 + j; seg(P(fx, 0.9, z), P(fx, 3.4, z), '#666', s * 0.04);
      const col = cols[(k + j) % cols.length]; poly([P(fx, 3.4, z), P(fx + 0.9, 3.3, z), P(fx + 0.9, 2.6, z), P(fx, 2.6, z)], col); }
  }
  // The east bank of the harbour: one continuous quay from the camera to the horizon (side +1 = right, -1 = left).
  // segs: [[zFrom, zTo, quayX], ...]  — quayX is the distance of the quay wall from the course centre.
  const Q = 16;
  function shore(side, segs) {
    const items = [], far = cam.z + 260;
    // land + quay wall, drawn first (behind everything on the water)
    items.push([1e9, () => {
      for (const [za, zb, qx] of segs) {
        const z0 = Math.max(za, cam.z + 1.2), z1 = Math.min(zb, far); if (z1 <= z0) continue;
        const X = side * qx, XF = side * 400;
        poly([P(X, 1.3, z0), P(X, 1.3, z1), P(XF, 1.3, z1), P(XF, 1.3, z0)], '#cbc3b2');
        poly([P(X, 0, z0), P(X, 0, z1), P(X, 1.3, z1), P(X, 1.3, z0)], '#9e9688');
        seg(P(X, 1.3, z0), P(X, 1.3, z1), '#e9e3d6', 2);
      }
      // end walls where the quay steps back (berths)
      for (let i = 1; i < segs.length; i++) { const z = segs[i][0], qa = segs[i - 1][2], qb = segs[i][2];
        if (z > cam.z + 1.2 && z < far) poly([P(side * qa, 0, z), P(side * qb, 0, z), P(side * qb, 1.3, z), P(side * qa, 1.3, z)], '#b3ab9c'); }
    }]);
    // warehouses, trees and shops along the quay
    const start = Math.ceil((cam.z + 4) / 11) * 11;
    for (let z = Math.min(far, segs[segs.length - 1][1]); z >= start; z -= 11) {
      const sg = segs.find(g => z >= g[0] && z < g[1]); if (!sg) continue;
      const k = Math.round(z / 11), qx = sg[2];
      items.push([z, () => {
        const x0 = side * (qx + 5 + hash(k, 3) * 4), x1 = x0 + side * 6, w = 4 + hash(k, 4) * 4, h = 3 + hash(k, 5) * 6;
        if (hash(k, 6) < 0.3) { // trees
          for (let j = 0; j < 3; j++) { const t = P(x0 + side * j * 1.4, 1.3 + 1.6, z + j * 1.8), tr = P(x0 + side * j * 1.4, 1.3, z + j * 1.8);
            if (t) { seg(tr, t, '#7a5a3a', t.s * 0.25); dot(t, t.s * 1.2, j % 2 ? '#4f9a5a' : '#3f8a4c'); } }
          return;
        }
        const col = ['#f2efe8', '#e3e8ec', '#f4e6d4', '#dfe9e1', '#e9dfe9'][k % 5], roof = ['#5d7486', '#8a5a44', '#4f6b5a', '#6d6d7a'][k % 4];
        poly([P(x0, 1.3, z), P(x0, 1.3, z + w), P(x0, 1.3 + h, z + w), P(x0, 1.3 + h, z)], col, 'rgba(0,0,0,.12)', 1);
        poly([P(x0, 1.3, z), P(x1, 1.3, z), P(x1, 1.3 + h, z), P(x0, 1.3 + h, z)], col);
        poly([P(x0, 1.3 + h, z), P(x0, 1.3 + h, z + w), P(x1, 1.3 + h, z + w), P(x1, 1.3 + h, z)], roof);
        for (let r = 0; r < Math.floor(h / 2); r++) seg(P(x0, 2.6 + r * 2, z + 0.6), P(x0, 2.6 + r * 2, z + w - 0.6), '#8fb3cf', Math.max(1, (P(x0, 2.6, z) || { s: 1 }).s * 0.3));
      }]);
    }
    return items;
  }
  // Matsugae pier crowd and festival tents, standing on the quay
  function crowd(side, z0, z1) {
    const x0 = side * (Q + 0.2);
    const items = [];
    for (let z = z1; z > z0; z -= 1.5) items.push([z, () => {
      const a = P(x0, 1.3, z); if (!a) return; const k = Math.round(z / 1.5);
      if (k % 9 === 0) {
        poly([P(x0 + side * 2.8, 1.3, z), P(x0 + side * 2.8, 3.4, z), P(x0 + side * 5.4, 3.4, z), P(x0 + side * 5.4, 1.3, z)], k % 2 ? '#e8f1fb' : '#fff3e6');
        poly([P(x0 + side * 2.5, 3.4, z), P(x0 + side * 4.1, 4.2, z), P(x0 + side * 5.7, 3.4, z)], k % 2 ? '#2c6ed5' : '#e63946');
      }
      for (let r = 0; r < 3; r++) for (let j = 0; j < 2; j++) {
        const hx = x0 + side * (0.5 + r * 0.7), hz = z - j * 0.75 - 0.3, bob = Math.max(0, Math.sin(S.time * 6 + k * 1.7 + r + j)) * 0.12;
        const body = P(hx, 1.75 + bob, hz), head = P(hx, 2.15 + bob, hz);
        const cc = ['#e63946', '#2c6ed5', '#ffb703', '#2a9d8f', '#f4a3c0', '#ffffff', '#7b5cd6'][(k * 7 + r * 3 + j) % 7];
        if (body) { dot(body, 0.26 * body.s, cc); dot(head, 0.16 * head.s, '#2a1c12'); }
      }
    }]);
    return items;
  }
  function ship(x, z0, z1) {
    const side = Math.sign(x), xn = x - side * 3;
    const A = (y, z) => P(xn, y, z);
    poly([P(xn, 0, z0), P(xn - side * 9, 0, z0), P(xn - side * 9, 6, z0), P(xn, 6, z0)], '#e7eef4', '#9fb3c2', 1);
    poly([A(0, z0), A(0, z1), A(6, z1), A(6, z0)], '#fbfdff', '#9fb3c2', 1);
    poly([A(0, z0), A(0, z1), A(1.4, z1), A(1.4, z0)], '#1f4e8c');
    poly([A(6, z0 + 6), A(6, z1 - 8), A(10, z1 - 12), A(10, z0 + 10)], '#f1f5f9', '#c7d3dc', 1);
    for (let z = z0 + 8; z < z1 - 10; z += 2) seg(A(7.5, z), A(7.5, z + 1.2), '#5e86a8', 2);
    const f = P(xn - side * 1, 10, z1 - 22), f2 = P(xn - side * 1, 13, z1 - 22); seg(f, f2, '#1f4e8c', f ? f.s * 2.2 : 1);
  }

  /* ---------------- boats ---------------- */
  const hullW = t => { let w = 0.66; if (t < 0.08) w *= 0.72 + t / 0.08 * 0.28; if (t > 0.74) w *= Math.max(0.05, (1 - t) / 0.26); return w; };
  const hullH = t => 0.5 + (t > 0.84 ? (t - 0.84) * 3.2 : 0);
  function wake(b) {
    const k = Math.min(1, b.v / 12) * 0.5 + 0.12; ctx.globalAlpha = k; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    for (const sd of [-1, 1]) {
      let prev = null; for (let i = 0; i <= 8; i++) { const p = P(b.x + sd * (0.6 + i * 0.24), 0, b.z - i * 0.9); if (p && prev) { ctx.lineWidth = Math.max(1, p.s * 0.16); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); } prev = p; }
      seg(P(b.x + sd * 0.2, 0, b.z + BOAT_L * 0.98), P(b.x + sd * 0.8, 0, b.z + BOAT_L * 0.8), '#fff', 2);
    }
    const f = P(b.x, 0, b.z - 0.3); if (f) { ctx.beginPath(); ctx.ellipse(f.x, f.y, f.s * 0.9, f.s * 0.16, 0, 0, 6.3); ctx.fillStyle = '#fff'; ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function rower(b, t, sd, ph, bob) {
    const z = b.z + t * BOAT_L, xs = b.x + sd * 0.34, h0 = hullH(t) - 0.12 + bob, lean = Math.cos(ph), sn = Math.sin(ph);
    const hip = P(xs, h0, z); if (!hip) return; const s = hip.s;
    const sh = P(xs, h0 + 0.7, z + lean * 0.25), hd = P(xs, h0 + 1.0, z + lean * 0.32);
    const tipY = sn > 0 ? -0.12 : 0.08 + 0.45 * (-sn), tipZ = z + lean * 0.95 + 0.15;
    const grip = P(xs + sd * 0.1, h0 + 0.92, z + lean * 0.5), hand = P(xs + sd * 0.38, h0 + 0.52, z + lean * 0.6);
    const tip = P(xs + sd * 1.08, tipY, tipZ), bl = P(xs + sd * 0.88, tipY + 0.34, tipZ);
    ctx.lineCap = 'round';
    seg(grip, tip, '#d9b47a', s * 0.07); seg(bl, tip, '#c99a55', s * 0.16);
    seg(hip, sh, b.shirt || b.color, s * 0.4); seg(sh, hand, '#e8b98f', s * 0.1);
    if (hd) { dot(hd, s * 0.165, '#2a1c12'); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.6, s * 0.055); ctx.beginPath();
      ctx.moveTo(hd.x - s * 0.165, hd.y - s * 0.02); ctx.lineTo(hd.x + s * 0.165, hd.y - s * 0.02); ctx.lineTo(hd.x + s * 0.25, hd.y + s * 0.08); ctx.stroke(); }
  }
  function drummer(b, t, ph, bob) {
    const z = b.z + t * BOAT_L, h0 = hullH(t) - 0.1 + bob, dc = P(b.x, h0 + 0.6, z + 0.55); if (!dc) return; const s = dc.s;
    ctx.beginPath(); ctx.ellipse(dc.x, dc.y, s * 0.4, s * 0.34, 0, 0, 6.3); ctx.fillStyle = '#8b2a1d'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(dc.x, dc.y - s * 0.2, s * 0.38, s * 0.11, 0, 0, 6.3); ctx.fillStyle = '#ead6ae'; ctx.fill();
    const gp = P(b.x + 0.5, h0 + 1.1, z + 0.25); seg(P(b.x + 0.5, h0, z + 0.25), P(b.x + 0.5, h0 + 1.6, z + 0.25), '#5a3a1a', s * 0.06);
    if (gp) { dot(gp, s * 0.28, '#c9962a'); dot(gp, s * 0.19, '#e9c25a'); dot(gp, s * 0.06, '#a57a1c'); }
    const hip = P(b.x, h0 + 0.55, z), sh = P(b.x, h0 + 1.3, z), hd = P(b.x, h0 + 1.6, z);
    seg(hip, sh, '#fff', s * 0.4);
    const up = Math.sin(ph * 2) > 0;
    seg(sh, P(b.x - 0.28, h0 + (up ? 1.7 : 1.0), z + 0.4), '#e8b98f', s * 0.1); seg(sh, P(b.x + 0.28, h0 + (up ? 1.0 : 1.7), z + 0.4), '#e8b98f', s * 0.1);
    if (hd) { dot(hd, s * 0.165, '#2a1c12'); ctx.strokeStyle = b.color; ctx.lineWidth = Math.max(0.6, s * 0.06); ctx.beginPath(); ctx.moveTo(hd.x - s * 0.165, hd.y - s * 0.03); ctx.lineTo(hd.x + s * 0.165, hd.y - s * 0.03); ctx.stroke(); }
  }
  function steersman(b, bob) {
    const t = 0.04, z = b.z + t * BOAT_L, h0 = hullH(t) + bob, sx = b.x + 0.36;
    const hip = P(sx, h0 + 0.35, z); if (!hip) return; const s = hip.s;
    const sh = P(sx, h0 + 1.0, z), hd = P(sx, h0 + 1.25, z), hand = P(sx + 0.3, h0 + 0.8, z - 0.2), end = P(sx + 0.75, -0.1, z - 3.0);
    seg(hand, end, '#c99a55', s * 0.09); seg(hip, sh, b.dark, s * 0.36); seg(sh, hand, '#e8b98f', s * 0.09); if (hd) dot(hd, s * 0.15, '#2a1c12');
  }
  function flag(b, bob) {
    const t = 0.97, z = b.z + t * BOAT_L, h = hullH(t) + bob, p0 = P(b.x, h, z), p1 = P(b.x, h + 2.3, z); if (!p0 || !p1) return; const s = p1.s;
    seg(p0, p1, '#eee', s * 0.06);
    const pts = [], N = 6, wv = u => Math.sin(S.time * 6 + u * 4 + b.lane) * 0.12 * u * (1 + b.v / 10);
    for (let i = 0; i <= N; i++) { const u = i / N; pts.push(P(b.x + u * 1.15, h + 2.25 + wv(u), z + wv(u))); }
    for (let i = N; i >= 0; i--) { const u = i / N; pts.push(P(b.x + u * 1.15, h + 1.55 + wv(u), z + wv(u))); }
    poly(pts, b.color, '#fff', Math.max(0.5, s * 0.03));
    const c = P(b.x + 0.58, h + 1.9, z); if (c) { const k = sprite('k' + b.kanji, 40, 40, g => { g.fillStyle = '#fff'; g.font = '900 34px "M PLUS Rounded 1c",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.kanji, 20, 22); });
      const sz = Math.max(7, s * 0.55); ctx.drawImage(k, c.x - sz / 2, c.y - sz / 2, sz, sz); }
  }
  function boat(b) {
    const bob = Math.sin(S.time * 1.7 + b.lane * 1.3) * 0.04;
    const tStart = Math.max(0, (cam.z + 1.6 - b.z) / BOAT_L); if (tStart > 0.93) return;
    const N = 18, GL = [], GR = [], WL = [], WR = [], IL = [], IR = [];
    for (let i = 0; i <= N; i++) { const t = tStart + (1 - tStart) * i / N, z = b.z + t * BOAT_L, w = hullW(t), h = hullH(t) + bob;
      GL.push(P(b.x - w, h, z)); GR.push(P(b.x + w, h, z)); WL.push(P(b.x - w * 0.8, 0, z)); WR.push(P(b.x + w * 0.8, 0, z));
      IL.push(P(b.x - w * 0.55, h - 0.05, z)); IR.push(P(b.x + w * 0.55, h - 0.05, z)); }
    if (tStart === 0) wake(b);
    poly([...GL, ...WL.slice().reverse()], b.dark); poly([...GR, ...WR.slice().reverse()], b.dark);
    if (tStart === 0) poly([GL[0], GR[0], WR[0], WL[0]], b.color, 'rgba(0,0,0,.2)', 1);
    poly([...GL, ...GR.slice().reverse()], '#7a4e26'); poly([...IL, ...IR.slice().reverse()], '#9a6a38');
    ctx.lineCap = 'round';
    for (let i = 1; i <= N; i++) { seg(GL[i - 1], GL[i], '#fff', GL[i].s * 0.07); seg(GR[i - 1], GR[i], '#fff', GR[i].s * 0.07); }
    const items = [[0.97, () => flag(b, bob)], [0.5, () => drummer(b, 0.5, b.phase, bob)], [0.04, () => steersman(b, bob)]];
    [0.86, 0.79, 0.72, 0.65, 0.58, 0.42, 0.35, 0.28, 0.21, 0.14].forEach(t => items.push([t, () => { rower(b, t, -1, b.phase, bob); rower(b, t, 1, b.phase, bob); }]));
    items.sort((a, c) => c[0] - a[0]).forEach(([t, fn]) => { if (t >= tStart) fn(); });
    // name tag (cached sprite)
    const lp = P(b.x, 3.1, b.z + 1.6);
    if (lp) {
      const font = '800 24px "M PLUS Rounded 1c",sans-serif', tw = measure(font, b.name) + 28, th = 38;
      const c = sprite('tag' + b.name + b.isPlayer, tw + 4, th + 12, g => {
        g.fillStyle = b.isPlayer ? '#ffd23f' : 'rgba(0,0,0,.6)'; g.strokeStyle = '#fff'; g.lineWidth = 3;
        g.beginPath(); g.roundRect ? g.roundRect(2, 2, tw, th, 19) : g.rect(2, 2, tw, th); g.fill(); if (b.isPlayer) g.stroke();
        if (b.isPlayer) { g.beginPath(); g.moveTo(tw / 2 - 6, th + 1); g.lineTo(tw / 2 + 2, th + 10); g.lineTo(tw / 2 + 10, th + 1); g.fill(); }
        g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = b.isPlayer ? '#3a2a00' : '#fff'; g.fillText(b.name, tw / 2 + 2, th / 2 + 3); });
      const k = Math.max(0.45, Math.min(1, lp.s / 60)); ctx.drawImage(c, lp.x - c.lw * k / 2, lp.y - th * k / 2, c.lw * k, c.lh * k);
    }
  }

  /* ---------------- particles & effects ---------------- */
  function splash(b, n, force = 1, gold) {
    for (let i = 0; i < n; i++) { const sd = Math.random() < 0.5 ? -1 : 1, t = 0.14 + Math.random() * 0.72;
      S.parts.push({ x: b.x + sd * (1.2 + Math.random() * 0.3), y: 0.05, z: b.z + t * BOAT_L, vx: sd * Math.random() * 1.2, vy: (1.5 + Math.random() * 2) * force, vz: -1 - Math.random() * 2, life: 0.5 + Math.random() * 0.4, gold }); }
  }
  function bowSpray(b) {
    for (let i = 0; i < 3; i++) { const sd = Math.random() < 0.5 ? -1 : 1;
      S.parts.push({ x: b.x + sd * 0.3, y: 0.2, z: b.z + BOAT_L * 0.97, vx: sd * (1.5 + Math.random() * 2), vy: 2 + Math.random() * 2.5, vz: -2, life: 0.6, gold: true }); }
  }
  function drawParts(dt) {
    for (const p of S.parts) { p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt; }
    S.parts = S.parts.filter(p => p.life > 0 && p.y > -0.2);
    for (const p of S.parts) { const q = P(p.x, p.y, p.z); if (!q) continue; ctx.globalAlpha = Math.min(1, p.life * 2) * 0.9;
      dot(q, Math.max(0.8, q.s * (p.gold ? 0.09 : 0.07)), p.gold ? '#fff7c2' : '#fff'); }
    ctx.globalAlpha = 1;
  }
  function speedLines() {
    if (S.boostFx <= 0.01) return;
    ctx.save(); ctx.globalAlpha = Math.min(0.6, S.boostFx); ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const a = hash(i, Math.floor(S.time * 14)) * Math.PI * 2, r0 = 240 + hash(i, 3) * 200, len = 60 + hash(i, 5) * 120;
      const cx = W / 2, cy = HOR + 60, x0 = cx + Math.cos(a) * r0 * 1.6, y0 = cy + Math.sin(a) * r0 * 0.7;
      if (y0 < HOR - 20) continue;
      ctx.lineWidth = 2 + hash(i, 9) * 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a) * len * 1.6, y0 + Math.sin(a) * len * 0.7); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- public API ---------------- */
  function resize(scale) {
    RES = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * scale));
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) RES = Math.min(RES, 1.25);   // Chromebooks
    cv.width = Math.round(W * RES); cv.height = Math.round(H * RES);
    paintPanorama();
  }
  function init(canvas) { cv = canvas; ctx = cv.getContext('2d'); }
  function setRace(o) { S.boats = o.boats; S.turnZ = o.turnZ; S.buoyZ = o.turnZ + BOAT_L + 1.5; S.finishZ = o.finishZ; S.leg = 1; cam.yaw = LEG1; S.yawT = 1; S.parts = []; S.boostFx = 0; S.labelT = 0; }
  function startTurn() { S.leg = 2; S.yawFrom = cam.yaw; S.yawT = 0; S.labelT = 0; }
  function update(dt, player, opts = {}) {
    S.time += dt;
    cam.z = player.z - 9.9;
    if (S.yawT < 1) { S.yawT = Math.min(1, S.yawT + dt / 1.6); const e = S.yawT < 0.5 ? 4 * S.yawT ** 3 : 1 - (-2 * S.yawT + 2) ** 3 / 2;
      cam.yaw = (S.yawFrom + angDiff(LEG2, S.yawFrom) * e + 360) % 360; }
    else if (opts.idle) cam.yaw = (LEG1 + Math.sin(S.time * 0.12) * 28 + 360) % 360;
    else cam.yaw = S.leg === 1 ? LEG1 : LEG2;
    S.boostFx += ((player.boost > 0 ? 1 : 0) - S.boostFx) * Math.min(1, dt * 4);
    if (player.boost > 0 && Math.random() < 0.6) bowSpray(player);
    cam.shake = Math.max(0, cam.shake - dt * 3);
    // landmark labels: always on the menus, shown for a few seconds at the start of each leg
    S.labelT += dt; const wantL = !opts.idle && S.labelT < 6 ? 1 : 0;
    S.labelA += (wantL - S.labelA) * Math.min(1, dt * 2);
  }
  function render(dt) {
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    if (cam.shake > 0) ctx.translate((Math.random() - 0.5) * cam.shake * 6, (Math.random() - 0.5) * cam.shake * 4);
    drawSky(); drawLabels(); drawWater(); drawRopes();
    const list = [];
    // props for the current leg
    if (S.leg === 1) {
      // heading north from Matsugae: the east bank (city side) is on the RIGHT, open harbour on the left
      list.push(...shore(1, [[-1e4, S.buoyZ + 400, Q]]));
      if (cam.z < 40) { list.push(...crowd(1, -30, 30)); list.push([BOAT_L + 0.5, drawStartLine]); }
      if (S.buoyZ - cam.z < 170) list.push([S.buoyZ, drawTurnBuoys]);
      for (let k = 0; k < 60; k++) { const z = 30 + k * 37; if (z > S.buoyZ) break; list.push([z, () => fishingBoat(-(13 + hash(k, 1) * 3), z, k)]); }
    } else {
      // heading south back to Matsugae: the east bank is on the LEFT. After the goal the quay steps back
      // to make a berth, and the cruise ship is docked there.
      const fz = S.finishZ;
      list.push(...shore(-1, [[S.turnZ - 50, fz + 6, Q], [fz + 6, fz + 400, 34]]));
      list.push(...crowd(-1, fz - 70, fz + 5));
      list.push([fz + 12, () => ship(-26, fz + 10, fz + 95)]);
      if (fz - cam.z < 220) list.push([fz, () => drawGate(fz, 'GOAL  ゴール', '#e63946')]);
      for (let k = 0; k < 60; k++) { const z = S.turnZ + 20 + k * 41; if (z > fz - 60) break; list.push([z, () => fishingBoat(13.5 + hash(k, 2) * 3, z, k + 2)]); }
    }
    for (const b of S.boats) list.push([b.z, () => boat(b)]);
    list.filter(([z]) => z - cam.z < 230).sort((a, b) => b[0] - a[0]).forEach(([, fn]) => fn());
    drawParts(dt);
    speedLines();
  }
  function screenOf(b, y = 2.5) { return P(b.x, y, b.z + 3); }
  return { init, resize, setRace, startTurn, update, render, splash, screenOf, cam, S, W, H, BOAT_L, LANES, shake: v => cam.shake = Math.max(cam.shake, v) };
})();
