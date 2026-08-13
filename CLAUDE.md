# LegalSquad — Instruções do Projeto

Este repositório é o **motor** de orquestração multi-agente para o Direito. **Áreas do Direito não
vivem aqui** — chegam como **pacotes assinados** (skills + squads + best-practices + agentes de área +
acervo) baixados por `sync` e liberados por licença.

## Escopo do repositório (leia primeiro)

**Este repositório é autocontido.** Trabalhe apenas dentro dele — não inspecione, não leia e não
dependa de repositórios vizinhos. O LegalSquad **baixa as áreas do Direito de forma remota**, como
pacotes assinados; nenhuma área vive aqui e nenhuma é lida de um diretório irmão.

O conteúdo de cada área é **autorado por seu curador**, fora daqui. O LegalSquad **executa** o que
foi baixado — e, quando pedido, **empacota um diretório qualquer** que lhe apontem.

> **Regra dura do empacotador:** `build-area` é **genérico e cego** — recebe o diretório de conteúdo
> por argumento e **nunca** conhece caminho de repositório específico. Ele **lê** a origem e **jamais
> escreve** nela; essa invariante é verificada com fixture sintética, no CI, sem depender de nenhuma
> máquina em particular.

## Fronteira núcleo × pacote

**Fica no motor:** roteador e loop de orquestração · Arquiteto · Pipeline Runner e checkpoints ·
resolvedor fail-closed (lifecycle/evidência) · Citation Gate · CLI · `sync` · `captura` (áudio/vídeo)
· OCR · indexadores · integrações (DJEN, e-mail, agenda) · dashboard.

**Vira pacote:** skills de matéria · squads · best-practices jurídicas · agentes especialistas
reutilizáveis de área · acervo · perfil/ética de instituição · **calculadoras específicas de área**
(dosimetria, prescrição, remição são criminais) · `core/authorities/`.

Regra prática: **se depende de matéria jurídica, é pacote; se é mecanismo, é núcleo.**

## Princípios inegociáveis

1. **Sincroniza, não serve.** Nada é buscado em runtime — preserva offline, sigilo (a query nunca
   sai da máquina) e latência. Pacote assinado (Ed25519) + cache local. **A busca é local sobre o
   catálogo sincronizado**; o servidor distribui dados e nunca recebe consulta.
2. **Local-first.** Depois de baixado, tudo funciona sem rede.
3. **Degradação graciosa.** Licença vencida nunca vira tijolo: cache segue read-only com selo
   *"desatualizado há N dias"*. Da mesma família, e valendo para as **três** ausências: **"não
   baixado", "não tenho direito" e "não sei ler" nunca se apresentam como "não existe"**.
4. **Uma área só vira pacote com curador de verdade.** Arquitetura ampla, vitrine estreita.
5. **Acesso aberto (decisão de 12/08/2026).** Não há passo de ativação: o motor embarca um **token
   de acesso aberto** (`LS-OPEN-ACCESS-2026`, em `src/acervo-config.js`) e o servidor o aceita como
   licença ativa. Instalar e rodar `sync` basta. O token **não é segredo** — vive num repositório
   público, e chamá-lo de chave seria mentir sobre o que ele protege; ele existe como **ponto de
   corte**: trocar/limpar `ACESSO_ABERTO_TOKEN` no servidor fecha o acesso sem republicar o motor,
   e `LEGALSQUAD_LICENSE` sobrepõe o embarcado numa instalação. A precedência é
   **config do projeto > ambiente > embarcado**, então quem tem licença nominal nunca é atropelado.
   O maquinário de licença por CPF+e-mail continua inteiro e funcionando — só deixou de ser
   obrigatório. **O que NÃO foi afrouxado:** a verificação de assinatura Ed25519. Acesso aberto
   responde *quem pode baixar*; a assinatura responde *isto veio mesmo de quem diz que veio* — e
   essa continua fail-closed. O catálogo segue descendo inteiro com `entitled` por pack, para a
   busca dizer *"existe, mas não está liberado"* em vez de mentir.
6. **Motor novo só aqui.** O CriminalSquad está em manutenção (correção crítica apenas).

## Documentação

