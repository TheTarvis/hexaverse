"""Measure screenshot rim brightness; no third-party dependencies or image edits."""
from pathlib import Path
import json, struct, zlib, os

def png(path):
    content=Path(path).read_bytes();assert content[:8]==b'\x89PNG\r\n\x1a\n'
    pos=8;parts=[]
    while pos<len(content):
        size=struct.unpack('>I',content[pos:pos+4])[0];kind=content[pos+4:pos+8];data=content[pos+8:pos+8+size];pos+=size+12
        if kind==b'IHDR':width,height,depth,color,_,_,interlace=struct.unpack('>IIBBBBB',data)
        if kind==b'IDAT':parts.append(data)
        if kind==b'IEND':break
    assert depth==8 and color in (2,6) and interlace==0
    channels=3 if color==2 else 4;stride=width*channels;raw=zlib.decompress(b''.join(parts));rows=[];previous=bytearray(stride)
    for y in range(height):
        mode=raw[y*(stride+1)];row=bytearray(raw[y*(stride+1)+1:(y+1)*(stride+1)])
        for x in range(stride):
            a=row[x-channels] if x>=channels else 0;b=previous[x];c=previous[x-channels] if x>=channels else 0
            if mode==1:value=a
            elif mode==2:value=b
            elif mode==3:value=(a+b)//2
            elif mode==4:
                p=a+b-c;dist=[abs(p-a),abs(p-b),abs(p-c)];value=[a,b,c][dist.index(min(dist))]
            else:assert mode==0;value=0
            row[x]=(row[x]+value)%256
        rows.append(row);previous=row
    def lum(x,y):
        offset=x*channels;r,g,b=rows[y][offset:offset+3];return .2126*r+.7152*g+.0722*b
    return width,height,lum

before=Path('/tmp/hexaverse-close-before')
after=Path('/tmp/hexaverse-close-after')
for root in (before,after):
 results=[]
 for lit in sorted(root.glob('*-rim-*.png')):
  if lit.stem.endswith('-static'):continue
  w,h,light=png(lit);sw,sh,dark=png(lit.with_stem(lit.stem+'-static'));assert(w,h)==(sw,sh)
  # Strictly inside the old 28px rectangular close mask, over the chamfer.
  gains=[light(x,y)-dark(x,y) for x in range(w-16,w-3) for y in range(3,16)]
  results.append({'file':lit.name,'max_close_chamfer_gain':max(gains)})
 if results:
  peak=max(r['max_close_chamfer_gain'] for r in results)
  print(json.dumps({'root':str(root),'samples':results,'peak':peak},indent=2))
  if root==before:assert peak<5,peak
  else:
   groups={}
   for row in results:
    key=row['file'].split('-rim-')[0];groups[key]=max(groups.get(key,0),row['max_close_chamfer_gain'])
   assert all(value>40 for value in groups.values()),groups
   print(json.dumps({'per_profile_peaks':groups},indent=2))
