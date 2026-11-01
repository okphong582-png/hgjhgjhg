from pathlib import Path
import json,sys,zipfile,hashlib,datetime
v=json.loads(sys.stdin.read());root=Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
t=root/('Mizze-Connect-before-write-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.zip')
b=json.dumps(v,sort_keys=True).encode();name=v.get('path','state')+'.json'
with zipfile.ZipFile(t,'x',zipfile.ZIP_DEFLATED) as z:z.writestr(name,b);z.writestr('BACKUP-SHA256.json',json.dumps({name:hashlib.sha256(b).hexdigest()}))
with zipfile.ZipFile(t) as z:assert z.testzip() is None and z.read(name)==b
