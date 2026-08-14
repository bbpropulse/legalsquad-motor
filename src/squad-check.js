// Validador MECÂNICO de squad — converte em código os gates que o Build hoje
// só descreve em prompt.
//
// A auditoria do Arquiteto apontou que o enforcement era majoritariamente
// textual: os gates verificavam MENÇÃO, não existência, e a "Filesystem
// Validation" do build.prompt.md dependia da obediência do modelo ao markdown.
// Este módulo é a contraparte determinística: mesmo conjunto de invariantes,
// verificado por código, com exit code — utilizável como gate real.
//
// Sem dependência de lib YAML, pelo mesmo motivo do resto do motor
// (src/acervo-search.js, tests/pipeline-runner.test.js): parsing por regex
// sobre um formato que nós mesmos geramos.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFrontMatter, getSkillLifecyclePolicy, parseSkillMetadata } from './frontmatter.js';
import { defaultBestPracticesCatalogPath } from './best-practices-catalog.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function squadsDirPadrao() {
  return join(PACKAGE_ROOT, 'squads');
}

/** `skills/` é irmão de `squads/` na raiz do projeto do usuário. */
function skillsDirPadrao(squadsDir) {
  return join(dirname(squadsDir), 'skills');
}

/** Reusa o mesmo cálculo de caminho de `defaultBestPracticesCatalogPath` — um só lugar sabe onde `_legalsquad/core/best-practices/` mora. */
function bestPracticesDirPadrao(squadsDir) {
  return dirname(defaultBestPracticesCatalogPath(dirname(squadsDir)));
}

/**
 * Valores declarados numa chave de topo qualquer — cobre as duas formas que o
 * motor gera: lista de bloco (`chave:\n  - a\n  - b`) e inline (`chave: [a, b]`).
 * Reusada por `skills:` (frontmatter dos agentes inclusive) e por `data:`.
 */
