# F0 · Plano 1 — Saneamento da fronteira

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA — use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> checkbox (`- [ ]`) para rastreio.

**Meta:** levar `npm test` de 206/304 a **zero falhas e zero skips**, restaurando o que é motor,
removendo o que é matéria jurídica e trocando as fixtures de conteúdo criminal por uma fixture
sintética.

**Arquitetura:** três classes de falha tratadas em ordem — **A** (regressão do F0: artefato de motor
apagado por engano) primeiro, porque contamina o diagnóstico das outras; **B** (matéria jurídica)
depois, porque só remove; **C** (motor testado com fixture criminal) por último, sobre um terreno já
limpo. Nenhum passo escreve nos repositórios de conteúdo.

**Stack:** Node ≥20, `node:test` (runner nativo), ESM, ESLint. Sem novas dependências.

**Spec:** [`F0-SANEAMENTO.md`](F0-SANEAMENTO.md) · **Branch:** `f0-saneamento` (já criada) ·
**Plano 2** (formato de pacote) vem depois deste.

## Restrições globais

- **`~/Documents/Projetos/Devlop/criminalsquad/app` é READ-ONLY.** É a fonte de leitura da Classe A.
  Ao final, `git -C <criminalsquad> status --short` deve ser **idêntico** ao do início (`?? output/`
  e `?? tmp/`, que já existiam). Qualquer linha nova é falha do plano.
- **Nenhum `skip`, `todo` ou teste comentado.** Se um teste não pode passar, ele é removido com
  justificativa no commit — não silenciado.
- **A dívida de fronteira não cresce.** O motor já contém matéria criminal hardcoded em 7 arquivos —
  inventário congelado em [`F0-SANEAMENTO.md §5-bis`](F0-SANEAMENTO.md), a corrigir no F1. Este ciclo
  não resolve isso, mas **nenhum arquivo hoje limpo pode passar a conter matéria**, e nenhum teste
  novo pode ser calibrado em conteúdo criminal. Guardado por `tests/fronteira.test.js` (Task 8).
- **Conventional commits** (`fix:`, `test:`, `chore:`, `refactor:`), em português, corpo explicando
  o *porquê*.
- **A fixture usa a área fictícia `demo`** — nunca direito real, para não reintroduzir conteúdo de
  área no motor pela porta dos fundos.
- Rodar a suíte completa: `npm test`. Uma suíte só:
  `node --import ./tests/test-setup.js --test tests/<arquivo>`.

---

## Estrutura de arquivos

**Restaurados** (Classe A, lidos do criminalsquad):
- `templates/ide-templates/{claude-code/.claude,gemini-cli/.gemini,qwen-code/.qwen}/skills/legalsquad/SKILL.md`
- `templates/ide-templates/codex/.agents/skills/legalsquad/SKILL.md`
- `.claude/skills/legalsquad/SKILL.md`
- `.claude/agents/catalog-scout.md` · `templates/ide-templates/claude-code/.claude/agents/catalog-scout.md`
  · `templates/ide-templates/codex/.Codex/agents/catalog-scout.toml`

**Modificados:**
- `src/build-ide-templates.js` — tirar `'CLAUDE.md'` do MANIFEST
- `src/init.js` — tirar `scripts/legal-calculators` de `CANONICAL_SOURCES`
- `package.json` — remover 3 scripts órfãos
- ~10 arquivos de teste — reapontar raiz e derivar asserções

**Criados:**
- `tests/fixtures/area-demo/**` — a fixture sintética
- `templates/squads/demo-squad/squad.yaml`, `templates/acervo/_index.yaml`,
  `templates/acervo/teses-modelos/.gitkeep`

**Removidos** (Classe B):
- `tests/calculadora-{dosimetria,prescricao,tempestividade}.test.js`,
  `tests/fine-amount-engine.test.js`, `tests/legal-calculators-gold.test.js`,
  `tests/execucao-p0.test.js`, `tests/execucao-v4.test.js`

---

## Task 1: Restaurar os wrappers de IDE e desarmar o `build:ide`

O F0 apagou tudo que casava com `skills/` e levou junto os wrappers do comando `/legalsquad` —
que são **motor**. O gerador `build:ide` **lê** o destino para preservar o frontmatter por IDE, então
apagados ele quebra com `ENOENT`. E o `MANIFEST` lista `'CLAUDE.md'` da raiz: corrigir a restauração
sem tirar essa linha faz o próximo `build:ide` **sobrescrever o `CLAUDE.md` do projeto**.

**Arquivos:**
- Criar: os 5 `SKILL.md` listados na estrutura acima
- Modificar: `src/build-ide-templates.js:33` (remover `'CLAUDE.md'` do MANIFEST)
- Teste: `tests/ide-build.test.js`, `tests/install-global.test.js`, `tests/init.test.js`

**Interfaces:**
- Consome: nada (primeira task)
- Produz: `npm run build:ide` funcional e idempotente; `templates/ide-assets/*` como fonte única dos
  corpos

- [ ] **Passo 1: Registrar o estado do repo fonte (prova de read-only)**

```bash
git -C ~/Documents/Projetos/Devlop/criminalsquad/app status --short > /tmp/cs-antes.txt
cat /tmp/cs-antes.txt
```

Esperado: exatamente `?? output/` e `?? tmp/`. Guarde — é comparado no Passo 9.

- [ ] **Passo 2: Ver as falhas antes**

```bash
node --import ./tests/test-setup.js --test tests/install-global.test.js 2>&1 | grep -E '^ℹ (pass|fail)'
```

Esperado: `pass 0`, `fail 13`. A causa é uma só: `cp` de um diretório inexistente em
`src/install-global.js:60`.

- [ ] **Passo 3: Copiar os 5 wrappers do repo fonte**

```bash
CS=~/Documents/Projetos/Devlop/criminalsquad/app
for f in \
  "templates/ide-templates/claude-code/.claude/skills/legalsquad/SKILL.md" \
  "templates/ide-templates/gemini-cli/.gemini/skills/legalsquad/SKILL.md" \
  "templates/ide-templates/qwen-code/.qwen/skills/legalsquad/SKILL.md" \
  "templates/ide-templates/codex/.agents/skills/legalsquad/SKILL.md" \
  ".claude/skills/legalsquad/SKILL.md" ; do
  mkdir -p "$(dirname "$f")" && cp "$CS/$f" "$f" && echo "ok $f"
done
```

