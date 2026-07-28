# Acervo-as-a-Service — Especificação Técnica

> Status: **Rascunho para decisão** · Escopo: distribuição de acervo jurídico (legislação,
> jurisprudência, súmulas, teses) e de áreas do Direito para o motor LegalSquad — **um produto,
> N áreas** (§1.2). Companheiros: [PLAN.md](PLAN.md) (plano de implementação) e
> [`DESCOBERTA.md`](../legalsquad/DESCOBERTA.md) (descoberta, licença e busca).

Documento visual de arquitetura/modelagem que originou este spec:
`scratchpad/acervo-server-design.html` (design doc).

---

## 1. Contexto e objetivo

Hoje cada squad traz um `acervo/` local, curado, semeado no `init` e **nunca sobrescrito** no
`update` (é PROTECTED em `src/update.js`). A pesquisa (`search-acervo`) roda 100% local sobre
`acervo/_index.yaml`. Isso é ótimo para **sigilo** e **offline**, mas o corpus:

- **envelhece** (legislação e jurisprudência mudam toda hora);
- **não cabe** por inteiro num pacote npm;
- é **curado manualmente** por squad, sem fonte central.

**Objetivo:** um serviço central que **distribui** o corpus em pacotes assinados e versionados;
cada squad **baixa, cacheia e pesquisa localmente**. Uma infra, N produtos.

### 1.1 A inversão que preserva o sigilo

> O servidor **distribui dados** (pacotes, tráfego de saída). Ele **não recebe buscas**
> (a query nunca entra). A pesquisa continua **local**.

O servidor vê: chave de licença + quais pacotes/versões o cliente já tem. **Nunca vê**: o que o
profissional pesquisa, nada do caso, nada do cliente, e jamais a pasta `acervo/casos/` (sigilosa,
gitignored). Isso mantém a postura LGPD de **distribuidor de conteúdo** (não operador de busca) e
não trai o discurso "tudo local, nada vaza" que é o maior ativo dos produtos.

### 1.2 Topologia — um produto, N áreas

```
                         ┌─────────────────────────────┐
                         │   ACERVO SERVER (1 só)       │
                         │   corpus + build + sign + CDN│
                         │   + endpoint de licença      │
                         └──────────────┬──────────────┘
              pacotes assinados por área (saída)
                                        ▼
                              ┌───────────────────┐
                              │    LegalSquad     │
                              │  (motor único)    │
                              └─────────┬─────────┘
        ┌───────────────────┬───────────┴───────────┬───────────────────┐
        ▼                   ▼                       ▼                   ▼
   area.criminal      area.trabalhista        area.extrajudicial    (futuras)
   penal, proc.       trabalhista, proc.      registral,
   penal, execução    do trabalho             notarial, civil
        └──────── transversal (acompanha todas) · busca local ────────┘
```

**Um motor, um produto, N áreas.** Uma licença válida libera **todas** as áreas (§7.1) — não há
entitlement por área nem tiers. As áreas diferem só no `pack_id`; os **schemas de dados são
idênticos** entre elas — jurisprudência trabalhista tem a mesma forma que criminal.

> Direito a tudo **não é** posse de tudo: o cliente sincroniza o **catálogo** de todas as áreas
> (fino, sempre) e baixa **conteúdo** sob demanda (§9.2). Ver
> [`DESCOBERTA §2`](../legalsquad/DESCOBERTA.md).

---

## 2. Princípios inegociáveis

1. **Busca é local.** Nenhuma query sai da máquina. O servidor nunca recebe termos de pesquisa.
2. **`casos/` nunca toca a rede.** Dado de cliente é sagrado.
3. **Fail-closed.** Pacote sem assinatura válida é **recusado** (não "avisa e usa").
4. **Offline-first.** Após o sync, tudo funciona sem rede. Licença expirada **degrada** para o
   último cache (somente leitura, com aviso) — nunca vira tijolo.
5. **Integridade de citação.** Um precedente adulterado numa peça é catástrofe; a verificação
   criptográfica no cliente é obrigatória.
6. **Minimização de dados (LGPD).** O endpoint de licença registra o mínimo (chave, packs,
   timestamp). Sem perfilamento de uso.
7. **`main` leve.** Só o pacote-base vem no npm; o corpus pesado é sincronizado.
8. **Nada quebra o que existe.** `acervo/`, `_index.yaml`, `search-acervo`, `indexar-acervo`
   permanecem; o sync **alimenta** o índice, não o substitui.

---

## 3. Arquitetura macro

O "servidor" é uma **esteira de build + uma borda de distribuição** — não um backend de runtime no
caminho crítico de nenhuma busca.

**Servidor (ver §8):** coletores por fonte → normalização/canonização (URN) → build de pacotes →
assinatura (Ed25519) → CDN de tarballs + endpoint de licença. Curadoria humana antes de assinar.

**Cliente (ver §9):** `legalsquad acervo sync` → lê manifesto → baixa deltas → **verifica
assinatura/hash** → funde no cache `acervo/_packs/` → roda `indexar-acervo` → `search-acervo` local.

---

## 4. Modelo de dados

Três regras atravessam **todas** as entidades: **URN canônica** (identidade estável), **situação
temporal** (o que vale *quando*) e **vínculos por URN** (nunca por texto solto).

### 4.1 Identidade — URN LexML

Adotar o padrão brasileiro `urn:lex:br:…` para norma, dispositivo, acórdão e súmula. Ganhos de
graça: dedup (mesma norma de duas fontes colapsa), citações que **resolvem** deterministicamente, e
base para o `verificacao-citacoes` conferir existência + vigência.

| Entidade | URN (exemplo) |
|---|---|
| Norma | `urn:lex:br:federal:decreto.lei:1940-12-07;2848` |
| Dispositivo | `urn:lex:br:federal:decreto.lei:1940-12-07;2848!art121` |
| Acórdão | `urn:lex:br:supremo.tribunal.federal:habeas.corpus;126292` |
| Súmula | `urn:lex:br:supremo.tribunal.federal:sumula.vinculante;11` |

