const crypto=require('node:crypto'),net=require('node:net');
function signature(secret,method,url,at,ip,body){return crypto.createHmac('sha256',secret).update([method,url,at,ip,crypto.createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex');}
function verify(secret,req,body,now=Date.now()){const at=req.headers['x-mizze-at'],ip=req.headers['x-mizze-ip'],got=req.headers['x-mizze-signature'];if(!secret||!/^\d{13}$/.test(at||'')||Math.abs(now-Number(at))>30000||!net.isIP(ip||'')||!/^[a-f0-9]{64}$/.test(got||''))return null;const expected=signature(secret,req.method,req.url,at,ip,body);return crypto.timingSafeEqual(Buffer.from(got),Buffer.from(expected))?ip:null;}
module.exports={signature,verify};
