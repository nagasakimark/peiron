/* Online TOP-100 time boards, kept in a Firebase Realtime Database through its REST API (no SDK).

   Data:  /boards/<long|short>/<mode>/<auto id> = finish time in milliseconds (an integer)
   Each qualifying time is ADDED as its own entry (append-only POST), so two players finishing at the
   same moment can never overwrite each other. Reads ask only for the fastest 100 (a query), so a read
   stays about 3 KB however big the board grows.

   Usage per finished race: 1 GET (about 3 KB). Only if the time makes the top 100: 1 POST (tiny).
   Leave PEIRON_LB_URL empty (js/lb-config.js) and the game simply hides the leaderboard. */
window.Leaderboard = (() => {
  const URL = String(window.PEIRON_LB_URL || '').trim().replace(/\/+$/, '');
  const N = 100;
  const [BASE, QS] = URL.split('?');                // (a query string is only used for the local emulator: ?ns=...)
  const path = (len, mode, q) => `${BASE}/boards/${len}/${mode}.json` + ([QS, q].filter(Boolean).length ? '?' + [QS, q].filter(Boolean).join('&') : '');
  function req(url, opt = {}, ms = 7000) {          // fetch with a timeout (school Wi-Fi can be slow)
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    return fetch(url, { cache: 'no-store', ...opt, signal: ac.signal }).finally(() => clearTimeout(t));
  }
  // the fastest 100 times, fastest first (a tie keeps the earlier time first: auto ids sort by time)
  async function get(len, mode) {
    const r = await req(path(len, mode, `orderBy=${encodeURIComponent('"$value"')}&limitToFirst=${N}`));
    if (!r.ok) throw new Error('leaderboard ' + r.status);
    const obj = await r.json() || {};
    return Object.keys(obj).filter(k => Number.isInteger(obj[k])).sort((a, b) => obj[a] - obj[b] || (a < b ? -1 : 1)).map(k => obj[k]).slice(0, N);
  }
  // Add `ms` if it makes the top 100. Resolves to { before, after, rank } (rank 0-based, -1 = not this time).
  async function submit(len, mode, ms) {
    const before = await get(len, mode);
    let rank = before.findIndex(x => ms < x); if (rank < 0) rank = before.length;    // a tie goes below the earlier time
    if (rank >= N) return { before, after: before, rank: -1 };
    const r = await req(path(len, mode), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ms) });
    if (!r.ok) throw new Error('leaderboard ' + r.status);
    const after = before.slice(0, rank).concat([ms], before.slice(rank)).slice(0, N);
    return { before, after, rank };
  }
  return { enabled: !!URL, N, get, submit };
})();
