#!/usr/bin/env python3
"""
Renderiza um modelo de item Java (Blockbench, cubos+UV) para um SPRITE 2D, usando a
transformação `display.gui` do próprio modelo — ou seja, o ícone fica igual ao que o
jogador vê no inventário do Java. Serve pra gerar o ícone Bedrock de itens 3D (ex.: a
Colhetadeira / crate4), que no Bedrock só podem aparecer como sprite 2D.

  python3 tools/render_item_icon.py <model.json> <textures_dir> <out.png> [size]

- model.json: assets/skib/models/item/<id>.json (com elements + display.gui)
- textures_dir: pasta base das texturas (resolve "skib:item/foo" -> <dir>/item/foo.png)
- out.png: sprite de saída (RGBA), quadrado, fundo transparente.
"""
import json, sys, math
from PIL import Image

SS = 8  # supersampling

FACE_SHADE = {  # sombreamento direcional padrão do Minecraft (constante por face)
    'up': 1.0, 'down': 0.5,
    'north': 0.8, 'south': 0.8,
    'east': 0.6, 'west': 0.6,
}
# os 4 cantos (em unidades de modelo 0-16) de cada face, no sentido que casa com a UV
# (u cresce p/ a direita, v cresce p/ baixo). lo=from, hi=to.
def face_corners(lo, hi, face):
    x0,y0,z0 = lo; x1,y1,z1 = hi
    return {
        'north': [(x1,y1,z0),(x0,y1,z0),(x0,y0,z0),(x1,y0,z0)],  # -Z
        'south': [(x0,y1,z1),(x1,y1,z1),(x1,y0,z1),(x0,y0,z1)],  # +Z
        'west':  [(x0,y1,z0),(x0,y1,z1),(x0,y0,z1),(x0,y0,z0)],  # -X
        'east':  [(x1,y1,z1),(x1,y1,z0),(x1,y0,z0),(x1,y0,z1)],  # +X
        'up':    [(x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)],  # +Y
        'down':  [(x0,y0,z1),(x1,y0,z1),(x1,y0,z0),(x0,y0,z0)],  # -Y
    }[face]

