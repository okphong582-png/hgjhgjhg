const test=require('node:test'),assert=require('node:assert/strict');
const handler=require('../api/gateway.js');
test('API proxy converts HTML tunnel failures to safe JSON while preserving 429 and successful JSON',async()=>{
 const priorFetch=global.fetch,priorOrigin=process.env.MIZZE_GATEWAY_ORIGIN,priorToken=process.env.MIZZE_WEB_PROXY_TOKEN;
 process.env.MIZZE_GATEWAY_ORIGIN='https://test.invalid';process.env.MIZZE_WEB_PROXY_TOKEN='isolated-test-not-real';
 async function request(response,route='/api/info'){global.fetch=async()=>response;const res={headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=Buffer.isBuffer(v)?v.toString():v}};await handler({url:'/api/gateway?route='+encodeURIComponent(route),method:'GET',headers:{}},res);return res;}
 try{
  for(const status of [200,502,503]){const r=await request(new Response('<!DOCTYPE html>private-upstream-detail',{status,headers:{'Content-Type':'text/html'}}));assert.equal(r.statusCode,502);assert.equal(r.headers['Content-Type'],'application/json; charset=utf-8');assert.ok(JSON.parse(r.body).error);assert.ok(!r.body.includes('private-upstream-detail'));}
  let r=await request(new Response('<html>rate limit</html>',{status:429,headers:{'Content-Type':'text/html','Retry-After':'30'}}));assert.equal(r.statusCode,429);assert.equal(r.headers['Retry-After'],'30');assert.match(JSON.parse(r.body).error,/giới hạn/);
  r=await request(new Response(JSON.stringify({gateway:'ready'}),{status:200,headers:{'Content-Type':'application/json'}}));assert.equal(r.statusCode,200);assert.equal(JSON.parse(r.body).gateway,'ready');
  r=await request(new Response('vless://test-fixture',{status:200,headers:{'Content-Type':'text/plain'}}),'/sub/'+'a'.repeat(64));assert.equal(r.statusCode,200);assert.equal(r.body,'vless://test-fixture');
 }finally{global.fetch=priorFetch;if(priorOrigin===undefined)delete process.env.MIZZE_GATEWAY_ORIGIN;else process.env.MIZZE_GATEWAY_ORIGIN=priorOrigin;if(priorToken===undefined)delete process.env.MIZZE_WEB_PROXY_TOKEN;else process.env.MIZZE_WEB_PROXY_TOKEN=priorToken;}
});
