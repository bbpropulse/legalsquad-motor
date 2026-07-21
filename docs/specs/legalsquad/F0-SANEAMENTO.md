# F0 — Saneamento da fronteira e formato de pacote

> Fecha as pendências abertas do F0 descritas em [`MIGRACAO.md`](MIGRACAO.md) e no `CLAUDE.md`.
> **Não** inclui o `build-area` — ele é o F1, e passa a encontrar o contrato de pacote pronto.

## Ponto de partida

`npm test` → **304 testes, 206 passam, 98 falham**. O `CLAUDE.md` diz que as falhas são "testes
dependentes de conteúdo" e manda não tratá-las como regressão. **Está parcialmente errado:** ~20 das
98 são regressão de verdade — o F0 apagou artefatos do motor junto com o conteúdo jurídico.

As 98 falhas se dividem em três classes:

| Classe | Falhas | O que é | Destino |
|---|---:|---|---|
| **A — regressão** | ~20 | Artefato de **motor** apagado por engano no F0 | Restaurar |
| **B — matéria** | ~21 | Lógica jurídica de área (dosimetria, execução penal) | Remover — é pacote |
| **C — motor com fixture de conteúdo** | ~57 | Código de **núcleo** testado com as skills criminais como fixture | Manter, reapontar p/ fixture sintética |

O corte entre B e C é a regra do `CLAUDE.md`: **se depende de matéria jurídica, é pacote; se é
mecanismo, é núcleo.** `calculadora-dosimetria` testa dosimetria penal → B. `skill-search` testa o
motor de busca, e só *por acaso* usa skills criminais como amostra → C.

---

## 1. Classe A — restaurar o que é motor

O F0 removeu tudo que casava com `skills/`. Junto foram os **wrappers de IDE do comando**, que são
motor: cada IDE recebe o mesmo corpo (`templates/ide-assets/command-body.md`) sob um frontmatter
próprio. São gerados por `npm run build:ide`, mas o gerador **lê** o destino para preservar o
frontmatter — então, apagados, ele quebra com `ENOENT`.

### 1.1 Artefatos a restaurar

Do `MANIFEST` em [`src/build-ide-templates.js`](../../../src/build-ide-templates.js):

- `templates/ide-templates/claude-code/.claude/skills/legalsquad/SKILL.md`
- `templates/ide-templates/gemini-cli/.gemini/skills/legalsquad/SKILL.md`
- `templates/ide-templates/qwen-code/.qwen/skills/legalsquad/SKILL.md`
- `.claude/skills/legalsquad/SKILL.md` — a cópia do próprio repo
- `templates/ide-templates/codex/.agents/skills/legalsquad/SKILL.md` — fora do MANIFEST, exigido
  por `init.test.js:424`

E o **catalog-scout** — o batedor read-only do catálogo, mecanismo de descoberta:

- `.claude/agents/catalog-scout.md`
- `templates/ide-templates/claude-code/.claude/agents/catalog-scout.md`
- `templates/ide-templates/codex/.Codex/agents/catalog-scout.toml`

Fonte: leitura de `~/Documents/Projetos/Devlop/criminalsquad/app` (read-only), seguida de
`npm run build:ide`. O `command-body.md` local é **idêntico** ao do repo fonte — só o frontmatter
por IDE é próprio de cada arquivo.

> **O corpo do `catalog-scout.md` cita skills criminais e o protocolo de execução penal.** Restaurar
> cru reintroduz matéria dentro de um artefato de motor. Os exemplos são **generalizados** na
> restauração.

### 1.2 Duas correções sem as quais o conserto é ilusório

**`CLAUDE.md` sai do MANIFEST.** `MANIFEST['instructions-body.md']` lista `'CLAUDE.md'` da raiz
([`src/build-ide-templates.js:33`](../../../src/build-ide-templates.js)). Hoje o `build:ide` morre
antes de chegar lá. **No instante em que a Classe A for corrigida, o primeiro `build:ide` sobrescreve
o `CLAUDE.md` do commit `73efa64`** com o corpo genérico de instruções. O `CLAUDE.md` do LegalSquad é
documento do projeto, não artefato gerado; o `instructions-body.md` segue alimentando os 6 destinos
de IDE.

