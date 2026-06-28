#!/usr/bin/env node
// Gera o pack BEDROCK + o mapping do Geyser para os BLOCOS CUSTOM das máquinas
// (textura 3D no BLOCO POSTO no Bedrock). Separado do build_bedrock.mjs (que cuida dos
// ITENS na mão) — blocos custom são um subsistema diferente do Geyser (custom_blocks com
// state_overrides, não custom_items).
//
//   node tools/build_bedrock_block.mjs
//
// Saída (no repo do SERVIDOR, irmão deste repo):
//   ../server/plugins/Geyser-Spigot/packs/SkibidilandiaBlocks.mcpack       (geometria+textura Bedrock)
//   ../server/plugins/Geyser-Spigot/custom_mappings/skib_blocks.json       (mapping note_block -> bloco custom)
//
// COMO FUNCIONA:
// - O ItemsAdder backa cada bloco custom num note_block num estado FIXO (note=0/1/2...). O
//   estado exato é lido em runtime via CustomBlock.getBaseBlockData (probe no skib_common; ver
//   real_blocks_note_ids_cache.yml). UM único minecraft:note_block no Java -> UM bloco custom
//   Bedrock com VÁRIAS permutações (uma por estado/máquina) via state_overrides.
// - only_override_states: true deixa todos os outros estados de note_block como vanilla.
// - O Bedrock precisa da geometria (.geo.json) + textura + terrain_texture.json no pack.
//
// ⚠️ Se o IA reatribuir os ids (ex.: ao reordenar/adicionar máquinas), os estados Java MUDAM
//    e o Bedrock quebra SILENCIOSAMENTE (o Java continua, IA dona dos dois lados lá). Reconferir
//    real_blocks_note_ids_cache.yml + o probe a cada rollout e atualizar `note` abaixo.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RP = path.resolve(__dirname, '..');
const SKIB = path.join(RP, 'assets', 'skib');
const OUT_GEYSER = path.resolve(RP, '..', 'server', 'plugins', 'Geyser-Spigot');
const PACKS_DIR = path.join(OUT_GEYSER, 'packs');
const MCPACK_FILE = path.join(PACKS_DIR, 'SkibidilandiaBlocks.mcpack');
const MAPPINGS_FILE = path.join(OUT_GEYSER, 'custom_mappings', 'skib_blocks.json');

// Nome do bloco custom Bedrock por bloco-base Java (geyser_custom:<name>); cada máquina daquele
// backing vira uma permutação.
const BLOCK_NAME = { 'minecraft:note_block': 'skib_machine', 'minecraft:chorus_plant': 'skib_machine_t' };
const BLOCK_DISPLAY = 'Máquina';

