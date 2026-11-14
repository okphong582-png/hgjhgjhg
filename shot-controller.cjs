class ShotController {
 constructor(){this.keys=new Map();}
 update(scope,p,recent,now=Date.now(),fast=p){
  const s=this.keys.get(scope)||{highSince:null,lowSince:null,on:false,until:0,cooldown:0,reason:'observing'};
  this.keys.set(scope,s);
  // A short-window peak needs corroboration; stale long-window evidence cannot arm alone.
  const high=recent&&((fast>=.9&&p>=.5)||(p>=.75&&fast>=.35));
  s.highSince=high?(s.highSince??now):null;
  s.lowSince=recent&&(p<.35||(fast<.35&&p<.65))?(s.lowSince??now):null;
  const lowConfirmed=s.lowSince!==null&&now-s.lowSince>=0;
  if(s.on&&(now>=s.until||!recent||lowConfirmed)){
   const capped=now>=s.until;
   s.on=false;s.cooldown=now+(capped?800:250);s.highSince=null;s.lowSince=null;
   s.reason=capped?'max-hold':!recent?'outgoing-idle':fast<.35?'confirmed-fast-score-low':'confirmed-score-low';
   return false;
  }
  if(!s.on&&s.highSince!==null&&now-s.highSince>=50&&now>=s.cooldown){
   s.on=true;s.until=now+6000;s.lowSince=null;s.reason='high-score-with-recent-outgoing';return true;
  }
  return null;
 }
}
module.exports={ShotController};