**`scripts/legal-calculators` sai de `CANONICAL_SOURCES`.** `src/init.js:21` manda o `init` copiar um
diretório que o F0 removeu (são calculadoras criminais — Classe B). Junto saem os 3 scripts órfãos do
`package.json`: `calculo:fracao`, `calculo:remicao`, `calculo:prescricao-executoria`.

### 1.3 Efeito esperado

| suíte | antes | depois de A |
|---|---|---|
| `install-global.test.js` | 0/13 | 11/13 |
| `init.test.js` | 37/47 | 42/47 |
| `templates-paridade.test.js` | 10/18 | 11/18 |
| `npm run build:ide` | ENOENT | roda, e não toca o `CLAUDE.md` |

A Classe A vem **primeiro** porque contamina o diagnóstico das outras.

---

## 2. Classe B — remover o que é matéria

Sai do motor (o lugar é `area.criminal`):

- Testes e engines das calculadoras criminais: dosimetria, prescrição, tempestividade, pena-multa,
  `legal-calculators-gold`.
- Execução penal: `execucao-p0.test.js`, `execucao-v4.test.js`.
- Asserções de matéria embutidas em suítes mistas: os 4 espelhos de `scripts/legal-calculators/` e a
  matriz do art. 112 em `templates-paridade.test.js`; o "exatamente 73 skills `ep-*`" em
  `integridade.test.js`.

---

## 3. Classe C — fixture sintética

Os motores **já aceitam raiz parametrizada** — `searchSkillCatalog(query, ROOT, …)`,
`validateSkillCatalog({skillsDir})`, `discoverSkillCatalog(dir)`, `loadSkillRuntimeRecords(root)`,
`checkLegalAuthorities({today})`. O trabalho é criar a árvore e trocar a raiz nos testes.

### 3.1 Forma

`tests/fixtures/area-demo/` — no **formato de destino** (uma área já instalada), não no formato de
repo de origem.

> **Consequência registrada:** o `build-area` (F1) não poderá usar esta fixture como repositório de
> entrada. O F1 terá de resolver o próprio banco de provas — ou construindo uma fixture de origem, ou
> apontando para um repo de conteúdo real. Decisão consciente, tomada aqui.

A área é fictícia (`demo`), **sem matéria jurídica real** — evita que a fixture vire, ela própria,
conteúdo de área dentro do motor.

### 3.2 Árvore

```
tests/fixtures/area-demo/
├── skills/
│   ├── _index.yaml                     # GERADO por indexar-skills — nunca à mão
│   ├── _demo-integration.yaml          # manifesto de canonicalização
│   ├── _evals/
│   │   ├── README.md
│   │   ├── catalog-v5.json             # ≥1 caso normal + ≥1 adversarial por skill
│   │   ├── demo-canonicas.json
│   │   ├── promotion-evidence.schema.json
│   │   └── results/                    # NÃO distribuído pelo init
│   ├── demo-peca-alpha/                # active · contracted · r4 · legal-drafting
│   ├── demo-calculo-beta/              # legal-calculation · engines: [demo-engine]
│   ├── demo-publicacao/                # external-action
│   ├── demo-preview-engine/            # lifecycle: preview
│   ├── demo-piloto/                    # lifecycle: pilot
│   ├── demo-quarentena/                # lifecycle: quarantined
│   ├── demo-deprecada/                 # lifecycle: deprecated
│   ├── conector-mcp/                   # type: mcp · env: [DEMO_TOKEN]
│   ├── gerador-imagem/                 # env: []
│   ├── gerador-imagem-env/             # env: [DEMO_API_KEY]
│   └── legalsquad-skill-creator/    # + scripts/ não-vazio; nome real hardcoded no motor
├── acervo/
│   ├── _index.yaml                     # GERADO por indexar-acervo
│   ├── jurisprudencia/tribunal-demo/DEMO_2024.md   # VERIFIED_OFFICIAL
│   ├── jurisprudencia/tribunal-demo/DEMO_2023.md   # DISCOVERY_ONLY
│   └── legislacao/norma-suspeita.md                # QUARANTINED
├── squads/demo-squad/
│   ├── squad.yaml                      # code: demo-squad (== nome da pasta)
│   └── pipeline/pipeline.yaml
└── core/
    ├── best-practices/_catalog.yaml + 2 .md
    └── authorities/demo-autoridade.json
```

