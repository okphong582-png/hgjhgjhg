// Network hold/release profiles derived from Hi.py's divert_worker_layer.
// No game-protocol parsing or guarantee of in-game effects.
class PacketGate{
 constructor(stats,{clock=Date.now,maxPackets=3000,maxBytes=4*1024*1024,budget=null,automatic=false}={}){Object.assign(this,{stats,clock,maxPackets,maxBytes,budget,automatic});this.timer=null;this.closed=false;this.state={fakelag:false,ghost:false,telekill:false};this.held=new Map();this.flushing=new Map();Object.assign(stats,{queued:0,heldPackets:0,flushingPackets:0,matching:{fakelag:0,ghost:0,telekill:0},captured:{fakelag:0,ghost:0,telekill:0},released:{fakelag:0,ghost:0,telekill:0},udpIn:0,udpOut:0,ports:{},lastGameAt:null});}
 eligible(port,out,n){return {telekill:out&&port>=10010&&port<=10020&&n>=43,ghost:out&&port>=10010&&port<=10020&&n>=55&&n<=300,fakelag:!out&&port>=10011&&port<=10019&&n>=30&&n<=1079};}
 enqueue(b,send,port,out,n,owner){if(this.closed)return;const stats=this.stats,now=this.clock(),hits=this.eligible(port,out,n);stats[out?'udpOut':'udpIn']++;const key=String(port);if(!stats.ports[key]&&Object.keys(stats.ports).length>=32){let oldest=Object.keys(stats.ports).sort((a,b)=>stats.ports[a].at-stats.ports[b].at)[0];delete stats.ports[oldest];}let v=stats.ports[key]||(stats.ports[key]={up:0,down:0,at:now});v[out?'up':'down']++;v.at=now;
  for(let k of Object.keys(hits))if(hits[k]){stats.matching[k]++;stats.lastGameAt=now;}
  // Hi.py drops fresh movement packets while releasing its Telekill burst.
  if(hits.telekill&&this.flushing.size>0){stats.dropped++;return;}
  let mode=hits.telekill&&this.state.telekill?'telekill':hits.ghost&&this.state.ghost?'ghost':hits.fakelag&&this.state.fakelag?'fakelag':null;
  if(!mode){send(b);return;}
  if(this.held.size+this.flushing.size>=this.maxPackets||stats.queued+b.length>this.maxBytes||(this.budget&&this.budget.used+b.length>this.budget.limit)){stats.dropped++;return;}
  this.held.set(Symbol(),{b:Buffer.from(b),send,mode,owner});stats.queued+=b.length;if(this.budget)this.budget.used+=b.length;stats.captured[mode]++;this.counts();
 }
 setState(next){const old=this.state;this.state={...next};for(let mode of ['telekill','ghost','fakelag'])if(old[mode]&&!next[mode])this.releaseMode(mode);}
 releaseMode(mode){let n=0,now=this.clock();for(const [id,x]of this.held)if(x.mode===mode){this.held.delete(id);if(mode==='telekill'){x.at=now+n*5+Math.floor(n/4)*5;this.flushing.set(id,x);n++;}else this.send(x);}this.tick();}
 send(x){this.stats.queued-=x.b.length;if(this.budget)this.budget.used-=x.b.length;try{x.send(x.b);this.stats.released[x.mode]++;}catch{this.stats.dropped++;}}
 tick(){const now=this.clock();for(const [id,x]of this.flushing)if(x.at<=now){this.flushing.delete(id);this.send(x);}this.counts();}
 counts(){this.stats.heldPackets=this.held.size;this.stats.flushingPackets=this.flushing.size;if(this.automatic){clearTimeout(this.timer);this.timer=null;if(this.flushing.size&&!this.closed){const next=Math.min(...[...this.flushing.values()].map(x=>x.at));this.timer=setTimeout(()=>this.tick(),Math.max(1,next-this.clock()));}}}
 cancelOwner(owner){for(let q of [this.held,this.flushing])for(const [id,x]of q)if(x.owner===owner){q.delete(id);this.stats.queued-=x.b.length;if(this.budget)this.budget.used-=x.b.length;this.stats.dropped++;}this.counts();}
 close(){if(this.closed)return;this.closed=true;clearTimeout(this.timer);if(this.budget)this.budget.used-=this.stats.queued;this.held.clear();this.flushing.clear();this.stats.queued=0;this.counts();}
}
module.exports={PacketGate};