Chave interna do banco pode ser curta; a URN é o identificador **público** que viaja nas citações.

### 4.2 Legislação — norma → dispositivo → **versão** (temporal)

Uma lei é uma **hierarquia de dispositivos que mudam no tempo**. Separar o *dispositivo* (a casca,
Art. 121) das suas *versões de redação* (o texto que valeu em cada intervalo) é o que responde
"qual era a pena na data do fato" — base de *lex mitior* e *tempus regit actum*.

```jsonc
// dispositivo (identidade estável)
{
  "urn": "urn:lex:br:federal:decreto.lei:1940-12-07;2848!art121",
  "norma_urn": "urn:lex:br:federal:decreto.lei:1940-12-07;2848",
  "tipo": "artigo", "rotulo": "Art. 121", "parent_urn": null, "ordem": 121,
  "ramo": ["penal"]
}
// versão de redação (o que se cita por data)
{
  "dispositivo_urn": "…;2848!art121_p2o_VII",
  "texto": "VII – contra a mulher por razões da condição de sexo feminino:",
  "vigencia_inicio": "2015-03-09",
  "vigencia_fim": null,
  "redacao_dada_por": "urn:lex:br:federal:lei:2015-03-09;13104",
  "revogado_por": null,
  "situacao": "vigente"            // vigente | revogada | futura
}
```

### 4.3 Jurisprudência — julgado + estado atual

O campo que separa amador de profissional é `situacao`: o julgado **ainda é bom direito**, foi
*superado* ou *distinguido*?

```jsonc
{
  "urn": "urn:lex:br:supremo.tribunal.federal:habeas.corpus;126292",
  "tribunal": "STF", "orgao": "Tribunal Pleno",
  "classe": "HC", "numero": "126.292", "relator": "Min. Teori Zavascki",
  "julgamento": "2016-02-17", "publicacao": "2016-05-17",
  "ramo": "processual-penal",
  "ementa": "Execução provisória de acórdão penal condenatório…",
  "tese": "A execução da pena após condenação em 2ª instância não viola a presunção de inocência.",
  "dispositivos_citados": ["urn:lex:br:federal:constituicao:1988-10-05;1988!art5_LVII"],
  "tema_id": null,
  "situacao": "superado",          // vigente | superado | distinguido | pendente
  "superado_por": "urn:lex:br:supremo.tribunal.federal:acao.declaratoria.constitucionalidade;43",
  "inteiro_teor_ref": "stf://acordao/126292.pdf",
  "fonte": "stf-dados-abertos"
}
```

### 4.4 Súmula / 4.5 Tese firmada (repetitivo, repercussão geral)

```jsonc
// Súmula
{ "urn": "…:sumula.vinculante;11", "tribunal": "STF", "numero": 11, "vinculante": true,
  "texto": "Só é lícito o uso de algemas…", "ramo": "processual-penal",
  "situacao": "vigente", "precedentes": ["…;91952"], "aprovacao": "2008-08-13" }
// Tese firmada
{ "id": "stj-tema-1053", "tribunal": "STJ", "sistema": "recurso-repetitivo", "tema": 1053,
  "tese": "O reconhecimento fotográfico deve observar o art. 226 do CPP.",
  "leading_case": "HC 598.886/SC", "status": "transitado",   // afetado | julgado | transitado
  "ramo": "processual-penal", "dispositivos": ["…;3689!art226"] }
```

### 4.6 Tese-modelo (autoral) — o diferencial do escritório

Diferente da tese *do tribunal*: é o know-how, com gancho e fundamentos amarrados por URN. Vem no
pacote-base. **Auto-auditável:** se um `fundamento` vira `superado`/`revogado` no sync, a
tese-modelo que o cita acende alerta de "revisar".

```jsonc
{ "id": "tese-quebra-cadeia-custodia",
  "titulo": "Nulidade da prova por quebra da cadeia de custódia",
  "materia": "processual-penal/provas",
  "gancho": "Quando não há registro íntegro do rastro da prova pericial…",
  "tese": "A ausência de documentação da cadeia de custódia (art. 158-A CPP) contamina…",
  "fundamentos": ["…;3689!art158A", "urn:lex:br:stj:habeas.corpus;653515"],
  "casos_de_uso": ["busca e apreensão", "interceptação"],
  "versao": "1.2.0" }
```

### 4.7 Doutrina — **só metadados** (direito autoral)

Doutrina é protegida; **não** se redistribui o texto integral. Modelar só metadado + citação. Texto
completo, se houver, é **cópia local do aluno** (`acesso: "local-only"`), nunca empacotado.

```jsonc
{ "id": "doutrina-nucci-cp", "autor": "Guilherme de Souza Nucci",
  "obra": "Código Penal Comentado", "edicao": "23ª", "ano": 2023,
  "dispositivos_comentados": ["…;2848!art121"], "acesso": "local-only", "trecho": null }
```

---

## 5. Confiança e integração com o índice existente

O `acervo/_index.yaml` já tem um modelo de confiança: `VERIFIED_OFFICIAL` (exige declaração
explícita) vs `DISCOVERY_ONLY` (padrão). **Encaixe direto:**

- Entidades vindas de um **pacote assinado e verificado** entram no índice como
  `confianca: VERIFIED_OFFICIAL` + `fonte_pack: <pack_id>@<version>` + `verificado_em: <data>`.
- Material que o próprio usuário jogou em `acervo/` continua `DISCOVERY_ONLY`.
- O `verificacao-citacoes` passa a ter três níveis: **assinado+vigente** (máxima confiança) >
  DISCOVERY_ONLY (conferir) > web/memória (sempre conferir). Citar dispositivo `revogado` ou
  precedente `superado` **bloqueia** com aviso, mesmo vindo de pacote.

---

## 6. Formato do pacote

Existem **dois tipos de pacote** — acervo e área — e eles compartilham **um único container**,
um único manifesto, uma única assinatura e um único cálculo de delta. Só o **aplicador** difere.
É isso que torna literal a promessa "um pipeline carrega skills e acervo".

