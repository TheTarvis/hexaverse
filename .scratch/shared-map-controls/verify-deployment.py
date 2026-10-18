from pathlib import Path
import urllib.request,urllib.error,urllib.parse,json,hashlib,re,gzip
base='http://127.0.0.1:20204';build=Path(Path('/tmp/hexaverse-controls-root.txt').read_text())/'frontend/.next-phone-preview'
paths=['/','/login','/systems/sys_0_1'];assets=set()
for path in paths:
 req=urllib.request.Request(base+path,headers={'Accept-Encoding':'gzip'})
 with urllib.request.urlopen(req,timeout=20) as response:
  data=response.read()
  if response.headers.get('Content-Encoding')=='gzip': data=gzip.decompress(data)
  assert response.status==200
  assert data.rstrip().endswith(b'</html>'),path
  if path.startswith('/systems/'):assert 'no-store' in response.headers.get('Cache-Control','')
  assets.update(re.findall(r'(?:src|href)="([^"?]+\.(?:js|css))',data.decode()))
  print(path,'complete HTML200',len(data))
for asset in sorted(assets):
 if not asset.startswith('/_next/'):continue
 with urllib.request.urlopen(base+asset,timeout=20) as r: data=r.read()
 assert data==(build/urllib.parse.unquote(asset.removeprefix('/_next/'))).read_bytes(),asset
print(len(assets),'initial JS/CSS assets byte-identical')
config=json.loads(Path('/tmp/hexaverse-weekend-supervision/config.json').read_text())
assert config['deadline']=='2026-10-19T00:00:00Z'
for path,digest in config['pins'].items():assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest,path
print(len(config['pins']),'pins valid')
for path,expected in [('/storybook/',200),('/debug',404),('/qa',404)]:
 try:
  with urllib.request.urlopen(base+path,timeout=20) as r:code=r.status
 except urllib.error.HTTPError as e:code=e.code
 assert code==expected,(path,code)
 print(path,code)
request=urllib.request.Request(base+'/api/v1/fleets',data=b'{}',headers={'Origin':'https://foreign.example.invalid','Content-Type':'application/json'},method='POST')
try:urllib.request.urlopen(request,timeout=20);raise AssertionError('foreign origin accepted')
except urllib.error.HTTPError as e:assert e.code==403
print('foreign Origin POST403')
