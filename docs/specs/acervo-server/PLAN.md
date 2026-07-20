# Acervo-as-a-Service — Plano de Implementação

> Companheiro do [SPEC.md](SPEC.md). Ordem, fatiamento, marcos, critérios de aceite e riscos.

## Estratégia de fatiamento

Duas verdades guiam a ordem:

1. **O motor de sync é barato; o corpus é caro.** O lado cliente (sync + verificação + índice) é
   ~1–2 semanas. A **ingestão do corpus** (normalizar legislação/jurisprudência brasileira em
   pacotes limpos, temporais, citáveis) é o trabalho de **meses**, incremental e contínuo.
2. **Por isso, cliente primeiro.** Construímos o motor contra um **pacote-semente estático,
   assinado à mão** — sem servidor nenhum. Isso entrega valor e de-risca o cliente antes de gastar
   no corpus. O servidor e o corpus crescem depois, sem bloquear o cliente.

Regra de ouro do sequenciamento: **cada fase entrega algo utilizável isolado.**

**MVP (menor coisa que já vale):** motor `acervo sync` + um pacote-semente assinado (súmulas +
leis penais essenciais + teses-modelo) + tier base funcionando offline sem conta. Já melhora o
produto sem servidor.

---

## Fase 0 — Fundações compartilhadas  · *~1 semana*

Congelar contratos e gerar as chaves. Nada aqui depende de servidor.

**Tarefas**
- Congelar o **modelo de dados** (§4 do SPEC) e a **URN** — schemas JSON (`schemas/*.json`) versionados.
- Congelar o **formato do pacote** e o `manifest.json` (`format_version: "1.0"`).
- Gerar par de chaves **Ed25519**; guardar a privada em KMS/1Password; **embarcar a pública** no
  core (`_criminalsquad/config/acervo-keys.json`, com `kid`).
- Escrever `tools/build-pack.mjs` (dev): recebe JSONL de entidades → produz tarball `.tar.zst` +
  `manifest.json` + assinatura. Determinístico.
- Produzir **1 pacote-semente** curado à mão para o CriminalSquad: `legislacao.penal.base` +
  `sumulas.stf-stj.penal` + `teses-modelos.penal.base`.

**Aceite:** `build-pack` gera um tarball; a assinatura valida com a pública embarcada; o schema
lint passa em todas as entidades do semente.

**Risco:** subestimar a modelagem temporal da legislação → mitigar limitando o semente a normas
com redação atual (versão única) e adiar o versionamento completo para a Fase 3.

---

## Fase 1 — Motor de sync no cliente (sem servidor)  · *~1–2 semanas*  ⭐ MVP

Tudo na engine compartilhada → CriminalSquad, DTSquad e EJsquad herdam de graça.

**Tarefas**
- `src/acervo-sync.js` + `src/acervo-cli.js`; registrar `acervo sync|status|packs` em
  `bin/criminalsquad.js` (padrão dos comandos existentes).
- **Source do pacote:** nesta fase, um caminho local/URL fixa para o semente (flag `--from`), sem
  entitlement. Baixa (ou lê) → **verifica sha256 + Ed25519** → extrai para `acervo/_packs/<id>/`.
- `acervo/_packs/_manifest.json` (registro do instalado).
- Estender `indexar-acervo` para fundir `acervo/_packs/**` no `_index.yaml` com
  `confianca: VERIFIED_OFFICIAL` + `fonte_pack` + `verificado_em`. Não tocar `casos/`.
- `search-acervo`: exibir proveniência (pack@versão), frescor e **estado** (vigente/superado/revogado)
  no resultado.
- Integrar 3 níveis no `verificacao-citacoes`: assinado+vigente > DISCOVERY_ONLY > web. Citar
  `revogado`/`superado` **bloqueia** com aviso.
- Degradação: sem rede, sync falha limpo e a busca segue; conteúdo não verificado **nunca** grava.
- Testes (node): verificação boa/adulterada (rejeita), merge no índice, `casos/` intocado,
  offline, idempotência de re-sync, e o corte de confiança no gate de citações.

**Aceite**
- `criminalsquad acervo sync --from ./seed` instala o semente; `search-acervo` acha as entidades e
  mostra `VERIFIED_OFFICIAL` + data.
- Um tarball com 1 byte trocado é **recusado** (assinatura inválida) e nada é gravado.
- `casos/` e o material do usuário permanecem no índice como `DISCOVERY_ONLY`, intactos.
- Offline: busca funciona; sync avisa e não quebra.
- `check:skills`/`lint`/`test` verdes.

**Entregável:** já dá para commitar nos três squads (cada um com seu semente-base).

---

## Fase 2 — Distribuição + licença (servidor mínimo)  · *~1–2 semanas (infra)*

O "servidor burro": CDN + endpoint de licença. Ainda com o corpus-semente (o corpus grande é a Fase 3).

**Tarefas**
- Object storage/CDN para os tarballs (S3+CloudFront / R2 / equivalente).
- `GET /v1/catalog` (serverless): valida licença → devolve packs com direito + **URLs assinadas
  expiráveis** + `have`→delta. Sem licença → só packs livres.
- `GET /v1/signing-keys` (rotação).
- Emissão de licenças (mínimo viável: chaves + tier + validade + `product_scope`; pode ser planilha
  → KV no começo).
- Cliente: trocar o `--from` fixo por `GET /v1/catalog` (com `~/.config/criminalsquad/license`).
  Cache-first; base tier sem conta.
- Loga só `{license, product, packs, ts}` (LGPD).

