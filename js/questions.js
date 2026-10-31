/* ============================================================
   PEIRON RACE — QUESTION SETS
   Every sentence the game can ask lives in this file.

   Each set builds a list of questions. A question has:
     pre / post : the words before and after the blank
     top        : (optional) a line shown above, e.g. a question
     bot        : (optional) a line shown below, e.g. an answer
     correct    : the right word for the blank
     wrong      : the other button
     cue        : (optional) word(s) to highlight as a hint
     say        : the full sentence the voice reads
     pic        : what picture to show (see "pic types" below)

   pic types:
     {type:'one',  img:'apple'}                 one picture
     {type:'many', img:'apple', n:3}            the picture n times
     {type:'can',  who:'p_she', img:'ski', ok:true}   person + activity + ⭕/✕
     {type:'prep', img:'cat', place:'box', prep:'in'} picture + box/desk
     {type:'ans',  img:'dog', yes:true}         topic + 🙆/🙅 kid
     {type:'week', img:'dog_walk', days:5}      picture + 7-day stamp card

   Pictures are files in img/stickers/<name>.webp
   If you add a sentence, run tools/make_voice.py to record it
   (otherwise the browser's own voice reads it).
   ============================================================ */
(function () {
  const sets = [];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- 1. can / can't  (NH5 Unit 3, 4) ---------- */
  const WHO = [['I', 'p_i'], ['You', 'p_you'], ['He', 'p_he'], ['She', 'p_she']];
  const CAN_ACTS = [
    ['swim', 'swim'], ['play the piano', 'piano'], ['play the recorder', 'recorder'],
    ['ride a bike', 'ride_bike'], ['ride a unicycle', 'unicycle'], ['cook', 'cook'],
    ['sing well', 'sing'], ['skate', 'skate'], ['ski', 'ski'], ['play soccer', 'soccer'],
    ['play baseball', 'baseball'], ['play dodgeball', 'dodgeball'], ['run fast', 'run'],
    ['draw pictures', 'draw'], ['play the guitar', 'guitar'], ['jump rope', 'jumprope']];
  const can = [];
  WHO.forEach(([w, wi]) => CAN_ACTS.forEach(([a, ai]) => [true, false].forEach(ok => {
    can.push({ pre: w + ' ', post: ' ' + a + '.', correct: ok ? 'can' : "can't", wrong: ok ? "can't" : 'can',
      say: `${w} ${ok ? 'can' : "can't"} ${a}.`, pic: { type: 'can', who: wi, img: ai, ok } });
  })));
  sets.push({ id: 'can', en: "can / can't", jp: 'できる？ できない？', unit: '5年 Unit 3・4', icon: 'unicycle', color: '#ff6b3d', items: can });

  /* ---------- 2. in / on / under / by  (NH5 Unit 5) ---------- */
  const THINGS = [['cat', 'cat'], ['dog', 'dog'], ['rabbit', 'rabbit'], ['bird', 'bird'], ['ball', 'ball'], ['apple', 'apple']];
  const PLACES = { box: ['in', 'on', 'by'], desk: ['on', 'under', 'by'] };
  const ALLP = ['in', 'on', 'under', 'by'];
  const prep = [];
  THINGS.forEach(([t, ti], k) => Object.entries(PLACES).forEach(([pl, ps]) => ps.forEach((p, j) => {
    // pick a stable but varied wrong answer
    const others = ALLP.filter(x => x !== p);
    const wrong = others[(k + j) % others.length];
    prep.push({ pre: `The ${t} is `, post: ` the ${pl}.`, correct: p, wrong,
      say: `The ${t} is ${p} the ${pl}.`, pic: { type: 'prep', img: ti, place: pl, prep: p } });
  })));
  sets.push({ id: 'prep', en: 'in / on / under', jp: 'どこに いる？', unit: '5年 Unit 5', icon: 'cat', color: '#22a6d8', items: prep });

  /* ---------- 3. Yes, I do / can / am  (Let's Try 1・2, NH5 Unit 3) ---------- */
  const FORMS = { can: ['Yes, I can.', "No, I can't."], do: ['Yes, I do.', "No, I don't."], am: ['Yes, I am.', "No, I'm not."] };
  const ASK = [
    ['Can you swim?', 'swim', 'can'], ['Can you cook?', 'cook', 'can'], ['Can you play the piano?', 'piano', 'can'],
    ['Can you ski?', 'ski', 'can'], ['Can you ride a unicycle?', 'unicycle', 'can'],
    ['Do you like dogs?', 'dog', 'do'], ['Do you like natto?', 'natto', 'do'], ['Do you like math?', 'math', 'do'],
    ['Do you have a pen?', 'pen', 'do'], ['Do you have a cat?', 'cat', 'do'], ['Do you like soccer?', 'soccer', 'do'],
    ['Are you hungry?', 'hungry', 'am'], ['Are you happy?', 'happy', 'am'], ['Are you sleepy?', 'sleepy', 'am'],
    ['Are you from Nagasaki?', 'megane', 'am'], ['Are you a cat?', 'cat', 'am']];
  const AUX = ['can', 'do', 'am'];
  const ans = [];
  ASK.forEach(([q, img, aux], k) => [true, false].forEach(yes => {
    const i = yes ? 0 : 1, other = AUX.filter(a => a !== aux)[k % 2];
    const c = FORMS[aux][i], w = FORMS[other][i];
    ans.push({ top: q, pre: '', post: '', correct: c, wrong: w, cue: q.split(' ')[0],
      say: `${q} ${c}`, pic: { type: 'ans', img, yes } });
  }));
  sets.push({ id: 'ans', en: 'Yes, I do / can', jp: 'こたえかた', unit: "Let's Try・5年 U3", icon: 'p_yes', color: '#3cb54a', items: ans });

  /* ---------- 4. Question words  (all books) ---------- */
  const WH = [
    ['When', 'is your birthday?', 'My birthday is May 5th.', 'Where', 'cake'],
    ['Where', 'is the park?', 'Go straight. Turn right.', 'When', 'map'],
    ['Who', 'is this?', 'This is my friend, Ken.', 'Where', 'p_he'],
    ['Who', 'is your hero?', 'My hero is my mother.', 'When', 'hero_mom'],
    ['What', 'do you want?', 'I want a new bike.', 'Who', 'gift'],
    ['How', 'many apples?', 'Three apples.', 'What', 'apple3'],
    ['How', 'much is it?', "It's 500 yen.", 'What', 'yen'],
    ['What', 'time is it?', "It's 7 o'clock.", 'How', 'clock'],
    ['Where', 'do you want to go?', 'I want to go to Italy.', 'Who', 'pizza'],
    ['What', 'sport do you like?', 'I like soccer.', 'Where', 'soccer'],
    ['How', 'was your weekend?', 'It was fun!', 'Who', 'ferris'],
    ['Why', 'do you want to go to Shiga?', 'I want to see Lake Biwa.', 'Who', 'lake'],
    ['How', 'are you?', "I'm happy.", 'Where', 'happy'],
    ['Where', 'is it from?', "It's from Brazil.", 'Who', 'globe'],
    ['What', 'day is it?', "It's Monday.", 'Who', 'calendar'],
    ['How', "'s the weather?", "It's sunny.", 'Who', 'sun'],
    ['What', 'would you like?', "I'd like a hamburger.", 'Where', 'hamburger'],
    ['Where', 'do pandas live?', 'They live in China.', 'When', 'panda']];
  const wh = WH.map(([c, rest, a, w, img]) => {
    const glue = rest[0] === "'" ? '' : ' ';
    return { pre: '', post: glue + rest, bot: a, correct: c, wrong: w, say: `${c}${glue}${rest} ${a}`, pic: { type: 'one', img } };
  });
  sets.push({ id: 'wh', en: 'What? Where?', jp: 'しつもんの ことば', unit: 'ぜんぶの 教科書', icon: 'map', color: '#8d5bd6', items: wh });

  /* ---------- 5. Past tense  (NH6 Unit 3, 7) ---------- */
  // [cue, verb now, verb past, rest, picture, isPast]
  const PAST = [
    ['Yesterday', 'go', 'went', 'to the park.', 'park', 1],
    ['Last Sunday', 'go', 'went', 'to the zoo.', 'lion', 1],
    ['Last summer', 'go', 'went', 'to the sea.', 'beach', 1],
    ['Last weekend', 'go', 'went', 'to Huis Ten Bosch.', 'htb', 1],
    ['Yesterday', 'go', 'went', 'to the library.', 'library', 1],
    ['Yesterday', 'eat', 'ate', 'champon.', 'champon', 1],
    ['Last night', 'eat', 'ate', 'curry.', 'curry', 1],
    ['Last Sunday', 'eat', 'ate', 'castella.', 'castella', 1],
    ['Last weekend', 'eat', 'ate', 'sushi.', 'sushi', 1],
    ['Yesterday', 'play', 'played', 'soccer.', 'soccer', 1],
    ['Last Sunday', 'play', 'played', 'video games.', 'videogame', 1],
    ['Yesterday', 'play', 'played', 'dodgeball.', 'dodgeball', 1],
    ['Last summer', 'see', 'saw', 'fireworks.', 'fireworks', 1],
    ['Last Sunday', 'see', 'saw', 'a big ship.', 'ship', 1],
    ['Last summer', 'see', 'saw', 'pandas.', 'panda', 1],
    ['Last summer', 'enjoy', 'enjoyed', 'camping.', 'tent', 1],
    ['Yesterday', 'enjoy', 'enjoyed', 'swimming.', 'swim', 1],
    ['Last weekend', 'enjoy', 'enjoyed', 'shopping.', 'shopping', 1],
    ['Last night', 'watch', 'watched', 'TV.', 'tv', 1],
    ['Last Sunday', 'watch', 'watched', 'a movie.', 'movie', 1],
    ['Last night', 'watch', 'watched', 'baseball.', 'baseball', 1],
    ['Every day', 'go', 'went', 'to school.', 'school', 0],
    ['Every Sunday', 'go', 'went', 'to the library.', 'library', 0],
    ['Every morning', 'eat', 'ate', 'breakfast.', 'breakfast', 0],
    ['Every Saturday', 'play', 'played', 'soccer.', 'soccer', 0],
    ['Every day', 'play', 'played', 'video games.', 'videogame', 0],
    ['Every night', 'watch', 'watched', 'TV.', 'tv', 0],
    ['Every summer', 'go', 'went', 'to the sea.', 'beach', 0],
    ['Every day', 'study', 'studied', 'English.', 'english', 0]];
  const past = PAST.map(([cue, now, pst, rest, img, isPast]) => {
    const c = isPast ? pst : now, w = isPast ? now : pst;
    return { pre: `${cue}, I `, post: ' ' + rest, correct: c, wrong: w, cue,
      say: `${cue}, I ${c} ${rest}`, pic: { type: 'one', img, clock: isPast ? 'past' : 'every' } };
  });
  const ISWAS = [
    ['Yesterday', 'Yesterday, it ', ' sunny.', 'was', 'sun'],
    ['Today', 'Today, it ', ' sunny.', 'is', 'sun'],
    ['Last summer', 'Last summer, it ', ' hot.', 'was', 'hot'],
    ['Today', 'Today, it ', ' cold.', 'is', 'snowman'],
    ['', 'My summer vacation ', ' fun.', 'was', 'beach'],
    ['', 'My school trip ', ' exciting.', 'was', 'bus'],
    ['This', 'This champon ', ' delicious.', 'is', 'champon'],
    ['Yesterday', 'Yesterday ', ' my birthday.', 'was', 'cake']];
  ISWAS.forEach(([cue, pre, post, c, img]) => past.push({ pre, post, correct: c, wrong: c === 'is' ? 'was' : 'is', cue: cue || undefined,
    say: pre + c + post, pic: { type: 'one', img, clock: c === 'was' ? 'past' : 'now' } }));
  sets.push({ id: 'past', en: 'go / went', jp: 'きのうの こと', unit: '6年 Unit 3・7', icon: 'fireworks', color: '#e8457a', items: past });

  /* ---------- 6. always / usually / sometimes / never  (NH6 Unit 2) ---------- */
  const FREQ = [['always', 7], ['usually', 5], ['sometimes', 2], ['never', 0]];
  const FACTS = [['walk my dog', 'dogwalk'], ['eat breakfast', 'breakfast'], ['play video games', 'videogame'],
    ['wash the dishes', 'dishes'], ['take out the garbage', 'garbage'], ['study English', 'english'],
    ['clean my room', 'broom'], ['get up at six', 'clock'], ['play soccer', 'soccer'], ['read books', 'book']];
  const freq = [];
  FACTS.forEach(([a, img], k) => FREQ.forEach(([w, d], j) => {
    // near neighbours make the best wrong answers (always vs usually etc.)
    const wrong = FREQ[j === 0 ? 1 : j === 3 ? 2 : (k % 2 ? j - 1 : j + 1)][0];
    freq.push({ pre: 'I ', post: ' ' + a + '.', correct: w, wrong, say: `I ${w} ${a}.`,
      pic: { type: 'week', img, days: w === 'usually' ? 5 + (k % 2) : w === 'sometimes' ? 2 + (k % 2) : d } });
  }));
  sets.push({ id: 'freq', en: 'always / never', jp: 'どのくらい する？', unit: '6年 Unit 2', icon: 'dogwalk', color: '#f2a516', items: freq });

  /* ---------- 7. a / an  &  one apple / two apples  (Let's Try 1, NH5 Unit 6) ---------- */
  const AN = [['apple', 'apple'], ['egg', 'egg'], ['orange', 'orange'], ['onion', 'onion'], ['umbrella', 'umbrella'], ['octopus', 'octopus'], ['ice cream', 'icecream']];
  const A_ = [['banana', 'banana'], ['hamburger', 'hamburger'], ['pen', 'pen'], ['cat', 'cat'], ['dog', 'dog'], ['bike', 'ride_bike'], ['cake', 'cake'], ['melon', 'melon'], ['rabbit', 'rabbit']];
  const aan = [];
  AN.forEach(([w, img]) => aan.push({ pre: 'I want ', post: ' ' + w + '.', correct: 'an', wrong: 'a', say: `I want an ${w}.`, pic: { type: 'one', img } }));
  A_.forEach(([w, img]) => aan.push({ pre: 'I want ', post: ' ' + w + '.', correct: 'a', wrong: 'an', say: `I want a ${w}.`, pic: { type: 'one', img } }));
  const PL = [['apple', 'apple'], ['banana', 'banana'], ['pencil', 'pencil'], ['cat', 'cat'], ['dog', 'dog'], ['ball', 'ball'],
    ['egg', 'egg'], ['book', 'book'], ['car', 'car'], ['star', 'star'], ['flower', 'flower']];
  const NUM = ['', 'one', 'two', 'three', 'four', 'five'];
  PL.forEach(([w, img]) => [1, 2, 3, 4, 5].forEach(n => {
    const c = n === 1 ? w : w + 's', x = n === 1 ? w + 's' : w;
    aan.push({ pre: `I have ${NUM[n]} `, post: '.', correct: c, wrong: x, cue: NUM[n], say: `I have ${NUM[n]} ${c}.`, pic: { type: 'many', img, n } });
  }));
  sets.push({ id: 'aan', en: 'a / an・-s', jp: 'ひとつ？ たくさん？', unit: "Let's Try 1・5年 U6", icon: 'apple', color: '#d63a3a', items: aan });

  window.QUESTION_SETS = sets;
  window.MIX_SET = { id: 'mix', en: 'Mix!', jp: 'ぜんぶ まぜる', unit: 'ぜんぶの もんだい', icon: 'peiron', color: '#1d4fbf' };
})();
