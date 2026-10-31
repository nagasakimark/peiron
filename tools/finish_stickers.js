// SVG (tools/raw) -> transparent 384px WebP (img/stickers). Needs: npm i playwright sharp
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');const sharp=require('sharp');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:512,height:512}});
const raw=path.join(__dirname,'raw'),out=path.join(__dirname,'..','img','stickers');
for(const f of fs.readdirSync(raw).filter(f=>f.endsWith('.svg'))){
  const o=path.join(out,f.replace('.svg','.webp'));if(fs.existsSync(o))continue;
  const svg=fs.readFileSync(path.join(raw,f));
  await p.setContent(`<body style="margin:0"><img id=i style="width:512px;height:512px" src="data:image/svg+xml;base64,${svg.toString('base64')}"></body>`);
  await p.waitForFunction(()=>document.getElementById('i').complete);
  // knock out the white background connected to the edges
  const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.drawImage(document.getElementById('i'),0,0,512,512);
    const d=x.getImageData(0,0,512,512),a=d.data,seen=new Uint8Array(512*512),st=[];
    const white=i=>{const r=a[i*4],g=a[i*4+1],b=a[i*4+2];return Math.min(r,g,b)>232&&Math.max(r,g,b)-Math.min(r,g,b)<20};
    for(let k=0;k<512;k++){st.push(k,511*512+k,k*512,k*512+511);}
    while(st.length){const i=st.pop();if(seen[i]||!white(i))continue;seen[i]=1;a[i*4+3]=0;const X=i%512,Y=(i/512)|0;
      if(X>0)st.push(i-1);if(X<511)st.push(i+1);if(Y>0)st.push(i-512);if(Y<511)st.push(i+512);}
    x.putImageData(d,0,0);return c.toDataURL('image/png');});
  await sharp(Buffer.from(png.split(',')[1],'base64')).trim().resize(368,368,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}})
    .extend({top:8,bottom:8,left:8,right:8,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:82}).toFile(o);
  console.log('made',o);
}
await b.close();})();
