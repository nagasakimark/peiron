# Online leaderboard (TOP 100 times)

Each game mode has two boards, one per course: **ながい** (`long`, 1150 m) and **みじかい** (`short`, 575 m).
A board keeps only finish times, in milliseconds. It stores no names or devices, and nothing that identifies a child.

When a race ends, the game asks for the board's fastest 100 times. If the new time is faster than the 100th, the
game adds it. The results screen then shows the time starting at rank 100 and climbing past the others to its place.

## Why Realtime Database (not Firestore)

|                         | Realtime Database (chosen)                                | Firestore                                                    |
|-------------------------|-----------------------------------------------------------|--------------------------------------------------------------|
| Free limit is counted by| data downloaded (10 GB/month)                             | documents read (50,000/day)                                  |
| Reading a top-100 board | one ~3 KB request                                         | 100 document reads (≈500 races/day before hitting the limit) |
| Rules can…              | allow only a "top 100" query, check every time is valid   | weaker per-entry checks                                      |
| Needs a library         | no (plain `fetch`)                                        | best with the Firebase SDK                                   |

## How little it uses

* **Per race:** 1 read (the top 100, about 3 KB). If the time makes the board, there is also 1 tiny write (a single number). Nothing loads on the title screen, and nothing stays connected.
* **Free plan (Spark):** 10 GB downloaded a month and 1 GB stored. 10 GB is roughly **2,000,000 finished races a month**.
  Storage grows only when someone makes a top 100, and that gets rarer over time. A million entries would still be under 50 MB.
* **Free plan:** 100 simultaneous connections. Each request lasts a fraction of a second, so even a whole class finishing at once is fine.
* **Cost:** the Spark plan has no card attached, so it can never charge you. If a limit were ever reached, the board would pause.
  The game would show 「ランキングに つながりません」 and keep working normally.

## Set it up (about 5 minutes)

1. Go to <https://console.firebase.google.com> → **Create a project** (e.g. `peiron-race`). You can turn Google Analytics off.
2. In the left menu: **Build → Realtime Database → Create Database**.
   * Location: **Singapore (asia-southeast1)**, the nearest to Japan.
   * Security rules: **Start in locked mode** → **Enable**.
3. Open the **Rules** tab. Replace everything with the contents of [`database.rules.json`](database.rules.json) → **Publish**.
4. Open the **Data** tab and copy the database URL at the top, e.g.
   `https://peiron-race-default-rtdb.asia-southeast1.firebasedatabase.app`
5. Paste it into [`js/lb-config.js`](js/lb-config.js):
   ```js
   window.PEIRON_LB_URL = window.PEIRON_LB_URL || 'https://peiron-race-default-rtdb.asia-southeast1.firebasedatabase.app';
   ```
   Commit and push. No API key is needed: the URL can be public because the rules decide what is allowed.
6. Play one race. In the **Data** tab you should see `boards → long → can → -Nxyz…: 41234`.

## What the rules allow

`database.rules.json` (tested against the official Firebase emulator):

* **Read:** only a board's fastest 100 times (`orderBy="$value"&limitToFirst=100`). Nobody can download a whole board or the whole database.
* **Write:** only **adding** a new time to a known board (`long`/`short` × `can, prep, ans, wh, past, freq, aan, mix`).
  * A time must be a whole number of milliseconds, at least 25 s on `long` or 12 s on `short`, and at most 30 minutes.
  * Nobody can change or delete an existing time, or wipe a board.
* Everything else is refused.

The game adds each time as its own entry, so two children finishing at the same moment can never overwrite each other.

## Looking after it

* **Usage:** the Realtime Database **Usage** tab shows downloads and storage.
* **Remove a cheated time / reset a board:** in the **Data** tab, hover the entry (or the whole board) and click the bin.
  You are the owner, so the console isn't limited by the rules.
* **New game mode:** add its id to the two `matches(/^(…)$/)` lists in the rules and publish again.
* **Change the fastest allowed times:** edit `25000` / `12000` in the rules. The fastest possible run is about 27 s on the long course.
* **Honest limit:** the game runs in the browser, so a determined person with developer tools could add a fake time.
  They could not erase anyone, and the time would still have to look possible. You can delete it in the console.

## Times and ties

Times are measured to the millisecond, at the exact moment the boat crosses the line. Speed no longer has a hard cap.
Each boost adds a little less the faster you already are, and quicker answers give a slightly bigger boost (±8%).
So good runs spread out instead of all hitting the same top speed. In a simulation of 4,000 players, the top 100 had about one tie.
With the old capped model, 15 of the top 100 shared a time with someone else. A real tie ranks below the time that was set first.