function listaDeChave(texto, chave) {
  const inline = texto.match(new RegExp(`^\\s*${chave}:\\s*\\[([^\\]]*)\\]\\s*$`, 'm'));
  if (inline) {
    return inline[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  const bloco = texto.match(new RegExp(`^${chave}:\\s*\\n((?:\\s+-\\s+.+\\n?)+)`, 'm'));
  if (!bloco) return [];
  return bloco[1]
    .split('\n')
    .map((linha) => linha.match(/^\s*-\s+(.+?)\s*$/)?.[1])
    .filter(Boolean)
    .map((s) => s.replace(/^["']|["']$/g, ''));
}

const skillsDeclaradas = (texto) => listaDeChave(texto, 'skills');

const PREFIXO_INSTALACAO_BP = '_legalsquad/core/best-practices/';
const PREFIXO_AUTORIA_BP = 'core/best-practices/';

/** Entradas de `data:` que apontam pra best-practices — instalação ou autoria. */
function bestPracticesDeclaradas(texto) {
  return listaDeChave(texto, 'data').filter(
    (ref) => ref.startsWith(PREFIXO_INSTALACAO_BP) || ref.startsWith(PREFIXO_AUTORIA_BP)
  );
}

/**
 * `---\nname: ...\n---` — contrato exigido só de best-practice consumida via
 * `format:` (runner.pipeline.md, Agent Loading 4a). Reusa `extractFrontMatter`
 * (mesmo strip de BOM que já protege SKILL.md) em vez de reimplementar o
 * parse pela terceira vez neste motor.
 */
function temFrontmatterComName(texto) {
  const corpo = extractFrontMatter(texto);
  return corpo ? /^name:\s*\S/m.test(corpo) : false;
}

/** Caminho relativo a `bestPracticesDir` que a referência implica — nunca só o basename. */
function caminhoRelativoBP(ref) {
  if (ref.startsWith(PREFIXO_INSTALACAO_BP)) return ref.slice(PREFIXO_INSTALACAO_BP.length);
  if (ref.startsWith(PREFIXO_AUTORIA_BP)) return ref.slice(PREFIXO_AUTORIA_BP.length);
  return ref.split('/').pop();
}

/**
 * Confere as referências a best-practices declaradas em `data:` (squad.yaml)
 * e `format:` (steps do pipeline) — a mesma classe de "declaração que ninguém
 * confere" que `checarSkillsDeclaradas` fecha para skills.
 *
 * Cobre um caso a mais que skills não tem: `data:` pode citar o caminho de
 * AUTORIA (`core/best-practices/`) em vez do de INSTALAÇÃO
 * (`_legalsquad/core/best-practices/`) — resíduo de quando o empacotador
 * ainda materializava no lugar errado. É aviso, não erro: o arquivo pode até
 * existir por acidente, mas a referência não sobrevive a uma reinstalação.
 */
function checarBestPracticesDeclaradas(dir, bestPracticesDir, steps, issues) {
  const squadYamlPath = join(dir, 'squad.yaml');
  const referencias = new Map(); // nome do arquivo -> referência original
  if (existsSync(squadYamlPath)) {
    for (const ref of bestPracticesDeclaradas(readFileSync(squadYamlPath, 'utf8'))) {
      if (ref.startsWith(PREFIXO_AUTORIA_BP) && !ref.startsWith(PREFIXO_INSTALACAO_BP)) {
        issues.push(issue(
          'warn',
          'best-practice-caminho-de-autoria',
          `data: "${ref}" usa o caminho de AUTORIA — instalação materializa em `
            + `"${PREFIXO_INSTALACAO_BP}${ref.slice(PREFIXO_AUTORIA_BP.length)}"`
        ));
      }
      referencias.set(caminhoRelativoBP(ref), ref);
    }
  }

  const formatos = new Map(); // nome do arquivo -> id do step
  for (const step of steps) {
    if (step.format) formatos.set(`${step.format}.md`, step.id);
  }

  if (!referencias.size && !formatos.size) return;

  if (!existsSync(bestPracticesDir)) {
    issues.push(issue(
      'warn',
      'best-practices-nao-instaladas',
      `${referencias.size + formatos.size} referência(s) de best-practice e nenhum diretório em `
        + `${bestPracticesDir} — área não instalada; não dá para verificar existência nem contrato`
    ));
    return;
  }

  for (const [arquivo, ref] of referencias) {
    if (!existsSync(join(bestPracticesDir, arquivo))) {
      issues.push(issue(
        'error',
        'best-practice-declarada-inexistente',
        `data: "${ref}" declarada e ausente de ${bestPracticesDir}`
      ));
    }
  }

  for (const [arquivo, stepId] of formatos) {
    const caminho = join(bestPracticesDir, arquivo);
    if (!existsSync(caminho)) {
      issues.push(issue(
        'error',
        'format-declarado-inexistente',
        `${stepId}: format: aponta pra "${arquivo}", ausente de ${bestPracticesDir}`
      ));
      continue;
    }
    if (!temFrontmatterComName(readFileSync(caminho, 'utf8'))) {
      issues.push(issue(
        'error',
        'format-sem-frontmatter',
        `${stepId}: format: "${arquivo}" existe mas não tem frontmatter YAML com name: — `
          + 'contrato exigido de quem é consumida via format: (runner.pipeline.md, Agent Loading 4a)'
      ));
    }
  }
}

/**
 * Confere que toda skill declarada existe e pode entrar em produção.
 *
 * `skills:` é DECLARAÇÃO — o runner a usa para injetar instrução, e até aqui
 * ninguém verificava que o alvo existe. Skill inexistente faz o step rodar com
 * menos instrução do que o squad promete; skill `quarantined` faz o resolvedor
 * bloquear só na hora em que o advogado está rodando a peça.
 *
 * **Sem `skills/` no disco, degrada com UM aviso.** Área não instalada é estado
 * normal deste motor (ele é content-free); cuspir um erro por skill declarada
 * transformaria "área ausente" em "squad quebrado" — a confusão entre ausência
 * e defeito que o motor não comete em nenhum outro lugar.
 */
/** Arquivos de agente do squad. Ausência do diretório é normal (squad sem agentes próprios). */
function arquivosDeAgente(dir) {
  const agentsDir = join(dir, 'agents');
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir).filter((f) => f.endsWith('.md')).map((f) => join(agentsDir, f));
}

function checarSkillsDeclaradas(dir, skillsDir, issues) {
  const declaradas = new Set();
  const fontes = [join(dir, 'squad.yaml'), ...arquivosDeAgente(dir)];
  for (const arquivo of fontes) {
    if (!existsSync(arquivo)) continue;
    for (const id of skillsDeclaradas(readFileSync(arquivo, 'utf8'))) declaradas.add(id);
  }
  if (declaradas.size === 0) return;

  if (!existsSync(skillsDir)) {
    issues.push(issue(
      'warn',
      'skills-nao-instaladas',
      `${declaradas.size} skill(s) declarada(s) e nenhum diretório skills/ em ${skillsDir} — `
        + 'área não instalada; não dá para verificar existência nem lifecycle'
    ));
    return;
  }

  for (const id of [...declaradas].sort()) {
    const skillPath = join(skillsDir, id, 'SKILL.md');
    if (!existsSync(skillPath)) {
      issues.push(issue('error', 'skill-declarada-inexistente', `skill "${id}" declarada e ausente de ${skillsDir}`));
      continue;
    }
    const metadata = parseSkillMetadata(readFileSync(skillPath, 'utf8'), { fallbackName: id });
    const politica = getSkillLifecyclePolicy(metadata.lifecycle);
    if (!politica.productionEligible) {
      issues.push(issue(
        'error',
        'skill-lifecycle-proibido',
        `skill "${id}" está ${politica.lifecycle} (${politica.selection}) — não entra em squad de produção`
      ));
    } else if (politica.selection === 'explicit') {
      // `pilot` é escolha consciente com fallback, não erro. Tratá-la como erro
      // impediria o uso legítimo; tratá-la como `active` esconderia a escolha.
      issues.push(issue(
        'warn',
        'skill-pilot-sem-opt-in',
        `skill "${id}" é pilot — exige escolha explícita e fallback declarado`
      ));
    }
  }
}

function issue(severity, code, detail) {
  return { severity, code, detail };
}

/** squad-party.csv cita campos com vírgula — split ingênuo desalinha colunas. */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const semAspas = (s) => s.trim().replace(/^["']|["']$/g, '');

/** Ids do squad-party.csv. Ausente → `[]`: quem cobra a ausência do party é a checagem própria dele. */
function idsDeAgente(dir) {
  const partyPath = join(dir, 'squad-party.csv');
  if (!existsSync(partyPath)) return [];
  return readFileSync(partyPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(1)
    .map((linha) => parseCsvLine(linha)[0])
    .filter(Boolean);
}

/**
 * Recorta o corpo de `steps:` até a próxima chave de topo. Sem isso, o bloco do
 * ÚLTIMO step ia até o fim do arquivo e engolia `checkpoints:` e o `output:`
 * do pipeline — o que faria a leitura de artefatos por step atribuir ao último
 * step a lista de entregas do squad inteiro.
 */
function secaoSteps(pipeline) {
  const inicio = pipeline.search(/^steps:[ \t]*$/m);
  if (inicio < 0) return pipeline; // pipeline sem a chave: mantém o comportamento antigo
  const resto = pipeline.slice(inicio);
  const corpo = resto.slice(resto.indexOf('\n') + 1);
  const fim = corpo.search(/^\S/m);
  return fim < 0 ? corpo : corpo.slice(0, fim);
}

/** Aceita as três formas de lista YAML que o formato admite. */
function parseListaDeStep(bloco, chave) {
  const inline = bloco.match(new RegExp(`^ {4}${chave}:[ \\t]+(.+)$`, 'm'));
  if (inline) {
    const valor = inline[1].trim();
    if (valor.startsWith('[')) {
      return valor.replace(/^\[|\]$/g, '').split(',').map(semAspas).filter(Boolean);
    }
    return [semAspas(valor)].filter(Boolean);
  }
  const emBloco = bloco.match(new RegExp(`^ {4}${chave}:[ \\t]*\\n((?: {6}- .*\\n)+)`, 'm'));
  if (!emBloco) return [];
  return [...emBloco[1].matchAll(/^ {6}- (.+)$/gm)].map((m) => semAspas(m[1])).filter(Boolean);
}

/** `output.artifacts` de um step (indentação 4/6/8). */
function parseArtefatosDoStep(bloco) {
  const m = bloco.match(/^ {4}output:[ \t]*\n {6}artifacts:[ \t]*\n((?: {8}- .*\n)+)/m);
  if (!m) return [];
  return [...m[1].matchAll(/^ {8}- (.+)$/gm)].map((linha) => semAspas(linha[1])).filter(Boolean);
}

/** `output.artifacts` do pipeline (indentação 0/2/4) — o que o squad promete entregar. */
function parseArtefatosDoPipeline(pipeline) {
  const m = pipeline.match(/^output:[ \t]*\n {2}artifacts:[ \t]*\n((?: {4}- .*\n)+)/m);
  if (!m) return [];
  return [...m[1].matchAll(/^ {4}- (.+)$/gm)].map((linha) => semAspas(linha[1])).filter(Boolean);
}

function parseSteps(pipeline) {
  const secao = secaoSteps(pipeline);
  const ids = [...secao.matchAll(/^ {2}- id: (\S+)$/gm)].map((m) => m[1]);

  return ids.map((id) => {
    const start = secao.indexOf(`  - id: ${id}\n`);
    const next = secao.indexOf('\n  - id:', start + 1);
    const bloco = secao.slice(start, next < 0 ? undefined : next);

    return {
      id,
      tipo: bloco.match(/^ {4}type: (\S+)\s*$/m)?.[1] || '',
      file: bloco.match(/^ {4}file: (\S+)\s*$/m)?.[1] || null,
      agent: bloco.match(/^ {4}agent: (\S+)\s*$/m)?.[1] || null,
      format: bloco.match(/^ {4}format: (\S+)\s*$/m)?.[1] || null,
      onReject: bloco.match(/^ {4}on_reject: (\S+)\s*$/m)?.[1] || null,
      dependsOn: parseListaDeStep(bloco, 'depends_on'),
      parallelGroup: bloco.match(/^ {4}parallel_group: (\S+)\s*$/m)?.[1] || null,
      artefatos: parseArtefatosDoStep(bloco),
    };
  });
}

/**
 * Devolve um ciclo no grafo de dependências, ou `null`. DFS com cores: cinza =
 * na pilha atual (aresta de retorno = ciclo), preto = subárvore já fechada.
 */
function acharCiclo(steps) {
  const porId = new Map(steps.map((s) => [s.id, s]));
  const cor = new Map();
  const pilha = [];

  function visitar(id) {
    if (cor.get(id) === 'preto') return null;
    if (cor.get(id) === 'cinza') return [...pilha.slice(pilha.indexOf(id)), id];
    cor.set(id, 'cinza');
    pilha.push(id);
    for (const dep of porId.get(id)?.dependsOn || []) {
      if (!porId.has(dep)) continue; // referência inválida já é reportada à parte
      const ciclo = visitar(dep);
      if (ciclo) return ciclo;
    }
    pilha.pop();
    cor.set(id, 'preto');
    return null;
  }

  for (const step of steps) {
    const ciclo = visitar(step.id);
    if (ciclo) return ciclo;
  }
  return null;
}

function parseCheckpoints(pipeline) {
  const bloco = pipeline.match(/^checkpoints:\s*\n((?: {2}- .*\n)*)/m);
  if (!bloco) return [];
  return [...bloco[1].matchAll(/^ {2}- (\S+)\s*$/gm)].map((m) => m[1]);
}

/**
 * Valida um squad. Nunca lança: problemas viram `issues` com severidade.
 * `ok` é falso quando há ao menos um `error` — é o que o CLI usa como exit code.
 */
export function checkSquad(squad, options = {}) {
  const squadsDir = options.squadsDir || squadsDirPadrao();
  const skillsDir = options.skillsDir || skillsDirPadrao(squadsDir);
  const bestPracticesDir = options.bestPracticesDir || bestPracticesDirPadrao(squadsDir);
  const dir = join(squadsDir, squad);
  const issues = [];
  const resultado = () => ({
    squad,
    dir,
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
  });

  if (!existsSync(dir)) {
    issues.push(issue('error', 'squad-nao-encontrado', `${dir} não existe`));
    return resultado();
  }

  // --- squad.yaml: identidade e rubrica ---
  const squadYamlPath = join(dir, 'squad.yaml');
  if (!existsSync(squadYamlPath)) {
    issues.push(issue('error', 'squad-yaml-ausente', 'squad.yaml não existe'));
  } else {
    const y = readFileSync(squadYamlPath, 'utf8');

    const code = y.match(/^code:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
    if (!code) {
      issues.push(issue('error', 'code-ausente', 'squad.yaml sem campo code'));
    } else if (code !== squad) {
      // O dashboard casa squad por `code`; divergência quebra o handoff.
      issues.push(issue('error', 'code-divergente', `code "${code}" != pasta "${squad}"`));
    }

    const goal = y.match(/^goal:\s*["']?([^"'\n]*)["']?\s*$/m)?.[1]?.trim();
    if (!goal) {
      issues.push(issue('error', 'goal-ausente', 'goal vazio ou ausente — o runner não tem meta a verificar'));
    }

    // --- chefe: a VOZ do run ---
    // Todo squad tem chefe; `chefe:` só existe para TROCAR o padrão (CHEFE_PADRAO
    // em runner.pipeline.md). Por isso `nome` ausente não é erro: exigi-lo
    // obrigaria todo squad a repetir a mesma linha, que é o oposto de ter um
    // padrão. Quem está no squad-party.csv executa step e ocupa desk no
    // dashboard; o chefe nunca executa — só fala —, então vive aqui.
    const chefe = y.match(/^chefe:\s*\n((?:[ \t]+\S.*\n?)*)/m)?.[1];
    if (chefe) {
      const chefeId = chefe.match(/^\s+id:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
      if (chefeId && idsDeAgente(dir).includes(chefeId)) {
        issues.push(issue(
          'error',
          'chefe-colide-com-agente',
          `chefe usa o id "${chefeId}", que já é de um agente do party — o handoff deixaria de dizer quem falou e quem produziu`
        ));
      }
    }

    const bloco = y.match(/^success_criteria:\s*\n((?: {2}- .*\n)*)/m);
    const criterios = bloco ? [...bloco[1].matchAll(/^ {2}- .+$/gm)].length : 0;
    if (criterios < 3 || criterios > 6) {
      issues.push(issue(
        'error',
        'success-criteria-insuficiente',
        `${criterios} critério(s); esperado 3–6 — é a rubrica do eval e da Verificação da Meta`
      ));
    }
  }

  // --- _evals: o harness nasce com o squad ---
  const scores = join(dir, '_evals', 'scores.md');
  if (!existsSync(scores)) {
    issues.push(issue('error', 'evals-scores-ausente', '_evals/scores.md não existe — sem log não há regressão a detectar'));
  } else if (!/\|\s*Data\s*\|/.test(readFileSync(scores, 'utf8'))) {
    issues.push(issue('error', 'evals-scores-sem-cabecalho', '_evals/scores.md sem o cabeçalho que o eval:resumo parseia'));
  }

  const casosDir = join(dir, '_evals', 'casos');
  const casos = existsSync(casosDir) ? readdirSync(casosDir).filter((f) => f.endsWith('.md')) : [];
  if (casos.length === 0) {
    issues.push(issue('error', 'caso-ouro-ausente', '_evals/casos/ sem nenhum caso — a avaliação não é repetível'));
  }

  // --- squad-party.csv: agentes declarados existem em disco ---
  const partyPath = join(dir, 'squad-party.csv');
  const agentesDoParty = new Set();
  if (!existsSync(partyPath)) {
    issues.push(issue('error', 'party-ausente', 'squad-party.csv não existe'));
  } else {
    const linhas = readFileSync(partyPath, 'utf8').split(/\r?\n/).filter((l) => l.trim());
    for (const linha of linhas.slice(1)) {
      const [id, , , , caminho] = parseCsvLine(linha);
      if (!id) continue;
      agentesDoParty.add(id);
      const arquivo = join(dir, (caminho || '').replace(/^\.\//, ''));
      if (caminho && !existsSync(arquivo)) {
        issues.push(issue('error', 'agent-file-ausente', `agente "${id}": ${caminho} não existe`));
      }
    }
  }

  // --- pipeline.yaml: integridade do grafo ---
  const pipelinePath = join(dir, 'pipeline', 'pipeline.yaml');
  if (!existsSync(pipelinePath)) {
    issues.push(issue('error', 'pipeline-ausente', 'pipeline/pipeline.yaml não existe'));
    return resultado();
  }

  const pipeline = readFileSync(pipelinePath, 'utf8');
  const steps = parseSteps(pipeline);

  if (steps.length === 0) {
    issues.push(issue('error', 'pipeline-sem-steps', 'nenhum step declarado'));
    return resultado();
  }

  const idsVistos = new Set();
  for (const step of steps) {
    if (idsVistos.has(step.id)) {
      issues.push(issue('error', 'step-id-duplicado', step.id));
    }
    idsVistos.add(step.id);

    if (!step.file) {
      issues.push(issue('error', 'step-sem-file', `${step.id} não declara file:`));
    } else if (!existsSync(join(dir, 'pipeline', step.file))) {
      issues.push(issue('error', 'step-file-ausente', `${step.id}: ${step.file} não existe em disco`));
    }

    if (step.agent && agentesDoParty.size && !agentesDoParty.has(step.agent)) {
      issues.push(issue('error', 'agent-fora-do-party', `${step.id} usa "${step.agent}", ausente do squad-party.csv`));
    }

    if (step.onReject && !steps.some((s) => s.id === step.onReject)) {
      issues.push(issue('error', 'on-reject-invalido', `${step.id}: on_reject "${step.onReject}" não é um step`));
    }
  }

  // --- grafo: depends_on aponta para step real, e o grafo é acíclico ---
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      if (!steps.some((s) => s.id === dep)) {
        issues.push(issue('error', 'depends-on-invalido', `${step.id}: depends_on "${dep}" não é um step`));
      }
    }
  }

  const ciclo = acharCiclo(steps);
  if (ciclo) {
    issues.push(issue(
      'error',
      'depends-on-ciclico',
      `ciclo em depends_on: ${ciclo.join(' → ')} — nenhum desses steps chega a executar`
    ));
  }

  // --- parallel_group: os ramos precisam voltar a se encontrar ---
  const grupos = new Map();
  for (const step of steps) {
    if (!step.parallelGroup) continue;
    if (!grupos.has(step.parallelGroup)) grupos.set(step.parallelGroup, []);
    grupos.get(step.parallelGroup).push(step.id);
  }
  for (const [grupo, membros] of grupos) {
    if (membros.length < 2) {
      issues.push(issue(
        'warn',
        'parallel-group-unitario',
        `parallel_group "${grupo}" tem um único membro (${membros[0]}) — nada a paralelizar`
      ));
      continue;
    }
    const convergencia = steps.some(
      (s) => !membros.includes(s.id) && membros.every((m) => s.dependsOn.includes(m))
    );
    if (!convergencia) {
      issues.push(issue(
        'error',
        'parallel-group-sem-convergencia',
        `parallel_group "${grupo}" (${membros.join(', ')}) não converge: nenhum step depende de todos os membros`
      ));
    }
  }

  // --- output.artifacts: quem promete precisa ter quem produza ---
  const produtorDoArtefato = new Map();
  for (const step of steps) {
    for (const artefato of step.artefatos) {
      const anterior = produtorDoArtefato.get(artefato);
      if (anterior) {
        issues.push(issue(
          'error',
          'artefato-duplicado',
          `"${artefato}" é declarado por ${anterior} e por ${step.id} — um sobrescreve o outro`
        ));
        continue;
      }
      produtorDoArtefato.set(artefato, step.id);
    }
  }
  for (const artefato of parseArtefatosDoPipeline(pipeline)) {
    if (!produtorDoArtefato.has(artefato)) {
      issues.push(issue(
        'error',
        'artefato-sem-produtor',
        `output.artifacts promete "${artefato}", mas nenhum step o declara em output.artifacts`
      ));
    }
  }

  const checkpoints = parseCheckpoints(pipeline);
  for (const cp of checkpoints) {
    if (!steps.some((s) => s.id === cp)) {
      issues.push(issue('error', 'checkpoint-invalido', `checkpoint "${cp}" não existe entre os steps`));
    }
  }
  if (checkpoints.length === 0) {
    // Aviso, não erro: um squad puramente analítico pode não ter aprovação
    // humana. Mas um squad que entrega peça sem checkpoint é defeito grave —
    // por isso o alerta existe.
    issues.push(issue('warn', 'sem-checkpoint', 'nenhum checkpoint humano declarado — confirme que é intencional'));
  }

  // --- skills declaradas: promessa que ninguém conferia ---
  checarSkillsDeclaradas(dir, skillsDir, issues);

  // --- best-practices declaradas (data:/format:): mesma promessa, mesma dívida ---
  checarBestPracticesDeclaradas(dir, bestPracticesDir, steps, issues);

  return resultado();
}
