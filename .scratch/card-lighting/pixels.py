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

root=Path('/tmp/hexaverse-card-lighting-after');results=[]
for lit in sorted(root.glob('*.png')):
    if lit.stem.endswith('-static') or 'static-frame' in lit.name:continue
    static=lit.with_stem(lit.stem+'-static')
    w,h,light=png(lit);sw,sh,dark=png(static);assert (w,h)==(sw,sh)
    gains=[]
    for side in ('left','right'):
        xs=range(1,5) if side=='left' else range(w-5,w-1)
        gains.append(max(sum(light(x,y)-dark(x,y) for y in range(h//2-3,h//2+4))/7 for x in xs))
    assert min(gains)>45,(lit.name,gains)
    assert abs(gains[0]-gains[1])<20,(lit.name,gains)
    results.append({'screenshot':lit.name,'size':[w,h],'opposed_rim_luminance_gain':gains})
assert len(results)==int(os.environ.get("QA_PIXEL_COUNT", "8")),len(results)
print(json.dumps(results,indent=2))
