/* Peiron Race — game logic & UI */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const rnd = Math.random, pick = a => a[Math.floor(rnd() * a.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  const ord = n => n + (['th', 'st', 'nd', 'rd'][n] || 'th');
  const STICKERS = new Set((window.ASSETS || {}).stickers || []), VOICES = new Set((window.ASSETS || {}).voices || []);
  const store = { get(k, d) { try { const v = localStorage.getItem('peiron.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('peiron.' + k, JSON.stringify(v)); } catch (e) { } } };

  /* ---------- pictures ---------- */
  const EMOJI = { park: '🛝', peiron: '🚣', pen: '🖊️', pencil: '✏️', piano: '🎹', pizza: '🍕', rabbit: '🐰', recorder: '🎶', ride_bike: '🚲', run: '🏃', school: '🏫',
    ship: '🚢', shopping: '🛍️', sing: '🎤', skate: '⛸️', ski: '⛷️', sleepy: '😪', snowman: '⛄', soccer: '⚽', star: '⭐', sun: '☀️', sushi: '🍣', swim: '🏊',
    tent: '⛺', tv: '📺', umbrella: '☂️', unicycle: '🎪', videogame: '🎮', yen: '💴' };
  function stk(id, cls = '') {
    if (id === 'peiron') return `<img class="stk ${cls}" src="img/icon.png" alt="" draggable="false">`;
    if (STICKERS.has(id)) return `<img class="stk ${cls}" src="img/stickers/${id}.webp" alt="" draggable="false">`;
    return `<div class="stk fallback ${cls}">${EMOJI[id] || '❓'}</div>`;
  }
  const STAMP_OK = '<svg class="stamp" viewBox="0 0 100 100"><circle cx="50" cy="50" r="36" fill="none" stroke="#e63946" stroke-width="13"/></svg>';
  const STAMP_NG = '<svg class="stamp" viewBox="0 0 100 100"><path d="M20 20L80 80M80 20L20 80" stroke="#1d6fe0" stroke-width="15" stroke-linecap="round"/></svg>';
  const HANKO = '<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="11" fill="#fff0f0" stroke="#e63946" stroke-width="3.5"/><text x="15" y="20" font-size="13" text-anchor="middle" fill="#e63946" font-weight="900">✓</text></svg>';
  const EMPTY = '<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="11" fill="#f1f4f8" stroke="#cfd8e3" stroke-width="2" stroke-dasharray="3 3"/></svg>';
  function prepSVG(img, place, prep) {
    const href = STICKERS.has(img) ? `img/stickers/${img}.webp` : null;
    const obj = (x, y, s) => href ? `<image href="${href}" x="${x - s / 2}" y="${y - s}" width="${s}" height="${s}"/>` :
      `<text x="${x}" y="${y - 6}" font-size="${s * 0.8}" text-anchor="middle">${EMOJI[img] || '❓'}</text>`;
    let s = '<rect x="0" y="150" width="240" height="30" fill="#dfeaf3"/><line x1="0" y1="150" x2="240" y2="150" stroke="#b9c9d6" stroke-width="3"/>';
    if (place === 'box') {
      const back = '<path d="M62 86 L178 86 L170 100 L70 100 Z" fill="#8a5a2b"/>';
      const flaps = '<path d="M60 96 L40 72 L84 80 Z" fill="#d9a066" stroke="#8a5a2b" stroke-width="3" stroke-linejoin="round"/><path d="M180 96 L200 72 L156 80 Z" fill="#d9a066" stroke="#8a5a2b" stroke-width="3" stroke-linejoin="round"/>';
      const front = '<rect x="58" y="96" width="124" height="56" rx="6" fill="#e3ac6f" stroke="#8a5a2b" stroke-width="4"/><rect x="104" y="96" width="32" height="56" fill="#cfa06a"/>';
      if (prep === 'in') s += back + obj(120, 128, 92) + flaps + front;
      else if (prep === 'on') s += '<rect x="58" y="96" width="124" height="56" rx="6" fill="#e3ac6f" stroke="#8a5a2b" stroke-width="4"/><rect x="52" y="88" width="136" height="14" rx="5" fill="#d9a066" stroke="#8a5a2b" stroke-width="4"/>' + obj(120, 94, 82);
      else s += back + flaps + front + obj(212, 156, 64);
    } else {
      const desk = '<rect x="40" y="76" width="160" height="14" rx="4" fill="#d9a066" stroke="#8a5a2b" stroke-width="4"/><rect x="50" y="90" width="140" height="18" fill="#c99a63" stroke="#8a5a2b" stroke-width="3"/>' +
        '<rect x="54" y="108" width="8" height="44" fill="#7d8b99"/><rect x="178" y="108" width="8" height="44" fill="#7d8b99"/>';
      if (prep === 'on') s += desk + obj(120, 80, 76);
      else if (prep === 'under') s += desk + obj(120, 154, 60);
      else s += desk + obj(214, 156, 58);
    }
    return `<svg viewBox="0 0 240 180">${s}</svg>`;
  }
  function renderPic(p) {
    switch (p.type) {
      case 'one': {
        const chip = p.clock ? `<div class="chip ${p.clock}">${{ past: 'かこ ⏪', every: 'いつも 🔁', now: 'いま' }[p.clock]}</div>` : '';
        return `<div class="pic-one">${chip}${stk(p.img)}</div>`;
      }
      case 'many': { const sz = p.n === 1 ? 150 : p.n === 2 ? 104 : p.n <= 4 ? 78 : 66;
        return `<div class="pic-many">${Array.from({ length: p.n }, () => stk(p.img).replace('class="stk', `style="width:${sz}px;height:${sz}px;font-size:${sz * 0.7}px" class="stk`)).join('')}</div>`; }
      case 'can': return `<div class="pic-can"><div class="act">${stk(p.img)}</div>${p.ok ? STAMP_OK : STAMP_NG}</div>`;
      case 'prep': return `<div class="pic-prep">${prepSVG(p.img, p.place, p.prep)}</div>`;
      case 'ans': return `<div class="pic-ans"><div class="topic">${stk(p.img)}</div><div class="kid">${stk(p.yes ? 'p_yes' : 'p_no')}${p.yes ? STAMP_OK : STAMP_NG}</div></div>`;
      case 'week': return `<div class="pic-week">${stk(p.img)}<div class="week">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) =>
        `<div>${(p.on || []).includes(i) ? HANKO : EMPTY}${d}</div>`).join('')}</div></div>`;
    }
    return '';
  }

  /* ---------- audio ---------- */
  let AC = null, master = null, muted = store.get('muted', false); const BUF = {}; let crowdSrc = null;
  function ac() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = muted ? 0 : 1; const lim = AC.createDynamicsCompressor(); lim.threshold.value = -16; lim.knee.value = 8; lim.ratio.value = 6; lim.attack.value = 0.003; lim.release.value = 0.2; master.connect(lim).connect(AC.destination); loadSfx(); } catch (e) { } }
    if (AC && AC.state === 'suspended') AC.resume(); return AC;
  }
  function loadSfx() {
    Object.entries(window.SFX_DATA || {}).forEach(([k, uri]) => {
      const bin = atob(uri.split(',')[1]), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      AC.decodeAudioData(arr.buffer, b => BUF[k] = b, () => { });
    });
  }
  function sfx(name, vol = 1, rate = 1) {
    if (!AC || !BUF[name]) return null; const s = AC.createBufferSource(), g = AC.createGain();
    s.buffer = BUF[name]; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g).connect(master); s.start(); return { s, g };
  }
  function sfxCut(name, vol, dur, rate = 1) {
    const h = sfx(name, vol, rate); if (!h) return; const t = AC.currentTime;
    h.g.gain.setValueAtTime(vol, t + dur * 0.6); h.g.gain.linearRampToValueAtTime(0.0001, t + dur); h.s.stop(t + dur + 0.05);
  }
  /* synthesised peiron instruments (the お囃子 「ドーン、ドン、ジャーン、ジャン」):
     a dry barrel-drum 「ドン」 and a bright, short Chinese-style ドラ 「ジャン」 */
  let noiseBuf = null;
  function noise() { if (noiseBuf) return noiseBuf; const n = AC.sampleRate; noiseBuf = AC.createBuffer(1, n, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return noiseBuf; }
  function drum(vol, accent) {       // deep taiko 「ドーン」: low skin tone with a long, booming body
    if (!AC) return; const t = AC.currentTime + 0.004, out = AC.createGain(); out.gain.value = vol; out.connect(master);
    const f0 = accent ? 62 : 70, dec = accent ? 1.1 : 0.6;
    [[1, 1, dec], [1.52, 0.45, dec * 0.6], [2.3, 0.25, dec * 0.35]].forEach(([m, a, d]) => {
      const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(f0 * m * 1.45, t); o.frequency.exponentialRampToValueAtTime(f0 * m, t + 0.06); o.frequency.exponentialRampToValueAtTime(f0 * m * 0.92, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.05); });
    const n = AC.createBufferSource(), lp = AC.createBiquadFilter(), gn = AC.createGain(); n.buffer = noise(); lp.type = 'lowpass'; lp.frequency.value = 700;
    gn.gain.setValueAtTime(accent ? 0.5 : 0.35, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.07); n.connect(lp).connect(gn).connect(out); n.start(t); n.stop(t + 0.1);
  }
  function dora(vol, open) {        // the small gong's bright 「チーン」 ting; damped for the short 「チン」
    if (!AC) return; const t = AC.currentTime + 0.004, dur = open ? 0.9 : 0.16, out = AC.createGain(); out.gain.value = vol; out.connect(master);
    [[1680, 1, 1], [4560, 0.45, 0.6], [8620, 0.18, 0.3], [2230, 0.25, 0.8]].forEach(([f, a, d]) => {
      const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a * 0.3, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0005, t + dur * d);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05); });
    const n = AC.createBufferSource(), bp = AC.createBiquadFilter(), gn = AC.createGain(); n.buffer = noise(); bp.type = 'highpass'; bp.frequency.value = 5000;
    gn.gain.setValueAtTime(0.12, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.02); n.connect(bp).connect(gn).connect(out); n.start(t); n.stop(t + 0.04);
  }
  function crowd(on) {
    if (on && !crowdSrc && BUF.crowd) { crowdSrc = sfx('crowd', 0.18); if (crowdSrc) crowdSrc.s.loop = true; }
    if (!on && crowdSrc) { try { crowdSrc.s.stop(); } catch (e) { } crowdSrc = null; }
  }
  let voiceEl = null; let enVoice = null;
  function pickVoice() { const vs = speechSynthesis.getVoices(); enVoice = vs.find(v => /en-US/.test(v.lang) && /Google|Samantha|Aria|Jenny/.test(v.name)) || vs.find(v => /^en/.test(v.lang)); }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text) {
    if (muted) return; stopVoice();
    const k = slug(text);
    if (VOICES.has(k)) { voiceEl = new Audio(`voice/${k}.mp3`); voiceEl.volume = 1; voiceEl.play().catch(() => { }); return; }
    if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.88; if (enVoice) u.voice = enVoice; speechSynthesis.speak(u); }
  }
  function stopVoice() { if (voiceEl) { voiceEl.pause(); voiceEl = null; } if (window.speechSynthesis) speechSynthesis.cancel(); }
  function setMuted(m) { muted = m; store.set('muted', m); if (master) master.gain.value = m ? 0 : 1; $('btnSound').classList.toggle('muted', m); if (m) stopVoice(); }

  /* ---------- teams ---------- */
  const COLORS = [
    { key: 'red', color: '#e23b3b', dark: '#8e1c1c', kanji: '赤' },
    { key: 'blue', color: '#2f6fe0', dark: '#1a3f88', kanji: '青' },
    { key: 'yellow', color: '#f2b71f', dark: '#9a6f05', kanji: '黄' },
    { key: 'green', color: '#22a35a', dark: '#13643a', kanji: '緑' }];
  // Computer crews are named after Nagasaki districts that row peiron. Never the same as the player's team.
  const DISTRICTS = [['野母崎', 'のもざき', 'nomozaki'], ['深堀', 'ふかほり', 'fukahori'], ['戸町', 'とまち', 'tomachi'], ['香焼', 'こうやぎ', 'koyagi'],
    ['小ヶ倉', 'こがくら', 'kogakura'], ['福田', 'ふくだ', 'fukuda'], ['三重', 'みえ', 'mie'], ['牧島', 'まきしま', 'makishima'], ['式見', 'しきみ', 'shikimi'], ['小榊', 'こさかき', 'kosakaki']];
  const norm = t => String(t || '').toLowerCase().replace(/[\s・ー\-_.]/g, '');
  function clashes(d, name) { const n = norm(name); if (n.length < 2) return false; return d.some(v => { const m = norm(v); return n.includes(m) || m.includes(n); }); }
  function cpuNames() { return shuffle(DISTRICTS.filter(d => !clashes(d, cfg.name))).slice(0, 3).map(d => d[0]); }
  const FACTS = ['ペーロンは 1655ねんに ながさきで はじまったよ。', 'ペーロンの なまえは ちゅうごくごの「白龍（パイロン）」から。',
    'ふねの ながさは 13.6m。のるのは 30にん まで！', 'こぎては 26にん。たいこ・ドラ・かじとり・あかくみ も のるよ。',
    'コースは いき 630m、かえり 520m。ぜんぶで 1150m！', 'かけごえは「ヨーイサー！」', 'おはやしは「ドーン、ドン、ジャーン、ジャン！」',
    'ターンブイを まわる ところで しょうぶが きまることが おおいよ。', '2023ねんは 野母崎が 4ふん53びょう98で ゆうしょう！', 'ふねは すぎの き で できているよ。', 'まつがえの ターミナルの やねからも レースが みられるよ。'];
  const fact = () => 'まめちしき：' + pick(FACTS);
  const CPU = [{ int: 7.6, acc: 0.7 }, { int: 5.9, acc: 0.78 }, { int: 4.2, acc: 0.88 }];   // seconds per answer, accuracy
  // Rowing model: every boat always rows at BASE speed. Right answers add a speed boost that fades away;
  // 3 in a row adds a bigger BOOST. A wrong answer makes the crew stumble for a moment (they never stop).
  // Speed has no hard cap: each boost adds less the faster you already are, and a quicker answer gives a
  // slightly bigger boost (±8%). So finish times are continuous and rarely tie on the leaderboard.
  const BASE = 5, KICK = 9, COMBO_KICK = 5, SOFT_CAP = 48, FADE = 2.4, TURN_T = [3.6, 3.2, 2.8];
  function kick(r, combo, q = 1) { r.extra = Math.min(60, r.extra + (KICK + (combo ? COMBO_KICK : 0)) * q * Math.max(0, 1 - r.extra / SOFT_CAP)); r.boost = combo ? 2.6 : 0; }
  const quick = secs => Math.max(0.92, Math.min(1.08, 1.1 - 0.035 * secs));
  function stumble(r) { r.extra *= 0.4; r.boost = 0; r.stumble = 1.0; }

  /* ---------- state ---------- */
  const cfg = { set: null, len: 1, cpu: 1, color: store.get('color', 'red'), name: store.get('name', '') };
  let state = 'title', racers = [], player = null, trackLen = 0;
  let qShownT = 0, lbJob = null, q = null, locked = true, qCount = 0, answered = 0, correctN = 0, streak = 0, missed = [], raceT = 0, deck = null, endT = 0, countT = 0, lastCount = 4;

  /* ---------- question deck: shuffled bag + wrong answers come back ---------- */
  function makeDeck(set) {
    const sets = set.id === 'mix' ? QUESTION_SETS : [set];
    const bags = sets.map(s => ({ s, bag: [] })); let rr = 0;
    const retry = []; let lastPic = '';
    const draw = b => { if (!b.bag.length) b.bag = shuffle(b.s.items); return b.bag.pop(); };
    return {
      next(n) {
        const due = retry.findIndex(r => r.due <= n);
        if (due >= 0) return retry.splice(due, 1)[0].q;
        let item, tries = 0;
        do { const b = set.id === 'mix' ? bags[(rr++) % bags.length] : bags[0]; if (set.id === 'mix' && rr % bags.length === 0) bags.sort(() => rnd() - 0.5);
          item = draw(b); tries++; } while (tries < 6 && (item.pic.img || '') === lastPic);
        lastPic = item.pic.img || ''; item._set = set.id === 'mix' ? sets.find(s => s.items.includes(item)) : set; return item;
      },
      again(item, n) { retry.push({ q: item, due: n + 3 }); }
    };
  }

  /* ---------- screens ---------- */
  const ALLSETS = () => [...QUESTION_SETS, MIX_SET];
  function modeCard(s, tag = 'button') {
    const best = store.get('best', {})[s.id];
    const medal = best ? `<div class="medal m${best.place}">${best.place}</div>` : '';
    return `<${tag} class="mode" data-id="${s.id}" style="--c:${s.color}"><div class="ic">${stk(s.icon)}</div><div class="tx"><div class="en">${esc(s.en)}</div><div class="jp">${s.jp}</div><div class="u">${esc(s.unit)}</div></div>${medal}</${tag}>`;
  }
  function showTitle() {
    state = 'title'; stopVoice(); crowd(false);
    $('modeGrid').innerHTML = ALLSETS().map(s => modeCard(s)).join('');
    $('modeGrid').querySelectorAll('.mode').forEach(el => el.onclick = () => { ac(); sfx('click', 0.6); cfg.set = ALLSETS().find(s => s.id === el.dataset.id); showSetup(); });
    show('title'); $('hud').classList.add('hidden'); $('btnHome').classList.add('hidden');
    idleRace(); dockIdle();
  }
  function show(id) { ['title', 'setup', 'results'].forEach(s => $(s).classList.toggle('hidden', s !== id)); }
  function showSetup() {
    state = 'setup'; show('setup');
    $('setupMode').innerHTML = modeCard(cfg.set, 'div');
    $('nameIn').value = cfg.name;
    $('segColor').innerHTML = COLORS.map(c => `<button data-v="${c.key}" style="background:${c.color};box-shadow:0 4px 0 ${c.dark}" class="${c.key === cfg.color ? 'on' : ''}">${c.kanji}</button>`).join('');
    seg('segColor', v => { cfg.color = v; store.set('color', v); idleRace(); });
    // preload this set's pictures
    const sets = cfg.set.id === 'mix' ? QUESTION_SETS : [cfg.set], ids = new Set();
    sets.forEach(s => s.items.forEach(i => { ['img', 'who'].forEach(k => i.pic[k] && ids.add(i.pic[k])); }));
    ['p_yes', 'p_no'].forEach(x => ids.add(x)); ids.forEach(id => { if (STICKERS.has(id)) { const im = new Image(); im.src = `img/stickers/${id}.webp`; } });
    idleRace();
  }
  function seg(id, fn) { const el = $(id); el.querySelectorAll('button').forEach(b => b.onclick = () => { sfx('click', 0.5); el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.v); }); }
  seg('segLen', v => cfg.len = +v); seg('segCpu', v => cfg.cpu = +v);
  $('btnBack').onclick = () => { sfx('click', 0.5); showTitle(); };
  $('btnStart').onclick = () => startRace();
  $('btnAgain').onclick = () => startRace();
  $('btnMenu').onclick = () => { sfx('click', 0.5); showTitle(); };
  $('btnHome').onclick = () => { if (confirmQuit()) showTitle(); };
  function confirmQuit() { return true; }
  $('btnSound').onclick = () => { ac(); setMuted(!muted); };
  $('btnFull').onclick = () => { const d = document; if (!d.fullscreenElement) (d.documentElement.requestFullscreen || (() => { })).call(d.documentElement).catch?.(() => { }); else d.exitFullscreen(); };
  $('nameIn').addEventListener('input', e => { cfg.name = e.target.value.trim(); store.set('name', cfg.name); });
  $('nameIn').addEventListener('keydown', e => { if (e.key === 'Enter') startRace(); e.stopPropagation(); });

  /* ---------- racers ---------- */
  function buildRacers() {
    const me = COLORS.find(c => c.key === cfg.color) || COLORS[0];
    const others = COLORS.filter(c => c !== me);
    const lanes = [others[0], me, others[1], others[2]];
    const names = cpuNames(); let n = 0;
    racers = lanes.map((c, i) => Scene.Course.pose({ ...c, lane: i, leg: 1, a: 0, phi: 0, v: 0, extra: 0, stumble: 0, nice: 0, phase: rnd() * 6, cyc: 0, beat: 0, boost: 0, streak: 0,
      isPlayer: c === me, name: c === me ? (cfg.name || 'MY TEAM') : names[n++], aiT: 1.5 + rnd() * 1.5, finished: false, finishT: 0 }));
    player = racers.find(r => r.isPlayer);
  }
  function idleRace() {
    Scene.Course.setup(cfg.len); trackLen = Scene.Course.total; buildRacers();
    Scene.setRace({ boats: racers });
  }

  /* ---------- race flow ---------- */
  function startRace() {
    ac(); stopVoice(); sfx('click', 0.6);
    $('nameIn').blur();
    idleRace();
    lbJob = null; cancelAnimationFrame(lbAnim); q = null; locked = true; qCount = 0; answered = 0; correctN = 0; streak = 0; missed = []; raceT = 0; endT = 0;
    deck = makeDeck(cfg.set);
    show(null); $('hud').classList.remove('hidden'); $('btnHome').classList.remove('hidden');
    $('setup').classList.add('hidden'); $('results').classList.add('hidden');
    document.documentElement.style.setProperty('--setc', cfg.set.color);
    dockIdle('よーい…'); updateCombo(); $('dist').textContent = `あと ${Math.round(trackLen)}m`;
    $('trackTurn').style.left = (Scene.Course.out / trackLen * 100) + '%';
    state = 'countdown'; countT = 2.6; lastCount = 4; crowd(true); Scene.showLabels();
    banner('よーい…'); drum(0.5, true);
  }
  function banner(html, cls = '') { const b = $('banner'); b.className = ''; b.innerHTML = html; void b.offsetWidth; b.className = 'show ' + cls; }
  function popup(text, cls = '', b = player) {
    const p = b === player ? { x: 640, y: 300 } : Scene.screenOf(b, 3.6); const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
    el.style.left = (p ? Math.max(120, Math.min(1160, p.x)) : 640) + 'px'; el.style.top = (p ? Math.max(70, p.y - 10) : 180) + 'px';
    $('popups').appendChild(el); setTimeout(() => el.remove(), 1200);
  }
  function go() { state = 'race'; banner('ドン！<small>こげ！ ヨーイサー！</small>'); drum(0.6, true); dora(0.25, true); nextQ(); }

  function dockIdle(msg) {
    $('card').innerHTML = `<div class="pic-one">${stk('peiron')}</div>`;
    $('qtop').textContent = ''; $('qbot').textContent = ''; $('qarea').classList.remove('three');
    $('qline').className = ''; $('qline').innerHTML = msg ? `<span class="waitmsg" style="color:var(--ink);text-shadow:none">${msg}</span>` : `<span style="font-family:var(--jp);font-weight:900;font-size:30px">ゲームを えらんでね！</span>`;
    document.querySelectorAll('.choice').forEach(b => { b.disabled = true; b.className = 'choice ' + (b.dataset.i === '0' ? 'c1' : 'c2') + ' dim'; b.querySelector('.t').textContent = ''; });
  }
  function highlightCue(text, cue) {
    let h = esc(text);
    if (cue) { const c = esc(cue); const i = h.indexOf(c); if (i >= 0) h = h.slice(0, i) + `<span class="cue">${c}</span>` + h.slice(i + c.length); }
    return h;
  }
  function nextQ() {
    q = deck.next(qCount); qCount++;
    const setc = (q._set || cfg.set).color; $('card').style.setProperty('--setc', setc);
    $('card').innerHTML = renderPic(q.pic); $('card').classList.remove('pop'); void $('card').offsetWidth; $('card').classList.add('pop');
    $('qtop').innerHTML = q.top ? highlightCue(q.top, q.cue) : '';
    $('qbot').textContent = q.bot || '';
    $('qarea').classList.toggle('three', !!(q.top || q.bot));
    const pre = q.top ? q.pre : highlightCue(q.pre, q.cue), post = q.top ? q.post : highlightCue(q.post, q.cue);
    $('qline').innerHTML = `<span class="qt">${pre}<span class="blank" id="blank"></span>${post}</span>`;
    const len = (q.pre + q.post).length + Math.max(q.correct.length, q.wrong.length);
    $('qline').className = len > 38 ? 'tiny' : len > 30 ? 'small' : '';
    const ch = shuffle([q.correct, q.wrong]); q._choices = ch;
    document.querySelectorAll('.choice').forEach((b, i) => { b.disabled = false; b.className = 'choice ' + (i ? 'c2' : 'c1') + (Math.max(ch[0].length, ch[1].length) > 11 ? ' small' : '');
      b.querySelector('.t').textContent = ch[i]; });
    locked = false; qShownT = raceT;
  }
  function choose(i) {
    if (state !== 'race' || locked || !q) return; locked = true; ac();
    const ok = q._choices[i] === q.correct; answered++;
    const bl = $('blank'); bl.textContent = q.correct; bl.classList.add(ok ? 'fill' : 'fix');
    const btns = document.querySelectorAll('.choice');
    btns.forEach(b => b.disabled = true);
    btns[i].classList.add(ok ? 'right' : 'wrong'); if (!ok) btns[1 - i].classList.add('right');
    say(q.say);
    if (ok) {
      correctN++; streak++;
      const boosted = streak >= 3; kick(player, boosted, quick(raceT - qShownT));
      if (player.leg === 'turn') { player.nice = 1.6; popup('ナイスターン！', 'gold'); }
      sfx('correct', 0.2);
      Scene.splash(player, 14, 1.2, boosted);
      if (player.leg !== 'turn') { if (boosted) { sfx('boost', 0.3); Scene.shake(0.6); popup(streak === 3 ? 'ヨーイサー！' : streak + ' れんぞく！', 'gold'); }
        else popup(pick(['Nice!', 'Great!', 'Good!', 'Yes!', 'いいね！', 'やったね！'])); }
    } else {
      streak = 0; stumble(player); missed.push(q); deck.again(q, qCount); if (player.leg === 'turn') player.nice = -1.2;
      sfx('wrong', 0.28); Scene.splash(player, 26, 0.6); popup('おしい！', 'bad');
    }
    updateCombo();
    setTimeout(() => {
      if (state !== 'race') return;
      if (player.finished) { $('card').innerHTML = `<div class="pic-one">${stk('peiron')}</div>`; $('qtop').textContent = ''; $('qbot').textContent = ''; $('qarea').classList.remove('three');
        $('qline').className = ''; $('qline').innerHTML = '<span style="font-family:var(--jp);font-weight:900">ゴール！ おつかれさま！</span>';
        btns.forEach(b => { b.className = 'choice dim ' + (b.dataset.i === '0' ? 'c1' : 'c2'); b.querySelector('.t').textContent = ''; }); }
      else nextQ();
    }, ok ? 900 : 2000);
  }
  document.querySelectorAll('.choice').forEach((b, i) => b.addEventListener('click', () => choose(i)));
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '1' || e.key === 'ArrowLeft') choose(0);
    if (e.key === '2' || e.key === 'ArrowRight') choose(1);
    if (e.key === 'Enter' && state === 'setup') startRace();
  });
  function updateCombo() {
    const pips = document.querySelectorAll('#combo span'); pips.forEach((p, k) => p.classList.toggle('on', k < Math.min(streak, 3)));
    $('combo').classList.toggle('boost', streak >= 3);
  }
  const prog = r => Scene.Course.progress(r);
  function ranking() { return racers.slice().sort((a, b) => (a.finished && b.finished) ? a.finishT - b.finishT : a.finished ? -1 : b.finished ? 1 : prog(b) - prog(a)); }
  const fmtT = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;

  /* ---------- results ---------- */
  function showResults() {
    state = 'results'; crowd(false);
    const order = ranking(), place = order.indexOf(player) + 1;
    const acc = answered ? Math.round(correctN / answered * 100) : 0;
    const best = store.get('best', {}); const prev = best[cfg.set.id];
    const isBest = !prev || place < prev.place || (place === prev.place && player.finishT < prev.time);
    if (isBest) { best[cfg.set.id] = { place, time: +player.finishT.toFixed(1) }; store.set('best', best); }
    const jp = ['やったね！ 1いだ！', 'すごい！ 2い！', 'がんばった！ 3い！', 'よく がんばったね！'][place - 1];
    const stars = acc >= 90 ? 3 : acc >= 70 ? 2 : 1;
    $('resHead').innerHTML = `<div class="medal big m${place}"><b>${place}</b><i>${['st', 'nd', 'rd', 'th'][place - 1]}</i></div>
      <div class="rh"><div class="msg">${jp}</div><div class="stars3">${[1, 2, 3].map(k => `<span class="${k <= stars ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.18}s">★</span>`).join('')}</div></div>`;
    const heights = [100, 86, 76, 68], podOrder = [1, 0, 2, 3];
    $('podium').innerHTML = podOrder.map(k => { const r = order[k]; if (!r) return '';
      return `<div class="pod ${r.isPlayer ? 'me' : ''}" style="height:${heights[k]}px;background:${r.color}"><b>${ord(k + 1)}</b><span>${esc(r.name)}</span>${r.finished ? `<em>${fmtT(r.finishT)}</em>` : ''}</div>`; }).join('');
    $('resStats').innerHTML = `<span class="st"><small>せいかい</small><b>${correctN}</b><small>/ ${answered}</small></span><span class="st"><small>タイム</small><b>${fmtT(player.finishT)}</b></span>${isBest ? '<span class="best">ベスト！</span>' : ''}`;
    $('factRes').textContent = fact();
    const seen = new Set(), list = missed.filter(m => !seen.has(m.say) && seen.add(m.say));
    $('review').innerHTML = list.length ? list.map((m, k) => {
      const full = (m.top ? esc(m.top) + ' ' : '') + esc(m.pre) + `<b>${esc(m.correct)}</b>` + esc(m.post) + (m.bot ? ' ' + esc(m.bot) : '');
      return `<div class="rev"><button data-k="${k}"><svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="#fff"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg></button><span>${full}</span></div>`; }).join('') : '<div class="perfect">パーフェクト！ ぜんぶ せいかい！</div>';
    $('review').querySelectorAll('button').forEach(b => b.onclick = () => say(list[+b.dataset.k].say));
    showBoard();
    show('results'); $('hud').classList.add('hidden'); $('btnHome').classList.add('hidden');
    if (place <= 3) { sfx('fanfare', 0.35); confetti(); }
    say(place === 1 ? 'You win!' : place <= 3 ? 'Great!' : 'Good try!');
  }
  /* ---------- online TOP-100 board ---------- */
  const lbKey = () => [cfg.len >= 1 ? 'long' : 'short', cfg.set.id];
  function submitTime(t) {
    if (!window.Leaderboard || !Leaderboard.enabled) return null;
    const [len, mode] = lbKey();
    return Leaderboard.submit(len, mode, Math.round(t * 1000)).catch(e => ({ error: e }));
  }
  function blip(f, vol = 0.05) {
    if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(); o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.07); o.connect(g).connect(master); o.start(t); o.stop(t + 0.08);
  }
  let lbAnim = 0;
  function showBoard() {
    cancelAnimationFrame(lbAnim);
    const on = !!(window.Leaderboard && Leaderboard.enabled);
    $('lb').classList.toggle('hidden', !on); document.querySelector('.resRow').classList.toggle('withLb', on);
    if (!on) return;
    $('lbSub').textContent = `${cfg.set.en}　・　${cfg.len >= 1 ? 'ながい コース' : 'みじかい コース'}`;
    $('lbList').innerHTML = ''; $('lbList').style.height = '0px'; $('lbNote').className = ''; $('lbNote').textContent = 'よみこみちゅう…';
    const job = lbJob || submitTime(player.finishT), myRace = racers;
    job.then(res => { if (state === 'results' && racers === myRace) drawBoard(res); });
  }
  function drawBoard(res) {
    const note = $('lbNote'), list = $('lbList'), view = $('lbView'), ROW = 40, ms = Math.round(player.finishT * 1000);
    if (!res || res.error) { note.textContent = 'ランキングに つながりません'; return; }
    const row = (k, t, me) => { const d = document.createElement('div'); d.className = 'lbr' + (me ? ' me' : '');
      d.innerHTML = `<span class="rk"></span><span class="tm">${fmtT(t / 1000)}</span>${me ? '<i>きみ！</i>' : ''}`; d.setRank = r => { d.querySelector('.rk').textContent = r + 1; d.className = d.className.replace(/ r[123]\b/g, '') + (r < 3 ? ' r' + (r + 1) : ''); };
      d.setPos = p => { d.style.transform = `translateY(${p * ROW}px)`; }; d.setRank(k); d.setPos(k); list.appendChild(d); return d; };
    const scrollTo = p => { view.scrollTop = Math.max(0, Math.min(list.offsetHeight - view.clientHeight + 12, p * ROW - view.clientHeight / 2 + ROW / 2)); };
    if (res.rank < 0) {                       // not on the board this time: show the top, and how close they were
      res.after.forEach((t, k) => row(k, t)); list.style.height = (res.after.length * ROW + 12) + 'px'; view.scrollTop = 0;
      const cut = res.after[Leaderboard.N - 1];
      note.textContent = cut ? `100いまで あと ${((ms - cut) / 1000).toFixed(3)}びょう！` : '';
      return;
    }
    // made the board: start at the bottom and climb past everyone to the new position
    const others = res.before.slice(0, Leaderboard.N), start = Math.min(others.length, Leaderboard.N - 1), goal = res.rank;
    const rows = others.map((t, k) => row(k, t)); const me = row(start, ms, true);
    list.style.height = (Math.min(Leaderboard.N, others.length + 1) * ROW + 12) + 'px';
    const shift = p => rows.forEach((r, k) => { const pos = k >= p ? k + 1 : k; if (r._pos !== pos) { r._pos = pos; r.setPos(pos); r.setRank(pos); r.classList.toggle('out', pos >= Leaderboard.N); } });
    shift(start); scrollTo(start);
    const D = Math.min(4.2, 0.8 + (start - goal) * 0.04) * 1000, t0 = performance.now() + 500; let lastR = start;
    const ease = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    const step = now => {
      const u = Math.max(0, Math.min(1, (now - t0) / D)), p = start + (goal - start) * ease(u), r = Math.round(p);
      me.setPos(p); scrollTo(p); shift(Math.ceil(p - 0.001));
      if (r !== lastR) { lastR = r; me.setRank(r); blip(520 + (1 - (r - goal) / Math.max(1, start - goal)) * 620); }
      if (u < 1) { lbAnim = requestAnimationFrame(step); return; }
      me.setRank(goal); me.classList.add('land'); if (goal < 4) view.scrollTo({ top: 0, behavior: 'smooth' }); dora(0.18, true); sfx('correct', 0.2);
      note.className = 'good'; note.textContent = goal === 0 ? 'しんきろく！ 1い！' : `ランクイン！ ${goal + 1}い！`;
    };
    lbAnim = requestAnimationFrame(step);
  }
  function confetti() {
    const c = $('confetti'), x = c.getContext('2d'); c.width = 1280; c.height = 600;
    const cols = ['#e63946', '#ffd23f', '#2fa7ff', '#22c55e', '#ff7b00', '#f472b6'];
    const ps = Array.from({ length: 160 }, () => ({ x: rnd() * 1280, y: -20 - rnd() * 400, vx: (rnd() - 0.5) * 120, vy: 120 + rnd() * 160, r: rnd() * 6, w: 8 + rnd() * 8, c: pick(cols) }));
    let t0 = performance.now();
    (function f(t) { const dt = Math.min(0.05, (t - t0) / 1000); t0 = t; x.clearRect(0, 0, 1280, 600); let alive = 0;
      for (const p of ps) { p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 6; if (p.y < 640) alive++;
        x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -3, p.w, 6); x.restore(); }
      if (alive && state === 'results') requestAnimationFrame(f); else x.clearRect(0, 0, 1280, 600); })(t0);
  }

  /* ---------- main loop ---------- */
  function update(dt) {
    if (state === 'countdown') { countT -= dt; if (countT <= 0) go(); }
    const racing = state === 'race', C = Scene.Course;
    if (racing) raceT += dt;
    for (const r of racers) {
      if (racing && !r.isPlayer && !r.finished) {
        r.aiT -= dt;
        if (r.aiT <= 0) { const d = CPU[cfg.cpu];
          if (rnd() < d.acc) { r.streak++; kick(r, r.streak >= 3); if (r.leg === 'turn') r.nice = 1.6; } else { r.streak = 0; stumble(r); }
          const ahead = prog(r) - prog(player);   // keep the race close and exciting
          r.aiT = d.int * (0.75 + rnd() * 0.55) * (ahead > 35 ? 1.4 : ahead > 15 ? 1.15 : ahead < -45 ? 0.85 : 1); }
      }
      r.boost = Math.max(0, r.boost - dt); r.stumble = Math.max(0, r.stumble - dt);
      r.extra = Math.max(0, r.extra - FADE * dt);
      let want = r.finished ? 4 : (BASE * (r.stumble > 0 ? 0.4 : 1) + r.extra);
      if (r.leg === 'turn') want = 2.2;                       // the long boat almost stops while it pivots
      if (!racing && state !== 'results') want = 0;
      r.v += (want - r.v) * Math.min(1, dt * 2.4);
      const p0 = prog(r);
      if (racing || state === 'results') {
        if (r.leg === 1) { r.a += r.v * dt; if (r.a >= C.out) { r.leg = 'turn'; r.phi = 0; r.nice = 0;
            if (r.isPlayer) { banner('ターン！<small>ブイを まわれ！</small>'); sfx('whoosh', 0.35); sfx('cheer', 0.25); Scene.showLabels(); } } }
        else if (r.leg === 'turn') {
          const base = Math.PI / (r.isPlayer ? 3.2 : TURN_T[2 - cfg.cpu] * (0.9 + rnd() * 0.2));
          const k = r.nice > 0 ? 1.9 : r.nice < 0 ? 0.55 : 1; r.nice = r.nice > 0 ? Math.max(0, r.nice - dt) : Math.min(0, r.nice + dt);
          r.phi += base * k * dt;
          if (r.phi >= Math.PI) { r.phi = Math.PI; r.leg = 2; r.a = 0; r.v = Math.max(r.v, 3); if (r.isPlayer) { popup('ヨーイサー！', 'gold'); Scene.showLabels(); } } }
        else r.a += r.v * dt;
      }
      Scene.Course.pose(r);
      const rateT = (state === 'title' || state === 'setup' || state === 'countdown') ? 0.8 : Math.min(5.9, 4.2 + r.v * 0.07);
      r.rate = r.rate === undefined ? rateT : r.rate + (rateT - r.rate) * Math.min(1, dt / 1.6); r.phase += dt * r.rate;
      // 「ドーン、ドン、ジャーン、ジャン！」 — four beats per paddle stroke
      const beat = Math.floor(r.phase / (Math.PI / 2));
      if (beat !== r.beat) { r.beat = beat;
        if (r.v > 1.5 && beat % 4 === 0) Scene.splash(r, 5);
        if (r.isPlayer && r.v > 1.2 && racing) { const b = beat % 4, loud = Math.min(1, 0.55 + r.v / 30);
          if (b === 0) drum(0.5 * loud, true); else if (b === 1) drum(0.36 * loud, false);
          else if (b === 2) dora(0.16 * loud, true); else dora(0.11 * loud, false); } }
      if (racing && !r.finished && prog(r) >= trackLen) {
        r.finished = true; const p1 = prog(r); r.finishT = Math.round((raceT - (p1 > p0 ? dt * (p1 - trackLen) / (p1 - p0) : 0)) * 1000) / 1000;
        if (r.isPlayer) lbJob = submitTime(r.finishT);
        if (r.isPlayer) { const pl = ranking().indexOf(r) + 1; banner(`ゴール！<small>${pl}い！</small>`); sfx('cheer', 0.4); dora(0.25, true); say('Goal!'); endT = 2.6; }
      }
    }
    if (racing && player.finished) { endT -= dt; if (endT <= 0) showResults(); }
    Scene.update(dt, player, { idle: state === 'title' || state === 'setup' });
    if (racing || state === 'countdown') hud();
  }
  function hud() {
    const order = ranking(), pl = order.indexOf(player) + 1, pos = $('pos');
    if (pos.dataset.p != pl) { pos.dataset.p = pl; pos.className = 'p' + pl; pos.innerHTML = `<b>${pl}</b><i>${['th', 'st', 'nd', 'rd'][pl] || 'th'}</i>`; }
    const tb = $('trackBoats');
    if (tb.children.length !== racers.length) tb.innerHTML = racers.map(r => `<div class="${r.isPlayer ? 'me' : ''}" style="background:${r.color}"></div>`).join('');
    racers.forEach((r, k) => tb.children[k].style.left = (Math.min(1, prog(r) / trackLen) * 100) + '%');
    $('dist').textContent = player.finished ? 'ゴール！' : `ゴールまで ${Math.max(0, Math.round(trackLen - prog(player)))}m`;
  }
  let last = performance.now();
  function frame(t) { const dt = Math.min(0.05, (t - last) / 1000); last = t; requestAnimationFrame(frame);
    try { update(dt); Scene.render(dt); } catch (e) { if (!frame.warned) { console.error(e); frame.warned = true; } } }

  /* ---------- layout ---------- */
  function fit() {
    const sc = Math.min(innerWidth / 1280, innerHeight / 600);
    $('stage').style.transform = `translate(-50%,-50%) scale(${sc})`;
    Scene.resize(sc);
  }
  Scene.init($('scene'));
  addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => Scene.resize(Math.min(innerWidth / 1280, innerHeight / 600)));
  // Only ask questions whose pictures have been drawn, so the picture always matches the sentence.
  const picsOf = p => [p.img, p.who, p.type === 'ans' ? (p.yes ? 'p_yes' : 'p_no') : null].filter(Boolean);
  QUESTION_SETS.forEach(s => { const ok = s.items.filter(it => picsOf(it.pic).every(id => STICKERS.has(id)));
    if (ok.length >= 6) s.items = ok;
    if (!STICKERS.has(s.icon)) { const f = s.items.find(it => STICKERS.has(it.pic.img)); if (f) s.icon = f.pic.img; } });
  // stamp days for the week pictures
  QUESTION_SETS.forEach(s => s.items.forEach((it, k) => { if (it.pic.type === 'week') it.pic.on = shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, it.pic.days).sort(); }));
  setMuted(muted); fit(); showTitle(); requestAnimationFrame(frame);
  window.PeironDebug = { get state() { return state; }, choose, get q() { return q; }, get racers() { return racers; }, cfg, startRace, showResults, get player() { return player; } };
})();
