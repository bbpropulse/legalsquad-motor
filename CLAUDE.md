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
  matéria criminal ainda hardcoded no motor (§5-bis).
- [`docs/specs/acervo-server/SPEC.md`](docs/specs/acervo-server/SPEC.md) — formato de pacote,
  manifesto, assinatura, delta, contratos de API. **Um pipeline carrega skills e acervo.**

## Estado atual: F0 concluído

Motor copiado do CriminalSquad (**a última cópia**) com todo o conteúdo jurídico removido.
Commit inicial: `19e29be`.

### Pendências abertas (não são bugs — é o F0 inacabado por decisão)

- **Identidade interna ainda é `criminalsquad`**: o comando, a pasta `_criminalsquad/`, textos e
  templates. Rename é mecânico mas é diff grande — decisão em `ARQUITETURA.md §6`
  (recomendação: manter `criminalsquad` como bundle comercial e renomear quando a 2ª área for
  vendida). `legalsquad` já existe como alias de bin.
- **Pacote `transversal` não extraído** — as ~20 skills que servem qualquer área. O conjunto já é
  **derivável hoje**, sem depender do `ejsquad`: a interseção de nomes entre `criminalsquad` e
  `dtsquad` dá exatamente 20 entradas (19 skills + `_evals`), confirmando o número da
  `ARQUITETURA §3`. `incidente-falsidade-documental` é a única com cara de matéria — o F1 decide se é
  transversal de verdade ou por acidente de fork. Extrair à mão seria uma 2ª cópia; isso é trabalho do
  `build-area` (F1).
- **A suíte está verde, com 7 falhas conhecidas — não é bug.** `npm test` → 283 passam, 7 falham, 0
  skip, 0 todo. A afirmação anterior deste documento — que as falhas "não são regressão" — **estava
  errada**: das 98 falhas originais, ~20 eram regressão de verdade (o F0 apagou os wrappers de IDE do
  comando e o `catalog-scout`, que são motor, junto com o conteúdo jurídico — foram restaurados),
  ~21 eram matéria jurídica de área (calculadoras criminais, execução penal — removidas com razão) e
  ~57 eram motor testado tendo as skills criminais como fixture — hoje reapontadas para
  `tests/fixtures/area-demo/` (sintética, sem matéria jurídica real). As 7 falhas que restam são dívida
  documentada e aceita, não trabalho esquecido: `init.test.js` (4), `update.test.js` (2) e
  `cli.test.js` (1) falham porque `installAllSkills`, `syncSkillCatalogArtifacts` (`src/init.js`) e o
  `resource-cli` resolvem o manifesto `_execucao-penal-v3-integration.yaml` por nome fixo, em vez de
  aceitar raiz parametrizada — parametrizar agora seria inventar a interface do pacote de área antes do
  `build-area` existir. Ver [`F0-SANEAMENTO.md §5-bis`](docs/specs/legalsquad/F0-SANEAMENTO.md). A
  não-regressão dessa dívida — nenhum arquivo novo passando a conter matéria jurídica — é guardada por
  `tests/fronteira.test.js`.

## Próximo passo: F1 — o exportador

`tools/build-area.mjs <repo-de-conteudo> <area-id>` → lê `skills/`, `squads/`,
`core/best-practices/` e o perfil; separa `transversal` de `area.*`; produz o pacote assinado.

**Aceite do F1:** gerar `area.criminal` a partir do CriminalSquad com **`git status` limpo lá**
(prova de que o build é read-only) e contagem batendo com as **520 skills**.

**Aceite do F2 (paridade):** instalação limpa `legalsquad` + `transversal` + `area.criminal`
reproduz a experiência atual do CriminalSquad — 9 squads, gates verdes, resolvedor e Citation Gate
funcionando. **Se não houver paridade, para** — não se abre área nova nem se migra aluno.