- [`docs/specs/legalsquad/ARQUITETURA.md`](docs/specs/legalsquad/ARQUITETURA.md) — a decisão, tipos de
  pacote, camada vertical, nome/comando.
- [`docs/specs/legalsquad/DESCOBERTA.md`](docs/specs/legalsquad/DESCOBERTA.md) — **como o Arquiteto
  acha skills e o squad acha jurisprudência**: os três relógios (sync × criação × execução),
  catálogo fino × conteúdo sob demanda, o veredito sobre embeddings, e as três decisões de licença
  já fechadas.
- [`docs/specs/legalsquad/MIGRACAO.md`](docs/specs/legalsquad/MIGRACAO.md) — plano F0–F5.
- [`docs/specs/legalsquad/F0-SANEAMENTO.md`](docs/specs/legalsquad/F0-SANEAMENTO.md) — o saneamento da
  suíte e da fronteira: por que 20 falhas eram regressão, o que virou fixture sintética, e a dívida de
  matéria criminal no motor — hoje **paga** (§5-bis).
- [`docs/specs/acervo-server/SPEC.md`](docs/specs/acervo-server/SPEC.md) — formato de pacote,
  manifesto, assinatura, delta, contratos de API. **Um pipeline carrega skills e acervo.**

## Estado atual: F0 concluído

Motor copiado do CriminalSquad (**a última cópia**) com todo o conteúdo jurídico removido.
Commit inicial: `19e29be`.

**O motor não tem mais categoria de assunto.** Duas mudanças de fundo fecharam isso:

1. **Matéria zerada.** A dívida da `§5-bis` — 34 arquivos do núcleo que falavam de execução penal,
   habeas corpus, júri e dosimetria — está **paga**. Os prompts do Arquiteto descobrem o manifesto
   de canonicalização (`skills/_*-integration.yaml`) e as best-practices obrigatórias pelo
   `_catalog.yaml` **da área instalada**, em vez de nomes criminais fixos. `tests/fronteira.test.js`
   passou de inventário de dívida a **guarda de não-regressão**: `DIVIDA_CONHECIDA` está vazia e
   nenhuma matéria pode voltar a entrar.
2. **Identidade `legalsquad` por inteiro** — comando, `_legalsquad/`, `bin/legalsquad.js`, textos,
   os wrappers das 13 IDEs, os marcadores de contrato (`LEGALSQUAD:HP-CONTRACT`,
   `LEGALSQUAD:CITATION-GATE`), o schema `legalsquad.skill-promotion-evidence/v1` e o prefixo de
   eval `lsq-v5-*`. **Sem alias de compatibilidade**: nada foi distribuído, então não há instalação
   a preservar.

> **Requisito que isso cria para o F1 — leia antes de escrever o `build-area`.** Conteúdo autorado
> antes deste rename traz gravados os marcadores antigos (`<!-- CRIMINALSQUAD:HP-CONTRACT:START -->`)
> e ids de eval `csq-v5-*`. O **`build-area` precisa traduzir esses identificadores ao empacotar** —
> `CRIMINALSQUAD:` → `LEGALSQUAD:`, `csq-v5-` → `lsq-v5-`, e o `schema_version` da evidência de
> promoção. É **normalização de fronteira**: acontece no pacote, com a origem intocada. Sem ela, o
> motor não reconhece o contrato das skills e a paridade do F2 falha.
>
> A armadilha, documentada no [`SPEC §6.8`](docs/specs/acervo-server/SPEC.md): reescrever o marcador
> **muda os bytes** do `SKILL.md`, e `skill_binding.skill_sha256` amarra a evidência de promoção a
> esses bytes. Normalizar sem re-bindar converte um erro ruidoso em falha silenciosa (a skill vira
> `contracted` e nunca promove); re-bindar torna o binding tautológico. Não há saída sem custo — é
> decisão de produto, não de implementação.

### Pendências abertas (não são bugs — é o F0 inacabado por decisão)

- **Pacote `transversal` não extraído** — as ~20 skills que servem qualquer área (integrações,
  mídia, e-mail, OCR, publicação). O número foi confirmado empiricamente e bate com a
  `ARQUITETURA §3`. `incidente-falsidade-documental` é a única com cara de matéria — o F1 decide se é
  transversal de verdade ou por acidente de fork. É trabalho do `build-area`: separar `transversal`
  de `area.*` é justamente o que ele faz.
