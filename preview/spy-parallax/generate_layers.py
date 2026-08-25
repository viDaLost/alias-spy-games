from PIL import Image, ImageDraw, ImageFilter
import random, math, os
S=2; W,H=720*S,1280*S
OUT=os.environ.get('OUT_DIR','public/layers')
os.makedirs(OUT,exist_ok=True)
random.seed(1337)
def canvas(): return Image.new('RGBA',(W,H),(0,0,0,0))
def save(im,name):
    im=im.resize((720,1280),Image.Resampling.LANCZOS)
    im.save(os.path.join(OUT,name),'WEBP',lossless=True,method=6)
def glow_dot(im,x,y,r,color,core=255):
    g=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(g)
    for k,a in [(4,22),(2,55),(1,core)]: d.ellipse((x-r*k,y-r*k,x+r*k,y+r*k),fill=(*color,a))
    im.alpha_composite(g.filter(ImageFilter.GaussianBlur(r*0.7)))
# 01 stars + moon
im=canvas(); d=ImageDraw.Draw(im)
for _ in range(220):
    x=random.randrange(W); y=random.randrange(int(H*.66)); r=random.choice([1,1,1,2,2,3]); a=random.randrange(65,190)
    d.ellipse((x-r,y-r,x+r,y+r),fill=(182,205,255,a))
mx,my,mr=int(W*.72),int(H*.17),int(W*.13)
moon=Image.new('RGBA',(W,H),(0,0,0,0)); md=ImageDraw.Draw(moon)
md.ellipse((mx-mr,my-mr,mx+mr,my+mr),fill=(190,200,217,225))
for _ in range(45):
    ang=random.random()*math.tau; rr=random.random()*mr*.8; cr=random.randint(5,28)*S
    cx=int(mx+math.cos(ang)*rr); cy=int(my+math.sin(ang)*rr)
    md.ellipse((cx-cr,cy-cr,cx+cr,cy+cr),fill=(112,126,151,random.randint(18,50)))
