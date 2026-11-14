const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {main}=require('../gateway-server.cjs');
const enabled=!!process.env.MIZZE_TEST_PYTHON&&!!process.env.MIZZE_TEST_BACKUP_ROOT;
class FakeGateway{
 constructor(){this.users=new Map();this.control={fakelag:false,ghost:false,telekill:false};this.states=new Map();this.removed=[];this.aimlags=new Map();}
 async start(){this.ready=true}async stop(){this.ready=false}
 async add(uuid,email){this.users.set(email,uuid)}async remove(email){this.removed.push(email);this.users.delete(email)}
 setUserState(email,state){this.states.set(email,state)}userState(email){return this.states.get(email)||this.control}stats(){return {}}
 setUserAimLag(email,value){this.aimlags.set(email,value)}aimLagState(email){return {holding:false}}
 uri(uuid){return 'vless://'+uuid+'@127.0.0.1:18443'}
}
async function fixture({durationMs=3600000,recheckIntervalMs=3600000}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mizze-security-'));fs.mkdirSync(path.join(root,'private'));
 fs.copyFileSync(path.join(__dirname,'../backup.py'),path.join(root,'backup.py'));
 let record={protocol:9,credentialMode:2,enabled:true,maxDevices:3,timeMode:'firstUse',durationMs,createdAt:Date.now(),activatedAt:0,expiresAt:0},offline=false,lookups=0;
 const ref={get:async()=>{if(offline)throw Error('database unavailable');return {val:()=>structuredClone(record)}},transaction:async f=>{let next=f(structuredClone(record));if(!next)return {committed:false};record=next;return {committed:true,snapshot:{val:()=>structuredClone(record)}}}};
 const source={name:'isolated-security-test',db:{ref:()=>ref}};
 const backend={sources:[source],lookup:async({key})=>{lookups++;return key==='LOCAL-TEST-ONLY'?{source,hash:'f'.repeat(64),record:structuredClone(record)}:null},backup:async()=>{}};
 const gateway=new FakeGateway(),app=await main({runtimeRoot:root,settings:{python:process.env.MIZZE_TEST_PYTHON,backupRoot:process.env.MIZZE_TEST_BACKUP_ROOT,webPort:0,tunnelPort:18443},gateway,backend,publicOrigin:null,writeShortcut:false,recheckIntervalMs});
 const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(route,body,token,cookie)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 async function provision(){const login=await post('/api/login',{key:'LOCAL-TEST-ONLY',deviceId:'a'.repeat(32)});assert.equal(login.status,200);const l=await login.json();const response=await post('/api/provision',{grant:l.grant});assert.equal(response.status,200);return {value:await response.json(),grant:l.grant,cookie:response.headers.get('set-cookie').split(';')[0]};}
 return {root,app,gateway,base,post,provision,offline:()=>offline=true,reset:()=>{record.devices={}},lookups:()=>lookups};
}
test('AimLag API authenticates, validates, persists server state and disables immediately',{skip:!enabled},async()=>{
 const f=await fixture();try{
  assert.equal((await f.post('/api/aimlag',{enabled:true})).status,401);
  const {value:v}=await f.provision();
  const url=f.base+'/sub/'+v.token;
  const firstDevice={headers:{'x-hwid':'test-iphone-one'}};
  assert.equal((await fetch(url)).status,403);
  const subscription=await fetch(url,firstDevice);
  assert.equal(subscription.status,200);
  assert.equal(subscription.headers.get('hide-settings'),'1');
  assert.equal(subscription.headers.get('subscription-always-hwid-enable'),'1');
  assert.equal((await fetch(url,{headers:{'x-hwid':'test-iphone-two'}})).status,403);
  assert.equal((await fetch(url,firstDevice)).status,200);
  assert.equal((await f.post('/api/login',{key:'LOCAL-TEST-ONLY',deviceId:'b'.repeat(32)})).status,400);
  assert.equal((await f.post('/api/aimlag',{enabled:'yes'},v.token)).status,400);
  assert.equal((await f.post('/api/aimlag',{enabled:true,other:true},v.token)).status,400);
  let r=await f.post('/api/aimlag',{enabled:true},v.token);assert.equal(r.status,200);assert.equal((await r.json()).aimlag.enabled,true);
  assert.equal([...f.gateway.aimlags.values()][0],true);
  assert.equal(Object.values(JSON.parse(fs.readFileSync(path.join(f.root,'private/aimlag-settings.json'))))[0],true);
  r=await fetch(f.base+'/api/state',{headers:{Authorization:'Bearer '+v.token}});assert.equal((await r.json()).aimlag.enabled,true);
  r=await f.post('/api/aimlag',{enabled:false},v.token);assert.equal(r.status,200);assert.equal((await r.json()).aimlag.enabled,false);assert.equal([...f.gateway.aimlags.values()][0],false);
  f.reset();assert.equal((await f.post('/api/aimlag',{enabled:true},v.token)).status,401);
 }finally{await f.app.stop()}
});
