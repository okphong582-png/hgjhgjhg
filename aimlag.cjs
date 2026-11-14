const {ShotWindow}=require('./shot-window.cjs');
const {ShotController}=require('./shot-controller.cjs');
const {responseEvidence}=require('./shot-response.cjs');
const {model}=require('./shot-model.json');
// Experimental traffic inference, never an authenticated game fire event.
class AimLag {
 constructor({change,clock=Date.now,automatic=true}={}){this.change=change;this.clock=clock;this.automatic=automatic;this.enabled=false;this.holding=false;this.timer=null;this.reset();}
 reset(){this.window=new ShotWindow();this.controller=new ShotController();}
 setEnabled(enabled){if(this.enabled===enabled)return;this.enabled=enabled;clearInterval(this.timer);this.timer=null;this.reset();this.setHolding(false);if(enabled&&this.automatic)this.timer=setInterval(()=>this.tick(),25);}
 setHolding(value){if(this.holding===value)return;this.holding=value;this.change(value);}
 observe(now,out,n,port){if(this.enabled)this.window.observe(now,out,n,port);}
 tick(){if(!this.enabled)return;const now=this.clock(),v=responseEvidence(model,this.window,now);this.controller.update('peer',v.score,v.recent,now,v.fastScore);this.setHolding(this.controller.keys.get('peer')?.on===true);}
 describe(){return {supported:true,enabled:this.enabled,holding:this.holding,experimental:true};}
 close(){this.setEnabled(false);clearInterval(this.timer);}
}
module.exports={AimLag};
