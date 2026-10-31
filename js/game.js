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
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = muted ? 0 : 1; master.connect(AC.destination); loadSfx(); } catch (e) { } }
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
    { key: 'red', color: '#e23b3b', dark: '#8e1c1c', kanji: '赤', cpu: 'Dejima' },
    { key: 'blue', color: '#2f6fe0', dark: '#1a3f88', kanji: '青', cpu: 'Oura' },
    { key: 'yellow', color: '#f2b71f', dark: '#9a6f05', kanji: '黄', cpu: 'Inasa' },
    { key: 'green', color: '#22a35a', dark: '#13643a', kanji: '緑', cpu: 'Tomachi' }];
  const CPU = [{ int: 5.6, acc: 0.72 }, { int: 4.4, acc: 0.82 }, { int: 3.3, acc: 0.9 }];
  // Rowing model: every boat always rows at BASE speed. Right answers add a speed boost that fades away;
  // 3 in a row adds a bigger BOOST. A wrong answer makes the crew stumble for a moment (they never stop).
  const BASE = 5, KICK = 9, COMBO_KICK = 5, MAX_EXTRA = 20, FADE = 1.8;
  function kick(r, combo) { r.extra = Math.min(MAX_EXTRA, r.extra + KICK + (combo ? COMBO_KICK : 0)); r.boost = combo ? 2.6 : 0; }
  function stumble(r) { r.extra = 0; r.boost = 0; r.stumble = 1.3; }

  /* ---------- state ---------- */
  const cfg = { set: null, len: 1000, cpu: 1, color: store.get('color', 'red'), name: store.get('name', '') };
  let state = 'title', racers = [], player = null, trackLen = 0, turned = false;
  let q = null, locked = true, qCount = 0, answered = 0, correctN = 0, streak = 0, missed = [], raceT = 0, deck = null, endT = 0, countT = 0, lastCount = 4;

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
    racers = lanes.map((c, i) => ({ ...c, lane: i, x: Scene.LANES[i], z: 0, v: 0, extra: 0, stumble: 0, phase: rnd() * 6, cyc: 0, boost: 0, streak: 0,
      isPlayer: c === me, name: c === me ? (cfg.name || 'MY TEAM') : c.cpu, aiT: 1.5 + rnd() * 1.5, finished: false, finishT: 0 }));
    player = racers.find(r => r.isPlayer);
  }
  function idleRace() {
    buildRacers(); trackLen = cfg.len;
    Scene.setRace({ boats: racers, turnZ: trackLen / 2, finishZ: trackLen + Scene.BOAT_L });
  }

  /* ---------- race flow ---------- */
  function startRace() {
    ac(); stopVoice(); sfx('click', 0.6);
    $('nameIn').blur();
    idleRace(); turned = false;
    q = null; locked = true; qCount = 0; answered = 0; correctN = 0; streak = 0; missed = []; raceT = 0; endT = 0;
    deck = makeDeck(cfg.set);
    show(null); $('hud').classList.remove('hidden'); $('btnHome').classList.remove('hidden');
    $('setup').classList.add('hidden'); $('results').classList.add('hidden');
    document.documentElement.style.setProperty('--setc', cfg.set.color);
    dockIdle('よーい…'); updateCombo();
    state = 'countdown'; countT = 3.2; lastCount = 4; crowd(true);
    say('Ready?');
  }
  function banner(html, cls = '') { const b = $('banner'); b.className = ''; b.innerHTML = html; void b.offsetWidth; b.className = 'show ' + cls; }
  function popup(text, cls = '', b = player) {
    const p = Scene.screenOf(b, 3.6); const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
    el.style.left = (p ? Math.max(120, Math.min(1160, p.x)) : 640) + 'px'; el.style.top = (p ? Math.max(70, p.y - 10) : 180) + 'px';
    $('popups').appendChild(el); setTimeout(() => el.remove(), 1200);
  }
  function go() { state = 'race'; banner('GO!<small>こげ！</small>'); sfx('gong', 0.8); say('Go!'); nextQ(); }

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
    locked = false;
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
      const boosted = streak >= 3; kick(player, boosted);
      sfx('correct', 0.55); sfx('taiko2', 0.9);
      Scene.splash(player, 14, 1.2, boosted);
      if (boosted) { sfx('boost', 0.6); Scene.shake(0.6); popup(streak === 3 ? 'BOOST!' : streak + ' COMBO!', 'gold'); }
      else popup(pick(['Nice!', 'Great!', 'Good!', 'Yes!', 'いいね！']));
    } else {
      streak = 0; stumble(player); missed.push(q); deck.again(q, qCount);
      sfx('wrong', 0.6); Scene.splash(player, 26, 0.6); popup('ざんねん…', 'bad');
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
  function ranking() { return racers.slice().sort((a, b) => (a.finished && b.finished) ? a.finishT - b.finishT : a.finished ? -1 : b.finished ? 1 : b.z - a.z); }

  /* ---------- results ---------- */
  function showResults() {
    state = 'results'; crowd(false);
    const order = ranking(), place = order.indexOf(player) + 1;
    const acc = answered ? Math.round(correctN / answered * 100) : 0;
    const best = store.get('best', {}); const prev = best[cfg.set.id];
    const isBest = !prev || place < prev.place || (place === prev.place && player.finishT < prev.time);
    if (isBest) { best[cfg.set.id] = { place, time: +player.finishT.toFixed(1) }; store.set('best', best); }
    const head = ['🥇 1st place!', '🥈 2nd place!', '🥉 3rd place!', '4th place'][place - 1];
    const jp = ['やったね！ 1いだ！', 'すごい！ 2い！', 'がんばった！ 3い！', 'つぎは がんばろう！'][place - 1];
    $('resHead').innerHTML = `${head}<small>${jp}</small>`;
    const heights = [112, 92, 76, 64], podOrder = [1, 0, 2, 3];
    $('podium').innerHTML = podOrder.map(k => { const r = order[k]; if (!r) return '';
      return `<div class="pod ${r.isPlayer ? 'me' : ''}" style="height:${heights[k]}px;background:${r.color}"><b>${ord(k + 1)}</b><span>${esc(r.name)}</span></div>`; }).join('');
    $('resStats').innerHTML = `せいかい ${correctN} / ${answered}（${acc}%） ・ タイム ${player.finishT.toFixed(1)}びょう${isBest ? '<span class="best">ベスト！</span>' : ''}`;
    const seen = new Set(), list = missed.filter(m => !seen.has(m.say) && seen.add(m.say));
    $('review').innerHTML = list.length ? list.map((m, k) => {
      const full = (m.top ? esc(m.top) + ' ' : '') + esc(m.pre) + `<b>${esc(m.correct)}</b>` + esc(m.post) + (m.bot ? ' ' + esc(m.bot) : '');
      return `<div class="rev"><button data-k="${k}">🔊</button><span>${full}</span></div>`; }).join('') : '<div class="perfect">パーフェクト！ ぜんぶ せいかい！ 🎉</div>';
    $('review').querySelectorAll('button').forEach(b => b.onclick = () => say(list[+b.dataset.k].say));
    show('results'); $('hud').classList.add('hidden'); $('btnHome').classList.add('hidden');
    if (place <= 3) { sfx('fanfare', 0.7); confetti(); }
    say(place === 1 ? 'You win!' : place <= 3 ? 'Great!' : 'Good try!');
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
    if (state === 'countdown') {
      countT -= dt; const n = Math.ceil(countT - 0.2);
      if (n < lastCount && n > 0 && n <= 3) { lastCount = n; banner(String(n)); sfx('taiko', 1); }
      if (countT <= 0) go();
    }
    const racing = state === 'race';
    if (racing) raceT += dt;
    for (const r of racers) {
      if (racing && !r.isPlayer && !r.finished) {
        r.aiT -= dt;
        if (r.aiT <= 0) { const d = CPU[cfg.cpu];
          if (rnd() < d.acc) { r.streak++; kick(r, r.streak >= 3); } else { r.streak = 0; stumble(r); }
          const ahead = r.z - player.z;   // keep the race close and exciting
          r.aiT = d.int * (0.75 + rnd() * 0.55) * (ahead > 60 ? 1.35 : ahead < -60 ? 0.8 : 1); }
      }
      r.boost = Math.max(0, r.boost - dt); r.stumble = Math.max(0, r.stumble - dt);
      r.extra = Math.max(0, r.extra - FADE * dt);
      let want = r.finished ? 5 : (BASE * (r.stumble > 0 ? 0.4 : 1) + r.extra);
      if (!racing && state !== 'results') want = 0;
      r.v += (want - r.v) * Math.min(1, dt * 2.4); r.z += r.v * dt;
      r.phase += dt * ((state === 'title' || state === 'setup' || state === 'countdown') ? 0.8 : 1.6 + r.v * 0.42);
      const cyc = Math.floor(r.phase / (Math.PI * 2));
      if (cyc !== r.cyc) { r.cyc = cyc; if (r.v > 1.5) { Scene.splash(r, 5); if (r.isPlayer) { sfx('taiko', 0.25 + Math.min(0.35, r.v / 50)); if (cyc % 4 === 0) sfx('gong', 0.12); } } }
      if (racing && !r.finished && r.z >= trackLen) {
        r.finished = true; r.finishT = raceT;
        if (r.isPlayer) { const pl = ranking().indexOf(r) + 1; banner(`GOAL!<small>${pl}い ゴール！</small>`); sfx('cheer', 0.7); sfx('gong', 0.8); say('Goal!'); endT = 2.6; }
      }
    }
    if (racing && !turned && player.z >= trackLen / 2) { turned = true; Scene.startTurn(); banner('TURN!<small>ターン！</small>'); sfx('whoosh', 0.8); sfx('cheer', 0.35); }
    if (racing && player.finished) { endT -= dt; if (endT <= 0) showResults(); }
    Scene.update(dt, player, { idle: state === 'title' || state === 'setup' });
    if (racing || state === 'countdown') hud();
  }
  function hud() {
    const order = ranking(), pl = order.indexOf(player) + 1, pos = $('pos');
    if (pos.dataset.p != pl) { pos.dataset.p = pl; pos.className = 'p' + pl; pos.innerHTML = `<b>${pl}</b><i>${['th', 'st', 'nd', 'rd'][pl] || 'th'}</i>`; }
    const tb = $('trackBoats');
    if (tb.children.length !== racers.length) tb.innerHTML = racers.map(r => `<div class="${r.isPlayer ? 'me' : ''}" style="background:${r.color}"></div>`).join('');
    racers.forEach((r, k) => tb.children[k].style.left = (Math.min(1, r.z / trackLen) * 100) + '%');
  }
  let last = performance.now();
  function frame(t) { const dt = Math.min(0.05, (t - last) / 1000); last = t; update(dt); Scene.render(dt); requestAnimationFrame(frame); }

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