def mat_mul(a,b):
    return [[sum(a[i][k]*b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
def mat_vec(m,v):
    return tuple(sum(m[i][j]*v[j] for j in range(3)) for i in range(3))
def rot_x(d):
    r=math.radians(d); c,s=math.cos(r),math.sin(r)
    return [[1,0,0],[0,c,-s],[0,s,c]]
def rot_y(d):
    r=math.radians(d); c,s=math.cos(r),math.sin(r)
    return [[c,0,s],[0,1,0],[-s,0,c]]
def rot_z(d):
    r=math.radians(d); c,s=math.cos(r),math.sin(r)
    return [[c,-s,0],[s,c,0],[0,0,1]]

def rotate_about(v, origin, axis, angle):
    p = tuple(v[i]-origin[i] for i in range(3))
    m = {'x':rot_x,'y':rot_y,'z':rot_z}[axis](angle)
    p = mat_vec(m,p)
    return tuple(p[i]+origin[i] for i in range(3))

def uv_quad(uv, rot):
    # uv = [u1,v1,u2,v2] em unidades de modelo; rot in {0,90,180,270}
    u1,v1,u2,v2 = uv
    pts = [(u1,v1),(u2,v1),(u2,v2),(u1,v2)]  # tl,tr,br,bl (casa com face_corners tl,tr,br,bl)
    k = (rot//90) % 4
    return pts[k:]+pts[:k]

def sample(tex, u, v):
    w,h = tex.size
    x = min(w-1, max(0, int(u)))
    y = min(h-1, max(0, int(v)))
    return tex.getpixel((x,y))

def main():
    model_path, tex_dir, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    size = int(sys.argv[4]) if len(sys.argv) > 4 else 64
    m = json.load(open(model_path))
    texsize = m.get('texture_size', [16,16])
    uv_scale = (texsize[0]/16.0, texsize[1]/16.0)
    # resolve texturas
    texs = {}
    for k,ref in (m.get('textures') or {}).items():
        ns,_,p = ref.partition(':')
        path = f"{tex_dir}/{p}.png" if ':' in ref else f"{tex_dir}/{ref}.png"
        try: texs[k] = Image.open(path).convert('RGBA')
        except FileNotFoundError: pass
    def resolve_tex(name):
        name = name.lstrip('#')
        seen=set()
        while name in (m.get('textures') or {}) and name not in seen:
            seen.add(name); ref=m['textures'][name]
            if ref.startswith('#'): name=ref[1:]
            else: return texs.get(name)
        return texs.get(name)

    # transform gui
    gui = (m.get('display') or {}).get('gui') or {}
    grot = gui.get('rotation', [0,0,0])
    Rgui = mat_mul(mat_mul(rot_x(grot[0]), rot_y(grot[1])), rot_z(grot[2]))

    quads = []  # (depth, [4 screen pts], [4 uv pts], tex, shade)
    for el in m.get('elements', []):
        f,t = el['from'], el['to']
        lo = [min(f[i],t[i]) for i in range(3)]
        hi = [max(f[i],t[i]) for i in range(3)]
        erot = el.get('rotation')
        for face, fd in (el.get('faces') or {}).items():
            corners = face_corners(lo, hi, face)
            if erot:
                corners = [rotate_about(c, erot['origin'], erot['axis'], erot['angle']) for c in corners]
            # gui transform: centra em 8, aplica rotação, projeta ortográfico
            scr=[]; zs=[]
            for c in corners:
                p = tuple(c[i]-8 for i in range(3))
                p = mat_vec(Rgui, p)
                scr.append((p[0], p[1])); zs.append(p[2])
            uv = fd.get('uv', [0,0,16,16])
            uvp = uv_quad([uv[0]*uv_scale[0], uv[1]*uv_scale[1], uv[2]*uv_scale[0], uv[3]*uv_scale[1]], fd.get('rotation',0))
            tex = resolve_tex(fd.get('texture','#0'))
            if tex is None: continue
            quads.append((sum(zs)/4.0, scr, uvp, tex, FACE_SHADE.get(face,0.8)))

    # bounds p/ enquadrar
    xs=[p[0] for q in quads for p in q[1]]; ys=[p[1] for q in quads for p in q[1]]
    minx,maxx,miny,maxy = min(xs),max(xs),min(ys),max(ys)
    span = max(maxx-minx, maxy-miny) * 1.04
    cx,cy = (minx+maxx)/2,(miny+maxy)/2
    S = size*SS
    def to_px(p):
        # y do modelo cresce p/ cima -> inverte p/ imagem
        px = (p[0]-cx)/span*S + S/2
        py = -(p[1]-cy)/span*S + S/2
        return (px,py)

    img = Image.new('RGBA',(S,S),(0,0,0,0))
    px = img.load()
    quads.sort(key=lambda q:q[0])  # pintor: longe (z menor) primeiro
    for _,scr,uvp,tex,shade in quads:
        P=[to_px(p) for p in scr]
        # rasteriza os 2 triângulos do quad (tl,tr,br,bl) -> (0,1,2),(0,2,3)
        for tri in ((0,1,2),(0,2,3)):
            raster(px,S,[P[i] for i in tri],[uvp[i] for i in tri],tex,shade)
    img = img.resize((size,size), Image.BOX)
    img.save(out_path)
    print('rendered', out_path, img.size)

def raster(px,S,P,UV,tex,shade):
    (x0,y0),(x1,y1),(x2,y2)=P
    minx=max(0,int(min(x0,x1,x2))); maxx=min(S-1,int(max(x0,x1,x2))+1)
    miny=max(0,int(min(y0,y1,y2))); maxy=min(S-1,int(max(y0,y1,y2))+1)
    d=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2)
    if abs(d)<1e-9: return
    tw,th=tex.size
    for y in range(miny,maxy+1):
        for x in range(minx,maxx+1):
            a=((y1-y2)*(x-x2)+(x2-x1)*(y-y2))/d
            b=((y2-y0)*(x-x2)+(x0-x2)*(y-y2))/d
            c=1-a-b
            if a<-0.001 or b<-0.001 or c<-0.001: continue
            u=a*UV[0][0]+b*UV[1][0]+c*UV[2][0]
            v=a*UV[0][1]+b*UV[1][1]+c*UV[2][1]
            r,g,bl,al=sample(tex,u,v)
            if al<8: continue
            px[x,y]=(int(r*shade),int(g*shade),int(bl*shade),al)

if __name__=='__main__':
    main()
