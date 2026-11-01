# ペーロンレース Peiron Race

An English grammar racing game for Japanese elementary students, set at the Nagasaki Peiron boat race.
Pick the right word and your crew rows faster. Three correct answers in a row give a boost.

**Play:** https://nagasakimark.github.io/peiron/ (or open `index.html`)

Runs in the browser with no install. It works on Chromebooks, tablets and phones.

## Grammar

Based on *Let's Try 1・2* and *New Horizon Elementary 5・6 (2024)*.

| Mode | Practises |
|---|---|
| can / can't | I can swim. / I can't swim. |
| in / on / under / by | The cat is in the box. |
| Yes, I do / can / am | Answering Can you…? Do you…? Are you…? |
| What? Where? When? | Question words |
| go / went | Past tense, is / was |
| always / never | always, usually, sometimes, never |
| a / an・-s | a / an, one apple / two apples |
| Mix | All of the above |

Each mode has a ルールを みる button on the setup screen with a short reminder of the rule.

## How it works

- Choose a mode, a boat colour, a course length and how strong the other crews are.
- Each question is a two-button choice. Keys `1` / `2` or `←` / `→` also work.
- A wrong answer makes the crew stumble. It comes back a few questions later and is listed on the results screen.
- Each mode has an optional online leaderboard of the top 100 times. See [LEADERBOARD.md](LEADERBOARD.md).

## Editing the questions

All sentences are in `js/questions.js`. A question only appears once its picture exists in `img/stickers/`.

## Making pictures and voices (optional)

The scripts in `tools/` use fal.ai. They read the key from the `FAL_KEY` environment variable. Never commit it.

```
node tools/extract_sentences.js      # after editing questions.js
python tools/gen_voice.py            # record missing sentences (needs ffmpeg)
python tools/gen_stickers.py         # draw missing pictures listed in tools/stickers.json
node tools/finish_stickers.js        # SVG to transparent WebP
python tools/build_assets.py         # update js/assets.js
```

## Credits

Pictures generated with fal.ai (Recraft). Race course based on the real Nagasaki Peiron Championship at Nagasaki Port.
