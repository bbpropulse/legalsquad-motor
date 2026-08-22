# LegalSquad

Motor de orquestração multi-agente para o Direito.

**Áreas do Direito não vivem neste repositório.** Elas chegam como **pacotes assinados**
(skills + squads + best-practices + acervo) baixados por `sync` e liberados por licença.

## Instalar e atualizar — pelo GitHub

O motor **não é distribuído pelo npm**. `npx legalsquad` numa máquina limpa falha com
`404 Not Found - GET https://registry.npmjs.org/legalsquad`, porque o pacote não existe no
registro público. Instale e atualize a partir deste repositório:

```bash
npm install -g github:bbpropulse/legalsquad-nucleo
```

O mesmo comando **instala e atualiza** — rodá-lo de novo troca o motor pela versão mais recente
de `main`. Depois disso o comando `legalsquad` existe no PATH e todos os `npx legalsquad …` deste
README funcionam (o `npx` encontra o pacote no prefix global antes de tentar o registro).

Cada projeto tem seus próprios dados. Dentro da pasta do projeto:

```bash
legalsquad init --yes --lang "português"
```

Para trazer as correções do motor a um projeto **já inicializado**, depois de atualizar o global:

```bash
legalsquad update
```

Ele substitui os arquivos de sistema (`_legalsquad/`, prompts, agentes), faz backup `.bak` do que
troca e **preserva** `_memory/`, `acervo/`, `agents/`, `squads/` e as skills sincronizadas.

As áreas do Direito atualizam por um caminho separado, contra o servidor de acervo:

```bash
legalsquad acervo sync
```

Ele baixa só o que mudou de versão, restaura arquivo de pacote que tenha sido apagado, e é
idempotente — rodar de novo sem novidade devolve `0 aplicado(s)`.

## O arranjo

**Este repositório é autocontido.** Ele não depende de nenhum diretório vizinho e não lê
repositório algum além de si próprio. As áreas do Direito chegam **de forma remota**, como pacotes
assinados verificados no cliente.

O conteúdo de cada área é autorado por seu **curador**, fora daqui. O LegalSquad **executa** o que
foi baixado — e, quando pedido, **empacota um diretório que lhe apontem**.

O `build-area` é **genérico**: recebe o caminho do conteúdo por argumento, nunca conhece um
repositório específico, e **jamais escreve na origem**.

## O que está aqui (motor)

Roteador e loop de orquestração · Arquiteto · Pipeline Runner e checkpoints · resolvedor
fail-closed (lifecycle/evidência) · Citation Gate · CLI · `captura` (áudio/vídeo) · indexadores ·
integrações (DJEN, e-mail, agenda) · dashboard.

## O que **não** está aqui (vira pacote)

Skills de matéria · squads · best-practices jurídicas · acervo · perfis de instituição ·
calculadoras específicas de área.

## Documentação