Seeds de distribuição, exigidos por `init`/`update`/`installer`:
`templates/squads/demo-squad/squad.yaml`, `templates/acervo/_index.yaml`,
`templates/acervo/teses-modelos/.gitkeep`.

### 3.3 Cada skill da fixture

Chaves de topo estritamente ⊆ `{name, description, license, allowed-tools, metadata}`
(`skill-quality.test.js:70`). Obrigatórios em `metadata`: `type`, `version`, `categories`,
`lifecycle`, `schema_version: "5"`, `contract_version: "5.0.0"`, `quality_profile` (existente em
`skill-quality-profiles.json`), `quality_status`, `risk_level` (`/^r[1-4]$/`), `delivery_type`,
`freshness_policy`, `eval_case_ids` (≥1), `guard_triggers` (≥3).

`name` **deve** ser igual ao nome da pasta. Corpo com o bloco `HP-CONTRACT:START…END`, ≤500 linhas,
links relativos resolvíveis, sem ciclo em `supersedes`. Irmãos obrigatórios:
`references/high-performance-contract.md` e `agents/openai.yaml` (com `default_prompt` terminando em
`$<id>`, `short_description` de 25–64 chars, e `allow_implicit_invocation: false` salvo se `active` +
`high_performance_eligible`).

### 3.4 Requisitos que não são óbvios pela árvore

- **`_index.yaml` é sempre gerado** por `indexar-skills` apontado à fixture. Não pode listar a skill
  `preview` (`init.test.js:345`).
- **Autoridade com expiração datada:** dois testes cruzam a validade — `today: '2026-07-09'` → `ok`;
  `today: '2026-07-10'` → `ok` **com** warning contendo `"expirada"`. Exige
  `operational_status: quarantined` + `revalidate_policy: same_day` + `verified_at: "2026-07-09"`.
  Todo `affected_skills[]` precisa existir na fixture.
- **Perfis de eval casam exatamente:** o conjunto de `result.profile` nos relatórios deve ser igual ao
  conjunto de `quality_profile` do catálogo (`skill-evals.test.js:44`).
- **Acervo:** ≥1 `QUARANTINED` (prova o filtro) e shortlist serializada <8000 bytes.
- **`squad.yaml`:** `code` idêntico ao nome da pasta — o dashboard casa por `code`.

### 3.5 Asserções calibradas no conteúdo criminal

~10 testes fixam números do acervo real. Viram **constantes derivadas da fixture** — o ponto é que a
fixture não pode virar um segundo número mágico mantido à mão:

| teste | hoje | vira |
|---|---|---|
| `skill-quality.test.js:23-32` | `520` skills | `catalog.entries.length` |
| `skill-quality.test.js:28` | backlog `> 4000` | escala com nº de skills |
| `skill-evals.test.js:14` | `caseCount >= 487` | derivado do catálogo |
| `skill-evals.test.js:23-26` | `summary.skills === 16` | derivado |
| `skill-catalog.test.js:138` | 73 fontes, counts fixos | derivado do manifesto |
| `skill-quality:129`, `promotion-evidence:262` | `evidence.size === 8` | nº de arquivos em `results/` |
| `install-global.test.js:41` | `agentsInstalled > 10` | 2–3 agentes + `catalog-scout` |
| `skill-search` / `skill-runtime-policy` | ids criminais | ids `demo-*` |

---

## 4. Formato de pacote e assinatura

### 4.1 Um container, dois aplicadores

`<pack_id>@<versão>.jsonl.zst` — **uma entidade por linha**, como o
[`SPEC §6`](../acervo-server/SPEC.md) já manda. O que muda é o que é uma "entidade":