| Tipo | `payload_kind` | Uma linha do payload é | Aplicador | Exemplos de `pack_id` |
|---|---|---|---|---|
| **Acervo** | `records` | um registro jurídico (norma, dispositivo, julgado, súmula, tese) | funde no `_index.yaml` e descarta o payload | `acervo.jurisprudencia.stj.penal` |
| **Área** | `tree` | **um arquivo**: `{path, sha256, bytes, text}` (ou `b64` se binário) | materializa a subárvore no disco | `area.criminal`, `transversal` |

Sem `payload_kind` o cliente não sabe o que fazer com o que baixou — o campo é **obrigatório** e a
sua ausência recusa o pacote (fail-closed; ver §6.7).

### 6.1 Container

```
<pack_id>@<versão>/
├── manifest.json          (metadados + hashes + assinatura)
├── catalog.jsonl.zst      (role: "catalog" — um registro de DESCOBERTA por item)  [exatamente 1]
└── <payload>.jsonl.zst    (role: "content" — uma entidade por linha)              [1..N arquivos]
```

**Catálogo e conteúdo são entidades separadas, baixáveis separadamente.** Essa é a decisão de
formato que sustenta a descoberta local: o cliente sincroniza o `catalog.jsonl.zst` de **todos** os
pacotes (fino, barato, sempre) e só baixa entidades de conteúdo quando alguma coisa é de fato
usada. Ver [`DESCOBERTA §2`](../legalsquad/DESCOBERTA.md).

Não é otimização: com licença completa (§7.1) **todas** as áreas estão liberadas, e um pacote de
jurisprudência sozinho passa de 90 MB. Sem a separação, a primeira execução baixaria centenas de
megas antes da primeira tela útil.

Consequências normativas:

- `catalog.jsonl.zst` é **obrigatório** e único. Sua ausência recusa o pacote (fail-closed, §6.7):
  um pacote sem catálogo é invisível para a busca, e invisível é indistinguível de inexistente.
- Ele entra em `entities` como qualquer outra, com `sha256` próprio, e portanto **participa do
  `content_hash`** (§6.6) e da assinatura. Catálogo adulterado é pacote recusado.
- Todo registro de catálogo aponta para o conteúdo por `sha256` **e** declara em que entidade ele
  vive — é isso que permite ao cliente resolver "preciso desta skill" em "preciso desta entidade".
- Um `sha256` presente no catálogo e ausente da entidade correspondente (ou vice-versa) é
  **inconsistência de build**, verificada no empacotamento, não no cliente.

```jsonc
// uma linha de catalog.jsonl — pacote de área (payload_kind: "tree")
{ "kind": "skill", "id": "habeas-corpus",
  "entity": "skills.jsonl.zst",              // onde o conteúdo vive
  "path": "skills/habeas-corpus/SKILL.md",
  "sha256": "3c9a…", "bytes": 8431,          // do conteúdo, casa com §6.2
  "description": "…recorte de até 220 caracteres…",
  "triggers": ["…"], "aliases": ["…"], "categories": ["…"],
  "lifecycle": "active", "quality_status": "certified",
  "high_performance_eligible": true, "eval_case_ids": ["lsq-v5-…"] }

// uma linha de catalog.jsonl — pacote de acervo (payload_kind: "records")
{ "kind": "julgado", "urn": "urn:lex:br:stj:habeas.corpus;653515",
  "entity": "decisoes.stj.penal.2020.jsonl.zst",
  "sha256": "b71f…",
  "tribunal": "STJ", "data": "2020-11-24", "relator": "…",
  "ementa": "…recorte…", "situacao": "vigente" }        // ver §6.1.1
```

Os campos de skill são exatamente os que o `search-skills` já devolve e os que o Arquiteto já
exige da shortlist — o catálogo não introduz conceito novo, só o desacopla do conteúdo.

#### 6.1.1 Por que `situacao` viaja no catálogo

Para `acervo.*`, o catálogo carrega **URN, ementa recortada e `situacao`** de cada julgado ou
dispositivo. Com isso o `verificador-citacoes` confirma **existência + vigência/superação sem
baixar inteiro teor nenhum** — local, offline, instantâneo. O inteiro teor desce só quando alguém
vai de fato lê-lo.

O Citation Gate fica **mais** rápido com a separação, não mais lento. Um precedente superado ou um
dispositivo revogado é detectável com o catálogo apenas — que é justamente o caso em que o gate
precisa bloquear.

#### 6.1.2 Granularidade das entidades de conteúdo

| Tipo | Granularidade | Por quê |
|---|---|---|
| `area.*`, `transversal` | uma entidade por classe (`skills`, `squads`, `best-practices`) | ~1,9 MB por área é barato de baixar inteiro; shardar aqui é complexidade sem ganho |
| `acervo.*` | **shards por faceta** (`<tribunal>.<ramo>.<ano>`) | 90 MB não descem inteiros; e faceta é exatamente como se consulta (§4) |

`.jsonl.zst` para os dois tipos. Para árvore isso foi **medido** contra a alternativa óbvia
(`tar.zst`) sobre conteúdo real — 520 skills, 1671 arquivos, 13,8 MB crus, 0 binários:

| formato | tamanho | observação |
|---|---:|---|
| JSONL + zstd −19 | **1,93 MB** | 8% menor que o tar |
| tar + zstd −19 | 2,10 MB | 512 B de header por arquivo ≈ 855 KB de padding |

Além do tamanho, o JSONL evita a dependência externa: `node:zlib` traz zstd nativo e `node:crypto`
traz Ed25519 — **zero dependências, sem binário externo**. O custo aceito é que `.jsonl.zst` não abre
em ferramenta comum; por isso o CLI precisa de um `pack inspect` para leitura humana.

### 6.2 A entidade-arquivo (`payload_kind: "tree"`)

