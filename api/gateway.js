const {signature}=require('../web-proxy.cjs');
const {headers:securityHeaders}=require('../security.cjs');
const {isIP}=require('node:net');
const {createRequestLimit}=require('../request-limit.cjs');
const rateLimit=createRequestLimit();
const limits={info:90,login:12,provision:20,state:90,aimlag:30,resume:20,forget:20,sub:60};
const upstreamSlotLimit=24;
let inflight=0;
module.exports=async function handler(req,res){
 securityHeaders(res);
 const fail=(status,message)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:message}));};
 try{
  const raw=new URL(req.url,'https://portal.invalid');const targetPath=raw.searchParams.get('route');
  if(raw.searchParams.getAll('route').length!==1||!/^\/(?:api\/(?:info|login|provision|state|aimlag|resume|forget)|sub\/[a-f0-9]{64})$/.test(targetPath||''))return fail(404,'Không tìm thấy trang.');
  if(req.method==='GET'&&/^\/api\/(?:login|provision|aimlag|resume|forget)$/.test(targetPath))return fail(405,'Phương thức không hợp lệ.');
  if(!['GET','POST'].includes(req.method))return fail(405,'Phương thức không hợp lệ.');
  if(req.method==='POST'&&!/^\/api\/(login|provision|aimlag|resume|forget)$/.test(targetPath))return fail(405,'Phương thức không hợp lệ.');
  const forwarded=process.env.VERCEL==='1'?req.headers['x-vercel-forwarded-for']:'';
  const requestIp=isIP(forwarded||'')?forwarded:(req.socket?.remoteAddress||'127.0.0.1');
  const bucket=targetPath.startsWith('/sub/')?'sub':targetPath.slice(5);
  const retry=rateLimit(bucket+':'+requestIp,limits[bucket]);
  if(retry){res.setHeader('Retry-After',String(retry));return fail(429,'Thao tác quá nhanh. Thử lại sau.');}
  const originHeader=req.headers.origin;if(originHeader){let o=new URL(originHeader);if(o.host!==req.headers.host)return fail(403,'Yêu cầu không hợp lệ.');}
  if(targetPath==='/api/forget'&&req.method==='POST'){res.setHeader('Set-Cookie','mizze_remember=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict');res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({ok:true}));return;}
  const origin=process.env.MIZZE_GATEWAY_ORIGIN,secret=process.env.MIZZE_WEB_PROXY_TOKEN;
  if(!origin||!secret)return fail(503,'Chưa cấu hình địa chỉ gateway VPS trong Vercel.');
  const base=new URL(origin);if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash||base.hostname==='mizzedongnhathoangha.com'||base.host===req.headers.host||base.hostname.endsWith('.vercel.app'))throw Error('config');
  const params=new URLSearchParams(raw.searchParams);params.delete('route');const route=targetPath+(params.size?'?'+params:'');
  let body=Buffer.alloc(0);if(req.method==='POST'){if(Buffer.isBuffer(req.body))body=req.body;else if(typeof req.body==='string')body=Buffer.from(req.body);else if(req.body)body=Buffer.from(JSON.stringify(req.body));else{let parts=[],n=0;for await(const b of req){n+=b.length;if(n>4096)return fail(413,'Yêu cầu quá lớn.');parts.push(b);}body=Buffer.concat(parts);}if(body.length>4096)return fail(413,'Yêu cầu quá lớn.');}
  const ip=requestIp;
  const at=String(Date.now()),headers={'Content-Type':'application/json','Origin':base.origin,'x-mizze-at':at,'x-mizze-ip':ip,'x-mizze-signature':signature(secret,req.method,route,at,ip,body)};
  const remember=String(req.headers.cookie||'').match(/(?:^|;\s*)mizze_remember=([A-Za-z0-9_.-]{1,2048})(?:;|$)/);if(remember)headers.Cookie='mizze_remember='+remember[1];
  if(req.headers.authorization)headers.Authorization=req.headers.authorization;for(const h of ['purpose','sec-purpose'])if(req.headers[h])headers[h]=req.headers[h];
  if(inflight>=upstreamSlotLimit){res.setHeader('Retry-After','5');return fail(503,'Máy chủ bận. Vui lòng thử lại sau.');}
  inflight++;
  try {
  const response=await fetch(base.origin+route,{method:req.method,headers,...(req.method==='POST'?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(targetPath.startsWith('/api/')&&!String(response.headers.get('content-type')||'').toLowerCase().includes('application/json')){
   if(response.status===429){const retry=response.headers.get('retry-after');if(/^\d{1,4}$/.test(retry||''))res.setHeader('Retry-After',retry);return fail(429,'Máy chủ đang giới hạn yêu cầu. Đợi một lúc rồi thử lại.');}
   return fail(502,'Đường hầm tới VPS đang lỗi. Kiểm tra gateway và kết nối Internet trên VPS.');
  }
  const cookie=response.headers.get('set-cookie');if(cookie&&cookie.startsWith('mizze_remember='))res.setHeader('Set-Cookie',cookie);
  res.statusCode=response.status;res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');for(const name of ['content-type','profile-title','subscription-userinfo','profile-update-interval','retry-after']){const value=response.headers.get(name);if(value)res.setHeader(name,value);}if(targetPath.startsWith('/sub/')&&response.ok)res.setHeader('Hide-Settings','1');res.end(Buffer.from(await response.arrayBuffer()));
  } finally { inflight--; }
 }catch{return fail(502,'Chưa kết nối được gateway VPS. Kiểm tra gateway và cấu hình Vercel.');}
};