| Pacote | Entidade por linha | Aplicador |
|---|---|---|
| `acervo.*` | registro jurídico (norma, julgado, tese) | funde no `_index.yaml` e descarta |
| `area.*`, `transversal` | **um arquivo**: `{path, sha256, bytes, text}` (ou `b64` se binário) | materializa no disco |

Assim a promessa "um pipeline carrega skills e acervo" deixa de ser aspiracional: mesmo container,
mesmo manifesto, mesma assinatura, mesmo cálculo de delta. Só o aplicador difere.

**Medido sobre o conteúdo criminal real** (520 skills, 1671 arquivos, 13,8 MB crus, **0 binários**):

| formato | tamanho | tempo |
|---|---:|---|
| JSONL + zstd −19 | **1,93 MB** | 4,0 s |
| JSONL + zstd −3 | 2,65 MB | 41 ms |
| tar + zstd −19 | 2,10 MB | requer `tar` externo |

O JSONL é **8% menor que o tar** — o tar gasta 512 B de header por arquivo, e com 1671 arquivos
pequenos são ~855 KB de padding. E `node:zlib` traz **zstd nativo** (`zstdCompressSync`, verificado
no v26 local), assim como `node:crypto` traz Ed25519: **zero dependências, sem binário externo**.

> **Formato normativo: [`SPEC §6`](../acervo-server/SPEC.md).** O que segue aqui é o esboço que
> originou a decisão; a especificação completa — entidade-arquivo, namespace de `pack_id`,
> contenção de `applies_to`, `removed_paths`, revogação e a normalização de identificadores da
> fronteira — vive no SPEC. Onde os dois divergirem, vale o SPEC (notadamente `applies_to`, que ali
> é **lista**, não string: um `area.*` materializa em três subárvores).

### 4.2 Manifesto

Mantém o `manifest.json` do §6, com dois campos novos que o pacote de árvore exige:

```jsonc
{
  "pack_id": "area.criminal",
  "format_version": "1.1",
  "version": "2026.07.1",
  "payload_kind": "tree",          // NOVO: "tree" | "records" — escolhe o aplicador
  "applies_to": "skills/",         // NOVO: subárvore de destino
  "created_at": "…", "requires_tier": "…", "product_scope": […],
  "counts": { "files": 1671 },
  "entities": [ { "file": "…", "sha256": "…", "bytes": … } ],
  "content_hash": "sha256:…",
  "signature": "ed25519:…",
  "supersedes": "2026.06.2"
}
```

Sem `payload_kind` o cliente não sabe o que fazer com o que baixou.

### 4.3 Assinatura

Ed25519 do `node:crypto` (nativo), destacada sobre o `content_hash` — sha256 da concatenação
**ordenada** dos hashes por arquivo.

**A chave privada nunca entra no repositório.** Vem de variável de ambiente ou arquivo fora da
árvore; o repo carrega apenas a pública, com `kid`, como o [`SPEC §7.2`](../acervo-server/SPEC.md)
prevê. Um `keygen` gera o par e imprime a pública para embarcar.

Sem assinatura válida, o pacote é **recusado** — nunca gravado.

### 4.4 Determinismo

Mesmo input → mesmo byte de saída. É o que torna o `content_hash` verificável por terceiros e o delta
calculável. Exige:

- ordenação de caminhos por **byte-order** (não `localeCompare`, que é sensível a locale);
- nenhum timestamp no payload — `created_at` vive só no manifesto;
- nível de compressão fixo;
- sem `.DS_Store` nem artefatos de SO.

Coberto por teste: empacotar duas vezes e comparar o hash.

### 4.5 Entregáveis

- `SPEC §6` estendido para cobrir `payload_kind`, `applies_to` e a entidade-arquivo.
- `src/pack.js` — montar, assinar, verificar, aplicar.
- CLI: `pack build` · `pack verify` · `pack inspect` (leitura humana, já que `.jsonl.zst` não abre em
  ferramenta comum — é o custo aceito por escolher este container).