```jsonc
// uma linha de skills.jsonl — texto
{ "path": "skills/habeas-corpus/SKILL.md",
  "sha256": "3c9a…",          // do conteúdo decodificado, não da linha
  "bytes": 8431,               // do conteúdo decodificado
  "mode": "644",               // permissão POSIX; "755" só para executáveis declarados
  "text": "---\nname: habeas-corpus\n…" }

// uma linha binária
{ "path": "squads/juri/assets/selo.png",
  "sha256": "b71f…", "bytes": 20418, "mode": "644",
  "b64": "iVBORw0KGgo…" }
```

- `text` e `b64` são **mutuamente exclusivos**; exatamente um deve estar presente.
- `text` é sempre UTF-8 com quebras `\n`. O empacotador **não** converte fim de linha: o que entra é
  o que sai, byte a byte — qualquer normalização de conteúdo quebraria o `sha256` da §6.6 e, pior, o
  `skill_binding` da evidência de promoção (§6.8).
- `bytes` e `sha256` referem-se ao **conteúdo decodificado**, para que a verificação seja a mesma
  independentemente de o arquivo ter viajado como texto ou base64.
- `path` é **relativo à raiz do projeto do usuário**, sempre com `/`.

### 6.3 Namespace de `pack_id`

O prefixo é o que decide o aplicador padrão e o alvo de extração. É **fechado** — um `pack_id` fora
destes prefixos é recusado:

| Prefixo | `payload_kind` | Conteúdo | Licença |
|---|---|---|---|
| `acervo.*` | `records` | corpus jurídico (o §4 inteiro) | completa (§7.1) |
| `area.<id>` | `tree` | skills, squads, best-practices e perfil de **uma** área | completa (§7.1) |
| `transversal` | `tree` | as ~19 skills que servem qualquer área (integrações, mídia, e-mail, OCR, publicação) | completa (§7.1) |

**O namespace não tem prefixo para squad.** Squads prontos viajam dentro de `area.<id>`, junto das
skills e best-practices — eles não são vendidos nem versionados separadamente. Abrir um `squad.*`
só se justificaria com licenciamento individual, que foi descartado
([`DESCOBERTA §6`](../legalsquad/DESCOBERTA.md), decisão 1).

`transversal` é singular de propósito: existe **um** pacote transversal, não um por área — é
exatamente a duplicação que a migração quer eliminar. Um `area.*` que contenha uma skill também
presente em `transversal` é um erro de build, não uma coincidência a resolver no cliente.

### 6.4 Manifesto

Campos comuns aos dois tipos, com os do pacote de árvore marcados:

```jsonc
// manifest.json — exemplo real de pacote de área
{
  "pack_id": "area.criminal",
  "format_version": "1.1",
  "version": "2026.07.1",                    // calendário: AAAA.MM.SEQ
  "created_at": "2026-07-14T03:00:00Z",      // só no manifesto — nunca no payload (§6.6)

  "payload_kind": "tree",                    // "tree" | "records" — escolhe o aplicador
  "applies_to": [                            // subárvores de destino (§6.5)
    "skills/",
    "squads/",
    "core/best-practices/"
  ],

  "area": { "id": "criminal", "titulo": "Direito Criminal",
            "curador": "…", "ramos": ["penal", "processual-penal", "execucao-penal"] },
  "requires": ["transversal@>=2026.07.1"],   // dependência entre pacotes
  "product_scope": ["legalsquad"],           // um produto só (§1.2)

  "normalization": {                         // §6.8 — o que o build traduziu na fronteira
    "contract_marker": { "from": "CRIMINALSQUAD:", "to": "LEGALSQUAD:" },
    "eval_id_prefix":  { "from": "csq-v5-",       "to": "lsq-v5-" },
    "evidence_schema": { "from": "criminalsquad.skill-promotion-evidence/v1",
                         "to":   "legalsquad.skill-promotion-evidence/v1" },
    "rebound_evidence": false                // ver §6.8 — false = bytes originais preservados
  },

  "counts": { "files": 1671, "skills": 520, "squads": 9, "best_practices": 24 },
  "entities": [                              // "catalog" é obrigatório e único (§6.1)
    { "file": "catalog.jsonl.zst",        "role": "catalog", "sha256": "1f8d…", "bytes":   44902 },
    { "file": "skills.jsonl.zst",         "role": "content", "sha256": "4e11…", "bytes": 1802044 },
    { "file": "squads.jsonl.zst",         "role": "content", "sha256": "9ab3…", "bytes":   96117 },
    { "file": "best-practices.jsonl.zst", "role": "content", "sha256": "c027…", "bytes":   31880 }
  ],
  "removed_paths": [                         // §6.7 — só em delta; vazio no pacote completo
    "skills/skill-aposentada/SKILL.md"
  ],
  "content_hash": "sha256:7d10…",            // sobre a concat ordenada dos sha256 (§6.6)
  "signature": "ed25519:5a4e…",              // destacada, sobre content_hash
  "signing_kid": "2026-a",                   // qual chave pública verifica (§7.2)
  "supersedes": "2026.06.2"                  // p/ cálculo de delta
}
```

Para `payload_kind: "records"` o manifesto é o mesmo, sem `applies_to`/`area`/`normalization`, com
`counts` por entidade (`{"decisoes": 48213, "teses": 640}`) — é o formato que a `1.0` já tinha.
`format_version` sobe para `1.1` porque `payload_kind` é campo novo obrigatório: um cliente `1.0`
lendo um pacote `1.1` deve recusar por versão, não adivinhar.

**Por que `applies_to` é lista e não string.** Um `area.*` materializa em **três** subárvores
(`skills/`, `squads/`, `core/best-practices/`); uma única string só descreveria a primeira. O rascunho
da [`F0 §4.2`](../legalsquad/F0-SANEAMENTO.md) escreveu `"applies_to": "skills/"` quando só as skills
estavam em vista — a forma normativa é a lista.

### 6.5 Extração (`payload_kind: "tree"`)

