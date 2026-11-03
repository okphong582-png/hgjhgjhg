const test=require('node:test'),assert=require('node:assert/strict');
const {RateLimiter,ExpiryGuard,headers}=require('../security.cjs');

test('authentication budget is isolated per IP, resets, and bounds memory',()=>{
 let now=1000;const rate=new RateLimiter({limit:2,maxEntries:2,now:()=>now});
 assert.equal(rate.take('a'),true);assert.equal(rate.take('a'),true);assert.equal(rate.take('a'),false);
 assert.equal(rate.take('b'),true);now+=60000;assert.equal(rate.take('a'),true);
 rate.take('c');assert.ok(rate.entries.size<=2);
});
test('absolute expiry closes access without database polling and retries failed cleanup',async()=>{
 let now=1000,id=0,calls=0;const timers=new Map();
 const guard=new ExpiryGuard({now:()=>now,setTimer:(fn,ms)=>{timers.set(++id,{fn,ms});return id},clearTimer:id=>timers.delete(id)});
 guard.track('session',1100,async()=>{calls++;if(calls===1)throw Error('cleanup temporarily unavailable')});
 assert.equal([...timers.values()][0].ms,100);now=1100;
 await assert.rejects(guard.revoke('session'));assert.equal(calls,1);assert.equal(guard.entries.get('session').expiresAt,0);
 await guard.revoke('session');assert.equal(calls,2);assert.equal(guard.entries.size,0);guard.close();
});
test('HTTP responses prevent framing, scripts from other origins, and credential referrers',()=>{
 const values={};headers({setHeader:(k,v)=>values[k]=v});
 assert.match(values['Content-Security-Policy'],/object-src 'none'/);
 assert.match(values['Content-Security-Policy'],/frame-ancestors 'none'/);
 assert.equal(values['Referrer-Policy'],'no-referrer');assert.equal(values['Cache-Control'],'no-store');
});
test('public proxy denies raw key URLs and unsupported methods before upstream access',async()=>{
 const handler=require('../api/gateway.js');
 async function request(path,method='GET'){const res={headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=JSON.parse(v)}};await handler({url:'/api/gateway?route='+encodeURIComponent(path),method,headers:{}},res);return res;}
 assert.equal((await request('/REAL-LICENSE-KEY/fakelag')).statusCode,404);
 assert.equal((await request('/api/login')).statusCode,405);
 assert.equal((await request('/api/state','POST')).statusCode,405);
 const forgotten=await request('/api/forget','POST');assert.equal(forgotten.body.ok,true);assert.match(forgotten.headers['Set-Cookie'],/Max-Age=0; HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await request('/key/'+'a'.repeat(64)+'/fakelag')).statusCode,503);
});

test('remember cookie cannot be forged, modified, or used beyond its absolute lifetime',()=>{
 const {sealRemember,openRemember,REMEMBER_TTL}=require('../security.cjs');const value={project:'isolated',hash:'a'.repeat(64),deviceHash:'b'.repeat(64),claimedAt:0,label:'TEST••••ONLY'};
 const token=sealRemember(value,'test-secret',1000);assert.equal(openRemember(token,'test-secret',1001).project,'isolated');
 assert.equal(openRemember(token,'other-secret',1001),null);assert.equal(openRemember(token+'x','test-secret',1001),null);assert.equal(openRemember(token,'test-secret',1000+REMEMBER_TTL),null);
});
