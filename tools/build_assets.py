# Writes js/assets.js: the list of finished stickers and voices the game can use.
import os,json
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
st=sorted(f[:-5] for f in os.listdir(os.path.join(R,'img','stickers')) if f.endswith('.webp'))
vo=sorted(f[:-4] for f in os.listdir(os.path.join(R,'voice')) if f.endswith('.mp3'))
open(os.path.join(R,'js','assets.js'),'w').write('/* list of finished pictures & voices (made by tools/build_assets.py) */\nwindow.ASSETS='+json.dumps({'stickers':st,'voices':vo})+';\n')
print(len(st),'stickers',len(vo),'voices')