`applies_to` **não é decoração: é o contrato de contenção**, e o cliente o aplica como whitelist.
Um pacote assinado ainda é conteúdo remoto materializando arquivos na máquina de um advogado; a
assinatura prova origem, não boa-fé de quem tinha a chave.

Recusa o **pacote inteiro** (não a linha) se qualquer `path`:

1. for absoluto, ou contiver `..`, ou não normalizar para si mesmo;
2. não começar por algum prefixo de `applies_to`;
3. cair em área **user-owned** — `acervo/` (exceto `acervo/_packs/`), `casos/`, `output/`,
   `skills/_evals/results/`, `.env`, `_legalsquad/_memory/`;
4. repetir um `path` já visto no mesmo pacote.

Uma linha hostil não é um item a pular — é prova de que o pacote não merece confiança. Pular em
silêncio seria exatamente a degradação silenciosa que este motor já pagou caro para eliminar.

**Aplicação atômica.** Materializa numa árvore temporária, verifica `sha256` de cada arquivo escrito
e só então troca. Uma área meio-instalada é pior que nenhuma: o resolvedor a veria como instalada e
responderia "essa skill não existe" no lugar de "essa área não terminou de instalar". Se a troca não
puder ser atômica, a falha é ruidosa e o estado anterior permanece.

**`skills/_evals/results/` é user-owned e nunca viaja no pacote** — é a evidência comportamental
daquela instalação (`src/init.js` já a preserva no `init`/`update`). Isso tem consequência direta
na §6.8: o pacote leva o *contrato* e os *casos* de eval, não a *prova*.

### 6.6 Determinismo

Mesmo input → mesmo byte de saída. Sem isso o `content_hash` não é verificável por terceiros e o
delta não é calculável. Exige:

- ordenação de caminhos por **byte-order** (`Buffer.compare`), nunca `localeCompare` — que é
  sensível a locale e faria o mesmo input produzir hashes diferentes em máquinas diferentes;
- ordenação das chaves de cada objeto JSON, e `JSON.stringify` sem espaço;
- **nenhum timestamp no payload** — `created_at` vive só no manifesto;
- nível de compressão fixo e declarado;
- exclusão de artefatos de SO (`.DS_Store`, `Thumbs.db`) e de `node_modules/`, `.git/`;
- `content_hash` = sha256 da concatenação dos `sha256` de `entities`, na ordem em que aparecem, que
  por sua vez é a ordem byte-order dos nomes de arquivo.

Coberto por teste: empacotar duas vezes e comparar o hash; e adulterar um byte e conferir que a
verificação recusa.

### 6.7 Delta, remoção e verificação

- **Delta:** `supersedes` + hashes por arquivo → baixa só o que mudou entre versões.
- **Remoção:** um delta precisa saber dizer o que **deixou de existir**. `removed_paths` é essa
  lista; sem ela, uma skill retirada pelo curador sobreviveria para sempre na instalação do aluno —
  e uma skill retirada costuma ter sido retirada por estar errada. Vazio em pacote completo.
- **Assinatura:** Ed25519 sobre `content_hash`, destacada. A **chave pública vem embarcada no core**
  (rotação por `kid`, §7.2). Verificação nunca depende de rede.
- **Revogação ≠ remoção.** `revoked` (§7.1) apaga um pacote de acervo do cache gerenciado. Para um
  pacote de **árvore** isso significaria apagar arquivos que o usuário pode ter editado — então
  revogação de `area.*` **não apaga**: marca a área como revogada, avisa em toda execução e bloqueia
  atualização. Apagar trabalho do usuário por decisão remota é o oposto de degradação graciosa.
- **Fail-closed:** sem assinatura válida, com `format_version` desconhecida, sem `payload_kind`, ou
  com qualquer violação da §6.5, o pacote é **recusado e não gravado**. O sync segue com os demais e
  reporta o recusado com o motivo — recusar em silêncio seria indistinguível de não haver pacote.

### 6.8 Normalização de identificadores na fronteira (requisito do F1)

O `build-area` empacota diretórios de conteúdo que podem ter sido autorados **antes deste motor**.
Conteúdo dessa geração traz gravados identificadores do fork de origem, e o motor de hoje só
reconhece os seus:

| O que | No repo de conteúdo | No motor | Onde o motor checa |
|---|---|---|---|
| Marcador de contrato | `<!-- CRIMINALSQUAD:HP-CONTRACT:START -->` | `LEGALSQUAD:` | `src/skill-contract.js:23-24`, `src/skill-quality.js` (`contract_marker`) |
| Prefixo de eval gerado | `csq-v5-<id>` | `lsq-v5-<id>` | `src/skill-contract.js:402-403` |
| Schema da evidência | `criminalsquad.skill-promotion-evidence/v1` | `legalsquad.…/v1` | `src/skill-quality.js:24` |

É **normalização de empacotamento**, não migração: os repos de conteúdo continuam intocados, como
manda a regra dura do `CLAUDE.md`. Sem ela, `contract_marker` falha e o auditor dá hard fail
`contrato v5 ausente` em todas as 520 skills — a paridade do F2 não fecha.

#### A armadilha: normalizar muda os bytes que a evidência de promoção amarra

`skill_binding.skill_sha256` é o sha256 do **arquivo `SKILL.md` inteiro**
(`readSkillEvidenceBinding`, `src/skill-quality.js:188-205`). Reescrever `CRIMINALSQUAD:` para
`LEGALSQUAD:` **muda esses bytes**. Então:

- **Traduzir o marcador e não re-bindar** → `skill_binding.skill_sha256 divergente` →
  `qualifiesForPromotion: false` → `evidence_required_satisfied: false` → hard fail
  `verified sem evidência comportamental persistida compatível`. Trocamos uma falha por outra.
- **Traduzir e re-bindar** (recalcular o hash e regravar na evidência) → tudo verde. E o binding
  vira **tautológico**: quem muta o texto e recalcula o hash transformou a prova comportamental num
  carimbo automático. O binding existe precisamente para impedir que uma skill seja reescrita
  mantendo o selo de "verified"; um empacotador que re-binda por conveniência é o primeiro
  atacante contra o qual o mecanismo foi desenhado.