- [`docs/specs/legalsquad/ARQUITETURA.md`](https://github.com/bbpropulse/legalsquad-motor/blob/main/docs/specs/legalsquad/ARQUITETURA.md) — a decisão, o corte
  núcleo × pacote, tipos de pacote, licença e a camada vertical.
- [`docs/specs/legalsquad/MIGRACAO.md`](https://github.com/bbpropulse/legalsquad-motor/blob/main/docs/specs/legalsquad/MIGRACAO.md) — plano de construção F0–F5.
- [`docs/specs/legalsquad/F0-SANEAMENTO.md`](https://github.com/bbpropulse/legalsquad-motor/blob/main/docs/specs/legalsquad/F0-SANEAMENTO.md) — o saneamento da
  suíte e da fronteira núcleo × pacote, incluindo a dívida de matéria criminal, hoje paga, no
  motor.
- [`docs/specs/acervo-server/SPEC.md`](https://github.com/bbpropulse/legalsquad-motor/blob/main/docs/specs/acervo-server/SPEC.md) — o mecanismo de pacote,
  assinatura, delta e sync (um pipeline carrega **skills e acervo**).

## Estado: F0 (scaffold)

O motor foi copiado do CriminalSquad — **a última cópia que será feita** — e todo o conteúdo
jurídico foi removido. Daqui pra frente, evolução de motor acontece **só aqui**.

**O motor não tem mais categoria de assunto, nem resquício do nome antigo.** A matéria jurídica de
área foi zerada do núcleo (a dívida `§5-bis`, de 34 arquivos, está paga — [`tests/fronteira.test.js`](https://github.com/bbpropulse/legalsquad-motor/blob/main/tests/fronteira.test.js)
agora guarda a não-regressão com inventário vazio) e a identidade é `legalsquad` por inteiro:
comando, `_legalsquad/`, `bin/legalsquad.js`, os marcadores de contrato
(`LEGALSQUAD:HP-CONTRACT`, `LEGALSQUAD:CITATION-GATE`), o schema
`legalsquad.skill-promotion-evidence/v1` e o prefixo de eval `lsq-v5-*`. Sem alias de
compatibilidade — nada foi distribuído ainda.

> **Requisito que isso cria para o F1:** as skills do `criminalsquad` e do `dtsquad` têm gravados os
> marcadores antigos (`CRIMINALSQUAD:HP-CONTRACT`) e evals `csq-v5-*`. O **`build-area` precisa
> traduzi-los ao empacotar** — é uma normalização de empacotamento, e o pacote é o lugar certo para
> ela. Sem isso, o motor não reconhece o contrato das skills importadas.

### Pendências conhecidas do F0

- **Pacote `transversal` ainda não extraído** (as ~20 skills que servem qualquer área). O conjunto já
  é derivável hoje: a interseção de nomes entre `criminalsquad` e `dtsquad` dá exatamente 20 entradas
  (19 skills + `_evals`), sem depender do `ejsquad` — ver
  [`F0-SANEAMENTO.md §7`](https://github.com/bbpropulse/legalsquad-motor/blob/main/docs/specs/legalsquad/F0-SANEAMENTO.md).
- **A suíte tem 7 falhas conhecidas, não está 100% verde:** `npm test` → 872 passam, 7 falham, 879 no
  total, 0 skip, 0 todo. São dívida documentada (não bug), mas por **duas causas diferentes**: 6 delas
  (`init.test.js` ×4, `update.test.js` ×1, `cli.test.js` ×1) são ENOENT puro — `installAllSkills` e o
  `resource-cli` tentam copiar skills de um `<repo>/skills` que este repo não tem mais. Só a 7ª
  (`update.test.js:225`) é causada por `syncSkillCatalogArtifacts` (`src/init.js`, chamada por `init`
  e `update`) resolver o manifesto `_execucao-penal-v3-integration.yaml` por nome fixo em vez de raiz
  parametrizada. Detalhe completo em
  [`F0-SANEAMENTO.md §5-bis`](https://github.com/bbpropulse/legalsquad-motor/blob/main/docs/specs/legalsquad/F0-SANEAMENTO.md). A não-regressão dessa dívida é
  guardada por [`tests/fronteira.test.js`](https://github.com/bbpropulse/legalsquad-motor/blob/main/tests/fronteira.test.js).
- **`npm run verify` continua vermelho** (não é regressão desta branch): `scripts/verify.mjs` exige
  487 `SKILL.md`, os motores de `legal-calculators/` e `_legalsquad/core/authorities/
  execucao-penal-art-112.json` — tudo conteúdo de área que este repo não tem mais. Só volta a passar
  quando o `build-area` (F1) alimentar o tarball com um pacote de área real.

## Regras do projeto

1. **Nenhum passo escreve nos repos de conteúdo.** O `build-area` é somente leitura.
2. **Motor novo só aqui.** O CriminalSquad está em manutenção (correção crítica apenas).
3. **Uma área só vira pacote com curador responsável.**
