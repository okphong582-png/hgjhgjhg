const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {main}=require('../gateway-server.cjs');
const enabled=!!process.env.MIZZE_TEST_PYTHON&&!!process.env.MIZZE_TEST_BACKUP_ROOT;
class FakeGateway{
 constructor(){this.users=new Map();this.control={fakelag:false,ghost:false,telekill:false};this.states=new Map();this.removed=[];}
 async start(){this.ready=true}async stop(){this.ready=false}
 async add(uuid,email){this.users.set(email,uuid)}async remove(email){this.removed.push(email);this.users.delete(email)}
 setUserState(email,state){this.states.set(email,state)}userState(email){return this.states.get(email)||this.control}stats(){return {}}
 uri(uuid){return 'vless://'+uuid+'@127.0.0.1:18443'}
}
async function fixture({durationMs=3600000,recheckIntervalMs=3600000}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mizze-security-'));fs.mkdirSync(path.join(root,'private'));
 fs.copyFileSync(path.join(__dirname,'../backup.py'),path.join(root,'backup.py'));
 let record={protocol:9,credentialMode:2,enabled:true,maxDevices:1,timeMode:'firstUse',durationMs,createdAt:Date.now(),activatedAt:0,expiresAt:0},offline=false,lookups=0;
 const ref={get:async()=>{if(offline)throw Error('database unavailable');return {val:()=>structuredClone(record)}},transaction:async f=>{let next=f(structuredClone(record));if(!next)return {committed:false};record=next;return {committed:true,snapshot:{val:()=>structuredClone(record)}}}};
 const source={name:'isolated-security-test',db:{ref:()=>ref}};
 const backend={sources:[source],lookup:async({key})=>{lookups++;return key==='LOCAL-TEST-ONLY'?{source,hash:'f'.repeat(64),record:structuredClone(record)}:null},backup:async()=>{}};
 const gateway=new FakeGateway(),app=await main({runtimeRoot:root,settings:{python:process.env.MIZZE_TEST_PYTHON,backupRoot:process.env.MIZZE_TEST_BACKUP_ROOT,webPort:0,tunnelPort:18443},gateway,backend,publicOrigin:null,writeShortcut:false,recheckIntervalMs});
 const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(route,body,token,cookie)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 async function provision(){const login=await post('/api/login',{key:'LOCAL-TEST-ONLY',deviceId:'a'.repeat(32)});assert.equal(login.status,200);const l=await login.json();const response=await post('/api/provision',{grant:l.grant});assert.equal(response.status,200);return {value:await response.json(),grant:l.grant,cookie:response.headers.get('set-cookie').split(';')[0]};}
 return {app,gateway,base,post,provision,offline:()=>offline=true,reset:()=>{record.devices={}},lookups:()=>lookups};
}
test('expired Happ credentials lose active access without a database response',{skip:!enabled},async()=>{
 const f=await fixture({durationMs:1000});try{
  const {value:v,grant}=await f.provision();assert.equal(f.gateway.users.size,1);
  assert.equal((await f.post('/api/provision',{grant})).status,401);
  assert.equal((await fetch(f.base+'/LOCAL-TEST-ONLY/ghost')).status,401);
  assert.equal((await fetch(f.base+'/key/'+v.token+'/ghost')).status,200);
  f.offline();await new Promise(r=>setTimeout(r,Math.max(0,v.expiresAt-Date.now())+100));
  assert.equal(f.gateway.users.size,0,'active gateway access revoked at absolute expiry');
  assert.equal((await fetch(f.base+'/sub/'+v.token)).status,401);
  assert.equal((await fetch(f.base+'/api/state',{headers:{Authorization:'Bearer '+v.token}})).status,401);
 }finally{await f.app.stop()}
});
test('license service errors revoke live access instead of leaving it enabled',{skip:!enabled},async()=>{
 const f=await fixture({recheckIntervalMs:40});try{
  await f.provision();assert.equal(f.gateway.users.size,1);f.offline();await new Promise(r=>setTimeout(r,150));
  assert.equal(f.gateway.users.size,0);
 }finally{await f.app.stop()}
});
test('repeated invalid logins are stopped before further database lookups',{skip:!enabled},async()=>{
 const f=await fixture();try{
  for(let n=0;n<12;n++)assert.equal((await f.post('/api/login',{key:'INVALID-TEST-ONLY',deviceId:'a'.repeat(32)})).status,400);
  const denied=await f.post('/api/login',{key:'INVALID-TEST-ONLY',deviceId:'a'.repeat(32)});
  assert.equal(denied.status,429);assert.equal(denied.headers.get('retry-after'),'60');assert.equal(f.lookups(),12);
 }finally{await f.app.stop()}
});

test('remembered browser rechecks key and restores a connection; device mismatch and reset revoke memory',{skip:!enabled},async()=>{
 const f=await fixture();try{
  const {value:v,cookie}=await f.provision();assert.match(cookie,/^mizze_remember=/);assert.ok(!cookie.includes('LOCAL-TEST-ONLY'));
  let resumed=await f.post('/api/resume',{deviceId:'a'.repeat(32)},null,cookie);assert.equal(resumed.status,200);
  const result=await resumed.json();assert.equal(result.connection.token,v.token);assert.equal(result.key,undefined);assert.match(result.keyLabel,/••••/);
  const other=await f.post('/api/resume',{deviceId:'b'.repeat(32)},null,cookie);assert.equal(other.status,401);
  f.reset();resumed=await f.post('/api/resume',{deviceId:'a'.repeat(32)},null,cookie);assert.equal(resumed.status,401);assert.match(resumed.headers.get('set-cookie'),/Max-Age=0/);
 }finally{await f.app.stop()}
});
test('remembering a pending key never starts its usage time',{skip:!enabled},async()=>{
 const f=await fixture();try{
  const login=await f.post('/api/login',{key:'LOCAL-TEST-ONLY',deviceId:'a'.repeat(32)}),cookie=login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const response=await f.post('/api/resume',{deviceId:'a'.repeat(32)},null,cookie);assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.startsOnAdd,true);assert.equal(result.expiresAt,null);assert.equal(f.gateway.users.size,0);
 }finally{await f.app.stop()}
});
