# ペーロンレース Peiron Race

A Nagasaki Peiron boat race for elementary English. Choose the right word, and your crew rows faster.
Grammar from **Let's Try 1・2** and **New Horizon Elementary 5・6 (2024)**.

Play: open `index.html` (works by double-click too, or on GitHub Pages).

## The race course is real
The 長崎ペーロン選手権大会 is held off **Matsugae pier (松が枝)** in Nagasaki Harbour, and crews race out, turn round a buoy and come back.
- **Leg 1, heading north:** いなさやま (with its TV towers) ahead-left, こんぴらさん ahead, the World Heritage giant cantilever crane on the left shore, ながさきえき and でじまワーフ on the right.
- **Turn:** the crews turn round the buoys (ターン！).
- **Leg 2, heading south:** めがみおおはし ahead, おおうらてんしゅどう and グラバーえん on the hill to the left, the shipyard cranes on the right, and the goal at the pier with a cruise ship and the crowd.

## Game sets
| Set | Grammar | Textbook |
|---|---|---|
| can / can't | I / You / He / She can … | NH5 Unit 3・4 |
| in / on / under / by | The cat is … the box. | NH5 Unit 5 |
| Yes, I do / can / am | match the answer to the question | Let's Try 1・2, NH5 Unit 3 |
| What? Where? When? | question words | all books |
| go / went | past tense, is / was, with time words highlighted | NH6 Unit 3・7 |
| always / never | always / usually / sometimes / never with a 7-day stamp card | NH6 Unit 2 |
| a / an・-s | a / an, one apple / two apples | Let's Try 1, NH5 Unit 6 |
| Mix | everything | |

## How it plays
- Each right answer moves your boat forward, and **3 right in a row = BOOST**.
- After every answer, a native voice reads the full sentence.
- A wrong answer comes back again 3 questions later, and the results screen lists every missed sentence with a 🔊 button.
- Students can type their name onto their boat and pick its colour. Their best place for each set is saved on that computer.
- Settings: race length (みじかい・ふつう・ながい) and how strong the CPU boats are (やさしい・ふつう・つよい).
- Keyboard: `1` / `2` or `←` / `→`.

## Editing questions
All sentences are in **`js/questions.js`**, with plain lists at the top of each set.
New sentences work straight away using the browser's voice. To record them with the same voice as the rest, follow the steps below.

## Making art / voices (optional)
The scripts in `tools/` call fal.ai. The key is read from the `FAL_KEY` environment variable and is **never stored in the project**.
```
node tools/extract_sentences.js      # after editing questions.js
set FAL_KEY=...                      # Windows (export on Mac)
python tools/gen_voice.py            # records missing sentences (needs ffmpeg)
python tools/gen_stickers.py         # draws missing pictures listed in tools/stickers.json
node tools/finish_stickers.js        # SVG -> transparent WebP (npm i playwright sharp)
python tools/build_assets.py         # updates js/assets.js
```
A missing picture falls back to an emoji, and a missing voice falls back to the browser's speech, so the game always works.

## For the games hub (nagasakimark/games → games.js)
```
name: ペーロンレース
english: Peiron Race
type: えいご
about: ただしい ことばを えらんで、ペーロンで きょうそう！
learn: can・ぜんちし・かこけい・しつもんの ことば
link: https://nagasakimark.github.io/peiron/
image: images/peiron.webp
new: yes
color: #E23B3B
```
Copy `img/thumb.webp` into the hub's `images/` folder as `peiron.webp`.