// ---- Máquinas: cada uma é um modelo Java (Blockbench) backado num bloco-base do IA num estado
// FIXO (lido do probe CustomBlock.getBaseBlockData). Backings:
//   REAL_NOTE        -> minecraft:note_block   (cubo cheio, OK p/ modelo que preenche a célula)
//   REAL_TRANSPARENT -> minecraft:chorus_plant (NÃO occlui o chão -> sem buraco; usado nos
//                       modelos que não preenchem a célula: carrinho/pallet)
// `javaBlock` + `state` saem do probe e DEVEM bater com real_*_blocks cache do IA. As 6
// mineradoras compartilham UMA máquina (mesmo modelo cf_generator_cart).
const MACHINES = [
  { id: 'colhetadeira',   model: 'crates_crate4',            atlas: 'dungeon_crates_props',
    javaBlock: 'minecraft:note_block',   state: 'instrument=basedrum,note=0,powered=false' },
  // Mineradora: 4 variantes direcionais (modelo já girado 90/180/270°), cada uma num estado
  // chorus_plant próprio (do probe). Mesma textura (cf_generator_cart), geometria por variante.
  { id: 'mineradora',     model: 'cf_generator_cart',        atlas: 'cf_generator_cart',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=false,south=false,up=false,west=true' },
  { id: 'mineradora_90',  model: 'cf_generator_cart_90',     atlas: 'cf_generator_cart',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=false,south=false,up=true,west=true' },
  { id: 'mineradora_180', model: 'cf_generator_cart_180',    atlas: 'cf_generator_cart',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=false,south=true,up=false,west=false' },
  { id: 'mineradora_270', model: 'cf_generator_cart_270',    atlas: 'cf_generator_cart',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=false,south=true,up=false,west=true' },
  { id: 'compactadora',   model: 'cf_concrete_block_pallet', atlas: 'cf_concrete_block_pallet',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=false,south=false,up=true,west=false' },
  // 6 máquinas auxiliares (rollout jun/2026). `state` veio do [skib-probe] no boot do dev
  // (CustomBlock.getBaseBlockData) — REAL_NOTE -> note_block note=3/4/5; REAL_TRANSPARENT ->
  // chorus_plant. ⚠️ Se reordenar/adicionar blocos no IA, reconferir o probe e atualizar aqui.
  { id: 'forja',      model: 'forja',      atlas: 'forja',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=true,south=false,up=true,west=false' },
  { id: 'mesa',       model: 'mesa',       atlas: 'mesa',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=true,south=false,up=false,west=true' },
  { id: 'coletor',    model: 'coletor',    atlas: 'coletor',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=true,south=false,up=true,west=true' },
  { id: 'espantalho', model: 'espantalho', atlas: 'espantalho',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=false,south=true,up=true,west=false' },
  { id: 'curral',     model: 'curral',     atlas: 'curral',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=false,south=true,up=true,west=true' },
  { id: 'matadouro',  model: 'matadouro',  atlas: 'matadouro',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=true,south=false,up=false,west=false' },
  // TNT Nuclear posto: barril explosivo (mesma textura do crate da Colhetadeira). Agora
  // REAL_TRANSPARENT (chorus_plant, do probe) p/ não deixar buraco no chão embaixo.
  { id: 'nuke',       model: 'crates_explosive_barrel', atlas: 'dungeon_crates_props',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=true,south=true,up=false,west=false' },

  // ---- variantes direcionais _90/_180/_270 (rollout facing, jun/2026). states do [skib-probe].
  { id: 'colhetadeira_90',  model: 'crates_crate4_90',               atlas: 'dungeon_crates_props',
    javaBlock: 'minecraft:note_block', state: 'instrument=basedrum,note=7,powered=false' },
  { id: 'colhetadeira_180', model: 'crates_crate4_180',              atlas: 'dungeon_crates_props',
    javaBlock: 'minecraft:note_block', state: 'instrument=basedrum,note=8,powered=false' },
  { id: 'colhetadeira_270', model: 'crates_crate4_270',              atlas: 'dungeon_crates_props',
    javaBlock: 'minecraft:note_block', state: 'instrument=basedrum,note=9,powered=false' },
  { id: 'compactadora_90',  model: 'cf_concrete_block_pallet_90',    atlas: 'cf_concrete_block_pallet',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=true,south=true,up=false,west=true' },
  { id: 'compactadora_180', model: 'cf_concrete_block_pallet_180',   atlas: 'cf_concrete_block_pallet',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=true,south=true,up=true,west=false' },
  { id: 'compactadora_270', model: 'cf_concrete_block_pallet_270',   atlas: 'cf_concrete_block_pallet',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=false,north=true,south=true,up=true,west=true' },
  { id: 'forja_90',         model: 'forja_90',                       atlas: 'forja',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=false,south=false,up=false,west=false' },
  { id: 'forja_180',        model: 'forja_180',                      atlas: 'forja',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=false,south=false,up=false,west=true' },
  { id: 'forja_270',        model: 'forja_270',                      atlas: 'forja',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=false,south=false,up=true,west=false' },
  { id: 'mesa_90',          model: 'mesa_90',                        atlas: 'mesa',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=false,south=false,up=true,west=true' },
  { id: 'mesa_180',         model: 'mesa_180',                       atlas: 'mesa',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=false,south=true,up=false,west=false' },
  { id: 'mesa_270',         model: 'mesa_270',                       atlas: 'mesa',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=false,south=true,up=false,west=true' },
  { id: 'coletor_90',       model: 'coletor_90',                     atlas: 'coletor',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=false,south=true,up=true,west=false' },
  { id: 'coletor_180',      model: 'coletor_180',                    atlas: 'coletor',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=false,south=true,up=true,west=true' },
  { id: 'coletor_270',      model: 'coletor_270',                    atlas: 'coletor',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=true,south=false,up=false,west=false' },
  { id: 'matadouro_90',     model: 'matadouro_90',                   atlas: 'matadouro',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=true,south=false,up=false,west=true' },
  { id: 'matadouro_180',    model: 'matadouro_180',                  atlas: 'matadouro',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=true,south=false,up=true,west=false' },
  { id: 'matadouro_270',    model: 'matadouro_270',                  atlas: 'matadouro',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=true,south=false,up=true,west=true' },
  { id: 'curral_90',        model: 'curral_90',                      atlas: 'curral',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=true,south=true,up=false,west=false' },
  { id: 'curral_180',       model: 'curral_180',                     atlas: 'curral',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=true,south=true,up=false,west=true' },
  { id: 'curral_270',       model: 'curral_270',                     atlas: 'curral',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=true,south=true,up=true,west=false' },
  // espantalho direcional (facing fix)
  { id: 'espantalho_90',    model: 'espantalho_90',                  atlas: 'espantalho',
    javaBlock: 'minecraft:chorus_plant', state: 'down=false,east=true,north=true,south=true,up=true,west=true' },
  { id: 'espantalho_180',   model: 'espantalho_180',                 atlas: 'espantalho',
    javaBlock: 'minecraft:chorus_plant', state: 'down=true,east=false,north=false,south=false,up=false,west=false' },
  { id: 'espantalho_270',   model: 'espantalho_270',                 atlas: 'espantalho',
    javaBlock: 'minecraft:chorus_plant', state: 'down=true,east=false,north=false,south=false,up=false,west=true' },
];
const geoId = (id) => `geometry.blocks.${id}`;
const texShort = (atlas) => `skib_${atlas}`;      // chave no terrain_texture.json + material_instances (por TEXTURA)
const texPath = (atlas) => `textures/blocks/${atlas}`; // sem extensão (convenção Bedrock)

// ---- UUIDs FIXOS (não regenerar — senão Bedrock re-baixa). Bumpar PACK_VERSION ao mudar conteúdo.
// jun/2026: UUID TROCADO de propósito 1x p/ FORÇAR re-download (o client tava preso no pack
// cacheado antigo e o bump de versão sozinho não bustava o cache). Manter estes novos daqui pra frente.
const HEADER_UUID = 'c9f5e3a2-1d4f-4e8c-af31-4f5d6e7a8c03';
const MODULE_UUID = 'd0a6f4b3-2e5a-4f9d-b042-5a6e7f8b9d14';
const PACK_VERSION = [1, 0, 14];
const PACK_NAME = 'Skibidilândia Blocos (Bedrock)';

// ---- ZIP writer determinístico (mesmo do build_bedrock.mjs) ------------------------------
function makeZip(entries) {
  const DOS_DATE = 0x21;
  const locals = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data) >>> 0;
    const deflated = zlib.deflateRawSync(data);
    const useDeflate = deflated.length < data.length;
    const method = useDeflate ? 8 : 0;
    const body = useDeflate ? deflated : data;
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0); lfh.writeUInt16LE(20, 4); lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(method, 8); lfh.writeUInt16LE(0, 10); lfh.writeUInt16LE(DOS_DATE, 12);
    lfh.writeUInt32LE(crc, 14); lfh.writeUInt32LE(body.length, 18); lfh.writeUInt32LE(data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26); lfh.writeUInt16LE(0, 28);
    locals.push(lfh, nameBuf, body);
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0); cdh.writeUInt16LE(20, 4); cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8); cdh.writeUInt16LE(method, 10); cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(DOS_DATE, 14); cdh.writeUInt32LE(crc, 16); cdh.writeUInt32LE(body.length, 20);
    cdh.writeUInt32LE(data.length, 24); cdh.writeUInt16LE(nameBuf.length, 28); cdh.writeUInt32LE(0, 30);
    cdh.writeUInt16LE(0, 34); cdh.writeUInt16LE(0, 36); cdh.writeUInt32LE(0, 38); cdh.writeUInt32LE(offset, 42);
    central.push(cdh, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

// ---- Conversão Java (Blockbench) -> geometria Bedrock --------------------------------------
// Convenção (espelho no X): origin = [8 - to_x, from_y, from_z - 8]; size = to-from.
// O X espelhado TROCA as faces east<->west. UV Java (espaço 0-16) -> pixel = uv * (texSize/16).
// Espelho no X inverte a handedness da rotação e o Bedrock usa convenção oposta à do Java; o
// produto dá +1 em cada eixo (confirmado no caixote: com -1 as abas fechavam pra BAIXO; com +1
// abrem pra CIMA como no Java).
const ROT_SIGN = { x: 1, y: 1, z: 1 };

function convFace([u1, v1, u2, v2], uvScale) {
  return { uv: [u1 * uvScale, v1 * uvScale], uv_size: [(u2 - u1) * uvScale, (v2 - v1) * uvScale] };
}

function convFaces(faces, uvScale) {
  const remap = { north: 'north', south: 'south', up: 'up', down: 'down', east: 'west', west: 'east' };
  const out = {};
  for (const [jf, data] of Object.entries(faces)) {
    if (!data || !data.uv) continue;
    out[remap[jf] || jf] = convFace(data.uv, uvScale);
  }
  return out;
}

function convElement(el, uvScale) {
  const f = el.from, t = el.to;
  const lo = [Math.min(f[0], t[0]), Math.min(f[1], t[1]), Math.min(f[2], t[2])];
  const hi = [Math.max(f[0], t[0]), Math.max(f[1], t[1]), Math.max(f[2], t[2])];
  const cube = {
    origin: [8 - hi[0], lo[1], lo[2] - 8],
    size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]],
    uv: convFaces(el.faces || {}, uvScale),
  };
  const r = el.rotation;
  if (r && r.angle) {
    cube.pivot = [8 - r.origin[0], r.origin[1], r.origin[2] - 8];
    cube.rotation = [
      r.axis === 'x' ? ROT_SIGN.x * r.angle : 0,
      r.axis === 'y' ? ROT_SIGN.y * r.angle : 0,
      r.axis === 'z' ? ROT_SIGN.z * r.angle : 0,
    ];
  }
  return cube;
}

// ---- Limite de geometria de BLOCO custom do Bedrock: a renderização é CORTADA (bloco fica
// INVISÍVEL) se a geometria sair da caixa [-8, 24] em qualquer eixo. A Compactadora cabe nessa
// caixa (X[-5,21]...) e por isso renderiza; modelos maiores (forja 48 de largura, espantalho
// 47 de altura) estouram e somem. Solução: pros que estouram, ESCALAR uniforme pra caber
// (mantém proporção), aterrar no Y=0 e empurrar X/Z pra dentro da caixa. Quem já cabe não muda.
// Limite real do Bedrock (CONFIRMADO in-game): geometria some se passar de ~[-8,24]. 18 renderiza
// (testado), 24 some. Compactadora rendezava nativa até 21. Alvo 22 (vão 30 = limite documentado
// de 1.875 bloco) = o MAIOR que renderiza com segurança. Modelos grandes (forja 3 blocos largura,
// espantalho 3 de altura) ENCOLHEM no Bedrock — limite da plataforma, inevitável (no Java ficam 100%).
const BMIN = -8, BMAX = 22, BSPAN = BMAX - BMIN; // 30
function bboxOf(cubes) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const c of cubes) {
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c.origin[i]); hi[i] = Math.max(hi[i], c.origin[i] + c.size[i]); }
  }
  return { lo, hi };
}
function fitBedrock(cubes) {
  let { lo, hi } = bboxOf(cubes);
  if (lo.every((v) => v >= BMIN) && hi.every((v) => v <= BMAX)) return { cubes, scale: 1 };
  const spanX = hi[0] - lo[0], spanY = hi[1] - lo[1], spanZ = hi[2] - lo[2];
  // escala uniforme: cada vão <= 32 (X/Z) e altura aterrada <= 24 (Y)
  const s = Math.min(1, BSPAN / spanX, BSPAN / spanZ, BMAX / Math.max(hi[1], spanY));
  let sc = cubes.map((c) => ({
    ...c,
    origin: c.origin.map((v) => v * s),
    size: c.size.map((v) => v * s),
    ...(c.pivot ? { pivot: c.pivot.map((v) => v * s) } : {}),
  }));
  ({ lo, hi } = bboxOf(sc));
  const t = [0, 0, 0];
  t[1] = -lo[1]; // aterra no chão (minY -> 0)
  if (hi[1] + t[1] > BMAX) t[1] = BMAX - hi[1];
  for (const i of [0, 2]) {
    if (lo[i] < BMIN) t[i] = BMIN - lo[i];
    else if (hi[i] > BMAX) t[i] = BMAX - hi[i];
  }
  const out = sc.map((c) => ({
    ...c,
    origin: [c.origin[0] + t[0], c.origin[1] + t[1], c.origin[2] + t[2]],
    ...(c.pivot ? { pivot: [c.pivot[0] + t[0], c.pivot[1] + t[1], c.pivot[2] + t[2]] } : {}),
  }));
  return { cubes: out, scale: s };
}

function machineGeometry(m) {
  const model = JSON.parse(fs.readFileSync(path.join(SKIB, 'models', 'item', `${m.model}.json`), 'utf8'));
  const texSize = model.texture_size || [16, 16];
  const uvScale = texSize[0] / 16;
  const rawCubes = (model.elements || []).map((el) => convElement(el, uvScale));
  const { cubes, scale } = fitBedrock(rawCubes);
  if (scale < 1) console.log(`    ↳ ${m.id}: geometria fora de [-8,24] do Bedrock -> escalada p/ ${(scale * 100).toFixed(0)}% (cabe + aterrada)`);
  return {
    geo: {
      format_version: '1.16.0',
      'minecraft:geometry': [{
        description: {
          identifier: geoId(m.id),
          texture_width: texSize[0],
          texture_height: texSize[1],
          visible_bounds_width: 3,
          visible_bounds_height: 3,
          visible_bounds_offset: [0, 1, 0],
        },
        bones: [{ name: m.id, pivot: [0, 0, 0], cubes }],
      }],
    },
    elements: (model.elements || []).length,
  };
}

const matInstances = (atlas) => ({
  '*': { texture: texShort(atlas), render_method: 'opaque', face_dimming: true, ambient_occlusion: true },
});

function main() {
  if (!fs.existsSync(path.resolve(RP, '..', 'server'))) throw new Error('Repo ../server não encontrado.');
  fs.mkdirSync(PACKS_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(MAPPINGS_FILE), { recursive: true });
  fs.rmSync(MCPACK_FILE, { force: true });

  const packFiles = [];
  packFiles.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify({
    format_version: 2,
    header: { name: PACK_NAME, description: 'Blocos custom das máquinas (Bedrock via Geyser)', uuid: HEADER_UUID, version: PACK_VERSION, min_engine_version: [1, 21, 0] },
    modules: [{ type: 'resources', uuid: MODULE_UUID, version: PACK_VERSION }],
  }, null, 2)) });

  const textureData = {};
  const overridesByBlock = {}; // javaBlock -> { state: {geometry, material_instances} }
  const firstByBlock = {};     // javaBlock -> primeira máquina (geometria/material fallback)
  const pushedTex = new Set(); // atlas já empurrado (variantes da Mineradora compartilham textura)
  const report = [];
  for (const m of MACHINES) {
    const atlasSrc = path.join(SKIB, 'textures', 'item', `${m.atlas}.png`);
    if (!fs.existsSync(atlasSrc)) throw new Error(`Atlas não encontrado: ${atlasSrc}`);
    const { geo, elements } = machineGeometry(m);
    if (!pushedTex.has(m.atlas)) {
      packFiles.push({ name: `${texPath(m.atlas)}.png`, data: fs.readFileSync(atlasSrc) });
      textureData[texShort(m.atlas)] = { textures: texPath(m.atlas) };
      pushedTex.add(m.atlas);
    }
    packFiles.push({ name: `models/blocks/${m.id}.geo.json`, data: Buffer.from(JSON.stringify(geo, null, 2)) });
    (overridesByBlock[m.javaBlock] ||= {})[m.state] = { geometry: geoId(m.id), material_instances: matInstances(m.atlas) };
    if (!firstByBlock[m.javaBlock]) firstByBlock[m.javaBlock] = m;
    report.push(`${m.id} (${m.model}, ${elements} elems, ${m.javaBlock}[${m.state}])`);
  }

  packFiles.push({ name: 'textures/terrain_texture.json', data: Buffer.from(JSON.stringify({
    resource_pack_name: 'SkibidilandiaBlocks',
    texture_name: 'atlas.terrain',
    texture_data: textureData,
  }, null, 2)) });
  const packPng = path.join(RP, 'pack.png');
  if (fs.existsSync(packPng)) packFiles.push({ name: 'pack_icon.png', data: fs.readFileSync(packPng) });

  packFiles.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(MCPACK_FILE, makeZip(packFiles));

  // ---- Mapping do Geyser: UM bloco custom Bedrock por bloco-base Java (note_block, chorus_plant),
  // cada um com várias permutações via state_overrides; só os estados exatos do IA viram custom,
  // o resto de cada bloco-base fica vanilla (only_override_states).
  const blocks = {};
  for (const [javaBlock, stateOverrides] of Object.entries(overridesByBlock)) {
    const fm = firstByBlock[javaBlock];
    blocks[javaBlock] = {
      name: BLOCK_NAME[javaBlock],
      display_name: BLOCK_DISPLAY,
      geometry: geoId(fm.id),
      material_instances: matInstances(fm.atlas),
      only_override_states: true,
      state_overrides: stateOverrides,
    };
  }
  const mapping = { format_version: 1, blocks };
  fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mapping, null, 2));

  console.log('\n== build_bedrock_block ==');
  console.log(`Blocos-base Java mapeados: ${Object.keys(blocks).join(', ')} (${MACHINES.length} máquinas)`);
  for (const r of report) console.log(`  ✓ ${r}`);
  console.log(`ROT_SIGN=${JSON.stringify(ROT_SIGN)}`);
  console.log(`.mcpack:  ${MCPACK_FILE} (${packFiles.length} arquivos)`);
  console.log(`Mapping:  ${MAPPINGS_FILE}`);
}

main();