Esperado: 5 linhas `ok`. Os quatro primeiros têm 422 linhas; o do codex é um stub de 6 linhas (fica
fora do MANIFEST — é esperado).

- [ ] **Passo 4: Tirar `CLAUDE.md` do MANIFEST**

Em `src/build-ide-templates.js`, no array `'instructions-body.md'`, remova a última entrada:

```js
  'instructions-body.md': [
    `${IDE}/claude-code/CLAUDE.md`,
    `${IDE}/gemini-cli/GEMINI.md`,
    `${IDE}/qwen-code/QWEN.md`,
    `${IDE}/antigravity/.agent/rules/legalsquad.md`,
    `${IDE}/cursor/.cursor/rules/legalsquad.mdc`,
    `${IDE}/trae/.trae/rules/legalsquad.md`,
    // O CLAUDE.md da raiz NÃO é gerado: é a instrução do projeto LegalSquad
    // (fronteira núcleo × pacote, regras do build-area), não o corpo distribuído
    // às IDEs. Gerá-lo aqui sobrescrevia a documentação do repositório.
  ],
```

- [ ] **Passo 5: Rodar o gerador e provar que o `CLAUDE.md` não foi tocado**

```bash
npm run build:ide && git status --short CLAUDE.md
```

Esperado: o build completa sem erro **e** `git status --short CLAUDE.md` sai **vazio**. Se aparecer
`M CLAUDE.md`, o Passo 4 não foi aplicado — reverta com `git checkout CLAUDE.md` e refaça.

- [ ] **Passo 6: Rodar as três suítes afetadas**

```bash
for t in ide-build install-global init; do
  printf '%-16s ' "$t"
  node --import ./tests/test-setup.js --test tests/$t.test.js 2>&1 | grep -E '^ℹ (pass|fail)' | tr '\n' ' '
  echo
done
```

Esperado: `install-global` 11/13 · `init` 42/47 · `ide-build` 1/1 (as restantes caem nas Tasks 2 e 7).

- [ ] **Passo 7: Provar idempotência do gerador**

```bash
npm run build:ide && git status --short
```

Esperado: **saída vazia**. Rodar duas vezes seguidas não pode produzir diff — se produzir, o gerador
não é determinístico e isso é bug a investigar antes de seguir.

- [ ] **Passo 8: Lint**

```bash
npm run lint
```

Esperado: sem erros.

- [ ] **Passo 9: Confirmar que o repo fonte não foi tocado**

```bash
git -C ~/Documents/Projetos/Devlop/criminalsquad/app status --short > /tmp/cs-depois.txt
diff /tmp/cs-antes.txt /tmp/cs-depois.txt && echo "READ-ONLY OK"
```

Esperado: `READ-ONLY OK`.

- [ ] **Passo 10: Commit**

```bash
git add -A
git commit -m "fix: restaurar os wrappers de IDE do comando e tirar CLAUDE.md do build:ide

O F0 removeu tudo que casava com skills/ e levou junto os wrappers do comando
/legalsquad — que são motor, não matéria. Como o gerador lê o destino para
preservar o frontmatter por IDE, apagados ele quebrava com ENOENT, derrubando
install-global (13 falhas) e ide-build (1).

O MANIFEST ainda listava CLAUDE.md da raiz como destino do instructions-body.
Hoje o build morria antes de chegar lá; corrigida a regressão, o próximo
build:ide sobrescreveria a instrução do projeto. O CLAUDE.md do LegalSquad é
documento, não artefato gerado."
```

---

## Task 2: Restaurar o `catalog-scout` sem a matéria criminal

O `catalog-scout` é o batedor read-only do catálogo — **mecanismo de descoberta**, portanto núcleo.
Mas o corpo dele cita skills, manifestos e best-practices criminais. Restaurar cru reintroduz matéria
dentro de um artefato de motor.

**Arquivos:**
- Criar: `.claude/agents/catalog-scout.md`,
  `templates/ide-templates/claude-code/.claude/agents/catalog-scout.md`,
  `templates/ide-templates/codex/.Codex/agents/catalog-scout.toml`
- Teste: `tests/templates-paridade.test.js:222,232`, `tests/integridade.test.js:58`

**Interfaces:**
- Consome: `npm run build:ide` funcional (Task 1)
- Produz: `.claude/agents/` populado — `install-global.test.js:41` exige `agentsInstalled > 10`,
  atendido junto com a fixture na Task 7

- [ ] **Passo 1: Copiar os três arquivos**

```bash
CS=~/Documents/Projetos/Devlop/criminalsquad/app
for f in \
  ".claude/agents/catalog-scout.md" \
  "templates/ide-templates/claude-code/.claude/agents/catalog-scout.md" \
  "templates/ide-templates/codex/.Codex/agents/catalog-scout.toml" ; do
  mkdir -p "$(dirname "$f")" && cp "$CS/$f" "$f" && echo "ok $f"
done
```

- [ ] **Passo 2: Generalizar os 6 pontos de matéria criminal**

Nos **três** arquivos, substitua (o `.toml` tem o mesmo corpo em bloco de string):

| # | Onde | De | Para |
|---|---|---|---|
| 1 | `description` do frontmatter | "catálogo de reuso do CriminalSquad" | "catálogo de reuso do LegalSquad" |
| 2 | seção 1, evolução arquitetural | "o manifesto `skills/_execucao-penal-v3-integration.yaml`" | "o manifesto de canonicalização da área (`skills/_*-integration.yaml`)" |
| 3 | seção 2, exemplos | ``jurisprudencia-stj-stf`, `defesa-criminal-resposta-acusacao`, `triagem-novo-caso`, `monitor-dje-djen`, `resumo-processo`, `verificador-citacoes`, `secretaria-juridica`, `acervo-busca`` | "os nomes exatos vêm de `.claude/agents/` da área instalada — não presuma um catálogo fixo" |
| 4 | seção 3, best-practices | "(incl. `verificacao-citacoes`, `etica-oab-sigilo` e os nichos `defesa-*`)" | "(incluindo os gates de verificação e ética que a área declarar)" |
| 5 | seção 3, frase final | "Para qualquer propósito de execução penal, selecione e leia também `_legalsquad/core/best-practices/execucao-penal-alta-performance.md` antes de recomendar capacidade ou pesquisa." | "Quando o `_catalog.yaml` da área marcar uma best-practice como obrigatória para o propósito em questão, leia-a antes de recomendar capacidade ou pesquisa." |
| 6 | Autoavaliação, 3º item | "Em execução penal, apliquei `execucao-penal-alta-performance` e resolvi as `ep-*` para alvos canônicos?" | "Apliquei as best-practices obrigatórias da área e resolvi os aliases para alvos canônicos?" |