- **E há um terceiro fato que agrava os dois:** a evidência mora em `skills/_evals/results/`, que é
  user-owned e **não viaja no pacote** (§6.5). Mesmo com binding perfeito, numa instalação limpa não
  existe evidência nenhuma — e toda skill que declare `verified`/`certified` hard-falha no destino.

Não há saída sem custo. As três opções, com o preço de cada uma:

| Opção | Como | Custo |
|---|---|---|
| **A — preservar bytes, reconhecer o legado** | O pacote leva o `SKILL.md` **original**, byte a byte. O motor passa a **reconhecer** `CRIMINALSQUAD:`/`csq-v5-` apenas para *identificar* o contrato — nunca para promover: skill com marcador legado é no máximo `contracted`, e o auditor diz por quê. `normalization.rebound_evidence: false`. | O motor carrega, no núcleo, conhecimento do nome de um fork antigo. Nenhuma skill importada promove até o curador agir. |
| **B — curador reemite a evidência** | Normaliza os bytes **e** roda de novo o forward-run + baseline + revisores sobre a skill normalizada, emitindo evidência nova. `rebound_evidence` não se aplica — é evidência nova, não re-binding. | Caro: é reexecutar a promoção de 520 skills. Mas é a única em que "verified" continua significando o que diz. |
| **C — re-bindar** | Normaliza e recalcula o hash na evidência existente. | **Rejeitada.** Converte a prova em carimbo. Se alguma vez for feita, o manifesto **tem** de declarar `rebound_evidence: true`, e o cliente **tem** de rebaixar essas skills para `contracted` na instalação — uma flag que o consumidor pode ver e desconfiar vale mais que um segredo bem-intencionado. |

**Recomendação para o F1: A como padrão de importação, B como caminho de promoção.** Importa-se a
área inteira preservando bytes e o valor de uso imediato (as skills funcionam, o Arquiteto as
resolve); o selo `verified` fica reservado a quem pagou o preço de reprová-lo. O que **não** pode
acontecer é o pacote sair com 520 skills marcadas `verified` cuja prova ninguém pode conferir —
isso é o motor voltando a mentir, na única dimensão em que ele acabou de parar de mentir.

O campo `normalization` do manifesto existe para que essa decisão seja **auditável no artefato**, e
não uma nota de rodapé no build.

---

## 7. Contratos de API (o mínimo do servidor)

Como a busca é local, o servidor expõe **dois** contratos apenas.

### 7.1 Catálogo / entitlement

**A licença é binária.** Válida → **todas** as áreas e todo o acervo. Não há entitlement por área,
não há tiers, não há `403` de "sem direito a este pack". Ver
[`DESCOBERTA §6`](../legalsquad/DESCOBERTA.md), decisão 3.

```
GET /v1/catalog?license=LS-XXXX-XXXX&product=legalsquad
    &have=acervo.jurisprudencia.stj.penal@2026.07.1,area.criminal@2026.06.2

200 →
{
  "status": "active",                         // active | expired
  "expires": "2026-08-01",
  "packs": [                                  // TODOS os pacotes — sempre
    { "pack_id": "acervo.jurisprudencia.stj.penal", "payload_kind": "records",
      "latest": "2026.07.2",
      "catalog": {                            // baixado SEMPRE (fino, §6.1)
        "url": "https://cdn…/…?exp=…&sig=…",  // URL assinada e expirável
        "sha256": "1f8d…", "bytes": 210433 },
      "content": {                            // baixado SOB DEMANDA (§9.2)
        "url": "https://cdn…/…?exp=…&sig=…",
        "sha256": "9f2c…", "bytes": 91223344, "delta_from": "2026.07.1" } },
    { "pack_id": "area.criminal", "payload_kind": "tree", "latest": "2026.07.1",
      "catalog": { "url": "https://cdn…/…?exp=…&sig=…",
                   "sha256": "1f8d…", "bytes": 44902 },
      "content": { "url": "https://cdn…/…?exp=…&sig=…",
                   "sha256": "4e11…", "bytes": 1930244, "delta_from": "2026.06.2" },
      "requires": ["transversal@>=2026.07.1"] }
  ],
  "revoked": []                               // packs que devem ser apagados do cache
}
401 → licença inválida
```

- **`catalog` e `content` têm URLs separadas** — é o que torna a §6.1 operável. O cliente busca
  todos os `catalog` no `sync` e só o `content` do que for usado.
- `have` permite ao servidor devolver **só o que mudou** e URLs de delta quando existirem.
- O `payload_kind` da resposta é **dica de planejamento, não autoridade**: a resposta do catálogo não
  é assinada. Quem escolhe o aplicador é o `payload_kind` do `manifest.json` verificado (§6.4).
  Divergência entre os dois recusa o pacote — é sinal de catálogo comprometido, não de erro de digitação.
- **Sem `license`:** vale o pacote-base que já vem no `main` (assinado, offline, sem conta). O
  endpoint devolve `{"status": "none", "packs": []}` — não há o que sincronizar sem licença.
- **`status: "expired"`:** ainda devolve `packs`, mas o cliente **não atualiza** (§9.4). Licença
  vencida degrada para o cache; nunca vira tijolo.

### 7.2 Chave pública (rotação)

```
GET /v1/signing-keys → { "keys": [ { "kid": "2026-a", "alg": "ed25519", "pub": "…" } ] }
```
O core embarca a(s) chave(s) atuais; este endpoint só cobre rotação/rollover. Verificação **nunca**
depende de rede (chave já embarcada); o endpoint é conveniência de atualização.

**Distribuição:** os tarballs vivem em object storage/CDN. O `/v1/catalog` só emite URLs assinadas.
Nenhuma lógica de busca no servidor.

---

## 8. Especificação do servidor

Componentes (todos fora do caminho de busca do usuário):

