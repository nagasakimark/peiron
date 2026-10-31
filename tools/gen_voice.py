# Record every sentence with fal.ai Kokoro (American English, voice af_heart).
#   node tools/extract_sentences.js   (refresh tools/says.json after editing questions.js)
#   set FAL_KEY=your_key
#   python tools/gen_voice.py         -> records sentences that don't have an mp3 yet (needs ffmpeg)
#   python tools/build_assets.py
import sys,json,os,re,subprocess,tempfile
HERE=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,HERE);from fal import run,download
from concurrent.futures import ThreadPoolExecutor
says=json.load(open(os.path.join(HERE,'says.json'),encoding='utf-8'))
extra=["Ready?","Go!","Turn around!","Goal!","Great!","Nice!","Excellent!","Super!","You win!","Good try!"]
OUT=os.path.join(HERE,'..','voice')
def slug(s): return re.sub(r'[^a-z0-9]+','_',s.lower()).strip('_')[:80]
allS=sorted(set([x for v in says.values() for x in v]+extra))
todo=[s for s in allS if not os.path.exists(os.path.join(OUT,slug(s)+'.mp3'))]
print(len(allS),'sentences,',len(todo),'to record',flush=True)
AF="silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.08"
def go(s):
    err=''
    for a in range(3):
        try:
            r=run('fal-ai/kokoro/american-english',{"prompt":s,"voice":"af_heart","speed":0.88})
            tmp=os.path.join(tempfile.gettempdir(),slug(s)+'.wav');download(r['audio']['url'],tmp)
            subprocess.run(['ffmpeg','-loglevel','error','-y','-i',tmp,'-af',AF,'-ac','1','-ar','24000','-b:a','48k',os.path.join(OUT,slug(s)+'.mp3')],check=True)
            return 'ok'
        except Exception as e: err=str(e)[:120]
    return 'FAIL '+s+' '+err
with ThreadPoolExecutor(8) as ex: res=list(ex.map(go,todo))
print('fails:',[r for r in res if r!='ok'])
