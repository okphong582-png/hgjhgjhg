const {features,score}=require('./shot-features.cjs');
const {isRecentGameOut}=require('./shot-activity.cjs');
function scoreWindow(model,w){
 return score(model,features({intervalMs:w.windowMs,delta:{udpOut:w.out,udpIn:w.input,up:w.bytes,down:w.down},ports:{10015:{up:w.game,down:w.gameIn}}}));
}
function responseEvidence(model,window,now){
 const slow=window.snapshot(now,600),fast=window.snapshot(now,200),recent=isRecentGameOut(slow,now);
 return {slow,fast,recent,score:recent?scoreWindow(model,slow):0,fastScore:recent?scoreWindow(model,fast):0};
}
module.exports={responseEvidence};
