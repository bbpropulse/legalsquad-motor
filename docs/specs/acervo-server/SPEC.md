# Acervo-as-a-Service — Especificação Técnica

> Status: **Rascunho para decisão** · Escopo: infraestrutura compartilhada de acervo jurídico
> (legislação, jurisprudência, súmulas, teses) para **todos os squads** (LegalSquad,
> DTSquad, EJsquad e futuros). Companheiro: [PLAN.md](PLAN.md) (plano de implementação).

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

### 1.2 Topologia multi-squad

```
                         ┌─────────────────────────────┐
                         │   ACERVO SERVER (1 só)       │
                         │   corpus + build + sign + CDN│
                         │   + endpoint de licença      │
                         └──────────────┬──────────────┘
              pacotes assinados por domínio (saída)
        ┌───────────────────┬───────────┴───────────┬───────────────────┐
        ▼                   ▼                       ▼                     ▼
  LegalSquad          DTSquad                 EJsquad             (futuros)
  base: penal        base: trabalhista       base: registral/
  packs: penal,      packs: trabalhista,     notarial, civil
   proc. penal,       proc. do trabalho
   execução
        └── mesmo motor de sync (engine compartilhada) · busca local ──┘
```

O **motor de sync é core compartilhado** (os forks já compartilham o motor). Cada squad difere só
em: (a) o **pacote-base** que vem no `main`, e (b) o **conjunto de packs** que sua licença libera.
Os **schemas de dados são idênticos** entre domínios — jurisprudência trabalhista tem a mesma forma
que criminal.

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
pacote-base (grátis). **Auto-auditável:** se um `fundamento` vira `superado`/`revogado` no sync, a
tese-modelo que o cita acende alerta de "revisar".

```jsonc
{ "id": "tese-quebra-cadeia-custodia",
  "titulo": "Nulidade da prova por quebra da cadeia de custódia",
  "materia": "processual-penal/provas",
  "gancho": "Quando não há registro íntegro do rastro da prova pericial…",
  "tese": "A ausência de documentação da cadeia de custódia (art. 158-A CPP) contamina…",
  "fundamentos": ["…;3689!art158A", "urn:lex:br:stj:habeas.corpus;653515"],
  "casos_de_uso": ["busca e apreensão", "interceptação"],
  "tier": "base", "versao": "1.2.0" }
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

Um pacote agrupa entidades de uma **matéria/tribunal** num tarball versionado, content-addressed e
assinado.

```
jurisprudencia.stj.penal@2026.07.2.tar.zst
├── manifest.json          (metadados + hashes + assinatura)
├── decisoes.jsonl.zst     (uma entidade por linha)
└── teses.jsonl.zst
```

```jsonc
// manifest.json
{
  "pack_id": "jurisprudencia.stj.penal",   // namespace espelha os 21 domínios do _index.yaml
  "materia": "penal", "tribunal": "STJ",
  "format_version": "1.0",
  "version": "2026.07.2",                   // calendário: AAAA.MM.SEQ
  "created_at": "2026-07-14T03:00:00Z",
  "requires_tier": "pro",                   // base | essencial | pro
  "product_scope": ["legalsquad"],       // quais produtos podem instalar
  "counts": { "decisoes": 48213, "teses": 640 },
  "entities": [
    { "file": "decisoes.jsonl.zst", "sha256": "9f2c…", "bytes": 91223344 },
    { "file": "teses.jsonl.zst",    "sha256": "1abd…", "bytes": 220145 }
  ],
  "content_hash": "sha256:7d10…",           // sobre a concat ordenada dos sha256
  "signature": "ed25519:5a4e…",             // assinatura destacada sobre content_hash
  "supersedes": "2026.07.1"                 // p/ cálculo de delta
}
```

- **Delta:** `supersedes` + hashes por arquivo → baixa só o que mudou entre versões.
- **Assinatura:** Ed25519. A **chave pública vem embarcada no core** (com rotação versionada). Sem
  assinatura válida, o pacote é recusado.
- **Formato pesquisável:** `.jsonl.zst` — descomprime, funde no índice, joga fora; barato linha a linha.

---

## 7. Contratos de API (o mínimo do servidor)

Como a busca é local, o servidor expõe **dois** contratos apenas.

### 7.1 Catálogo / entitlement

```
GET /v1/catalog?license=CS-XXXX-XXXX&product=legalsquad
    &have=jurisprudencia.stj.penal@2026.07.1,legislacao.penal@2026.06.1

