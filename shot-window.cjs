// Stores counts and lengths only; no packet payloads or addresses.
function addLength(hist,key,n=1,limit=32){
 key=String(key);if(hist[key]===undefined&&Object.keys(hist).length>=limit)key='other';hist[key]=(hist[key]||0)+n;
}
class ShotWindow{
 constructor(){this.buckets=Array.from({length:40},()=>({id:-1,out:0,input:0,bytes:0,down:0,game:0,gameIn:0,outLengths:{},inLengths:{}}));this.lastGameOut=0;}
 observe(now,out,n,port){
  const id=Math.floor(now/50),b=this.buckets[id%40];
  if(b.id!==id)Object.assign(b,{id,out:0,input:0,bytes:0,down:0,game:0,gameIn:0,outLengths:{},inLengths:{}});
  b[out?'out':'input']++;b[out?'bytes':'down']+=n;
  if(port>=10010&&port<=10020){b[out?'game':'gameIn']++;addLength(b[out?'outLengths':'inLengths'],n);if(out)this.lastGameOut=now;}
 }
 snapshot(now,windowMs=600){
  const v={out:0,input:0,bytes:0,down:0,game:0,gameIn:0,lastGameOut:this.lastGameOut,windowMs,gameOutLengths:{},gameInLengths:{}};
  const oldest=Math.floor((now-windowMs)/50),newest=Math.floor(now/50);
  for(const b of this.buckets)if(b.id>oldest&&b.id<=newest){
   for(const k of ['out','input','bytes','down','game','gameIn'])v[k]+=b[k];
   for(const [n,count]of Object.entries(b.outLengths))addLength(v.gameOutLengths,n,count,64);
   for(const [n,count]of Object.entries(b.inLengths))addLength(v.gameInLengths,n,count,64);
  }
  return v;
 }
}
module.exports={ShotWindow};