- **A suíte tem 7 falhas conhecidas — dívida documentada, não bug (mas não está verde).**
  `npm test` → 314 passam, 7 falham, 321 no total, 0 skip, 0 todo. A afirmação anterior deste
  documento — que as falhas "não são regressão" — **estava errada**: das 98 falhas originais, ~20
  eram regressão de verdade (o F0 apagou os wrappers de IDE do comando, o `catalog-scout` **e os
  dois juízes do loop de qualidade** — `avaliador-squad` e `verificador-citacoes` —, que são
  motor, junto com o conteúdo jurídico — todos foram restaurados generalizados), ~21 eram matéria jurídica de área
  (calculadoras criminais, execução penal — removidas com razão) e ~57 eram motor testado tendo as
  skills criminais como fixture — hoje reapontadas para `tests/fixtures/area-demo/` (sintética, sem
  matéria jurídica real). Das 7 falhas que restam, **duas causas distintas, não uma só**: 6 delas —
  `init.test.js` (4: `apify`/`blotato`/`canva` não instaladas, `legalsquad-skill-creator/scripts`,
  `_evals/README.md`, `habeas-corpus/references/high-performance-contract.md`), `update.test.js` (1:
  `image-ai-generator/SKILL.md`) e `cli.test.js` (1: `skillsCli install` de `image-creator`) — são
  ENOENT puro: este repo não tem mais um `<repo>/skills` de verdade para instalar, e parametrizar
  qualquer nome de manifesto não resolveria nenhuma delas, porque falta o pacote inteiro, não um
  arquivo específico. Só a 7ª (`update.test.js:225`, teste `update does not auto-import preview
  skills`) é causada por `syncSkillCatalogArtifacts` (`src/init.js`, reusado por `update.js`)
  resolver `_execucao-penal-v3-integration.yaml` por nome fixo a partir de `PACKAGE_ROOT/skills`: como
  esse caminho também não existe, a função no-opa silenciosamente (`src/init.js:264`) em vez de
  lançar, e devolve ao teste o manifesto obsoleto que ele mesmo escreveu. Parametrizar o nome do
  manifesto resolveria só essa 1; as outras 6 exigem que o `build-area` (F1) produza um `<repo>/skills`
  real. Ver [`F0-SANEAMENTO.md §5-bis`](docs/specs/legalsquad/F0-SANEAMENTO.md). A não-regressão dessa
  dívida — nenhum arquivo novo passando a conter matéria jurídica — é guardada por
  `tests/fronteira.test.js`.
- **`npm run verify` continua vermelho** — não é regressão desta branch, já era assim antes; registrado
  aqui para quem clona não descobrir na marra. `scripts/verify.mjs` é o gate de release do tarball
  publicável e exige conteúdo de área que este repo não tem mais: exatamente 487 `SKILL.md` (com
  `references/high-performance-contract.md` e `agents/openai.yaml` correspondentes), os três motores de
  `legal-calculators/` (fração/data, remição, prescrição executória) e
  `_legalsquad/core/authorities/execucao-penal-art-112.json`. Continuará vermelho até o `build-area`
  (F1) produzir um pacote de área para alimentar o tarball.

## F1 — o empacotador: **concluído**

```bash
node tools/build-area.mjs <diretorio-de-conteudo> <area-id> --key <chave.pem> [--out <dir>]
```

Lê `skills/`, `squads/`, `core/best-practices/`, `core/agents/` e o `_packs.yaml` **do diretório que
receber por argumento**; separa `transversal` de `area.*`; remapeia caminho de autoria para caminho
de instalação onde os dois divergem (`_legalsquad/core/best-practices/`, `.claude/agents/` — §6.2.1
da SPEC); produz os pacotes assinados. Cinco módulos, todos com
teste: [`pack-format`](src/pack-format.js) (container, selo, verificação) ·
[`pack-tree`](src/pack-tree.js) (árvore → entidades-arquivo) · [`pack-split`](src/pack-split.js)
(corte) · [`pack-catalog`](src/pack-catalog.js) (registro de descoberta) ·
[`pack-build`](src/pack-build.js) (orquestração).

