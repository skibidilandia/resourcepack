# Skibidilândia — Resource Pack

Texturas customizadas dos itens dos plugins (skib_common). **Dois alvos a partir das mesmas
texturas:** o pack **Java** (`SkibidilandiaPack.zip`) e o pack **Bedrock** (`.mcpack`, via Geyser).
Detalhes do pack Java (pack_format, como funciona o `item_model`, hospedagem): `LEIA-ME.md`.
Visão geral do Bedrock/Geyser: `../server/BEDROCK-SUPPORT.md`.

## ⚠️ AO MUDAR QUALQUER TEXTURA OU ADICIONAR ITEM: atualizar OS DOIS alvos

Se mexer numa PNG / adicionar item, os dois packs precisam ser regerados, senão Java e Bedrock
ficam dessincronizados (um mostra textura nova, o outro a antiga / item base).

### 1) Pack Java
- Reconstruir o `SkibidilandiaPack.zip` (geradores em `tools/` — **NOTA: esses scripts NÃO
  estão neste checkout** (PowerShell/JS externos, ver `LEIA-ME.md`); só o zip construído está aqui).
- **Re-upload em https://mc-packs.net** → ele devolve uma URL + sha1 novos.
- Atualizar no `../server/server.properties`: `resource-pack`, `resource-pack-sha1` e
  `resource-pack-id`. (Hoje: `download.mc-packs.net/pack/251c88a1….zip`, sha1 `251c88a1…`.)
- **Só re-upa em mc-packs.net quando a textura muda** — se o conteúdo do zip não mudou
  (sha1 igual), não precisa.

### 2) Pack Bedrock (.mcpack + mappings do Geyser)
- Rodar: `node tools/build_bedrock.mjs` (lê `assets/skib/`, escreve direto em
  `../server/plugins/Geyser-Spigot/`).
- **BUMPAR `PACK_VERSION`** no `tools/build_bedrock.mjs` antes de rodar — senão o cliente
  Bedrock não re-baixa (usa o cache).
- Gera:
  - `packs/SkibidilandiaBedrock.mcpack` — **tem que ser .mcpack/.zip**; o Geyser IGNORA pasta
    solta em `packs/` (`ResourcePackLoader PACK_MATCHER "glob:**.{zip,mcpack}"`). O zip é feito
    por um writer nativo no próprio script (deflate+CRC32 do Node, paths `/`, determinístico) —
    **não usar `Compress-Archive`** do PowerShell (grava `\`, Minecraft ignora os assets).
  - `custom_mappings/skibidilandia.json` — mapeia o componente `minecraft:item_model = skib:<id>`.
- Cobertura: **16 itens com sprite custom** viram custom item no Bedrock; os ~11 que
  reaproveitam modelo vanilla (mineradoras, fornalha, forja, nuke…) aparecem como **item base**
  no Bedrock (= igual ao Java). Material base de cada item está hardcoded no `BASE_MATERIAL` do
  script (fonte: código do skib_common).

### 3) Deploy (no repo `../server`)
```
git add plugins/Geyser-Spigot/ server.properties   # + qualquer config alterado
make deploy                                         # sync (git ls-files) + restart
```
`make sync` só sobe arquivos **rastreados no git** → `git add` os novos antes.

## Não esquecer
- Itens **antigos** no inventário não atualizam o modelo sozinhos (Java) — pegar item novo
  via `/minemagic dar`, `/minerador dar`, etc.
- Renderização da textura no **Bedrock** só dá pra confirmar em **dispositivo real** (o boot do
  Geyser só confirma `Registered N custom items`, não a renderização).
