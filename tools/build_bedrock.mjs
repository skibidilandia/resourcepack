#!/usr/bin/env node
// Gera o pack BEDROCK + os mappings do Geyser a partir do pack Java JÁ CONSTRUÍDO
// (assets/skib/) — fonte da verdade versionada. Roda DEPOIS do build do pack Java.
//
//   node tools/build_bedrock.mjs
//
// Saída (no repo do SERVIDOR, irmão deste repo):
//   ../server/plugins/Geyser-Spigot/packs/SkibidilandiaBedrock/   (pack Bedrock)
//   ../server/plugins/Geyser-Spigot/custom_mappings/skibidilandia.json  (mappings)
//
// Como funciona: cada item custom usa o componente Java `minecraft:item_model` =
// `skib:<id>`. O Geyser 2.x mapeia DIRETO nesse componente (sistema novo de custom
// items), então vários itens com o mesmo item base (ex.: 6 cajados em TRIDENT) viram
// várias "definitions" sob `minecraft:trident`, cada uma com seu `model`. Sem colisão.
//
// Só os itens com TEXTURA CUSTOM (sprite 2D) viram custom item no Bedrock. Os que
// reaproveitam modelo vanilla (mineradoras=furnace, fornalha=blast_furnace, forja=
// smithing_table) são PULADOS de propósito: no Bedrock aparecem como o item base —
// que é exatamente como o jogador Java os vê.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RP = path.resolve(__dirname, '..');                       // repo do resourcepack
const SKIB = path.join(RP, 'assets', 'skib');
const OUT_GEYSER = path.resolve(RP, '..', 'server', 'plugins', 'Geyser-Spigot'); // repo do servidor (irmão)
// O Geyser SÓ carrega .zip/.mcpack da pasta packs/ (pasta solta é IGNORADA — fonte:
// ResourcePackLoader PACK_MATCHER "glob:**.{zip,mcpack}"). Então geramos um .mcpack.
const PACKS_DIR = path.join(OUT_GEYSER, 'packs');
const MCPACK_FILE = path.join(PACKS_DIR, 'SkibidilandiaBedrock.mcpack');
const MAPPINGS_FILE = path.join(OUT_GEYSER, 'custom_mappings', 'skibidilandia.json');

