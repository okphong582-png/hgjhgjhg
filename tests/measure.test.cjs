const test=require('node:test'),assert=require('node:assert/strict');
test('measurement can restore an existing session through POST; administrative routes remain inaccessible',async()=>{
 const handler=require('../api/gateway.js');async function request(route,method){const res={setHeader(){},end(v){this.value=JSON.parse(v)}};await handler({url:'/api/gateway?route='+encodeURIComponent(route),method,headers:{},body:{}},res);return res;}
 assert.equal((await request('/api/restore-test-session','POST')).statusCode,503);
 assert.equal((await request('/api/restore-test-session','GET')).statusCode,405);
 assert.equal((await request('/api/control','POST')).statusCode,404);
});
