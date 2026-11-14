function features(r){const dt=r.intervalMs/1000,s=r.delta;let out=0,input=0;for(const [p,v]of Object.entries(r.ports||{}))if(+p>=10010&&+p<=10020){out+=v.up;input+=v.down;}return [s.udpOut,s.udpIn,s.up,s.down,out,input].map(n=>Math.log1p(Math.max(0,n)/dt));}
function score(m,x){const z=m.w[0]+x.reduce((s,v,k)=>s+m.w[k+1]*(v-m.mu[k])/m.sd[k],0);return 1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));}
module.exports={features,score};
