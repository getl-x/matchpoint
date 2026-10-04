from PIL import Image, ImageDraw
from pathlib import Path
root = Path(r'F:\Ai Code\personal-projects\matchpoint\assets')
for name, size, maskable in [('icon-192.png',192,False),('icon-512.png',512,False),('icon-maskable.png',512,True)]:
    image=Image.new('RGB',(size,size),'#f0e6fa')
    draw=ImageDraw.Draw(image)
    unit=size/64
    offset=8 if maskable else 0
    scale=(64-2*offset)/64
    def poly(points,fill):
        draw.polygon([(int((x*scale+offset)*unit),int((y*scale+offset)*unit)) for x,y in points],fill=fill)
    poly([(11,18),(23,30),(11,42),(18,49),(37,30),(18,11)],'#9370be')
    poly([(28,18),(40,30),(28,42),(35,49),(54,30),(35,11)],'#b197d0')
    image.save(root/name)
print('PWA icons generated: 192px, 512px, maskable 512px')
