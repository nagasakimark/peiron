import random, statistics as st
def race(think, acc, cpu, P, scale=0.5, seed=None):
    BASE,KICK,COMBO,MAXE,FADE=P['BASE'],P['KICK'],P['COMBO'],P['MAXE'],P['FADE']
    out,back,L=630*scale,520*scale,13.6; total=out+back-L
    ints={0:(7.6,.7),1:(5.9,.78),2:(4.2,.88)}
    racers=[dict(isP=i==1,a=0,leg=1,phi=0,v=0,extra=0,st=0,streak=0,nice=0,aiT=1.5+random.random()*1.5,fin=None) for i in range(4)]
    p=racers[1]; t=0; nextAns=think; dt=0.05
    prog=lambda r: r['a'] if r['leg']==1 else out if r['leg']=='turn' else out+r['a']
    def kick(r,combo): r['extra']=min(MAXE,r['extra']+KICK+(COMBO if combo else 0))
    def stumble(r): r['extra']*=0.4; r['st']=1.0
    while t<400 and p['fin'] is None:
        t+=dt
        if t>=nextAns:
            if random.random()<acc: p['streak']+=1; kick(p,p['streak']>=3); nextAns=t+0.9+think; 
            else: p['streak']=0; stumble(p); nextAns=t+2.0+think
            if p['leg']=='turn': p['nice']=1.6 if p['streak']>0 else -1.2
        for r in racers:
            if not r['isP'] and r['fin'] is None:
                r['aiT']-=dt
                if r['aiT']<=0:
                    I,A=ints[cpu]
                    if random.random()<A: r['streak']+=1; kick(r,r['streak']>=3); 
                    else: r['streak']=0; stumble(r)
                    if r['leg']=='turn' and r['streak']>0: r['nice']=1.6
                    ah=prog(r)-prog(p); r['aiT']=I*(0.75+random.random()*0.55)*(1.4 if ah>35 else 1.15 if ah>15 else 0.85 if ah<-45 else 1)
            r['st']=max(0,r['st']-dt); r['extra']=max(0,r['extra']-FADE*dt)
            want=4 if r['fin'] else BASE*(0.4 if r['st']>0 else 1)+r['extra']
            if r['leg']=='turn': want=2.2
            r['v']+=(want-r['v'])*min(1,dt*2.4)
            if r['leg']==1:
                r['a']+=r['v']*dt
                if r['a']>=out: r['leg']='turn'; r['phi']=0
            elif r['leg']=='turn':
                import math
                base=math.pi/(3.2 if r['isP'] else [3.6,3.2,2.8][2-cpu]*(0.9+random.random()*0.2))
                k=1.9 if r['nice']>0 else 0.55 if r['nice']<0 else 1
                r['nice']=max(0,r['nice']-dt) if r['nice']>0 else min(0,r['nice']+dt)
                r['phi']+=base*k*dt
                if r['phi']>=math.pi: r['leg']=2; r['a']=0
            else: r['a']+=r['v']*dt
            if r['fin'] is None and prog(r)>=total: r['fin']=t
    order=sorted(racers,key=lambda r:(r['fin'] is None, r['fin'] or 1e9, -prog(r)))
    return order.index(p)+1, p['fin']
def stats(think,acc,cpu,P,n=300):
    res=[race(think,acc,cpu,P) for _ in range(n)]
    places=[r[0] for r in res]; times=[r[1] for r in res if r[1]]
    return f"think{think} acc{acc} cpu{cpu}: win {places.count(1)/n:.0%} top2 {sum(1 for x in places if x<=2)/n:.0%} avgT {st.mean(times):.0f}s"
import sys
P=dict(BASE=5,KICK=9,COMBO=5,MAXE=26,FADE=2.4)
for c in [(3.5,.8,1),(2,.9,1),(5,.7,1),(3.5,.8,0),(5,.7,0),(2,.9,2),(3.5,.8,2)]: print(stats(*c,P))
