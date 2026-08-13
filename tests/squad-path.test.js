import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { grupoDe, injetarRunId, proximaVersao, versaoVigente, resolverCaminho } from '../src/squad-path.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'squad-path.mjs');

const RUN = '2026-03-03-143022';

// ---------------------------------------------------------------------------
// Step 1 — injeção do run_id
// ---------------------------------------------------------------------------

test('injeta o run_id logo depois de output/', () => {
  assert.equal(
    injetarRunId('squads/carousel/output/slides/draft.md', RUN),
    `squads/carousel/output/${RUN}/slides/draft.md`,
  );
});

test('arquivo na raiz do output também recebe o run_id', () => {
  assert.equal(injetarRunId('squads/x/output/brief.yaml', RUN), `squads/x/output/${RUN}/brief.yaml`);
});

test('caminho fora de squads/<nome>/output/ fica inalterado', () => {
  assert.equal(injetarRunId('acervo/_index.yaml', RUN), 'acervo/_index.yaml');
  assert.equal(injetarRunId('squads/x/pipeline/steps/01.md', RUN), 'squads/x/pipeline/steps/01.md');
});

test('caminho que JÁ tem o run_id não recebe um segundo', () => {
  const jaTransformado = `squads/x/output/${RUN}/slides/draft.md`;
  assert.equal(injetarRunId(jaTransformado, RUN), jaTransformado);
});

// ---------------------------------------------------------------------------
// Step 2 — versão (vN)
// ---------------------------------------------------------------------------

test('grupo sem nenhuma versão começa em v1', () => {
  assert.equal(proximaVersao([]), 'v1');
  assert.equal(versaoVigente([]), null);
});

test('próxima versão é a seguinte à maior existente', () => {
  assert.equal(proximaVersao(['v1', 'v2']), 'v3');
  assert.equal(versaoVigente(['v1', 'v2']), 'v2');
});

test('buraco na sequência não reaproveita número — incrementa o MAIOR', () => {
  assert.equal(proximaVersao(['v1', 'v3']), 'v4');
  assert.equal(versaoVigente(['v1', 'v3']), 'v3');
});

test('ordena por NÚMERO, não por texto: v10 vem depois de v9', () => {
  // `sort` lexicográfico devolveria 'v9' como maior e sobrescreveria a v10.
  assert.equal(versaoVigente(['v9', 'v10']), 'v10');
  assert.equal(proximaVersao(['v9', 'v10']), 'v11');
});

test('entradas que não são pasta de versão são ignoradas', () => {
  assert.equal(proximaVersao(['slides', 'v1', 'rascunho.md', 'v2x', 'v']), 'v2');
  assert.equal(versaoVigente(['slides', 'v1', 'v2x', 'v']), 'v1');
});

// ---------------------------------------------------------------------------
// Resolução completa — os três modos
// ---------------------------------------------------------------------------

test('escrita: grava na PRÓXIMA versão do grupo', () => {
  const r = resolverCaminho({
    caminho: 'squads/x/output/slides/draft.md',
    runId: RUN,
    entradas: ['v1'],
    modo: 'escrita',
  });
  assert.equal(r.caminho, `squads/x/output/${RUN}/slides/v2/draft.md`);
  assert.equal(r.versao, 'v2');
});

test('leitura: lê a versão VIGENTE, não a próxima', () => {
  // É o erro que trava o pipeline: o writer gravou em v2, e o validador de
  // input do step seguinte precisa procurar em v2 — nunca em v3.
  const r = resolverCaminho({
    caminho: 'squads/x/output/slides/draft.md',
    runId: RUN,
    entradas: ['v1', 'v2'],
    modo: 'leitura',
  });
  assert.equal(r.caminho, `squads/x/output/${RUN}/slides/v2/draft.md`);
  assert.equal(r.versao, 'v2');
});

test('leitura sem nenhuma versão no grupo cai no caminho sem pasta de versão', () => {
  const r = resolverCaminho({
    caminho: 'squads/x/output/brief.yaml',
    runId: RUN,
    entradas: [],
    modo: 'leitura',
  });
  assert.equal(r.caminho, `squads/x/output/${RUN}/brief.yaml`);
  assert.equal(r.versao, null);
});

test('checkpoint: recebe o run_id mas NÃO é versionado', () => {
  const r = resolverCaminho({
    caminho: 'squads/x/output/foco.md',
    runId: RUN,
    entradas: ['v1'],
    modo: 'checkpoint',
  });
  assert.equal(r.caminho, `squads/x/output/${RUN}/foco.md`);
  assert.equal(r.versao, null);
});

test('caminho fora do output não é versionado em nenhum modo', () => {
  const r = resolverCaminho({ caminho: 'acervo/_index.yaml', runId: RUN, entradas: ['v1'], modo: 'escrita' });
  assert.equal(r.caminho, 'acervo/_index.yaml');
  assert.equal(r.versao, null);
});

test('o grupo é o diretório onde as versões vivem — é o que o CLI vai ler', () => {
  assert.equal(grupoDe('squads/x/output/slides/draft.md', RUN), `squads/x/output/${RUN}/slides`);
  assert.equal(grupoDe('squads/x/output/brief.yaml', RUN), `squads/x/output/${RUN}`);
  assert.equal(grupoDe('acervo/_index.yaml', RUN), null);
});

test('modo inválido falha alto em vez de adivinhar', () => {
  assert.throws(
    () => resolverCaminho({ caminho: 'squads/x/output/a.md', runId: RUN, entradas: [], modo: 'talvez' }),
    /modo/i,
  );
});

