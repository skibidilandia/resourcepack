#!/usr/bin/env python3
"""
Gira um modelo Java (Blockbench, cubos + rotação por-elemento) em torno do eixo Y, em passos
de 90°, em torno do centro do bloco (8, *, 8). Usado pra gerar as 4 variantes direcionais de
uma máquina (a Mineradora) — um bloco custom do IA por facing — já que IA REAL blocks têm
orientação fixa e o CustomBlock.place não aceita facing.

  python3 tools/rotate_model.py <in.json> <out_dir> <basename>
  -> escreve <basename>_90.json, _180.json, _270.json em <out_dir> (e copia o 0° como <basename>.json)

Rotação de 90° mantém caixas alinhadas aos eixos (continuam from/to válidos). A rotação
por-elemento (eixo+ângulo+origem) é conjugada: R · rot(θ,A,O) · R⁻¹ = rot(θ, R·A, R·O), o que
sob 90°Y manda o eixo X -> ±Z e mantém |θ| dentro do limite ±45 do Minecraft.
"""
import json, sys, os, math, copy

# faces laterais: como o NOME muda sob rotação Y de +90° (sentido do nosso rotpt).
# normal +X(leste)->norte, norte->oeste, oeste->sul, sul->leste (derivado de R·normal).
FACE_CYCLE_90 = {'east': 'north', 'north': 'west', 'west': 'south', 'south': 'east'}

def cyc(face, k):
    for _ in range(k % 4):
        face = FACE_CYCLE_90.get(face, face)
    return face

def rot_pt(x, y, z, k):
    # k*90° em torno do centro (8,*,8). x'=(x-8)cos+ (z-8)sin +8 ; z'=-(x-8)sin+(z-8)cos +8
    phi = math.radians(90 * k)
    c, s = round(math.cos(phi)), round(math.sin(phi))
    xc, zc = x - 8, z - 8
    return (xc * c + zc * s + 8, y, -xc * s + zc * c + 8)

def rot_vec(vx, vy, vz, k):
    phi = math.radians(90 * k)
    c, s = round(math.cos(phi)), round(math.sin(phi))
    return (vx * c + vz * s, vy, -vx * s + vz * c)

def rotate_element(el, k):
    e = copy.deepcopy(el)
    f, t = el['from'], el['to']
    # gira os 2 cantos e renormaliza min/max (caixa continua alinhada)
    a = rot_pt(*f, k); b = rot_pt(*t, k)
    e['from'] = [min(a[0], b[0]), min(a[1], b[1]), min(a[2], b[2])]
    e['to']   = [max(a[0], b[0]), max(a[1], b[1]), max(a[2], b[2])]
    # rotação por-elemento: conjuga eixo + origem
    r = el.get('rotation')
    if r and r.get('angle'):
        axis = {'x': (1, 0, 0), 'y': (0, 1, 0), 'z': (0, 0, 1)}[r['axis']]
        va = rot_vec(*axis, k)
        # eixo dominante + sinal
        if abs(va[0]) > 0.5:   newaxis, sign = 'x', va[0]
        elif abs(va[1]) > 0.5: newaxis, sign = 'y', va[1]
        else:                  newaxis, sign = 'z', va[2]
        e['rotation'] = {
            'angle': r['angle'] * (1 if sign > 0 else -1),
            'axis': newaxis,
            'origin': list(rot_pt(*r['origin'], k)),
        }
    # faces: move dados das laterais p/ a nova direção; gira UV de up/down
    faces = el.get('faces') or {}
    newfaces = {}
    for fname, fdata in faces.items():
        fd = copy.deepcopy(fdata)
        if fname in ('up', 'down'):
            fd['rotation'] = (fd.get('rotation', 0) + 90 * k) % 360
            newfaces[fname] = fd
        else:
            newfaces[cyc(fname, k)] = fd
    e['faces'] = newfaces
    return e

def rotate_model(model, k):
    m = copy.deepcopy(model)
    m['elements'] = [rotate_element(el, k) for el in model.get('elements', [])]
    return m

def main():
    inp, outdir, base = sys.argv[1], sys.argv[2], sys.argv[3]
    model = json.load(open(inp))
    os.makedirs(outdir, exist_ok=True)
    # 0° = cópia do original
    json.dump(model, open(os.path.join(outdir, f'{base}.json'), 'w'))
    for k in (1, 2, 3):
        json.dump(rotate_model(model, k), open(os.path.join(outdir, f'{base}_{90*k}.json'), 'w'))
        print(f'  {base}_{90*k}.json')
    print('done')

if __name__ == '__main__':
    main()