- Testes sobre a fixture da §3.
- **`engines.node` revisto.** Hoje o `package.json` declara `>=20.0.0`, mas o zstd nativo de
  `node:zlib` só existe a partir de uma versão posterior (confirmado no v26 local; **a mínima exata
  precisa ser fixada na implementação**, não chutada aqui). Se a mínima resultar alta demais para a
  base instalada, o fallback é `brotliCompressSync` — também nativo, disponível desde o Node 12, ao
  custo de um pacote um pouco maior.

### 4.6 O que o F1 herda junto com o contrato

O contrato de pacote não é neutro para o `build-area`: ele **cria uma decisão que o F1 tem de tomar
antes da primeira linha de código**, e que a [`SPEC §6.8`](../acervo-server/SPEC.md) documenta por
inteiro. Em resumo, para não descobrir na execução:

1. **Normalizar identificadores é obrigatório para reconhecimento.** As 520 skills do
   `criminalsquad` trazem `<!-- CRIMINALSQUAD:HP-CONTRACT:START -->` e evals `csq-v5-*`; o motor
   checa `LEGALSQUAD:` (`src/skill-contract.js:23-24`) e gera `lsq-v5-`
   (`src/skill-contract.js:402`). Sem tradução, `contract_marker` falha e o auditor dá hard fail
   `contrato v5 ausente` em todas elas.
2. **Mas reescrever o marcador muda os bytes do `SKILL.md`** — e `skill_binding.skill_sha256`
   (`readSkillEvidenceBinding`, `src/skill-quality.js:188-205`) é o sha256 do arquivo inteiro. Sem
   re-bindar, troca-se um hard fail por outro (`skill_binding.skill_sha256 divergente` →
   `evidence_required_satisfied: false`). **Re-bindando, o binding vira tautológico:** quem muta o
   texto e recalcula o hash converte a prova comportamental em carimbo automático — exatamente o
   ataque contra o qual o binding foi desenhado.
3. **E `skills/_evals/results/` é user-owned e não viaja no pacote** (`src/init.js:317-323`). Numa
   instalação limpa não há evidência nenhuma, então toda skill que declare `verified`/`certified`
   hard-falha no destino, com ou sem binding correto.

Não há saída sem custo. As opções e seus preços estão na [`SPEC §6.8`](../acervo-server/SPEC.md); a
recomendação registrada é **preservar os bytes originais e o motor tolerar o marcador legado apenas
para RECONHECER — nunca para promover** (skill importada fica no máximo `contracted`), com a
reemissão de evidência pelo curador como caminho de promoção. O que não pode acontecer é o pacote
sair com 520 skills `verified` cuja prova ninguém pode conferir.

**Fora de escopo:** o `build-area`. É F1, e passa a ter contrato fixo em vez de inventá-lo no
caminho.

---

## 5. Aceite

Ordem de execução: **A → B → C → pacote**.

1. `npm test` com **zero `skip`** e falhas apenas as que a dívida da §5-bis torna inevitáveis.
   Hoje: 206 passam, 98 falham. Depois: 288 passam, **7 falham** (295 no total — o saneamento criou
   `tests/fronteira.test.js` e o pacote de correções do Arquiteto somou `contrato-investigation` e o
   teste do curto-circuito nativo do resolvedor).

   As 7 são consequência direta da dívida congelada, não trabalho por fazer — mas por **duas causas
   distintas**, não uma só. **6 delas** — `init.test.js` (4: `apify`/`blotato`/`canva` não instaladas,
   `legalsquad-skill-creator/scripts`, `_evals/README.md`,
   `habeas-corpus/references/high-performance-contract.md`), `update.test.js` (1:
   `image-ai-generator/SKILL.md`) e `cli.test.js` (1: `skillsCli install` de `image-creator`) — são
   **ENOENT puro**: `installAllSkills` e o `resource-cli.js` (via `skills.js`) tentam copiar skills de
   um `<repo>/skills` que este repo não tem. Parametrizar o nome de manifesto algum resolveria essas 6
   — falta o pacote inteiro, não um arquivo. Só a **7ª** (`update.test.js:225`, teste `update does not
   auto-import preview skills`) é causada por `syncSkillCatalogArtifacts` (`src/init.js`, chamada por
   `init` e por `update`) resolver o manifesto `_execucao-penal-v3-integration.yaml` por nome fixo a
   partir de `PACKAGE_ROOT/skills`: como esse caminho também não existe, a função no-opa
   silenciosamente (`src/init.js:264`, `catch { // Partial/legacy package without the integration
   manifest. }`) em vez de lançar, e devolve ao teste o manifesto obsoleto que ele mesmo escreveu.
   Parametrizar essa raiz resolveria só essa 1ª causa — a maioria das 7 falhas (6 de 7) não tem nada a
   ver com o nome do manifesto e só se resolve quando o `build-area` existir e produzir um
   `<repo>/skills` de verdade. As 7 estão documentadas inline no código, sem `skip` e sem teste
   comentado: elas falham visivelmente, como devem.