moon=moon.filter(ImageFilter.GaussianBlur(.45*S)); im.alpha_composite(moon); save(im,'01-sky-moon.webp')
# 02 far city/hills
im=canvas(); d=ImageDraw.Draw(im)
for pts,col in [([(0,790*S),(160*S,710*S),(340*S,770*S),(520*S,680*S),(W,755*S),(W,H),(0,H)],(20,28,52,180)), ([(0,880*S),(190*S,780*S),(360*S,820*S),(560*S,745*S),(W,810*S),(W,H),(0,H)],(14,20,38,220))]: d.polygon(pts,fill=col)
for i in range(34):
    x=int((i*25+random.randint(-7,7))*S); bw=random.randint(18,38)*S; bh=random.randint(40,110)*S; base=random.randint(885,960)*S
    d.rectangle((x,base-bh,x+bw,base),fill=(17,21,39,215))
    if random.random()<.25: d.polygon([(x,base-bh),(x+bw//2,base-bh-random.randint(10,28)*S),(x+bw,base-bh)],fill=(14,18,34,220))
cx=int(W*.56); base=830*S
for off,w,h in [(-110,58,180),(-42,88,240),(55,64,160)]:
    x=cx+off*S; d.rectangle((x,base-h*S,x+w*S,base),fill=(12,16,31,235)); d.rectangle((x-5*S,base-h*S,x+(w+5)*S,base-(h-12)*S),fill=(13,17,32,235))
for x in range(cx-50*S,cx+46*S,18*S): d.rectangle((x,570*S,x+9*S,590*S),fill=(12,16,31,235))
save(im,'02-city-far.webp')
# 03 mid rooftops
im=canvas(); d=ImageDraw.Draw(im)
for i in range(12):
    x=(i*74-random.randint(0,20))*S; base=random.randint(990,1100)*S; bw=random.randint(88,150)*S; bh=random.randint(80,190)*S
    c=(10+random.randint(0,5),13+random.randint(0,6),27+random.randint(0,7),245); d.rectangle((x,base-bh,x+bw,base),fill=c)
    if i%3!=1: d.polygon([(x-8*S,base-bh),(x+bw//2,base-bh-random.randint(20,55)*S),(x+bw+8*S,base-bh)],fill=(8,12,25,245))
    for wx in range(x+18*S,x+bw-12*S,34*S):
        wy=base-bh+random.randint(28,58)*S; d.rounded_rectangle((wx,wy,wx+12*S,wy+24*S),radius=6*S,fill=(2,5,13,170))
d.polygon([(0,1110*S),(220*S,1065*S),(430*S,1088*S),(W,1035*S),(W,H),(0,H)],fill=(8,11,23,235)); save(im,'03-rooftops-mid.webp')
# 04 foreground cover
im=canvas(); d=ImageDraw.Draw(im); stone=(5,8,18,250); stone2=(10,13,25,245)
for rect,col in [((0,0,72*S,H),stone),((0,0,150*S,150*S),stone2),((0,150*S,115*S,430*S),stone),((0,1070*S,210*S,H),stone2),((650*S,0,W,H),stone)]: d.rectangle(rect,fill=col)
arch=Image.new('L',(W,H),0); ad=ImageDraw.Draw(arch); ad.ellipse((-120*S,-260*S,850*S,420*S),fill=255); ad.ellipse((-35*S,-175*S,765*S,335*S),fill=0)
stone_img=Image.new('RGBA',(W,H),(5,8,18,0)); stone_img.putalpha(arch); im.alpha_composite(stone_img)
for side in [0,1]:
    for _ in range(28):
        x=random.randint(8,120)*S if side==0 else random.randint(600,710)*S; y=random.randint(30,520)*S; rx=random.randint(10,22)*S; ry=random.randint(4,10)*S
        d.ellipse((x-rx,y-ry,x+rx,y+ry),fill=(9,22,24,random.randint(120,210)))
save(im,'04-foreground-cover.webp')
# 05 spy silhouette
im=canvas(); d=ImageDraw.Draw(im); hood=[(58*S,690*S),(68*S,620*S),(108*S,580*S),(157*S,603*S),(177*S,660*S),(162*S,724*S),(106*S,742*S)]
d.polygon(hood,fill=(3,6,15,245)); d.ellipse((90*S,620*S,145*S,682*S),fill=(8,11,20,250)); d.polygon([(98*S,646*S),(128*S,638*S),(144*S,670*S),(116*S,694*S),(92*S,674*S)],fill=(1,3,8,235)); d.polygon([(70*S,716*S),(156*S,705*S),(245*S,900*S),(28*S,930*S)],fill=(3,6,15,250))
rim=Image.new('RGBA',(W,H),(0,0,0,0)); rd=ImageDraw.Draw(rim); rd.line(hood+[hood[0]],fill=(60,72,118,90),width=3*S); im.alpha_composite(rim.filter(ImageFilter.GaussianBlur(S))); save(im,'05-spy-hideout.webp')
# 06 fog
im=canvas(); fog=Image.new('L',(W,H),0); fd=ImageDraw.Draw(fog)
for _ in range(26):
    x=random.randint(-150,650)*S; y=random.randint(390,1030)*S; rx=random.randint(90,250)*S; ry=random.randint(24,80)*S
    fd.ellipse((x-rx,y-ry,x+rx,y+ry),fill=random.randint(22,65))
fog=fog.filter(ImageFilter.GaussianBlur(42*S)); col=Image.new('RGBA',(W,H),(80,103,150,0)); col.putalpha(fog); im.alpha_composite(col); save(im,'06-fog.webp')
# 07 city lights
im=canvas()
for _ in range(52):
    x=random.randint(30,690)*S; y=random.randint(690,1110)*S; r=random.choice([1,1,2,2,3])*S; glow_dot(im,x,y,r,(255,174,77),random.randint(140,230))
save(im,'07-city-lights.webp')
# 08 torch walker
im=canvas(); d=ImageDraw.Draw(im); x,y=558*S,850*S
d.ellipse((x-10*S,y-68*S,x+10*S,y-48*S),fill=(4,6,12,245)); d.polygon([(x-15*S,y-46*S),(x+14*S,y-48*S),(x+24*S,y+38*S),(x-22*S,y+40*S)],fill=(4,6,12,250)); d.line((x-8*S,y+35*S,x-14*S,y+95*S),fill=(3,5,10,250),width=8*S); d.line((x+9*S,y+35*S,x+18*S,y+95*S),fill=(3,5,10,250),width=8*S); d.line((x+12*S,y-20*S,x+58*S,y-55*S),fill=(4,6,12,250),width=7*S); d.line((x+58*S,y-55*S,x+65*S,y-105*S),fill=(35,22,15,255),width=4*S); glow_dot(im,x+65*S,y-115*S,8*S,(255,137,48),255); save(im,'08-torch-walker.webp')
print('generated 8 transparent layers')
