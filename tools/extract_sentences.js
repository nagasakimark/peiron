// node tools/extract_sentences.js  -> writes tools/says.json (every sentence the voice must read)
global.window = {}; require('../js/questions.js');
const says = {}; for (const s of window.QUESTION_SETS) says[s.id] = s.items.map(q => q.say);
require('fs').writeFileSync(__dirname + '/says.json', JSON.stringify(says, null, 1));
console.log(Object.values(says).flat().length, 'sentences');