2. `npm run build:ide` roda **e não modifica** o `CLAUDE.md` — verificado por `git status` limpo
   depois de rodar.
3. **Não-regressão da fronteira:** o inventário da §5-bis não cresce — nenhum arquivo hoje limpo
   passa a conter matéria jurídica. Guardado por teste, não por inspeção. E nenhuma asserção de teste
   calibrada em conteúdo criminal.
4. Empacotar a fixture duas vezes produz **hashes idênticos**.
5. Um pacote com **um byte adulterado** é recusado na verificação, com erro claro.
6. **Nada foi escrito em `~/Documents/Projetos/Devlop/criminalsquad/app` por este trabalho.**

   O critério **não** é "`git status` limpo" — isso não é mais verificável. Durante a execução deste
   ciclo, uma sessão paralela passou a implementar `sync` e overlay de pacotes *dentro* do
   LegalSquad (12 arquivos modificados, `src/packs-overlay.js` e `tests/packs-overlay.test.js`
   novos). É trabalho deliberado do autor, não interferência deste ciclo.

   O critério passa a ser **diferencial**: registrar `git -C <legalsquad> status --short` antes de
   cada tarefa e comparar depois. Só as mudanças introduzidas pela tarefa contam.

   > **Nota para o F1/Plano 2.** Essa implementação paralela cria um `sync` e um formato de cache de
   > pacotes no LegalSquad, enquanto a §4 deste spec define o formato de pacote para o LegalSquad.
   > São o mesmo conceito em dois repositórios — exatamente a duplicação que a
   > [`MIGRACAO.md`](MIGRACAO.md) chama de "sangria de portar correção à mão entre forks". Antes de
   > executar o Plano 2, vale decidir se o formato do LegalSquad **adota** o que foi construído lá,
   > ou se as duas implementações convergem de outra forma. Construir os dois em paralelo, sem essa
   > decisão, é pagar duas vezes.

## 5-bis. Dívida descoberta: matéria criminal *dentro* do motor

Levantada no pré-voo da execução, **depois** de este spec ser escrito. Não estava prevista porque a
análise olhou os testes e não o `src/`.

O F0 removeu o conteúdo jurídico dos diretórios, mas **a matéria criminal continua hardcoded no
código do motor**. A fronteira núcleo × pacote do `CLAUDE.md` está violada no próprio `src/`:

