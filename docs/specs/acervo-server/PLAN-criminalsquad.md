# Plano de Implementação — Lado CriminalSquad (motor de sync)

> Recorte do [PLAN.md](PLAN.md) só com o que vive **neste repositório** (a engine compartilhada).
> Executável **sem servidor**: o motor sincroniza a partir de um pacote-semente assinado à mão.
> Como a engine é compartilhada, o que lançar aqui **DTSquad e EJsquad herdam** de graça.

## Escopo

O que entra: comando `acervo sync|status|packs`, verificação criptográfica, cache de packs, fusão
no índice, integração com o gate de citações, offline/degradação, testes.
O que **não** entra (é servidor, [PLAN.md](PLAN.md) F2/F3): CDN, `/v1/catalog`, esteira de
ingestão, corpus grande.

## Decisões de engenharia (cliente zero-dependência)

Refinam o formato abstrato do [SPEC §6](SPEC.md#6-formato-do-pacote) para o cliente Node não
precisar de dependência nativa:

1. **Sem tarball / sem zstd no cliente.** Um pack é um **diretório publicado**: `manifest.json` +
   um arquivo por tipo de entidade **gzipado** (`decisoes.jsonl.gz`, `teses.jsonl.gz`). O cliente
   busca os arquivos listados no manifesto individualmente. Evita tar-extractor e usa
   `zlib.gunzipSync` (built-in). `zstd` fica como upgrade futuro (Node ≥ 22.15 tem `zlib` zstd).
2. **Ed25519 com o `crypto` nativo.** `crypto.verify(null, contentHashBuf, pubKeyObject, sigBuf)`.
   Nenhuma lib externa.
3. **`content_hash` determinístico:** `sha256(sha256(file1) || sha256(file2) || …)` na ordem do
   manifesto. A assinatura é sobre o `content_hash`.
4. **Fonte do pack por flag nesta fase:** `--from <dir|url>` (semente local ou URL fixa). A troca
   por `/v1/catalog` + licença é um único ponto de integração (CM4), mockável em teste.

## Layout do cache

```
acervo/                      (PROTECTED em update.js — user-owned)
├── jurisprudencia/ …        (material do usuário — DISCOVERY_ONLY, intocado)
├── casos/                   (sigiloso — nunca indexado, nunca tocado)
└── _packs/                  (área GERENCIADA pelo sync — a única que o sync escreve)
    ├── _manifest.json       (registro do instalado: pack_id → version, hashes, verificado_em)
    └── jurisprudencia.stj.penal/
        ├── manifest.json
        └── decisoes.jsonl   (descomprimido após verificação)
```

Invariantes: o sync **só** escreve em `acervo/_packs/`; nunca toca `jurisprudencia/`, `doutrina/`,
`teses-modelos/`, `casos/` do usuário. `casos/` continua fora do índice.

## Superfície de CLI

```
legalsquad acervo sync   [--from <dir|url>] [--only <pack_id,…>] [--dry-run]
legalsquad acervo status                 # tiers, packs instalados, versão, frescor (idade)
legalsquad acervo packs  [--json]        # disponíveis vs instalados
legalsquad acervo verify                 # revalida assinatura/hash de tudo no cache
```
Wiring em `bin/legalsquad.js` (tabela de comandos) + `src/acervo-cli.js`, no padrão de
`search-acervo` e `captura`. `checkSuccess: true`.

## Algoritmo do `sync`

1. Descobrir a fonte (`--from` ou, na CM4, `/v1/catalog?license&product&have`).
2. Ler `acervo/_packs/_manifest.json` (o que já está instalado) para calcular o que baixar.
3. Para cada pack novo/atualizado (respeitando `--only`):
   a. Baixar/ler `manifest.json`.
   b. Baixar/ler cada arquivo de entidade listado.
   c. **Verificar:** `sha256` de cada arquivo == manifesto; recomputar `content_hash`; **verificar
      assinatura Ed25519** com a pública embarcada (`_legalsquad/config/acervo-keys.json`, por `kid`).
   d. **Só após verificar tudo:** gravar em `acervo/_packs/<pack_id>/` (escrita atômica: tmp → rename).
   e. Atualizar `acervo/_packs/_manifest.json` (`version`, `content_hash`, `verificado_em`).
4. Aplicar `revoked` (CM4): apagar do cache packs revogados.
5. Rodar `indexar-acervo`.
6. Relatar: baixados, tamanho, frescor; avisar packs vencidos. `--dry-run` só relata.

**Fail-closed:** qualquer falha de verificação → pack **recusado**, nada gravado, erro claro; o
sync segue com os demais e sai != 0.

## Marcos (com arquivos e aceite)

### CM0 — Fundações no repo  · *~2 dias*
- `_legalsquad/config/acervo-keys.json` (chave **pública** Ed25519 + `kid`).
- `schemas/acervo/*.json` (norma, dispositivo+versão, decisão, súmula, tese-firmada, tese-modelo).
- `tools/build-pack.mjs` (dev): entidades JSONL → diretório de pack + `manifest.json` + assinatura
  (assina com a privada, fora do repo).
- Fixture: 1 pacote-semente assinado em `tests/fixtures/acervo/seed/` (súmulas + leis penais + teses-modelo).
- **Aceite:** `build-pack` gera o semente; assinatura valida com a pública embarcada; schema-lint passa.

### CM1 — Núcleo do sync  · *~3–4 dias*
- `src/acervo-sync.js` (fetch/read, verify, escrita atômica, `_manifest.json`).
- `src/acervo-cli.js` + registro no `bin/`. `acervo sync --from`, `status`, `packs`, `verify`.
- **Aceite:**
  - `acervo sync --from tests/fixtures/acervo/seed` instala o semente em `acervo/_packs/`.
  - Trocar 1 byte de um arquivo do pack → **recusado** (hash/assinatura), nada gravado.
  - Chave errada → recusado. `--dry-run` não escreve. Re-sync é idempotente.
  - `casos/` e material do usuário intocados.

### CM2 — Fusão no índice  · *~2–3 dias*
- Estender `scripts/indexar-acervo.js` para varrer `acervo/_packs/**` e emitir entradas com
  `confianca: VERIFIED_OFFICIAL`, `fonte_pack: <id>@<versão>`, `verificado_em`, `situacao` e `urn`.
- `src/acervo-search.js`: resultado mostra proveniência (pack@versão), idade/frescor e **estado**
  (vigente/superado/revogado).
- **Aceite:** `search-acervo` acha entidades do pack marcadas `VERIFIED_OFFICIAL`; material do
  usuário continua `DISCOVERY_ONLY`; `casos/` fora do índice; índice fresco após sync.

### CM3 — Gate de citações  · *~2 dias*
- `_legalsquad/core/best-practices/verificacao-citacoes.md`: 3 níveis (assinado+vigente >
  DISCOVERY_ONLY > web). Citar dispositivo `revogado`/precedente `superado` **bloqueia** com aviso.
- Hook/checagem: quando uma peça cita uma URN presente no índice como `superado`/`revogado`, sinaliza.
- **Aceite:** citar uma súmula `vigente` do pack passa; citar um precedente `superado` bloqueia com
  a alternativa (`superado_por`).

### CM4 — Ponte com o servidor  · *~2 dias (após F2 do servidor)*
- Trocar `--from` fixo por `GET /v1/catalog` + `~/.config/legalsquad/license`; cache-first;
  base tier sem conta; aplicar `revoked`.
- **Aceite (mockado):** com licença Pro baixa o pack Pro; sem licença, só o base; URL expirada e
  401/403 tratados; nada de termos de busca sai do cliente (auditar o request).

## Plano de testes (`tests/acervo-sync.test.js`)

- Verificação: pack íntegro aceito; 1 byte trocado rejeitado; assinatura de chave errada rejeitada.
- Escrita: atômica; nada gravado em falha; idempotência do re-sync; `--dry-run` não escreve.
- Isolamento: `casos/` e subpastas do usuário nunca escritas nem indexadas.
- Índice: entidades do pack entram `VERIFIED_OFFICIAL` com proveniência; usuário `DISCOVERY_ONLY`.
- Offline: fonte inacessível → falha limpa, busca segue no cache.
- Gate: citar `superado`/`revogado` bloqueia.
- Todos junto com `lint` + `check:skills` verdes.

## Ordem e esforço

`CM0 → CM1 → CM2 → CM3` = **~1,5–2 semanas**, tudo neste repo, sem servidor, commitável e já útil
(o MVP do [PLAN.md](PLAN.md) F1). `CM4` engancha quando o servidor F2 existir.

## Herança multi-squad

Como `src/acervo-sync.js` e a extensão do `indexar-acervo` são **engine compartilhada**, ao portar
para DTSquad/EJsquad só muda o **pacote-semente** de cada um (`schemas` e motor idênticos). Nada de
reescrever o sync.