test('run_id ausente falha alto — sem run_id o caminho colide entre execuções', () => {
  assert.throws(() => resolverCaminho({ caminho: 'squads/x/output/a.md', runId: '', entradas: [], modo: 'escrita' }), /run/i);
});

// ---------------------------------------------------------------------------
// CLI — é ele que lê o disco (o módulo acima é puro)
// ---------------------------------------------------------------------------

function makeRun() {
  const dir = mkdtempSync(join(tmpdir(), 'squad-path-'));
  mkdirSync(join(dir, 'squads', 'x', 'output'), { recursive: true });
  return dir;
}

function run(cwd, ...args) {
  const stdout = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf-8', cwd });
  return JSON.parse(stdout);
}

test('CLI resolve escrita lendo as versões que existem no disco', () => {
  const dir = makeRun();
  try {
    mkdirSync(join(dir, 'squads', 'x', 'output', RUN, 'slides', 'v1'), { recursive: true });
    const out = run(dir, 'resolve', 'squads/x/output/slides/draft.md', '--run', RUN, '--modo', 'escrita');
    assert.equal(out.caminho, `squads/x/output/${RUN}/slides/v2/draft.md`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI resolve leitura devolvendo a versão vigente', () => {
  const dir = makeRun();
  try {
    mkdirSync(join(dir, 'squads', 'x', 'output', RUN, 'slides', 'v1'), { recursive: true });
    mkdirSync(join(dir, 'squads', 'x', 'output', RUN, 'slides', 'v2'), { recursive: true });
    const out = run(dir, 'resolve', 'squads/x/output/slides/draft.md', '--run', RUN, '--modo', 'leitura');
    assert.equal(out.caminho, `squads/x/output/${RUN}/slides/v2/draft.md`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --print caminho imprime texto puro, para uso direto em bash', () => {
  // Sem isto, o runner precisaria de `jq` (não garantido) ou de um pipe para
  // node só para extrair um campo — atrito que convida a improvisar o caminho.
  const dir = makeRun();
  try {
    mkdirSync(join(dir, 'squads', 'x', 'output', RUN, 'slides', 'v1'), { recursive: true });
    const stdout = execFileSync(
      'node',
      [SCRIPT, 'resolve', 'squads/x/output/slides/draft.md', '--run', RUN, '--modo', 'leitura', '--print', 'caminho'],
      { encoding: 'utf-8', cwd: dir },
    );
    assert.equal(stdout.trim(), `squads/x/output/${RUN}/slides/v1/draft.md`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --print com campo inexistente falha em vez de imprimir vazio', () => {
  const dir = makeRun();
  try {
    let failed = false;
    try {
      execFileSync('node', [SCRIPT, 'resolve', 'squads/x/output/a.md', '--run', RUN, '--print', 'inventado'], {
        encoding: 'utf-8',
        cwd: dir,
        stdio: 'pipe',
      });
    } catch {
      failed = true;
    }
    assert.ok(failed, '--print com campo desconhecido deveria falhar');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI sem --run falha em vez de gravar fora do run', () => {
  const dir = makeRun();
  try {
    let failed = false;
    try {
      execFileSync('node', [SCRIPT, 'resolve', 'squads/x/output/a.md'], { encoding: 'utf-8', cwd: dir, stdio: 'pipe' });
    } catch {
      failed = true;
    }
    assert.ok(failed, 'resolve sem --run deveria falhar');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Paridade das cópias (o script do usuário é auto-contido: não importa de src/)
// ---------------------------------------------------------------------------

const BEGIN = '// >>> squad-path:begin';
const END = '// <<< squad-path:end';

function block(raw, file) {
  const from = raw.indexOf(BEGIN);
  const to = raw.indexOf(END);
  assert.ok(from >= 0 && to > from, `marcadores squad-path ausentes em ${file}`);
  return raw.slice(from + BEGIN.length, to).trim();
}

test('a resolução de caminho é a MESMA em src/, scripts/ e templates/scripts/', () => {
  const files = [
    join(ROOT, 'src', 'squad-path.js'),
    join(ROOT, 'scripts', 'squad-path.mjs'),
    join(ROOT, 'templates', 'scripts', 'squad-path.mjs'),
  ];
  const [reference, ...rest] = files.map((f) => block(readFileSync(f, 'utf-8'), f));
  assert.ok(reference.length > 500, 'bloco de referência parece curto demais');
  rest.forEach((b, i) => assert.equal(b, reference, `bloco divergiu em ${files[i + 1]}`));
});

test('o script distribuído ao usuário não importa nada de src/', () => {
  const raw = readFileSync(join(ROOT, 'templates', 'scripts', 'squad-path.mjs'), 'utf-8');
  assert.ok(!/from\s+['"][^'"]*\/src\//.test(raw), 'templates/scripts/squad-path.mjs importa de src/');
});

// Guarda: o runner é PROMPT — se ele manda rodar um script que não é
// distribuído, a falha só aparece no projeto do cliente, em runtime, no meio de
// um run. Aqui ela aparece na suíte.
test('todo script que o runner manda executar é distribuído em templates/scripts/', () => {
  const runner = readFileSync(join(ROOT, '_legalsquad', 'core', 'runner.pipeline.md'), 'utf-8');
  const citados = new Set([...runner.matchAll(/\bnode\s+scripts\/([\w.-]+\.mjs)/g)].map((m) => m[1]));
  assert.ok(citados.size > 0, 'nenhum script citado no runner — o regex provavelmente parou de casar');
  for (const script of citados) {
    assert.ok(
      existsSync(join(ROOT, 'templates', 'scripts', script)),
      `runner manda rodar scripts/${script}, que não existe em templates/scripts/ (não chegaria ao usuário)`,
    );
  }
});