| Arquivo:linha | O que está hardcoded | Gravidade |
|---|---|---|
| `src/skill-catalog.js:22` | regex `execucao-penal` → rótulo de grupo "Execução penal" | média |
| `src/skill-catalog.js:562` · `src/init.js:268` · `src/skill-catalog-cli.js:18` | o nome `_execucao-penal-v3-integration.yaml`, **em três lugares** | **alta** — o manifesto de canonicalização é por área |
| `src/skill-contract.js:168` | regex com ids `ep-auditoria-calculo-pena`, `ep-remicao-calculator`… | alta |
| `src/skill-quality.js:69,93` | regexes com `calculadora-*`, `ep-*`, `habeas-corpus`, `mandado-seguranca`, `queixa-crime`, `revisão-criminal`… (14 ocorrências) | **alta** — classifica perfil por nome de peça criminal |
| `scripts/verify.mjs:122-123` | **exige** `execucao-penal-art-112.json` e a matriz temporal do art. 112 no tarball para o build passar | **alta** — o gate de release depende de conteúdo criminal |
| `templates/package.json:14` | script `calculo:remicao` | baixa — órfão |
| `templates/ide-assets/command-body.md:12,150` | lista os 9 squads criminais e cita `habeas-corpus`, `triagem-novo-caso`, `execução penal`… | **alta** — fonte (`npm run build:ide`) de 7 cópias em `templates/` (linha abaixo) mais a cópia do próprio repo em `.claude/skills/`, fora do escopo deste teste |
| `templates/ide-assets/instructions-body.md:20` | descreve a biblioteca de skills por matéria: "execução penal, tribunal do júri…" | **alta** — fonte (`npm run build:ide`) das outras 6 cópias em `templates/` (linha abaixo) |
| 13 cópias geradas dos dois arquivos acima, uma por IDE — mesmo corpo, frontmatter próprio: `templates/ide-templates/claude-code/CLAUDE.md`, `templates/ide-templates/claude-code/.claude/skills/legalsquad/SKILL.md`, `templates/ide-templates/cursor/.cursor/rules/legalsquad.mdc`, `templates/ide-templates/qwen-code/QWEN.md`, `templates/ide-templates/qwen-code/.qwen/skills/legalsquad/SKILL.md`, `templates/ide-templates/codex/AGENTS.md`, `templates/ide-templates/gemini-cli/GEMINI.md`, `templates/ide-templates/gemini-cli/.gemini/skills/legalsquad/SKILL.md`, `templates/ide-templates/vscode-copilot/.github/prompts/legalsquad.prompt.md`, `templates/ide-templates/trae/.trae/rules/legalsquad.md`, `templates/ide-templates/antigravity/.agent/rules/legalsquad.md`, `templates/ide-templates/antigravity/.agent/workflows/legalsquad.md`, `templates/ide-templates/opencode/AGENTS.md` | herdam a matéria da linha acima; `npm run build:ide` reintroduz se alguém limpar só a cópia | **alta** — mesma causa raiz, 13 sintomas |
| `_legalsquad/core/architect.agent.yaml`, `_legalsquad/core/runner.pipeline.md`, `_legalsquad/core/seeds/company.md`, `_legalsquad/core/prompts/discovery.prompt.md`, `_legalsquad/core/prompts/design.prompt.md`, `_legalsquad/core/prompts/build.prompt.md`, `_legalsquad/core/prompts/sherlock-shared.md`, `_legalsquad/core/prompts/sherlock-instagram.md`, `_legalsquad/core/prompts/sherlock-youtube.md`, `_legalsquad/core/prompts/sherlock-twitter.md`, `_legalsquad/core/prompts/sherlock-linkedin.md` (11 arquivos) e `.claude/skills/legalsquad/SKILL.md` (1 arquivo) — **12 ao todo** | instruem o Architect e o Sherlock a ler `execucao-penal-alta-performance.md` e a consultar `skills/_execucao-penal-v3-integration.yaml`; `company.md` lista "execução penal" como nicho de exemplo; `SKILL.md` descreve a biblioteca de 520 skills e os 9 squads criminais | **alta** — `_legalsquad/core/` está em `CANONICAL_SOURCES` de `src/init.js`: é o caminho pelo qual matéria criminal chega a **todo usuário novo** via `init` |

**Classificado como mecanismo, não matéria:** a regex de
`templates/ide-templates/*/hooks/verifica-citacoes.mjs:32` (`REsp|HC|Súmula|LEP|CPP|art.`). É o
**Citation Gate**, que a [`ARQUITETURA §2`](ARQUITETURA.md) põe no núcleo — detectar uma citação
exige conhecer o formato dela. Está calibrada para o direito brasileiro, o que é aceitável num
produto brasileiro; não é matéria de *área*. `tests/fronteira.test.js` não inclui `LEP` no padrão de
matéria pelo mesmo motivo — do contrário os dois `verifica-citacoes.mjs` (claude-code e codex, que
citam `LEP` só como token da regex de citação) apareceriam como falso positivo de dívida nova.