| Componente | Responsabilidade | Notas |
|---|---|---|
| **Coletores** | Um por fonte (§ Fontes). Incremental, idempotente. | Filas por fonte; respeitam rate limits/robots. |
| **Normalizador** | Canoniza URN, extrai dispositivos/ementa/tese, classifica ramo/matéria, resolve vínculos temporais e de superação. | O trabalho mais pesado. |
| **Dedup/merge** | Mesma URN de fontes diferentes vira uma entidade. | Chave = URN. |
| **Curadoria (painel interno)** | Humano revisa/aprova o que entra em cada pack antes de assinar. | A assinatura é o selo de curadoria. |
| **Builder** | Agrupa por `pack_id`, versiona, comprime `.jsonl.zst`, computa hashes. | Determinístico → mesmo input, mesmo hash. |
| **Signer** | Assina `content_hash` com a chave privada (HSM/KMS). | Chave privada **nunca** sai do KMS. |
| **Distribuição** | Publica tarballs no CDN; atualiza o índice de catálogo. | Estático. |
| **Entitlement API** | `/v1/catalog`, `/v1/signing-keys`. Minúsculo, stateless quanto a conteúdo. | Serverless basta. |

### 8.1 Fontes de ingestão

| Fonte | Fornece | Forma |
|---|---|---|
| Planalto | Legislação federal (texto oficial, redações) | HTML/PDF → parse |
| LexML Brasil | URN canônica + XML estruturado + rede de normas | XML / API |
| STF | Acórdãos, súmulas (vinculantes/comuns), repercussão geral | portal + dados abertos |
| STJ | Acórdãos, súmulas, recursos repetitivos | portal + dados abertos |
| CNJ DataJud | Metadados processuais (capa, movimentos) — não o mérito | API pública |
| DJEN | Publicações/intimações **(já integrado no core)** | API oficial |
| TST, CNJ Provimentos, CGJs, TJs/TRFs/TRTs | Fontes das demais áreas | mesmas técnicas |

---

## 9. Especificação do cliente (motor compartilhado)

Vive no motor — uma implementação, todas as áreas (§1.2).

### 9.1 Comando

```
legalsquad acervo sync            # sincroniza os CATÁLOGOS de todos os packs (§6.1)
legalsquad acervo sync --content  # força baixar também o conteúdo (uso offline planejado)
legalsquad acervo sync --check    # só relata o que está desatualizado (exit != 0 se há update)
legalsquad acervo status          # licença, versões instaladas, frescor por pack
legalsquad acervo packs           # packs disponíveis · catálogo instalado · conteúdo em cache
```

O `sync` sem flag **não baixa conteúdo** — baixa o catálogo de tudo e para. Conteúdo desce sob
demanda (§9.2) ou por prefetch das áreas de atuação declaradas no perfil. `--content` existe para
quem vai ficar sem rede de propósito e quer pagar o download antes.

Wiring idêntico ao dos comandos existentes (`bin/legalsquad.js` + `src/acervo-cli.js`),
espelhando o padrão de `search-acervo`/`contract-skills`.

### 9.2 Fluxo do `sync`

1. Lê `acervo/_packs/_manifest.json` (o que está instalado; produto + versões).
2. `GET /v1/catalog?license&product&have=…` → lista de packs, com URLs de `catalog` e `content`
   separadas (§7.1). Sem licença não há o que sincronizar — vale o pacote-base do `main`.
3. **Baixa o `catalog.jsonl.zst` de TODOS os packs** (fino, §6.1) → verifica sha256 + assinatura
   Ed25519 com a chave embarcada → **só então** grava. É este passo que deixa a busca local
   enxergar o servidor inteiro sem nunca mandar uma consulta para lá.
4. **Conteúdo não desce aqui.** Uma entidade de conteúdo é baixada quando (a) algo do catálogo dela
   é de fato selecionado, (b) o prefetch das áreas de atuação a alcança, ou (c) veio `--content`.
   A verificação é a mesma: sha256 + assinatura antes de gravar, sempre.
5. Extrai o payload conforme o `payload_kind` do manifesto (§6): pacote de **acervo**
   (`payload_kind: "records"`) vai para `acervo/_packs/<pack_id>/` (área **gerenciada**); pacote de
   **área** (`area.*`, `transversal`, `payload_kind: "tree"`) materializa as subárvores declaradas em
   `applies_to` — `skills/`, `squads/`, `core/best-practices/` — sob as regras de contenção e
   atomicidade da §6.5, e aplicando `removed_paths` quando for delta.
6. **Reindexa o que foi tocado** — e só o que foi tocado:
   - pacote de acervo → `indexar-acervo` (as entidades entram como `VERIFIED_OFFICIAL` +
     proveniência);
   - pacote de área → `indexar-skills`.
7. Aplica `revoked`: apaga do cache packs revogados — **e reindexa de novo**, senão o índice passa a
   listar o que foi apagado.
8. Relata: catálogos atualizados, conteúdo baixado, tamanho, frescor, e avisa packs vencidos.

> **Por que o passo 6 distingue os dois índices.** Eles têm criticidade oposta, e confundi-los custa
> caro:
>
> - **`acervo/_index.yaml` é consumido pela busca** (`src/acervo-search.js`). Desatualizado, a
>   pesquisa devolve resultado incompleto — e num acervo jurídico "nenhum resultado" é
>   indistinguível de "não há precedente sobre isso". Por isso reindexar aqui é **obrigatório**, e
>   por isso `search-acervo` também detecta a defasagem por conta própria
>   (`detectarIndiceDefasado`): o sync é a primeira linha de defesa, não a única — o usuário também
>   adiciona material à mão.
> - **`skills/_index.yaml` NÃO é consumido pela busca.** `search-skills` e `resolve-skills` chamam
>   `discoverSkillCatalog`, que varre o disco: o catálogo real é sempre o que está instalado. O
>   índice de skills é artefato de inspeção e distribuição — reindexar mantém a honestidade do
>   arquivo (e o `check-skills` verde), mas um índice stale **não** cega o Arquiteto. Não confunda
>   as duas coisas ao implementar: proteger o índice errado dá falsa sensação de segurança.