Também troque `_legalsquad/core/best-practices/_catalog.yaml` por
`<core>/best-practices/_catalog.yaml` no item 3 da lista "O que você varre", já que o diretório
depende da área instalada.

- [ ] **Passo 3: Provar que não sobrou matéria**

```bash
grep -rniE 'execucao-penal|ep-\*|stj|stf|criminal|penal|defesa-|oab' \
  .claude/agents/catalog-scout.md \
  templates/ide-templates/claude-code/.claude/agents/catalog-scout.md \
  templates/ide-templates/codex/.Codex/agents/catalog-scout.toml
```

Esperado: **nenhuma linha**. Se algo aparecer, generalize também.

> Exceção consciente: a string `criminalsquad` sobrevive em nome de comando e caminho de pacote — a
> decisão de não renomear está em [`ARQUITETURA.md §6`](ARQUITETURA.md). O grep acima não casa
> `criminalsquad` isolado; casa `criminal` como palavra dentro de texto. Se ele acusar apenas
> ocorrências do identificador `criminalsquad`, está correto seguir.

- [ ] **Passo 4: Rodar as suítes**

```bash
node --import ./tests/test-setup.js --test tests/templates-paridade.test.js 2>&1 | grep -E '^ℹ (pass|fail)'
node --import ./tests/test-setup.js --test tests/integridade.test.js 2>&1 | grep -E '^ℹ (pass|fail)'
```

Esperado: `templates-paridade` sobe para 13/18 (as 5 restantes são Classe B, Task 4);
`integridade` sobe para 5/7.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "fix: restaurar o catalog-scout generalizando os exemplos de matéria

O batedor do catálogo é mecanismo de descoberta — núcleo. Mas o corpo citava
skills, manifesto e best-practices criminais; restaurar cru reintroduziria
matéria dentro de um artefato de motor.

Os exemplos passam a referenciar o catálogo da área instalada em vez de nomes
fixos, e a regra de best-practice obrigatória vem do _catalog.yaml em vez de
apontar execucao-penal-alta-performance."
```

---

## Task 3: Remover as referências órfãs às calculadoras criminais

`src/init.js` manda copiar `scripts/legal-calculators` — diretório que o F0 removeu (são calculadoras
criminais). O `package.json` ainda expõe 3 scripts para lá.

**Arquivos:**
- Modificar: `src/init.js:21`, `package.json:29-31`
- Teste: `tests/init.test.js`, `tests/cli.test.js`

**Interfaces:**
- Consome: nada
- Produz: `CANONICAL_SOURCES` sem entradas fantasma

- [ ] **Passo 1: Tirar de `CANONICAL_SOURCES`**

Em `src/init.js`, remova a 4ª entrada:

```js
const CANONICAL_SOURCES = [
  { src: join(PACKAGE_ROOT, '_legalsquad', 'core'), dest: join('_legalsquad', 'core') },
  { src: join(PACKAGE_ROOT, '_legalsquad', 'config'), dest: join('_legalsquad', 'config') },
  { src: join(PACKAGE_ROOT, 'dashboard'), dest: 'dashboard' },
  // scripts/legal-calculators saiu: calculadoras de matéria são pacote de área,
  // não motor. Chegam pelo sync, não pelo init.
];
```

- [ ] **Passo 2: Remover os 3 scripts órfãos do `package.json`**

Apague as linhas `calculo:fracao`, `calculo:remicao` e `calculo:prescricao-executoria`.

- [ ] **Passo 3: Provar que não sobrou referência**

```bash
grep -rn 'legal-calculators' src/ bin/ scripts/ package.json || echo "sem referências órfãs ✓"
```

Esperado: `sem referências órfãs ✓`.

- [ ] **Passo 4: Rodar**

```bash
node --import ./tests/test-setup.js --test tests/init.test.js 2>&1 | grep -E '^ℹ (pass|fail)'
npm run lint
```

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "chore: remover referências órfãs a scripts/legal-calculators

O init copiava um diretório que o F0 removeu, e o package.json expunha três
scripts para lá. Calculadoras de matéria são pacote de área — chegam pelo sync."
```

---

## Task 4: Remover os testes de matéria jurídica (Classe B)

Testam lógica jurídica de área — dosimetria, prescrição, tempestividade, pena-multa, execução penal.
O lugar deles é `area.criminal`, no repositório onde o conteúdo é autorado.

**Arquivos:**
- Remover: `tests/calculadora-dosimetria.test.js`, `tests/calculadora-prescricao.test.js`,
  `tests/calculadora-tempestividade.test.js`, `tests/fine-amount-engine.test.js`,
  `tests/legal-calculators-gold.test.js`, `tests/execucao-p0.test.js`, `tests/execucao-v4.test.js`
- Modificar: `tests/templates-paridade.test.js`, `tests/integridade.test.js`
- Verificar: `tests/gold/`

**Interfaces:**
- Consome: nada
- Produz: suíte sem asserções de matéria

- [ ] **Passo 1: Remover as 7 suítes**

```bash
git rm -q tests/calculadora-dosimetria.test.js tests/calculadora-prescricao.test.js \
  tests/calculadora-tempestividade.test.js tests/fine-amount-engine.test.js \
  tests/legal-calculators-gold.test.js tests/execucao-p0.test.js tests/execucao-v4.test.js
```

- [ ] **Passo 2: Verificar `tests/gold/`**

```bash
ls tests/gold/
```

Se o conteúdo servir só às calculadoras removidas (nomes de arquivo referentes a dosimetria,
prescrição, remição, fração), remova o diretório: `git rm -rq tests/gold`. Se houver material usado
por suítes que ficam, preserve — confirme com:
`grep -rn 'tests/gold\|gold/' tests/ --include='*.test.js'`.

- [ ] **Passo 3: Tirar as asserções de matéria das suítes que ficam**

Em `tests/templates-paridade.test.js`, remova as asserções que espelham
`scripts/legal-calculators/` (4 arquivos) e a matriz do art. 112 da LEP — são 5 casos.

Em `tests/integridade.test.js`, remova a asserção que exige **exatamente 73 skills `ep-*`**
(`preview ep-* permanece isolada e estruturalmente válida`). A regra geral que ela protege — "skill
`preview` não vaza para produção" — é preservada na Task 7 pela skill `demo-preview-engine` da
fixture, sem número fixo de área.