**Também propaga matéria:** as duas linhas de `templates/ide-assets/` acima e as 13 cópias por IDE
que `npm run build:ide` gera a partir delas — 15 arquivos ao todo, todos hoje na `DIVIDA_CONHECIDA`
de `tests/fronteira.test.js`, que guarda esse inventário contra crescimento.

**Chega a todo usuário novo via `init`:** os 12 arquivos de `_legalsquad/core/` e
`.claude/skills/legalsquad/SKILL.md` acima também estão na `DIVIDA_CONHECIDA` de
`tests/fronteira.test.js`, que agora varre `_legalsquad/` e `.claude/` além de
`src/ bin/ scripts/ templates/`. Diferem em gravidade dos demais: não são só código do motor, são
**prompt e best-practice do Architect/Sherlock** — o texto que o agente lê para decidir o que fazer
— e `_legalsquad/core/` está em `CANONICAL_SOURCES` de `src/init.js`, copiado por todo `init`
novo. É a rota mais direta de vazamento de matéria para o usuário final.

### Decisão

**Registrado como dívida do F1, não tratado neste ciclo.** Razões:

1. O objetivo deste ciclo é a suíte verde e o contrato de pacote. Des-criminalizar o motor é trabalho
   ortogonal e maior.
2. Mexer nessas regexes com a suíte ainda vermelha remove a rede de segurança justamente onde ela é
   mais necessária.
3. A correção certa não é apagar as regexes — é **parametrizá-las pelo pacote de área**, e esse
   parâmetro só existe quando o `build-area` existir. Fazer antes seria inventar a interface duas
   vezes.

**Consequência para o aceite:** o critério 3 da §5 muda de "nenhuma matéria jurídica no motor"
(impossível hoje) para **não-regressão**: o inventário acima não cresce. Um teste guarda essa
fronteira, falhando se aparecer matéria em arquivo que hoje está limpo.

## 6. Fora de escopo, e por quê

| Item | Por quê |
|---|---|
| **Des-criminalizar o `src/`** | Dívida da §5-bis. A correção é parametrizar por pacote de área, e o parâmetro só existe com o `build-area`. |
| `build-area` | É o F1. Este ciclo entrega o contrato que ele vai cumprir. |
| Extrair o pacote `transversal` | Extrair as 19 skills transversais *é* trabalho do `build-area`; fazer à mão seria uma 2ª cópia manual, contra a regra "a última cópia". |
| Rename `legalsquad` → `legalsquad` | [`ARQUITETURA.md §6`](ARQUITETURA.md) recomenda adiar até a 2ª área ser comercializada. |
| `sync`, licença, entitlement | F3. |

## 7. Correção de documentação

Duas coisas que a doc afirma e não se sustentam:

1. **`ejsquad` não existe no disco.** `CLAUDE.md`, `README.md` e `MIGRACAO.md` listam
   `~/Devlop/ejsquad/app` como fonte do conteúdo extrajudicial; o caminho não existe (nem
   `~/Devlop/ejsquad`). Só `legalsquad` (520 skills) e `dtsquad` (405) estão presentes.
2. **O conjunto transversal é derivável hoje.** A doc diz que as ~20 skills transversais foram
   "isoladas ao criar o EJsquad". Com o ejsquad ausente, a interseção de nomes entre `legalsquad`
   e `dtsquad` dá **exatamente 20 entradas** (19 skills + `_evals`), confirmando o número da
   `ARQUITETURA §3`:

   ```
   apify · blotato · canva · captura-midia-av · carteira-lote · email-juridico
   image-ai-generator · image-creator · image-fetcher · incidente-falsidade-documental
   instagram-publisher · mail-merge-pecas · obsidian-vault · ocr-autos-pdf
   publicacao-redes · relatorio-executivo-escritorio · resend · template-designer · triagem-email
   ```

   18 são mecanismo puro (integrações, mídia, e-mail, OCR, publicação).
   `incidente-falsidade-documental` é a única com cara de matéria — **o F1 deve decidir se ela é
   mesmo transversal ou se está transversal por acidente de fork.**

3. **O `CLAUDE.md` afirma que as falhas de teste "não são regressão".** Vinte delas são. A frase é
   corrigida junto com o saneamento.