// ---- ZIP writer mínimo (deflate + CRC32 nativos do Node), grava caminhos com '/'.
// Determinístico (sem timestamp) → rebuild idêntico = mesmo .mcpack = sem ruído no git.
// Evita o Compress-Archive do PowerShell (grava '\' e o Minecraft ignora os assets).
function makeZip(entries) { // entries: [{ name, data: Buffer }]
  const DOS_DATE = 0x21; // 1980-01-01, fixo
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

// UUIDs FIXOS (não regenerar por build — senão o Bedrock trata como pack novo a cada
// vez e força re-download). Bumpar o PACK_VERSION quando o conteúdo mudar.
const HEADER_UUID = 'a7f3c1e0-9b2d-4c6a-8e1f-2d3b4c5a6e7f';
const MODULE_UUID = 'b8e4d2f1-0c3e-4d7b-9f20-3e4c5d6b7f80';
const PACK_VERSION = [1, 0, 6];
const PACK_NAME = 'Skibidilândia (Bedrock)';

// Itens cujo modelo Java é 3D (Blockbench, ex.: a Colhetadeira = crate4) e NÃO têm sprite 2D
// próprio (`skib:item/<id>`). No Bedrock o inventário/GUI é SEMPRE 2D, então damos um ÍCONE 2D
// dedicado (recorte da textura do crate) — senão o item cai no material base (dispenser) e o
// jogador Bedrock vê um dispenser na mão. id -> nome do PNG em textures/item/ (sem .png).
// (O BLOCO posto já renderiza 3D no Bedrock via Geyser custom_blocks; isto é só o item na mão.)
const ICON_OVERRIDE = {
  colhetadeira: 'colhetadeira_icon',
  // as 6 mineradoras compartilham o mesmo modelo (cf_generator_cart) -> mesmo ícone
  mineradora_carvao: 'cf_generator_cart_icon',
  mineradora_cobre: 'cf_generator_cart_icon',
  mineradora_ferro: 'cf_generator_cart_icon',
  mineradora_ouro: 'cf_generator_cart_icon',
  mineradora_diamante: 'cf_generator_cart_icon',
  mineradora_netherite: 'cf_generator_cart_icon',
  compactadora: 'cf_concrete_block_pallet_icon',
  // 6 máquinas aux: modelo 3D Blockbench (sem sprite 2D próprio). Ícone renderizado do
  // modelo via tools/render_item_icon.py (mesma transform display.gui do Java). O id do ITEM
  // (item_model skib:<id>) é a chave: SMELTER usa id "fornalha" mas modelo/ícone "forja".
  fornalha: 'forja_icon',
  mesa: 'mesa_icon',
  coletor: 'coletor_icon',
  espantalho: 'espantalho_icon',
  curral: 'curral_icon',
  matadouro: 'matadouro_icon',
  // TNT Nuclear: modelo 3D = barril explosivo (crates_explosive_barrel). Ícone renderizado.
  nuke_tnt: 'crates_explosive_barrel_icon',
};

// Material base de cada item (extraído do código do SkibCommon — ver
// server/BEDROCK-SUPPORT.md). minúsculo, vira `minecraft:<base>`.
const BASE_MATERIAL = {
  mjolnir: 'mace',
  espada_guerreiro: 'netherite_sword',
  adaga_assassino: 'netherite_sword',
  arco_elfo: 'bow',
  machado_lenhador: 'iron_axe',
  cajado_mago_fogo: 'trident',
  cajado_mago_raio: 'trident',
  cajado_mago_congelar: 'trident',
  cajado_curandeiro_cura: 'trident',
  cajado_curandeiro_gravidade: 'trident',
  cajado_necromante: 'trident',
  picareta_bedrock: 'golden_pickaxe',
  picareta_fornalha: 'iron_pickaxe',
  machado_fornalha: 'iron_axe',
  pa_fornalha: 'iron_shovel',
  nuke_tnt: 'tnt',
  carrinho_nuke: 'tnt_minecart',
  gema_infinito: 'amethyst_shard',
  // sprites 2D custom novos (viram custom item no Bedrock):
  modulo_industrial: 'heart_of_the_sea',
  foice_do_fazendeiro: 'shears',
  // os abaixo reaproveitam modelo vanilla / usam modelo 3D Blockbench (sem sprite 2D
  // próprio) — serão PULADOS; no Bedrock aparecem como o bloco/item base:
  forja_infinito: 'smithing_table',
  fornalha: 'blast_furnace',
  colhetadeira: 'dispenser',
  compactadora: 'dispenser',
  mineradora_carvao: 'furnace',
  mineradora_cobre: 'furnace',
  mineradora_ferro: 'furnace',
  mineradora_ouro: 'furnace',
  mineradora_diamante: 'furnace',
  mineradora_netherite: 'furnace',
  // 6 máquinas aux — material base = MachineType.getBaseBlock() do skib_common.
  // fornalha (SMELTER) já está acima = blast_furnace.
  mesa: 'crafting_table',        // CRAFTER
  coletor: 'hopper',             // COLLECTOR
  espantalho: 'carved_pumpkin',  // SCARECROW
  curral: 'hay_block',           // RANCH
  matadouro: 'bone_block',       // SLAUGHTERHOUSE
};

const DISPLAY_NAME = {
  mjolnir: 'Mjolnir',
  espada_guerreiro: 'Espada do Guerreiro',
  adaga_assassino: 'Adaga do Assassino',
  arco_elfo: 'Arco do Elfo',
  machado_lenhador: 'Machado Lenhador',
  cajado_mago_fogo: 'Cajado do Mago (Fogo)',
  cajado_mago_raio: 'Cajado do Mago (Raio)',
  cajado_mago_congelar: 'Cajado do Mago (Congelar)',
  cajado_curandeiro_cura: 'Cajado do Curandeiro (Cura)',
  cajado_curandeiro_gravidade: 'Cajado do Curandeiro (Gravidade)',
  cajado_necromante: 'Cajado do Necromante',
  picareta_bedrock: 'Picareta Quebra-Bedrock',
  picareta_fornalha: 'Picareta da Fornalha',
  machado_fornalha: 'Machado da Fornalha',
  pa_fornalha: 'Pá da Fornalha',
  nuke_tnt: 'TNT Nuclear',
  carrinho_nuke: 'Carrinho com TNT Nuclear',
  gema_infinito: 'Gema do Infinito',
  modulo_industrial: 'Módulo Industrial',
  foice_do_fazendeiro: 'Foice do Fazendeiro',
  colhetadeira: 'Colhetadeira',
  mineradora_carvao: 'Mineradora de Carvão',
  mineradora_cobre: 'Mineradora de Cobre',
  mineradora_ferro: 'Mineradora de Ferro',
  mineradora_ouro: 'Mineradora de Ouro',
  mineradora_diamante: 'Mineradora de Diamante',
  mineradora_netherite: 'Mineradora de Netherite',
  compactadora: 'Compactadora',
  fornalha: 'Fornalha Industrial',
  mesa: 'Super Mesa de Trabalho',
  coletor: 'Coletor',
  espantalho: 'Espantalho',
  curral: 'Curral Automático',
  matadouro: 'Matadouro',
};

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });
const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });

// Acha o valor de textura custom do modelo (ex.: "skib:item/mjolnir"), se houver.
function customTextureRef(model, id) {
  const tex = model.textures || {};
  const wanted = `skib:item/${id}`;
  for (const v of Object.values(tex)) if (v === wanted) return v;
  return null;
}