**Aceite**
- `acervo sync` com licença Pro baixa o pack Pro do CDN, verificado; sem licença, baixa só o base.
- URL expirada é rejeitada; licença inválida → 401 tratado; tier insuficiente → 403 tratado.
- Nada de query/termos no servidor (auditar logs).

**Risco:** custo/ops. Mitigar com serverless + CDN estático (sem infra de busca).

---

## Fase 3 — Esteira de ingestão v1 (o corpus criminal)  · *meses, incremental*

A parte cara. Construir o corpus real do CriminalSquad, em ondas.

**Ordem interna (valor/dificuldade):**
1. **Legislação penal versionada** — CP, CPP, LEP, Lei de Drogas, ECA penal etc., com
   `dispositivo × versão` por data (o alicerce do *lex mitior*). Fonte: Planalto + LexML.
2. **Súmulas + teses firmadas** — pequeno, altíssimo valor, estado bem definido.
3. **Jurisprudência criminal STF/STJ com `situacao`** — ementa+tese+dispositivos+superação. Inteiro
   teor por referência.
4. Só então **expandir** (TJs, mais leis, outros recortes).

**Tarefas (por onda)**
- Coletor + normalizador da fonte; canonização URN; dedup; resolução de vínculos temporais e de
  superação; classificação por ramo/matéria.
- **Painel de curadoria** mínimo (aprovar antes de assinar).
- Build determinístico + assinatura (KMS) + publicação + **delta**.

**Aceite (por onda):** um pack reconstruído da fonte, assinado, publicado; o cliente sincroniza o
delta; amostra auditada por advogado (você) confirma URN/vigência/situação corretas.

**Riscos:** parsing heterogêneo das fontes; correção temporal (o mais difícil); integridade
(assinatura obrigatória já mitiga adulteração). Começar estreito e medir qualidade antes de ampliar.

---

## Fase 4 — Rollout multi-squad  · *~1–2 semanas por squad (após Fase 3 do domínio)*

Mesma infra, novos domínios.

**Tarefas**
- **DTSquad:** packs `legislacao.trabalhista.*`, `jurisprudencia.tst.*`, teses-modelo trabalhistas;
  pacote-base próprio no `main`; `product_scope: ["dtsquad"]` nas licenças.
- **EJsquad:** packs registral/notarial/civil; provimentos CNJ/CGJ; base próprio.
- Entitlement por produto (uma licença CriminalSquad não abre packs trabalhistas, salvo bundle).
- O **motor de sync não muda** (já é compartilhado) — só os pacotes e os escopos.

**Aceite:** cada squad sincroniza seus packs de domínio; escopos de produto respeitados; base tier
de cada um funciona offline.

---

## Fase 5 — Profundidade  · *contínuo*

- Inteiro teor **sob demanda** (baixa da fonte oficial e cacheia local) para o Pro.
- Ampliar a modelagem temporal para os outros domínios.
- Ferramentas de curadoria melhores; métricas (privacy-safe: sem termos de busca).
- Ensaios de **rotação de chave** e revogação de packs.
- (Opcional, v2) busca semântica local.

---

## Mapa de sequenciamento

```
F0 Fundações ──▶ F1 Cliente (MVP, offline) ──▶ F2 Distribuição+licença ──▶ F4 Multi-squad
   (schemas,          (motor de sync,             (CDN + /v1/catalog)         (dtsquad, ejsquad)
    chaves,            verificação, índice)              │
    semente)                 │                           │
                             └──────────── F3 Ingestão do corpus (paralela, meses) ──────────┘
```

- **F0→F1→F2** é o caminho crítico curto (semanas) que já entrega o produto com sync.
- **F3** (corpus) roda **em paralelo** e alimenta packs cada vez mais ricos sem mexer no motor.
- **F4** só precisa da F3 do domínio respectivo + o motor (já pronto na F1).

## Definição de pronto (o produto "tem acervo vivo")

`acervo sync` instalado nos squads · pacote-base assinado no `main` · pelo menos um pack de
jurisprudência criminal atualizando via servidor · citação bloqueando precedente `superado` ·
tudo funcionando offline após o sync.

## Registro de riscos (resumo)

| Risco | Impacto | Mitigação |
|---|---|---|
| Ingestão do corpus é subestimada | alto | fatiar por onda; começar estreito (penal); medir qualidade antes de ampliar |
| Correção temporal da legislação | alto | é o campo mais valioso; semente com redação única, versionamento na F3 |
| Adulteração de precedente | crítico | assinatura Ed25519 obrigatória + verificação fail-closed no cliente |
| Vazamento de query (sigilo) | crítico | busca local; servidor nunca recebe termos — invariante de arquitetura |
| Copyright de doutrina | jurídico | só metadados; texto integral é cópia local do aluno |
| Custo/ops do servidor | médio | serverless + CDN estático; sem infra de busca |
| Licença expira e trava o usuário | médio | degradação graciosa: último cache read-only, nunca tijolo |

## Arquivos que este plano cria (referência)

**Cliente (engine compartilhada):** `src/acervo-sync.js`, `src/acervo-cli.js`,
`_criminalsquad/config/acervo-keys.json` (pública), extensão de `scripts/indexar-acervo.js`,
`schemas/*.json`, testes em `tests/acervo-sync.test.js`. Wiring em `bin/criminalsquad.js`.

**Ferramentas de build (dev):** `tools/build-pack.mjs`, `tools/sign-pack.mjs`.

**Servidor (repo separado, a criar):** coletores, normalizador, builder, entitlement API
(serverless), infra de CDN. Não vive neste repo.
