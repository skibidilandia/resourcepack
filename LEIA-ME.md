# Resource Pack — Skibidilândia

Texturas customizadas dos itens dos plugins (fuckbedrocks, furnacetools, minemagic, miner).
O pack é baixado automaticamente quando o player conecta.

## ⚠️ pack_format precisa bater com a versão do CLIENTE

O `pack_format` é da versão do **cliente** que conecta. Cliente = **26.1.2 → format 84**
(campo `pack_version.resource_major` do `version.json`). O `pack.mcmeta` declara
`pack_format: 84` com `supported_formats: [46, 120]` para tolerar clientes 1.21.x
(ViaVersion) e versões futuras. Se o cliente padrão mudar, confira o `resource_major`
no `version.json` do jar do cliente e ajuste em `tools/build_pack.js`.

## Como funciona (técnico)

Cada item custom recebe o componente `minecraft:item_model` apontando para `skib:<id>`
(feito no código via `SkibModel.apply(item, "<id>")`). O client resolve isso para
`assets/skib/items/<id>.json` → modelo `skib:item/<id>` → textura
`assets/skib/textures/item/<id>.png`. **Só os itens custom são afetados** — nenhum
item vanilla muda de aparência.

> Itens **antigos** (já no inventário/baús) não atualizam o modelo sozinhos — pegue
> itens novos com `/minemagic dar`, `/minerador dar`, `/maquina dar`, `/furnacetool dar`,
> `/fuckbedrocks dar` para ver as texturas.

## Reconstruir o pack

Depois de trocar qualquer PNG em `skib_common/assets/img/` ou ajustar os geradores:

```powershell
powershell -ExecutionPolicy Bypass -File tools\pack.ps1
```

Isso recolore os cajados, regenera as mineradoras/máquinas, reescreve os JSON e
gera `SkibidilandiaPack.zip` + imprime o **sha1** novo.

> **Não empacote com `Compress-Archive`** (PowerShell 5.1): ele grava os caminhos
> internos com `\` e o Minecraft só lê o `pack.mcmeta` da raiz, ignorando todos os
> assets (textura faltando = preto/magenta). Por isso usamos `tools/zip.js`, que grava
> com `/`. O `pack.ps1` já chama o zipper certo.

## Hospedar no GitHub e ligar o auto-download

Em uso: **release** `jlenon7/skibidilandia` tag `1.0.0`, asset `SkibidilandiaPack.zip`.

1. Suba o `SkibidilandiaPack.zip` (raiz deste repo) como asset do release.
2. No `skibidilandia/server.properties` (já configurado):

   ```properties
   resource-pack=https://github.com/jlenon7/skibidilandia/releases/download/1.0.0/SkibidilandiaPack.zip
   resource-pack-sha1=02c2d64c8ff56e56b18a49894c88b3916b84e018
   require-resource-pack=true
   resource-pack-prompt=Texturas personalizadas da Skibidilândia
   ```

3. Reinicie o servidor. **Após cada novo upload do zip, atualize o `resource-pack-sha1`**
   com o valor que o `pack.ps1`/`zip.js` imprime — o client usa o sha1 pra decidir se
   re-baixa, então com o sha1 certo ele ignora o cache antigo mesmo na mesma URL.

> Se substituir o asset na mesma tag e o client insistir no cache, crie uma tag nova
> (`.../releases/download/1.0.1/...`) e ajuste a URL — release não tem o cache agressivo
> do raw, mas o CDN pode segurar o asset antigo por um tempo.

## Mapa de itens → textura

| Item | id (skib:) | fonte |
|---|---|---|
| Picareta Quebra-Bedrock | picareta_bedrock | fornecida |
| TNT Nuclear | nuke_tnt | fornecida |
| Carrinho com TNT Nuclear | carrinho_nuke | gerada |
| Picareta/Machado/Pá da Fornalha | picareta_fornalha / machado_fornalha / pa_fornalha | fornecidas |
| Machado Lenhador | machado_lenhador | fornecida (32×32) |
| Cajado do Mago (Fogo/Raio/Congelar) | cajado_mago_fogo / _raio / _congelar | recolor de cajados.png |
| Cajado do Curandeiro (Cura/Gravidade) | cajado_curandeiro_cura / _gravidade | recolor |
| Cajado do Necromante | cajado_necromante | recolor (roxo) |
| Arco do Elfo | arco_elfo | fornecida |
| Mjolnir | mjolnir | fornecida |
| Espada do Guerreiro | espada_guerreiro | fornecida |
| Adagas do Assassino | adaga_assassino | fornecida |
| Gema do Infinito | gema_infinito | fornecida |
| Forja do Infinito | forja_infinito | fornecida (só o item; o bloco colocado fica smithing table vanilla) |
| Mineradoras (carvão→netherite) | mineradora_carvao … _netherite | geradas |
| Colhetadeira / Compactadora | colhetadeira / compactadora | geradas |
