# Make missing picture stickers with fal.ai (Recraft v3, vector style).
#   set FAL_KEY=your_key        (Windows)   /   export FAL_KEY=your_key   (Mac/Linux)
#   python tools/gen_stickers.py            -> makes any sticker in stickers.json that doesn't exist yet
#   python tools/gen_stickers.py cat dog    -> remakes just those
# Then run tools/finish_stickers.js (needs Node + Playwright) and tools/build_assets.py
import sys,json,os
HERE=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,HERE);from fal import run,download
from concurrent.futures import ThreadPoolExecutor
P=json.load(open(os.path.join(HERE,'stickers.json'),encoding='utf-8'))
OUT=os.path.join(HERE,'raw');os.makedirs(OUT,exist_ok=True)
DONE=os.path.join(HERE,'..','img','stickers')
S=(", cute kawaii children's picture-book sticker illustration, thick dark outline, flat vivid saturated cheerful colors, "
   "simple rounded shapes, one centered subject, no extra decorations, no sparkles, no text, plain white background")
ids=sys.argv[1:] or [k for k in P if not os.path.exists(os.path.join(DONE,k+'.webp')) and not os.path.exists(os.path.join(OUT,k+'.svg'))]
def go(k):
    err=''
    for a in range(3):
        try:
            r=run('fal-ai/recraft/v3/text-to-image',{"prompt":P[k]+S,"style":"vector_illustration","image_size":"square_hd"})
            download(r['images'][0]['url'],os.path.join(OUT,k+'.svg'));return k+' ok'
        except Exception as e: err=str(e)[:150]
    return k+' FAIL '+err
print(len(ids),'to make')
with ThreadPoolExecutor(6) as ex:
    for m in ex.map(go,ids): print(m,flush=True)