function main() {
  if (!fs.existsSync(SKIB)) throw new Error(`assets/skib não encontrado em ${SKIB}`);
  if (!fs.existsSync(path.resolve(RP, '..', 'server'))) {
    throw new Error('Repo ../server não encontrado ao lado do resourcepack — ajuste OUT_GEYSER.');
  }
  mkdirp(PACKS_DIR);
  mkdirp(path.dirname(MAPPINGS_FILE));
  // remove saída antiga (pasta solta de versões anteriores + .mcpack) pra não duplicar
  rmrf(path.join(PACKS_DIR, 'SkibidilandiaBedrock'));
  rmrf(MCPACK_FILE);

  const itemsDir = path.join(SKIB, 'items');
  const ids = fs.readdirSync(itemsDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();

  const textureData = {};
  const items = {}; // minecraft:<base> -> [definitions]
  const packFiles = []; // { name (path '/'), data: Buffer }
  const mapped = [], skipped = [], missingBase = [];

  for (const id of ids) {
    const modelPath = path.join(SKIB, 'models', 'item', `${id}.json`);
    if (!fs.existsSync(modelPath)) { skipped.push(`${id} (sem model)`); continue; }
    const model = readJSON(modelPath);
    let pngSrc = null;
    let hasCustomTex = false;

    // ICON_OVERRIDE tem PRECEDÊNCIA: itens de modelo 3D (forja/mesa/coletor/...) têm bloco
    // `textures` skib: pro Java, mas a textura é um ATLAS de UV (fica feio como ícone 2D no
    // Bedrock). O ícone renderizado (render_item_icon.py) é o que parece o item de verdade.
    if (ICON_OVERRIDE[id]) {
      const ovSrc = path.join(SKIB, 'textures', 'item', `${ICON_OVERRIDE[id]}.png`);
      if (fs.existsSync(ovSrc)) { pngSrc = ovSrc; hasCustomTex = true; }
    }

    // Senão, usa o sprite 2D próprio do item (skib:item/<id> + textures/item/<id>.png).
    if (!hasCustomTex) {
      pngSrc = path.join(SKIB, 'textures', 'item', `${id}.png`);
      hasCustomTex = customTextureRef(model, id) && fs.existsSync(pngSrc);
    }

    if (!hasCustomTex) {
      skipped.push(`${id} → modelo vanilla (${model.parent || '?'}); Bedrock mostra item base`);
      continue;
    }

    const base = BASE_MATERIAL[id];
    if (!base) { missingBase.push(id); continue; }

    const parent = String(model.parent || '');
    const handheld = parent.includes('handheld');
    const texKey = `skib_${id}`; // shorthand sem ':' nem '/' — serve de chave E de icon

    packFiles.push({ name: `textures/items/${id}.png`, data: fs.readFileSync(pngSrc) });
    textureData[texKey] = { textures: [`textures/items/${id}`] };

    const mcBase = `minecraft:${base}`;
    (items[mcBase] ||= []).push({
      type: 'definition',
      model: `skib:${id}`,
      bedrock_identifier: `skib:${id}`,
      display_name: DISPLAY_NAME[id] || id,
      bedrock_options: {
        icon: texKey,
        display_handheld: handheld,
        allow_offhand: true,
        creative_category: 'items',
      },
    });
    mapped.push(`${id} → ${mcBase}${handheld ? ' (handheld)' : ''}`);
  }

  // monta o conteúdo do .mcpack em memória
  packFiles.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify({
    format_version: 2,
    header: { name: PACK_NAME, description: 'Itens custom da Skibidilândia para Bedrock (via Geyser)', uuid: HEADER_UUID, version: PACK_VERSION, min_engine_version: [1, 21, 0] },
    modules: [{ type: 'resources', uuid: MODULE_UUID, version: PACK_VERSION }],
  }, null, 2)) });
  packFiles.push({ name: 'textures/item_texture.json', data: Buffer.from(JSON.stringify({
    resource_pack_name: 'SkibidilandiaBedrock',
    texture_name: 'atlas.items',
    texture_data: textureData,
  }, null, 2)) });
  const packPng = path.join(RP, 'pack.png');
  if (fs.existsSync(packPng)) packFiles.push({ name: 'pack_icon.png', data: fs.readFileSync(packPng) });

  // grava .mcpack (ordem estável p/ zip determinístico) e mappings
  packFiles.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(MCPACK_FILE, makeZip(packFiles));
  fs.writeFileSync(MAPPINGS_FILE, JSON.stringify({ format_version: 2, items }, null, 2));

  // relatório
  console.log(`\n== build_bedrock ==`);
  console.log(`Itens custom mapeados (${mapped.length}):`);
  for (const m of mapped) console.log(`  ✓ ${m}`);
  console.log(`\nPulados / item base no Bedrock (${skipped.length}):`);
  for (const s of skipped) console.log(`  ~ ${s}`);
  if (missingBase.length) {
    console.log(`\n⚠ SEM material base em BASE_MATERIAL (${missingBase.length}): ${missingBase.join(', ')}`);
  }
  console.log(`\n.mcpack:  ${MCPACK_FILE} (${packFiles.length} arquivos)`);
  console.log(`Mappings: ${MAPPINGS_FILE}`);
  console.log(`Bases distintas: ${Object.keys(items).length} (com colisões resolvidas por item_model)`);
}

main();
