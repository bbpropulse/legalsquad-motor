# LegalSquad — Instruções do Projeto

Este repositório é o **motor** de orquestração multi-agente para o Direito. **Áreas do Direito não
vivem aqui** — chegam como **pacotes assinados** (skills + squads + best-practices + acervo)
baixados por `sync` e liberados por licença.

## O arranjo entre repositórios (leia primeiro)

| Repositório | Papel | Pode ser modificado? |
|---|---|---|
| **`legalsquad`** (este) | Motor + plataforma de distribuição | **sim** — é onde o motor evolui |
| `~/Documents/Projetos/Devlop/criminalsquad/app` | Fonte do conteúdo criminal **e** produto que vende hoje (Núcleo, turma fundadora) | **NÃO** |
| `~/Devlop/dtsquad` | Fonte do conteúdo trabalhista | **NÃO** |

> `~/Devlop/ejsquad/app` (fonte do conteúdo extrajudicial) **não existe no disco** — nem
> `~/Devlop/ejsquad`. Hoje só `criminalsquad` (520 skills) e `dtsquad` (405) estão presentes.
> Ver [`F0-SANEAMENTO.md §7`](docs/specs/legalsquad/F0-SANEAMENTO.md).

> **Regra dura:** o `build-area` **lê** os repos de conteúdo e produz pacotes. Nenhum passo escreve
> neles. O critério de aceite de toda fase inclui conferir que esses repos ficam com
> **`git status` limpo** depois do build.

O conteúdo continua sendo **autorado no repo da área** (com os gates que já funcionam lá); o
LegalSquad apenas **empacota e distribui**.

## Fronteira núcleo × pacote

**Fica no motor:** roteador e loop de orquestração · Arquiteto · Pipeline Runner e checkpoints ·
resolvedor fail-closed (lifecycle/evidência) · Citation Gate · CLI · `sync` · `captura` (áudio/vídeo)
· OCR · indexadores · integrações (DJEN, e-mail, agenda) · dashboard.

**Vira pacote:** skills de matéria · squads · best-practices jurídicas · acervo · perfil/ética de
instituição · **calculadoras específicas de área** (dosimetria, prescrição, remição são criminais) ·
`core/authorities/`.

Regra prática: **se depende de matéria jurídica, é pacote; se é mecanismo, é núcleo.**

## Princípios inegociáveis

1. **Sincroniza, não serve.** Nada é buscado em runtime — preserva offline, sigilo (a query nunca
   sai da máquina) e latência. Pacote assinado (Ed25519) + cache local.
2. **Local-first.** Depois de baixado, tudo funciona sem rede.
3. **Degradação graciosa.** Licença vencida nunca vira tijolo: cache segue read-only com selo
   *"desatualizado há N dias"*.
4. **Uma área só vira pacote com curador de verdade.** Arquitetura ampla, vitrine estreita.
5. **Motor novo só aqui.** O CriminalSquad está em manutenção (correção crítica apenas).

## Documentação

- [`docs/specs/legalsquad/ARQUITETURA.md`](docs/specs/legalsquad/ARQUITETURA.md) — a decisão, tipos de
  pacote, licença/tiers, camada vertical, nome/comando.
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
2. **Identidade renomeada** para `legalsquad` (comando, `_legalsquad/`, `bin/legalsquad.js`, textos
   e os wrappers das 13 IDEs). O bin mantém `criminalsquad` como **alias**, então quem já instalou
   não perde o comando.

**Três identificadores conservam o nome antigo de propósito** — são formato de dados, não marca:
`CRIMINALSQUAD:HP-CONTRACT` e `CRIMINALSQUAD:CITATION-GATE` (marcadores gravados dentro dos
`SKILL.md` das 520 skills criminais e das 405 trabalhistas) e
`criminalsquad.skill-promotion-evidence/v1` (schema versionado). Trocá-los faria o pacote do F1 não
ser reconhecido pelo motor e quebraria a paridade do F2 em silêncio — é migração de dados, não
rename.

### Pendências abertas (não são bugs — é o F0 inacabado por decisão)

- **Pacote `transversal` não extraído** — as ~20 skills que servem qualquer área. O conjunto já é
  **derivável hoje**, sem depender do `ejsquad`: a interseção de nomes entre `criminalsquad` e
  `dtsquad` dá exatamente 20 entradas (19 skills + `_evals`), confirmando o número da
  `ARQUITETURA §3`. `incidente-falsidade-documental` é a única com cara de matéria — o F1 decide se é
  transversal de verdade ou por acidente de fork. Extrair à mão seria uma 2ª cópia; isso é trabalho do
  `build-area` (F1).
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

## Próximo passo: F1 — o exportador

`tools/build-area.mjs <repo-de-conteudo> <area-id>` → lê `skills/`, `squads/`,
`core/best-practices/` e o perfil; separa `transversal` de `area.*`; produz o pacote assinado.

**Aceite do F1:** gerar `area.criminal` a partir do LegalSquad com **`git status` limpo lá**
(prova de que o build é read-only) e contagem batendo com as **520 skills**.

**Aceite do F2 (paridade):** instalação limpa `legalsquad` + `transversal` + `area.criminal`
reproduz a experiência atual do LegalSquad — 9 squads, gates verdes, resolvedor e Citation Gate
funcionando. **Se não houver paridade, para** — não se abre área nova nem se migra aluno.
