const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {main}=require('../gateway-server.cjs');
test('restore measurement uses the already-bound browser and the existing Happ credential without claiming a new device',{skip:!process.env.MIZZE_TEST_PYTHON||!process.env.MIZZE_TEST_BACKUP_ROOT},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mizze-measure-'));fs.mkdirSync(path.join(root,'private'));fs.copyFileSync(path.join(__dirname,'../backup.py'),path.join(root,'backup.py'));
 const now=Date.now(),device='a'.repeat(32),deviceHash=crypto.createHash('sha256').update('mizze-happ-browser-v1\n'+device).digest('hex'),hash='f'.repeat(64),token='b'.repeat(64),expiresAt=now+3600000;
 const record={protocol:9,credentialMode:2,enabled:true,maxDevices:1,timeMode:'firstUse',durationMs:3600000,activatedAt:now,expiresAt,devices:{[deviceHash]:{version:1,claimedAt:now}}};let writes=0;
 const source={name:'measurement-memory-only',db:{ref:()=>({get:async()=>({val:()=>structuredClone(record)}),transaction:async()=>{writes++;throw Error('Must not claim or activate')}})}};
 const session={project:source.name,hash,deviceHash,claimedAt:now,uuid:'isolated-uuid',email:'isolated-test@mizze',expiresAt};fs.writeFileSync(path.join(root,'private/sessions.json'),JSON.stringify([[token,session]]),{flag:'wx'});
 const gateway={users:new Map(),control:{fakelag:false,ghost:false,telekill:false},async start(){this.ready=true},async stop(){},async add(uuid,email){this.users.set(email,uuid)},async remove(email){this.users.delete(email)},stats(){return {}},userState(){return this.control}};
 const app=await main({runtimeRoot:root,settings:{webPort:0,python:process.env.MIZZE_TEST_PYTHON,backupRoot:process.env.MIZZE_TEST_BACKUP_ROOT},backend:{sources:[source],lookup:async()=>({source,hash,record:structuredClone(record)})},gateway,publicOrigin:null,writeShortcut:false});
 const base='http://127.0.0.1:'+app.server.address().port,post=(route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  const login=await post('/api/login',{key:'LOCAL-TEST-ONLY',deviceId:device}),grant=(await login.json()).grant;assert.equal(login.status,200);
  const restored=await post('/api/restore-test-session',{grant}),value=await restored.json();assert.equal(restored.status,200);assert.equal(value.token,token);assert.equal(value.newDevice,false);assert.equal(value.expiresAt,expiresAt);assert.equal(writes,0);assert.equal(gateway.users.size,1);
  assert.equal((await post('/api/restore-test-session',{grant})).status,401);
  assert.equal((await post('/api/login',{key:'LOCAL-TEST-ONLY',deviceId:'c'.repeat(32)})).status,400);
 }finally{await app.stop()}
});