### 9.3 Convivência com `acervo/` (PROTECTED)

`acervo/` é user-owned e PROTECTED no `update`. O sync escreve **apenas** dentro de
`acervo/_packs/` (subárvore gerenciada) e nunca toca `jurisprudencia/`, `doutrina/`, `casos/` etc.
do usuário. O `indexar-acervo` funde as duas origens no mesmo `_index.yaml`, com `confianca`
distinguindo pack (VERIFIED_OFFICIAL) de material do usuário (DISCOVERY_ONLY). `casos/` continua
omitido do índice.

### 9.4 Integridade, offline e degradação

- **Verificação obrigatória:** hash + assinatura antes de gravar. Falha → pack recusado, sync
  segue com os demais, erro claro. Nunca grava conteúdo não verificado.
- **Offline:** sem rede, `sync` falha graciosamente; a busca segue no cache. Tudo funciona.
- **Licença expirada:** mantém o último cache (somente leitura) com banner "desatualizado"; nunca
  apaga nem bloqueia a busca. Só para de **atualizar**.
- **Pacote-base no `main`:** o motor embarca um pacote-base assinado; funciona sem nenhuma conta.
- **Conteúdo ausente ≠ conteúdo inexistente.** Com fetch preguiçoso (§9.2), o catálogo conhece
  itens cujo conteúdo ainda não foi baixado. Sem rede para buscá-lo, a resposta é
  **"conhecido, não baixado — sincronize"**, jamais "não existe". Confundir os dois é a degradação
  silenciosa que este motor já pagou caro para eliminar: num acervo jurídico, "não encontrei" lido
  como "não há precedente" é o erro que chega à peça.

### 9.5 Estados de licença

Não há tiers. A licença tem **dois** estados, e o pacote-base cobre o terceiro caso:

| Estado | Alcance | Atualização |
|---|---|---|
| **Sem licença** | pacote-base embarcado no `main` (assinado, offline, sem conta) | a cada release do npm |
| **Válida** | **tudo** — todas as áreas, todo o acervo | sync (catálogo sempre; conteúdo sob demanda) |
| **Vencida** | último cache, somente leitura, com selo "desatualizado há N dias" | nenhuma |

---

## 10. Segurança & LGPD

- **Minimização:** o entitlement loga só `{license, product, packs, ts}` — sem IP-profiling, sem
  termos de busca (que nem existem no servidor).
- **Chaves:** privada de assinatura no KMS/HSM, nunca no build host; pública embarcada + rotação por `kid`.
- **URLs assinadas expiráveis** para os tarballs (sem CDN aberto).
- **Papel LGPD:** distribuidor de conteúdo. Publicar postura de privacidade explícita.
- **Sem dado de caso jamais:** reforço de contrato — `casos/` e queries nunca saem do cliente.

---

## 11. Requisitos não-funcionais

- **Frescor:** cadência por fonte (súmula/tese: semanal; grandes decisões: sob demanda; legislação:
  ao publicar). `updated_at` por pack; aviso de "desatualizado" acima de N dias (configurável).
- **Tamanho:** pacote-base < ~15 MB; ementa+tese sempre no pack, inteiro teor por referência.
- **Catálogo:** o `sync` de catálogos de **todos** os packs deve caber em um download único de
  poucas centenas de KB. É o requisito que sustenta a descoberta local (§6.1).
- **Busca local:** shortlist sobre o catálogo completo em < 100 ms, sem rede.
- **Verificação:** assinatura de um pack em < 1 s no cliente.
- **Determinismo do build:** mesmo input → mesmo `content_hash` (reprodutível, auditável).
- **Cobertura de citação:** todo dispositivo/precedente citável tem URN resolvível e `situacao`.

---

## 12. Fora de escopo (v1)

- Busca semântica/embeddings no cliente (v1 é lexical, como o `search-acervo` atual). A alternativa
  concreta — léxico de sinônimos curado, distribuído no pacote — e a condição de reabertura estão em
  [`DESCOBERTA §3`](../legalsquad/DESCOBERTA.md).
- Full inteiro teor de todos os tribunais empacotado (fica por referência).
- Anotações colaborativas entre alunos (é local/privado).
- Redistribuição de doutrina (proibido — só metadados).

---

## 13. Glossário

- **Pack:** unidade de distribuição, versionada e assinada. Dois tipos, um container (§6):
  **acervo** (`acervo.*`, `payload_kind: records`) e **área** (`area.*` / `transversal`,
  `payload_kind: tree`).
- **`payload_kind`:** o que é uma linha do payload — `records` (registro jurídico) ou `tree`
  (um arquivo). Escolhe o aplicador.
- **Catálogo × conteúdo:** as duas metades de um pack (§6.1). O **catálogo** (`role: "catalog"`) é
  fino, sincronizado sempre, e é sobre ele que a busca local roda. O **conteúdo**
  (`role: "content"`) é gordo e desce sob demanda. Direito a tudo não é posse de tudo.
- **`applies_to`:** lista de subárvores em que um pacote de árvore pode escrever. Contrato de
  contenção, verificado como whitelist pelo cliente.
- **Normalização de fronteira:** tradução de identificadores do fork de origem
  (`CRIMINALSQUAD:`/`csq-v5-`) para os do motor, feita no empacotamento e declarada em
  `manifest.normalization` (§6.8).
- **URN LexML:** identificador canônico de norma/dispositivo/julgado brasileiro.
- **Dispositivo × Versão:** a casca estável (Art. X) vs o texto por intervalo de vigência.
- **Situação:** estado temporal (vigente/revogado; vigente/superado).
- **VERIFIED_OFFICIAL:** nível de confiança do índice para conteúdo de pack assinado.
- **Licença:** binária — válida libera **tudo** (todas as áreas, todo o acervo). Não há tiers nem
  entitlement por área. Sem licença vale o pacote-base do `main`; vencida, o cache read-only (§9.5).
