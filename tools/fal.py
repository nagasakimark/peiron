import os, json, time, urllib.request, sys
KEY=os.environ['FAL_KEY']
H={'Authorization':'Key '+KEY,'Content-Type':'application/json'}
def req(url,data=None,method=None):
    r=urllib.request.Request(url,data=json.dumps(data).encode() if data is not None else None,headers=H,method=method or ('POST' if data is not None else 'GET'))
    with urllib.request.urlopen(r,timeout=120) as f: return json.loads(f.read())
def run(model,args,timeout=300):
    s=req(f'https://queue.fal.run/{model}',args)
    st_url=s['status_url']; res_url=s['response_url']
    t0=time.time()
    while time.time()-t0<timeout:
        st=req(st_url)
        if st.get('status')=='COMPLETED': return req(res_url)
        if st.get('status') in ('FAILED','ERROR'): raise Exception(str(st))
        time.sleep(1.2)
    raise Exception('timeout')
def download(url,path):
    urllib.request.urlretrieve(url,path)