Zero dependência: `node:zlib` traz zstd nativo e `node:crypto` traz Ed25519 — confirmado no Node 26
**antes** de escrever a primeira linha. Verificar assinatura não pode depender de instalar nada.

**Genérico e cego por definição:** nenhum caminho de repositório aparece no código, no teste ou no
aceite. Ele empacota o que apontarem — de um checkout, de um diretório exportado, de um tarball
extraído. Se um dia precisar saber *de quem* é o conteúdo, o desenho está errado.

**Ele emite duas metades, não uma.** Todo pacote leva um `catalog.jsonl.zst` fino (um registro de
descoberta por item) **separado** das entidades de conteúdo — é o que permite ao cliente
sincronizar o catálogo de tudo e baixar conteúdo só do que usa. Isso **tem prazo**: é formato
assinado, e retrofitar depois obriga a re-assinar e re-distribuir tudo. Ver
[`SPEC §6.1`](docs/specs/acervo-server/SPEC.md) e
[`DESCOBERTA §2`](docs/specs/legalsquad/DESCOBERTA.md).

**Aceite do F1 — todos verdes**, no CI, sem depender de máquina nenhuma
([`tests/pack-*.test.js`](tests/pack-build.test.js)):
1. ✅ Empacotar `tests/fixtures/area-demo/` produz pacotes assinados válidos, e a contagem de skills
   bate com a fixture — nenhuma perdida, nenhuma nos dois pacotes.
2. ✅ O diretório de origem fica **byte a byte idêntico** depois do build (invariante read-only,
   provada por hash da árvore antes e depois — não por `git status` de um repo externo).
3. ✅ Empacotar duas vezes dá o **mesmo `content_hash`** (determinismo).
4. ✅ Um pacote com um byte adulterado é **recusado**, e o motivo nomeia a entidade.
5. ✅ O pacote tem **exatamente um** `catalog.jsonl.zst` (`role: "catalog"`), e todo `sha256` que ele
   referencia existe na entidade de conteúdo declarada — e vice-versa.
6. ✅ Um pacote **sem** catálogo é **recusado** (fail-closed): sem ele a área é invisível para a
   busca, e invisível é indistinguível de inexistente.
7. ✅ A razão catálogo/conteúdo **medida** entra no relatório do build.

> **Correção de redação no aceite 7.** A versão anterior deste documento exigia catálogo "ordens de
> grandeza menor", e isso **não é verificável na fixture sintética**: medido, dá `transversal` 2,5× e
> `area.demo` 9,9×, porque as skills da fixture têm corpo curto e a metadata pesa quase tanto quanto
> o conteúdo. A razão cresce com arquivos de apoio por item; o conteúdo medido no
> [`SPEC §6.1`](docs/specs/acervo-server/SPEC.md) (520 skills, 1671 arquivos, 1,93 MB) projeta ~27×.
>
> Um limiar em bytes calibrado numa fixture seria número arbitrário. O que sustenta a razão em
> **qualquer** escala é estrutural, e é isso que o teste prende: o catálogo **não carrega corpo**
> (`text`/`b64` ausentes) e traz **um registro por item descobrível, não por arquivo**. Acrescentar
> `text` ao registro passaria por qualquer limiar folgado e destruiria a economia inteira em campo.

**Como o corte `transversal` × `area.*` é declarado.** O empacotador é cego: não adivinha que uma
skill serve qualquer área. O curador declara num `_packs.yaml` na raiz do conteúdo (YAML plano,
lido pelo `parseScalar`/`parseList` que já existe — cinco chaves não justificam dependência):

```yaml
area_id: criminal
area_titulo: "Direito Criminal"
transversal_skills: [conector-mcp, gerador-imagem, publicacao-web]
```

Três portas fail-closed fecham **o mesmo** modo de falha: arquivo ausente, chave `transversal_skills`
ausente, e id declarado que não casa com skill nenhuma. Se qualquer uma tolerasse, as ~19 skills
transversais cairiam no pacote de área **em silêncio** — duplicadas em toda área instalada, que é o
que a migração existe para eliminar. `transversal_skills: []` é aceito; a omissão não.

