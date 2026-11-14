const MODES=['fakelag','ghost','telekill'];const empty=()=>Object.fromEntries(MODES.map(m=>[m,0]));
function validSeconds(n){return typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=3600&&Math.abs(n*10-Math.round(n*10))<0.00001;}
class AutoOff{
 constructor({settings={},states=new Map(),save=async()=>{},onChange=()=>{},clock=Date.now,automatic=true}={}){this.settings=new Map();for(const [scope,value]of Object.entries(settings))if(value&&MODES.every(m=>validSeconds(value[m])))this.settings.set(scope,{...value});this.states=states;this.active=new Map();this.save=save;this.onChange=onChange;this.clock=clock;this.chain=Promise.resolve();this.timer=automatic?setInterval(()=>this.tick(),100):null;}
 describe(scope){let entry=this.active.get(scope)||{};return {seconds:{...empty(),...this.settings.get(scope)},offAt:Object.fromEntries(MODES.map(m=>[m,entry[m]?.offAt||0]))};}
 set(scope,next){if(MODES.some(m=>typeof next[m]!=='boolean')||Object.keys(next).some(m=>!MODES.includes(m)))throw Error('invalid_control');let now=this.clock(),old=this.states.get(scope)||{},active=this.active.get(scope)||{},seconds=this.describe(scope).seconds;
  for(const m of MODES){if(next[m]&&!old[m])active[m]={started:now,offAt:seconds[m]?now+seconds[m]*1000:0};else if(!next[m])delete active[m];}
  this.states.set(scope,{...next});if(Object.keys(active).length)this.active.set(scope,active);else this.active.delete(scope);this.onChange(scope,{...next});return this.describe(scope);
 }
 configure(scope,mode,seconds){if(!MODES.includes(mode)||!validSeconds(seconds))return Promise.reject(Error('invalid_seconds'));const run=this.chain.catch(()=>{}).then(async()=>{const next=new Map(this.settings);next.set(scope,{...this.describe(scope).seconds,[mode]:seconds});await this.save(Object.fromEntries(next));this.settings=next;const entry=this.active.get(scope)?.[mode];if(entry)entry.offAt=seconds?entry.started+seconds*1000:0;this.tick();return this.describe(scope);});this.chain=run;return run;}
 tick(){const now=this.clock();for(const [scope,active]of this.active){const current=this.states.get(scope)||{};let changed=false,next={...current};for(const m of MODES)if(active[m]?.offAt&&active[m].offAt<=now){next[m]=false;delete active[m];changed=true;}if(!Object.keys(active).length)this.active.delete(scope);if(changed){this.states.set(scope,next);try{this.onChange(scope,{...next});}catch{}}}}
 forget(scope){this.active.delete(scope);this.states.delete(scope);}
 close(){clearInterval(this.timer);this.timer=null;this.active.clear();}
}
module.exports={AutoOff,validSeconds};