200 →
{
  "tier": "pro",
  "expires": "2026-08-01",
  "packs": [
    { "pack_id": "jurisprudencia.stj.penal", "latest": "2026.07.2",
      "url": "https://cdn…/…?exp=…&sig=…",   // URL assinada e expirável
      "sha256": "9f2c…", "bytes": 91223344, "delta_from": "2026.07.1" }
  ],
  "revoked": []                               // packs que devem ser apagados do cache
}
401 → licença inválida     403 → produto/tier sem direito ao pack
```

- `have` permite ao servidor devolver **só o que mudou** e URLs de delta quando existirem.
- Sem `license` (ou tier `base`): devolve só os packs livres. O free tier funciona sem conta.

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
| (trabalhista) TST, (extrajudicial) CNJ Provimentos, CGJs | Domínios dos outros squads | mesmas técnicas |

---

## 9. Especificação do cliente (motor compartilhado)

Vive na engine compartilhada → presente em LegalSquad, DTSquad, EJsquad automaticamente.

### 9.1 Comando

```
legalsquad acervo sync            # sincroniza os packs com direito
legalsquad acervo sync --check    # só relata o que está desatualizado (exit != 0 se há update)
legalsquad acervo status          # tiers, versões instaladas, frescor por pack
legalsquad acervo packs           # lista packs disponíveis vs instalados
```

Wiring idêntico ao dos comandos existentes (`bin/legalsquad.js` + `src/acervo-cli.js`),
espelhando o padrão de `search-acervo`/`contract-skills`.

### 9.2 Fluxo do `sync`

1. Lê `acervo/_packs/_manifest.json` (o que está instalado; produto + versões).
2. `GET /v1/catalog?license&product&have=…` → lista de packs/URLs (ou, sem licença, só os livres).
3. Para cada pack novo/atualizado: baixa (delta quando houver) → **verifica sha256 + assinatura
   Ed25519** com a chave embarcada → **só então** grava.
4. Extrai o payload para o destino declarado no manifesto (`applies_to`): pacote de **acervo** vai
   para `acervo/_packs/<pack_id>/` (área **gerenciada**); pacote de **área** (`area.*`,
   `transversal`) materializa `skills/`, `squads/` e best-practices.
5. **Reindexa o que foi tocado** — e só o que foi tocado:
   - pacote de acervo → `indexar-acervo` (as entidades entram como `VERIFIED_OFFICIAL` +
     proveniência);
   - pacote de área → `indexar-skills`.
6. Aplica `revoked`: apaga do cache packs revogados — **e reindexa de novo**, senão o índice passa a
   listar o que foi apagado.
7. Relata: baixados, tamanho, frescor, e avisa packs vencidos.

> **Por que o passo 5 distingue os dois índices.** Eles têm criticidade oposta, e confundi-los custa
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
- **Base tier no `main`:** cada squad embarca seu pack-base assinado; funciona sem nenhuma conta.

### 9.5 Tiers

| Tier | Conteúdo | Atualização | Entrega |
|---|---|---|---|
| **Base** | Teses-modelos + leis essenciais do domínio + súmulas STF/STJ | a cada release | vem no `main` · offline |
| **Essencial** | + jurisprudência do domínio (STF/STJ) curada + estado do precedente | semanal | sync |
| **Pro** | + TJs/TRTs + inteiro teor + repositório de teses expandido | diária | sync |

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
- **Tamanho:** pacote-base < ~15 MB; ementa+tese sempre no pack, inteiro teor por referência/Pro.
- **Verificação:** assinatura de um pack em < 1 s no cliente.
- **Determinismo do build:** mesmo input → mesmo `content_hash` (reprodutível, auditável).
- **Cobertura de citação:** todo dispositivo/precedente citável tem URN resolvível e `situacao`.

---

## 12. Fora de escopo (v1)

- Busca semântica/embeddings no cliente (v1 é lexical, como o `search-acervo` atual).
- Full inteiro teor de todos os tribunais empacotado (fica por referência/Pro).
- Anotações colaborativas entre alunos (é local/privado).
- Redistribuição de doutrina (proibido — só metadados).

---

## 13. Glossário

- **Pack:** unidade de distribuição (matéria/tribunal), versionada, assinada.
- **URN LexML:** identificador canônico de norma/dispositivo/julgado brasileiro.
- **Dispositivo × Versão:** a casca estável (Art. X) vs o texto por intervalo de vigência.
- **Situação:** estado temporal (vigente/revogado; vigente/superado).
- **VERIFIED_OFFICIAL:** nível de confiança do índice para conteúdo de pack assinado.
- **Tier:** base (grátis, no `main`) · essencial · pro.