**Promoção não viaja no pacote.** A evidência comportamental mora em `skills/_evals/results/`, que é
user-owned e não é empacotado ([`SPEC §6.5`](docs/specs/acervo-server/SPEC.md)). Então o catálogo
**capa em `contracted`** toda skill que se declare `verified`/`certified`, e registra o motivo em
`promotion_blocked_by`. O pacote leva o **contrato** e os **casos** de eval; a **prova** é local, por
construção. Um pacote saindo com 520 skills `verified` cuja prova ninguém pode conferir seria o motor
voltando a mentir na única dimensão em que acabou de parar.

**Bytes de origem preservados** ([`SPEC §6.8`](docs/specs/acervo-server/SPEC.md), opção A): marcador
de contrato legado **identifica** o contrato e nunca promove — capa em `contracted` com o motivo, em
vez de reescrever. Reescrever mudaria os bytes que `skill_binding.skill_sha256` amarra; o manifesto
declara `normalization.rewritten_bytes: false` e `rebound_evidence: false` para que a decisão seja
auditável no artefato.

**Aceite do F2 (paridade):** instalação limpa `legalsquad` + `transversal` + `area.criminal`
reproduz a experiência atual do LegalSquad — 9 squads, gates verdes, resolvedor e Citation Gate
funcionando. **Se não houver paridade, para** — não se abre área nova nem se migra aluno.

## F3 — Sync + licença: **concluído e no ar**

O servidor de distribuição (SPEC §7-§8) mora num repositório **novo e privado**,
[`legalsquad-acervo-server`](https://github.com/bbpropulse/legalsquad-acervo-server) — nunca no
motor (público). Mesma razão pela qual conteúdo de área não entra aqui: segredo de assinatura de
URL, segredo de admin e o inventário de quem tem licença não pertencem a repositório público.

**Construído e testado (39 testes no servidor, 576 no motor):**
- Servidor: `GET /v1/catalog` (entitlement, URLs assinadas HMAC expiráveis), `GET /v1/signing-keys`,
  `POST /v1/admin/publish` (autenticado). Módulos puros, camada HTTP fina em cima.
- Motor: `src/pack-archive.js` (formato de transporte — um pacote inteiro num `Buffer`, pra caber
  numa única URL do §7.1), `src/acervo-transport.js` (`baixar` via `fetch`), `src/acervo-cli.js`
  (`sync` real: busca catálogo → `planejarSync` → `executarSync` com `verificarPacote`/
  `aplicarPacote` já existentes), `tools/publish-pack.mjs` (verifica localmente com `--pubkey`,
  publica no servidor — nunca sobe pacote sem verificar antes).

**Simplificação deliberada de v1** (decidida com o usuário — ver README do servidor):
`verificarPacote` verifica o pacote como unidade atômica; não há verificação parcial por entidade
ainda. Por isso `catalog` e `content`, na resposta do `/v1/catalog`, apontam pro mesmo arquivo (o
pacote inteiro), e sem entitlement nenhum dos dois aparece — o pack continua listado (nunca some),
só sem link de download. A separação "catálogo fino sempre baixável" da SPEC fica para quando
`pack-format.js` suportar verificação parcial.

**Em produção:** `https://acervo-server-production.up.railway.app` (projeto Railway
`legalsquad-acervo`, volume persistente em `/data`). Chave Ed25519 de produção em
`~/.legalsquad-signing/` — privada **fora de qualquer git**, `kid: prod-2026-07`, pública servida em
`/v1/signing-keys`. 12 pacotes publicados (**5523 skills**: 10 áreas JusSkills + transversal +
`area.eleitoral` com 1000 skills).

**Aceite (SPEC/MIGRACAO.md F3) — verificado contra a instância pública:** licença ativa baixa os 12
packs numa instalação limpa (18s) e a busca encontra as skills; licença inexistente devolve
`status: none` com os 12 packs **listados** e zero links de download — "existe, sua licença não
cobre", nunca "não existe".

**Pendência remanescente (decisão de produto, não dívida):** o motor **não embarca chave pública** —
o cliente aponta `signing_public_key_path` para um arquivo local, mesmo padrão manual do
`apply-pack.mjs --pubkey`. Embarcar uma chave padrão no motor público é decisão ainda não tomada; a
SPEC §7.2 já registra isso como aspiracional ("verificação nunca depende de rede, chave já
embarcada").