- [ ] **Passo 4: Rodar e conferir a queda de total**

```bash
npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'
```

Esperado: `tests` cai de 304 para ~283; `fail` cai para ~57 (só Classe C).

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "test: remover os testes de matéria jurídica (Classe B)

Dosimetria, prescrição, tempestividade, pena-multa e execução penal testam
lógica de área, não mecanismo. Pela regra do CLAUDE.md — se depende de matéria
jurídica, é pacote — o lugar deles é o repositório onde o conteúdo é autorado,
com os gates que já funcionam lá.

Saem junto as asserções de matéria embutidas em suítes que ficam: os espelhos
de scripts/legal-calculators/ e a matriz do art. 112 em templates-paridade, e o
'exatamente 73 skills ep-*' em integridade. A regra que esta última protegia
(preview não vaza para produção) é recuperada pela fixture sintética."
```

---

## Task 5: Criar o esqueleto da fixture sintética

Onze skills demo cobrindo os cinco `lifecycle`, dois `quality_profile`, uma com `env`, uma `mcp`, uma
com `scripts/`. Área fictícia — sem direito real.

**Arquivos:**
- Criar: `tests/fixtures/area-demo/skills/**`
- Teste: nenhum ainda (a fixture é consumida na Task 7)

**Interfaces:**
- Consome: `_legalsquad/core/skill-quality-profiles.json` (perfis válidos)
- Produz: `tests/fixtures/area-demo/skills/` com 11 skills válidas para
  `validateSkillCatalog({skillsDir})` e `discoverSkillCatalog(dir)`

- [ ] **Passo 1: Confirmar os vocabulários antes de gerar**

```bash
node -e "const p=require('./_legalsquad/core/skill-quality-profiles.json'); console.log('perfis:', Object.keys(p.profiles).join(' | '))"
node -e "import('./src/skill-quality.js').then(m=>console.log('status:', m.SKILL_QUALITY_STATUSES.join(' | ')))"
```

Esperado (já conferido ao escrever este plano — se divergir, o motor mudou e o gerador do Passo 2
precisa acompanhar):

```
perfis: legal-drafting | legal-analysis | evidence-forensics | legal-calculation |
        client-operations | external-action | authority-content | system-orchestration
status: legacy | contracted | verified | certified | quarantined
```

**A armadilha:** `quality_profile` e `delivery_type` são vocabulários **diferentes** com nomes
parecidos. `external-action` e `legal-calculation` são **perfis**, não `delivery_type`. Os
`delivery_type` válidos, observados no catálogo criminal, são: `legal-analysis`, `legal-draft`,
`evidence-report`, `operational-brief`, `external-mutation`, `audit-calculation`, `system-artifact`.

- [ ] **Passo 2: Escrever o gerador da fixture**

Criar `tests/fixtures/gerar-area-demo.mjs`. Gerar em vez de escrever 11 skills à mão evita
divergência entre elas e mantém o conjunto fácil de estender:

```js
// Gera tests/fixtures/area-demo/skills/ — área fictícia para testar o MOTOR
// sem depender de conteúdo jurídico real. Rode: node tests/fixtures/gerar-area-demo.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), 'area-demo');

// Perfis e delivery_type conferidos contra o motor:
//   quality_profile ∈ skill-quality-profiles.json → legal-drafting | legal-analysis |
//     evidence-forensics | legal-calculation | client-operations | external-action |
//     authority-content | system-orchestration
//   quality_status  ∈ SKILL_QUALITY_STATUSES (src/skill-quality.js:16) → legacy |
//     contracted | verified | certified | quarantined
//   delivery_type   → legal-analysis | legal-draft | evidence-report | operational-brief |
//     external-mutation | audit-calculation | system-artifact
// ATENÇÃO: quality_profile e delivery_type são vocabulários DIFERENTES. Não existe
// delivery_type "legal-calculation" nem "external-action" — esses são nomes de PERFIL.
const PERFIL_A = 'legal-drafting';
const PERFIL_B = 'legal-calculation';

const SKILLS = [
  { nome: 'demo-peca-alpha',      lifecycle: 'active',      perfil: PERFIL_A, risco: 'r4', entrega: 'legal-draft',        tipo: 'prompt' },
  { nome: 'demo-calculo-beta',    lifecycle: 'active',      perfil: PERFIL_B, risco: 'r3', entrega: 'audit-calculation',  tipo: 'prompt', engines: ['demo-engine'] },
  { nome: 'demo-publicacao',      lifecycle: 'active',      perfil: PERFIL_A, risco: 'r2', entrega: 'external-mutation',  tipo: 'prompt' },
  { nome: 'demo-preview-engine',  lifecycle: 'preview',     perfil: PERFIL_B, risco: 'r3', entrega: 'audit-calculation',  tipo: 'prompt', versao: '3.0.0' },
  { nome: 'demo-piloto',          lifecycle: 'pilot',       perfil: PERFIL_A, risco: 'r2', entrega: 'legal-draft',        tipo: 'prompt' },
  { nome: 'demo-quarentena',      lifecycle: 'quarantined', perfil: PERFIL_A, risco: 'r4', entrega: 'legal-draft',        tipo: 'prompt' },
  { nome: 'demo-deprecada',       lifecycle: 'deprecated',  perfil: PERFIL_A, risco: 'r2', entrega: 'legal-draft',        tipo: 'prompt' },
  { nome: 'conector-mcp',         lifecycle: 'active',      perfil: PERFIL_A, risco: 'r2', entrega: 'external-mutation',  tipo: 'mcp',    env: ['DEMO_TOKEN'] },
  { nome: 'gerador-imagem',       lifecycle: 'active',      perfil: PERFIL_A, risco: 'r1', entrega: 'external-mutation',  tipo: 'prompt', env: [] },
  { nome: 'gerador-imagem-env',   lifecycle: 'active',      perfil: PERFIL_A, risco: 'r1', entrega: 'external-mutation',  tipo: 'prompt', env: ['DEMO_API_KEY'] },
  { nome: 'legalsquad-skill-creator', lifecycle: 'active',  perfil: PERFIL_A, risco: 'r2', entrega: 'system-artifact',    tipo: 'prompt', scripts: true },
];

const skillMd = (s) => `---
name: ${s.nome}
description: >-
  Use ao lidar com ${s.nome} na área fictícia demo — cenário sintético que exercita o motor
  sem depender de matéria jurídica real. Gatilhos: ${s.nome}, demo ${s.nome.split('-').pop()}.
  Não use para decisão final, entrega de produção ou qualquer caso real.
metadata:
  type: "${s.tipo}"
  version: "${s.versao ?? '1.0.0'}"
  categories: [demo, sintetico]
  lifecycle: "${s.lifecycle}"
  schema_version: "5"
  quality_profile: "${s.perfil}"
  contract_version: "5.0.0"
  quality_status: "contracted"
  eval_case_ids: ["demo-v5-${s.nome}"]
  risk_level: "${s.risco}"
  delivery_type: "${s.entrega}"
  freshness_policy: "official-current-source-required"
  positive_triggers: ["${s.nome}", "demo ${s.nome.split('-').pop()}"]
  negative_triggers: ["entrega_producao", "peca_protocolavel", "parecer_final"]
  guard_triggers: ["objetivo ou fase indefinidos", "documento determinante ausente", "regra não verificada"]
  env: ${JSON.stringify(s.env ?? [])}
  engines: ${JSON.stringify(s.engines ?? [])}
---

# ${s.nome} (fixture sintética)

<!-- LEGALSQUAD:HP-CONTRACT:START -->

## Quando usar

Cenário sintético da área demo. Este arquivo existe para exercitar o motor —
catálogo, busca, política de runtime e resolvedor — sem conteúdo jurídico real.

## Entradas mínimas

- objetivo declarado
- fase do fluxo demo
- documento de referência

## Limites

Não produz entrega de produção. Não substitui revisão humana.

<!-- LEGALSQUAD:HP-CONTRACT:END -->
`;

// short_description precisa ter 25..64 caracteres — validado em skill-quality.test.js:60
const agenteYaml = (s) => {
  const curta = `Fixture demo: ${s.nome}`.slice(0, 64);
  if (curta.length < 25) throw new Error(`short_description curta demais para ${s.nome}: ${curta.length}`);
  return `default_prompt: "Execute o fluxo sintético da fixture demo $${s.nome}"
short_description: "${curta}"
allow_implicit_invocation: false
`;
};

for (const s of SKILLS) {
  const dir = join(RAIZ, 'skills', s.nome);
  await mkdir(join(dir, 'references'), { recursive: true });
  await mkdir(join(dir, 'agents'), { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), skillMd(s));
  await writeFile(join(dir, 'agents', 'openai.yaml'), agenteYaml(s));
  await writeFile(
    join(dir, 'references', 'high-performance-contract.md'),
    `# Contrato de alta performance — ${s.nome}\n\nFixture sintética. Sem matéria jurídica.\n`
  );
  if (s.scripts) {
    await mkdir(join(dir, 'scripts'), { recursive: true });
    await writeFile(join(dir, 'scripts', 'criar-skill.mjs'), `export const demo = () => 'fixture';\n`);
  }
}
console.log(`${SKILLS.length} skills geradas em ${RAIZ}/skills`);
```

- [ ] **Passo 3: Gerar e conferir**

```bash
node tests/fixtures/gerar-area-demo.mjs
ls tests/fixtures/area-demo/skills/
```

Esperado: `11 skills geradas…` e as 11 pastas listadas.

- [ ] **Passo 4: Validar contra o próprio motor**

```bash
node -e "
import('./src/skill-catalog.js').then(async (m) => {
  const r = await m.validateSkillCatalog({ skillsDir: 'tests/fixtures/area-demo/skills' });
  console.log(JSON.stringify(r.issues ?? r, null, 2).slice(0, 2000));
});
"
```

Esperado: **nenhum** `folder-name-mismatch`, `broken-reference` nem `invalid-graph`. Se a assinatura
de `validateSkillCatalog` diferir, ajuste a chamada ao que `src/skill-catalog.js` exporta — o ponto é
rodar o validador real contra a fixture antes de seguir.

- [ ] **Passo 5: Commit**

```bash
git add tests/fixtures/
git commit -m "test: gerar a fixture sintética de skills (área demo)

Onze skills fictícias cobrindo os cinco lifecycle, dois quality_profile, env
vazio e preenchido, tipo mcp e uma com scripts/. Área 'demo' — sem direito real,
para não reintroduzir conteúdo de matéria no motor pela porta dos fundos.

Geradas por script em vez de escritas à mão: mantém as onze coerentes entre si e
torna barato estender o conjunto quando um teste novo exigir um caso."
```

---

## Task 6: Completar a fixture — evals, acervo, autoridade, squad

**Arquivos:**
- Criar: `tests/fixtures/area-demo/{skills/_evals,acervo,squads,core}/**`,
  `templates/squads/demo-squad/squad.yaml`, `templates/acervo/_index.yaml`,
  `templates/acervo/teses-modelos/.gitkeep`
- Modificar: `tests/fixtures/gerar-area-demo.mjs`

**Interfaces:**
- Consome: as 11 skills da Task 5
- Produz: fixture completa consumível por `skill-evals`, `acervo-search`, `acervo-confianca`,
  `legal-authorities`, `integridade`, `init`, `installer`

- [ ] **Passo 1: `_evals` — casos e evidência**

Estenda o gerador para produzir `tests/fixtures/area-demo/skills/_evals/`:

- `catalog-v5.json`: `{schema_version:"1", suite:"demo", evaluation_type:"contract-specification", cases:[…]}`.
  **Um caso por skill**, cada um com `id: "demo-v5-<nome>"` (igual ao `eval_case_ids` da Task 5),
  `skill`, `evaluation_type:"contract"` e `scenarios` contendo **≥1 `kind:"normal"` e ≥1
  `kind:"adversarial"`** — `skill-evals.test.js:12` exige os dois.
- `promotion-evidence.schema.json`: `properties.schema_version.const` **exatamente**
  `"legalsquad.skill-promotion-evidence/v1"` (`skill-promotion-evidence.test.js:268`).
- `demo-canonicas.json` e `README.md`: distribuídos pelo `init`.
- `results/`: **um arquivo por `quality_profile` usado** — como a fixture usa 2 perfis, são 2
  relatórios. `skill-evals.test.js:44` exige que o conjunto de `result.profile` seja **igual** ao
  conjunto de `quality_profile` do catálogo. Cada evidência com `evidenceKind:'forward-run'`,
  `qualifiesForPromotion:false` e `source` casando `^_evals/results/` (relativo, sem `/` inicial).

- [ ] **Passo 2: acervo**

```
tests/fixtures/area-demo/acervo/
├── jurisprudencia/tribunal-demo/DEMO_2024.md    # VERIFIED_OFFICIAL
├── jurisprudencia/tribunal-demo/DEMO_2023.md    # DISCOVERY_ONLY
└── legislacao/norma-suspeita.md                 # QUARANTINED
```

O `_index.yaml` é **gerado** por `indexar-acervo`, nunca escrito à mão. Formato de cada item:
`path`, `tags`, `confianca`; os `VERIFIED_OFFICIAL` exigem também `url_oficial` e `consultado_em`.
O item `QUARANTINED` é o que prova o filtro em `acervo-search.test.js:44`. Shortlist serializada
deve ficar **<8000 bytes** — mantenha os três arquivos curtos.

- [ ] **Passo 3: autoridade com expiração datada**

`tests/fixtures/area-demo/core/authorities/demo-autoridade.json`, validado contra
`_legalsquad/core/authority-record.schema.json`. Dois testes cruzam a validade:
`today:'2026-07-09'` → `ok:true`; `today:'2026-07-10'` → `ok:true` **com warning contendo
"expirada"**. Isso exige exatamente:

```json
{
  "schema_version": "1",
  "topic": "demo-autoridade-sintetica",
  "operational_status": "quarantined",
  "verified_at": "2026-07-09",
  "revalidate_policy": "same_day",
  "human_review": { "reviewed_by": "fixture", "reviewed_at": "2026-07-09" },
  "sources": [{ "status": "discovery_only", "url": "https://exemplo.demo/norma", "consulted_at": "2026-07-09" }],
  "affected_skills": ["demo-calculo-beta"],
  "affected_eval_cases": ["demo-v5-demo-calculo-beta"]
}
```

`affected_skills[]` **precisa existir** como `skills/<id>/SKILL.md` na fixture
(`check-legal-authorities.mjs:61`) — `demo-calculo-beta` existe desde a Task 5. Confira os nomes de
campo contra o schema real antes de escrever; se divergirem, o schema manda.

- [ ] **Passo 4: squad, best-practices e os seeds de `templates/`**

- `tests/fixtures/area-demo/squads/demo-squad/squad.yaml` com `code: demo-squad` — **idêntico ao
  nome da pasta** (`integridade.test.js:84`; o dashboard casa por `code`) — e
  `pipeline/pipeline.yaml`.

> **O `pipeline.yaml` não pode ser um stub.** A revisão da Task 4 constatou que as suítes removidas
> (`execucao-v4`, `execucao-p0`) carregavam, junto com a matéria, três testes de **mecanismo do
> Pipeline Runner** — que o [`CLAUDE.md`](../../../CLAUDE.md) põe explicitamente no motor. Eles
> validavam: `step-id` sequenciais; `checkpoints:` apontando para ids existentes; todo `file:`
> referenciado existindo em disco; todo `agent:` resolvendo; e o grafo `execution: subagent` +
> `parallel_group` + `depends_on` + `on_reject`. Não há nenhum outro teste no repositório cobrindo
> isso (`squad-state.test.js` cobre só a máquina de estados).
>
> Portanto o `pipeline.yaml` da fixture precisa exercitar **todas** essas construções: pelo menos 4
> steps com ids sequenciais, ≥2 checkpoints, um `parallel_group` com dois membros que convergem via
> `depends_on`, um `on_reject`, e ao menos um `file:` e um `agent:` que resolvam de verdade. É o que
> permite à Task 7 recriar a cobertura perdida.
- `tests/fixtures/area-demo/core/best-practices/_catalog.yaml` com **2 entradas** (`id`, `name`,
  `whenToUse`, `file`) e os 2 `.md` correspondentes; todo `file:` precisa resolver
  (`integridade.test.js:30`).
- Seeds de distribuição: `templates/squads/demo-squad/squad.yaml`, `templates/acervo/_index.yaml`,
  `templates/acervo/teses-modelos/.gitkeep` — é o que faz `init` criar `squads/` e o que
  `installer.test.js:230` escreve.

- [ ] **Passo 5: Gerar o `_index.yaml` das skills**

```bash
node scripts/indexar-skills.js --root tests/fixtures/area-demo
```

Se o script não aceitar `--root`, descubra a flag real com `node scripts/indexar-skills.js --help`
ou lendo o arquivo. **Nunca** escreva `_index.yaml` à mão — ele é gerado, e um índice escrito à mão
diverge silenciosamente do catálogo.

Confira que o índice **não** lista `demo-preview-engine` (`init.test.js:345` proíbe skill `preview`
no índice) e que traz `schema_version: 3`.

- [ ] **Passo 6: Rodar tudo e commitar**

```bash
npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'
git add -A
git commit -m "test: completar a fixture com evals, acervo, autoridade e squad

Os relatórios de eval cobrem exatamente os dois quality_profile do catálogo —
skill-evals exige igualdade de conjuntos, não superconjunto. A autoridade usa
verified_at 2026-07-09 com revalidate_policy same_day porque dois testes cruzam
a validade: em 09 passa limpo, em 10 precisa emitir warning de expirada.

O _index.yaml é gerado pelo indexador, nunca escrito à mão."
```

---

## Task 7: Reapontar os testes da Classe C para a fixture

Os motores já aceitam raiz parametrizada — `searchSkillCatalog(query, ROOT, …)`,
`validateSkillCatalog({skillsDir})`, `discoverSkillCatalog(dir)`, `loadSkillRuntimeRecords(root)`,
`checkLegalAuthorities({today})`. O trabalho é trocar a raiz e os ids.

**Arquivos:**
- Modificar: `tests/skill-search.test.js`, `tests/skill-quality.test.js`,
  `tests/skill-evals.test.js`, `tests/skill-promotion-evidence.test.js`,
  `tests/skill-catalog.test.js`, `tests/skill-runtime-policy.test.js`, `tests/skills.test.js`,
  `tests/acervo-search.test.js`, `tests/acervo-confianca.test.js`,
  `tests/legal-authorities.test.js`, `tests/init.test.js`, `tests/update.test.js`,
  `tests/installer.test.js`, `tests/cli.test.js`, `tests/integridade.test.js`

**Interfaces:**
- Consome: `tests/fixtures/area-demo/` completa (Tasks 5–6)
- Produz: suíte verde

- [ ] **Passo 1: Criar o módulo de caminhos da fixture**

`tests/fixtures/caminhos.js` — um lugar só para a raiz, para nenhum teste hardcodar caminho:

```js
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

export const AREA_DEMO = join(AQUI, 'area-demo');
export const SKILLS_DEMO = join(AREA_DEMO, 'skills');
export const ACERVO_DEMO = join(AREA_DEMO, 'acervo');
export const SQUADS_DEMO = join(AREA_DEMO, 'squads');
export const CORE_DEMO = join(AREA_DEMO, 'core');
```

- [ ] **Passo 2: Trocar raiz e ids, uma suíte por vez**

Para **cada** arquivo da lista acima, nesta ordem — `skill-catalog`, `skill-quality`, `skill-search`,
`skill-runtime-policy`, `skill-evals`, `skill-promotion-evidence`, `skills`, `acervo-search`,
`acervo-confianca`, `legal-authorities`, depois os de instalação (`init`, `update`, `installer`,
`cli`, `integridade`):

1. Importe de `tests/fixtures/caminhos.js` e substitua a raiz real pela da fixture.
2. Troque os ids criminais pelos `demo-*`:

| id antigo | id novo |
|---|---|
| `habeas-corpus` | `demo-peca-alpha` |
| `ep-fracao-progressao-engine` | `demo-calculo-beta` |
| `busca-apreensao-escritorio-advocacia` | `demo-peca-alpha` |
| `publicacao-redes` | `demo-publicacao` |
| `audiencia-de-custodia` | `demo-peca-alpha` |
| `image-creator` | `gerador-imagem` |
| `image-ai-generator` | `gerador-imagem-env` |

3. Rode só aquela suíte e só siga para a próxima quando ela estiver verde:

```bash
node --import ./tests/test-setup.js --test tests/<arquivo>.test.js 2>&1 | grep -E '^ℹ (pass|fail)'
```

4. Commit por suíte — `test: reapontar <suíte> para a fixture sintética`. Commits pequenos aqui
   valem porque um reaponte errado é fácil de isolar e reverter.

- [ ] **Passo 2-bis: Recriar a cobertura de mecanismo perdida na Task 4**

A revisão da Task 4 identificou cobertura de **núcleo** que saiu junto com a matéria e **não tem
sucessor** em nenhuma suíte remanescente. Recrie-a sobre a fixture, em
`tests/pipeline-runner.test.js` (novo arquivo — a cobertura é do Pipeline Runner, não de execução
penal, e o nome deve dizer isso):

1. **Schema do pipeline** — sobre `tests/fixtures/area-demo/squads/demo-squad/pipeline/pipeline.yaml`:
   os `step-id` são sequenciais e únicos; todo id em `checkpoints:` existe entre os steps; todo
   `file:` referenciado existe em disco; todo `agent:` resolve.
2. **Grafo de execução** — o `parallel_group` tem membros independentes que convergem num
   `depends_on` comum; `on_reject` aponta para um step existente.
3. **Paridade squad ↔ template** — `tests/fixtures/area-demo/squads/demo-squad/` e
   `templates/squads/demo-squad/` não divergem naquilo que ambos declaram.

**Guarde-se contra o falso-verde.** A revisão da Task 4 observou que vários testes de `integridade`
passam hoje em ~0,1 ms porque iteram sobre diretórios vazios — passam sem verificar nada. Cada teste
acima deve **primeiro** afirmar que a coleção que vai percorrer não está vazia. Um teste que percorre
zero elementos e passa é pior que teste nenhum, porque compra confiança sem entregar cobertura.

- [ ] **Passo 3: Derivar as asserções calibradas em conteúdo criminal**

Estes números vieram do acervo real. **Não os substitua por números da fixture** — isso só troca um
número mágico por outro. Derive-os:

| arquivo | asserção atual | vira |
|---|---|---|
| `skill-quality.test.js:23-32` | `520` skills; soma de `by_certification_wave` | `catalog.entries.length` |
| `skill-quality.test.js:28` | backlog `> 4000` | expressão sobre `catalog.entries.length` |
| `skill-evals.test.js:14` | `caseCount >= 487` | `catalog.entries.length` (1 caso por skill) |
| `skill-evals.test.js:23-26` | `summary.skills === 16` | derivado do catálogo |
| `skill-catalog.test.js:138-139` | 73 fontes; counts `{ADD,MERGE,SPLIT,ABSORB}` | derivado do manifesto lido |
| `skill-quality.test.js:129`, `skill-promotion-evidence.test.js:262` | `evidence.size === 8` | nº de arquivos em `_evals/results/` |
| `install-global.test.js:41` | `agentsInstalled > 10` | `> 0`, ou o nº de agentes da fixture |

- [ ] **Passo 4: Suíte inteira verde**

```bash
npm test 2>&1 | grep -E '^ℹ (tests|pass|fail|skipped|todo)'
```

Esperado: `fail 0`, `skipped 0`, `todo 0`. **Se sobrar qualquer falha, não prossiga** — investigue
antes; um teste remanescente costuma indicar fixture incompleta, não teste errado.

- [ ] **Passo 5: Lint e commit final**

```bash
npm run lint
git add -A
git commit -m "test: derivar as asserções que estavam calibradas no acervo criminal

Os números fixos (520 skills, caseCount 487, 73 fontes, 8 evidências) vinham do
conteúdo criminal. Passam a ser derivados do catálogo carregado — trocar por
números da fixture só substituiria um número mágico por outro, e voltaria a
quebrar assim que a fixture crescesse."
```

---

## Task 8: Provar o aceite e corrigir a documentação

**Arquivos:**
- Modificar: `CLAUDE.md`, `README.md`

**Interfaces:**
- Consome: tudo
- Produz: critérios 1, 2, 3 e 6 da §5 do spec, verificados

- [ ] **Passo 1: Suíte verde, sem skip**

```bash
npm test 2>&1 | grep -E '^ℹ (tests|pass|fail|skipped|todo)'
```

Esperado: `fail 0`, `skipped 0`, `todo 0`.

- [ ] **Passo 2: `build:ide` roda e não toca o `CLAUDE.md`**

```bash
npm run build:ide && git status --short
```

Esperado: saída **vazia**.

- [ ] **Passo 3: Não-regressão da fronteira (teste, não inspeção)**

O critério original — "nenhuma matéria jurídica no motor" — **é impossível hoje** e foi corrigido no
spec: veja [`F0-SANEAMENTO.md §5-bis`](F0-SANEAMENTO.md). O F0 removeu o conteúdo dos diretórios mas
deixou matéria criminal hardcoded em 7 arquivos de `src/` e `scripts/` (o nome do manifesto
`_execucao-penal-v3-integration.yaml` em três lugares, regexes com `ep-*` e nomes de peças criminais,
e o `verify.mjs` exigindo o art. 112 no tarball). Corrigir isso é dívida do F1 — a solução certa é
parametrizar por pacote de área, e esse parâmetro só existe quando o `build-area` existir.

O que este ciclo garante é que a dívida **não cresce**. Crie `tests/fronteira.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Matéria jurídica de ÁREA que não deveria estar no motor. Não inclui o vocabulário
// de citação (REsp, Súmula, CPP) — o Citation Gate é núcleo por definição da
// ARQUITETURA §2, e reconhecer o formato de uma citação é mecanismo.
const MATERIA = 'dosimetria|remicao|remição|habeas.corpus|art\\.? 112|execucao.penal|execução.penal|\\bLEP\\b|\\bep-[a-z-]+|queixa-crime|revisao-criminal|mandado-seguranca';

// Inventário congelado em F0-SANEAMENTO.md §5-bis. Estes arquivos JÁ contêm matéria;
// a dívida está registrada e datada. Nenhum arquivo NOVO pode entrar nesta lista.
const DIVIDA_CONHECIDA = new Set([
  'src/skill-quality.js',
  'src/skill-catalog.js',
  'src/skill-catalog-cli.js',
  'src/skill-contract.js',
  'src/init.js',
  'scripts/verify.mjs',
  'templates/package.json',
]);

test('a matéria jurídica no motor não se espalha para arquivos novos', () => {
  let saida = '';
  try {
    saida = execFileSync(
      'grep',
      ['-rlEi', MATERIA, 'src/', 'bin/', 'scripts/', 'templates/package.json'],
      { encoding: 'utf8' }
    );
  } catch (e) {
    // grep sai 1 quando não há match — significa fronteira totalmente limpa.
    if (e.status !== 1) throw e;
  }

  const encontrados = saida.split('\n').filter(Boolean).map((p) => p.replace(/^\.\//, ''));
  const novos = encontrados.filter((f) => !DIVIDA_CONHECIDA.has(f));

  assert.deepEqual(
    novos,
    [],
    `Matéria jurídica de área apareceu em arquivo(s) fora do inventário da dívida:\n` +
      `  ${novos.join('\n  ')}\n\n` +
      `Ou remova a matéria, ou — se for dívida legítima e consciente — acrescente o arquivo ` +
      `a DIVIDA_CONHECIDA aqui E à tabela da §5-bis de F0-SANEAMENTO.md. Nunca só aqui.`
  );

  // O inventário também não pode encolher sem atualizar a doc: se um arquivo foi
  // limpo, ótimo — mas a §5-bis precisa refletir isso.
  const resolvidos = [...DIVIDA_CONHECIDA].filter((f) => !encontrados.includes(f));
  assert.deepEqual(
    resolvidos,
    [],
    `Estes arquivos foram limpos — remova-os de DIVIDA_CONHECIDA e da §5-bis:\n  ${resolvidos.join('\n  ')}`
  );
});
```

Rode:

```bash
node --import ./tests/test-setup.js --test tests/fronteira.test.js
```

Esperado: **PASS**. Se falhar apontando arquivo novo, algo no saneamento espalhou matéria — muito
provavelmente a restauração dos wrappers da Task 1 (o `command-body.md` lista os 9 squads criminais).
Nesse caso, avalie se o arquivo entra na dívida documentada ou se o texto deve ser generalizado como
se fez com o `catalog-scout` na Task 2.

- [ ] **Passo 4: Repo fonte intocado**

```bash
git -C ~/Documents/Projetos/Devlop/criminalsquad/app status --short > /tmp/cs-final.txt
diff /tmp/cs-antes.txt /tmp/cs-final.txt && echo "READ-ONLY OK"
```

- [ ] **Passo 5: Corrigir as três afirmações erradas da documentação**

No `CLAUDE.md`, seção "Pendências abertas":

1. **Substituir** "Testes dependentes de conteúdo falham … **Não trate como regressão.**" pelo estado
   real: a suíte está verde; ~20 daquelas falhas **eram** regressão do F0 (wrappers de IDE e
   catalog-scout apagados por engano), ~21 eram matéria removida e ~57 eram motor testado com fixture
   criminal, hoje sobre `tests/fixtures/area-demo/`.
2. **Corrigir a fonte extrajudicial:** `~/Devlop/ejsquad/app` **não existe** no disco. Ajustar a
   tabela de repositórios no `CLAUDE.md` e no `README.md` para refletir que só `criminalsquad` e
   `dtsquad` estão presentes.
3. **Registrar o conjunto transversal** como derivável hoje: a interseção de nomes entre
   `criminalsquad` e `dtsquad` dá exatamente 20 entradas (19 skills + `_evals`), confirmando o número
   da `ARQUITETURA §3` sem depender do ejsquad. Anotar que `incidente-falsidade-documental` é a única
   com cara de matéria — **o F1 decide se é transversal de verdade ou por acidente de fork**.

- [ ] **Passo 6: Commit final**

```bash
git add -A
git commit -m "docs: alinhar CLAUDE.md e README ao estado real do F0

A suíte está verde. A afirmação de que as falhas 'não são regressão' estava
errada: vinte delas eram — o F0 apagou wrappers de IDE e o catalog-scout, que
são motor. Corrige também a fonte extrajudicial (ejsquad não existe no disco) e
registra que o conjunto transversal é derivável da interseção criminal ∩
trabalhista, sem depender dele."
```

---

## Aceite do Plano 1

| # | Critério | Como provar |
|---|---|---|
| 1 | `npm test` sem falha e sem skip | Task 8, Passo 1 |
| 2 | `build:ide` roda e não altera o `CLAUDE.md` | Task 8, Passo 2 |
| 3 | A dívida de fronteira não cresce (teste guarda) | Task 8, Passo 3 |
| 4 | `criminalsquad` intocado | Task 8, Passo 4 |
| 5 | Documentação alinhada ao real | Task 8, Passo 5 |

Critérios 4 e 5 da §5 do spec — determinismo de empacotamento e recusa de pacote adulterado —
pertencem ao **Plano 2**.
