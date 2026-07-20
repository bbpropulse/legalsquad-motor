import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateSkillRuntime,
  loadSkillRuntimeRecords,
  resolveSkillRuntime,
} from '../src/skill-runtime-policy.js';
import { AREA_DEMO } from './fixtures/caminhos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function record(id, overrides = {}) {
  return {
    id,
    lifecycle: 'active',
    qualityStatus: 'contracted',
    highPerformanceEligible: false,
    score: 100,
    hardFails: [],
    ...overrides,
  };
}

function reasonCodes(decision) {
  return decision.reasons.map((item) => item.code);
}

test('runtime bloqueia preview, quarantined e legacy mesmo sob supervisão', () => {
  const preview = evaluateSkillRuntime(record('preview', { lifecycle: 'preview' }), {
    supervised: true,
  });
  const quarantined = evaluateSkillRuntime(record('quarantined', {
    lifecycle: 'quarantined',
    qualityStatus: 'quarantined',
  }), { supervised: true });
  const legacy = evaluateSkillRuntime(record('legacy', { qualityStatus: 'legacy' }), {
    supervised: true,
  });

  assert.equal(preview.allowed, false);
  assert.ok(reasonCodes(preview).includes('lifecycle-preview-blocked'));
  assert.equal(quarantined.allowed, false);
  assert.ok(reasonCodes(quarantined).includes('lifecycle-quarantined-blocked'));
  assert.ok(reasonCodes(quarantined).includes('quality-quarantined-blocked'));
  assert.equal(legacy.allowed, false);
  assert.ok(reasonCodes(legacy).includes('quality-legacy-blocked'));
});

test('contracted exige supervisão explícita e não vira high performance', () => {
  const candidate = record('contracted');
  const blocked = evaluateSkillRuntime(candidate);
  const supervised = evaluateSkillRuntime(candidate, { supervised: true });

  assert.equal(blocked.allowed, false);
  assert.ok(reasonCodes(blocked).includes('human-supervision-required'));
  assert.equal(supervised.allowed, true);
  assert.equal(supervised.disposition, 'supervised-contracted');
  assert.equal(supervised.highPerformanceEligible, false);
  assert.equal(supervised.requiresHumanSupervision, true);
});

test('verified/certified só executam quando a evidência gera elegibilidade', () => {
  const unproven = evaluateSkillRuntime(record('claimed-verified', {
    qualityStatus: 'verified',
  }), { supervised: true });
  const eligible = evaluateSkillRuntime(record('evidence-verified', {
    qualityStatus: 'verified',
    highPerformanceEligible: true,
  }));

  assert.equal(unproven.allowed, false);
  assert.ok(reasonCodes(unproven).includes('promotion-evidence-missing'));
  assert.equal(eligible.allowed, true);
  assert.equal(eligible.disposition, 'high-performance');
  assert.equal(eligible.requiresHumanSupervision, false);
});

test('pilot exige opt-in específico, fallback active e gate válido no fallback', () => {
  const pilot = record('pilot', { lifecycle: 'pilot' });
  const activeFallback = record('fallback');
  const records = new Map([
    ['pilot', pilot],
    ['fallback', activeFallback],
  ]);

  const noConsent = evaluateSkillRuntime(pilot, { supervised: true, records });
  assert.ok(reasonCodes(noConsent).includes('pilot-opt-in-required'));
  assert.ok(reasonCodes(noConsent).includes('pilot-active-fallback-required'));

  const approved = evaluateSkillRuntime(pilot, {
    supervised: true,
    records,
    pilotOptIns: new Set(['pilot']),
    pilotFallbacks: new Map([['pilot', 'fallback']]),
  });
  assert.equal(approved.allowed, true);
  assert.equal(approved.fallback, 'fallback');

  records.set('fallback', record('fallback', { lifecycle: 'preview' }));
  const invalidFallback = evaluateSkillRuntime(pilot, {
    supervised: true,
    records,
    pilotOptIns: new Set(['pilot']),
    pilotFallbacks: new Map([['pilot', 'fallback']]),
  });
  assert.equal(invalidFallback.allowed, false);
  assert.ok(reasonCodes(invalidFallback).includes('pilot-fallback-not-active'));
});

test('seleção automática escolhe somente elegível e prioriza certified', () => {
  const records = new Map([
    // Even a corrupt/ad-hoc true flag cannot promote a contracted record.
    ['contracted', record('contracted', { highPerformanceEligible: true })],
    ['verified', record('verified', {
      qualityStatus: 'verified',
      highPerformanceEligible: true,
    })],
    ['certified', record('certified', {
      qualityStatus: 'certified',
      highPerformanceEligible: true,
    })],
  ]);
  const result = resolveSkillRuntime(['contracted', 'verified', 'certified'], {
    mode: 'selection',
    supervised: true,
    records,
  });

  assert.equal(result.success, true);
  assert.equal(result.selected, 'certified');
  assert.equal(result.decisions.find((item) => item.id === 'contracted').allowed, true);
  assert.equal(
    result.decisions.find((item) => item.id === 'contracted').highPerformanceEligible,
    false,
  );
});

test('seleção automática não rebaixa silenciosamente para contracted ou ferramenta nativa', () => {
  const contractedOnly = resolveSkillRuntime(['contracted'], {
    mode: 'selection',
    supervised: true,
    records: new Map([['contracted', record('contracted')]]),
  });
  const nativeOnly = resolveSkillRuntime(['web_search'], {
    mode: 'selection',
    records: new Map(),
  });

  assert.equal(contractedOnly.success, false);
  assert.equal(contractedOnly.selected, null);
  assert.equal(contractedOnly.error.code, 'no-high-performance-candidate');
  assert.equal(nativeOnly.success, false);
  assert.equal(nativeOnly.selected, null);
});

test('seleção explícita preserva contracted supervisionada sem relaxar o gate', () => {
  const records = new Map([['contracted', record('contracted')]]);
  const withoutSupervision = resolveSkillRuntime(['contracted'], {
    mode: 'explicit-selection',
    records,
  });
  const supervised = resolveSkillRuntime(['contracted'], {
    mode: 'explicit-selection',
    supervised: true,
    records,
  });
  const ambiguous = resolveSkillRuntime(['contracted', 'web_search'], {
    mode: 'explicit-selection',
    supervised: true,
    records,
  });

  assert.equal(withoutSupervision.success, false);
  assert.equal(supervised.success, true);
  assert.equal(supervised.selected, 'contracted');
  assert.equal(supervised.decisions[0].disposition, 'supervised-contracted');
  assert.equal(supervised.decisions[0].highPerformanceEligible, false);
  assert.equal(ambiguous.success, false);
  assert.equal(ambiguous.error.code, 'explicit-selection-requires-one');
});

test('catálogo real aplica o mesmo gate sem confiar no campo gerado do índice', () => {
  const { records } = loadSkillRuntimeRecords(AREA_DEMO);
  assert.ok(records.size > 0, 'a fixture precisa carregar registros para o teste valer algo');
  const contracted = resolveSkillRuntime(['demo-peca-alpha'], { records });
  const supervised = resolveSkillRuntime(['demo-peca-alpha'], {
    records,
    supervised: true,
  });
  // demo-preview-engine (preview) e demo-quarentena (quarantined) — a mesma dupla
  // de lifecycles bloqueados do teste original, agora com as skills da fixture
  // cujo lifecycle é literalmente esse (busca-apreensao-escritorio-advocacia, a
  // fonte original desta segunda posição, não era quarantined na fixture; troquei
  // por demo-quarentena para preservar a asserção de lifecycle-quarantined-blocked).
  const blocked = resolveSkillRuntime([
    'demo-preview-engine',
    'demo-quarentena',
  ], { records, supervised: true });

  assert.equal(contracted.success, false);
  assert.ok(reasonCodes(contracted.decisions[0]).includes('human-supervision-required'));
  assert.equal(supervised.success, true);
  assert.equal(supervised.decisions[0].disposition, 'supervised-contracted');
  assert.equal(blocked.success, false);
  assert.ok(reasonCodes(blocked.decisions[0]).includes('lifecycle-preview-blocked'));
  assert.ok(reasonCodes(blocked.decisions[1]).includes('lifecycle-quarantined-blocked'));
});

test('Runner e Skills Engine tornam o resolvedor pré-condição da injeção', async () => {
  const runner = await readFile(join(ROOT, '_criminalsquad/core/runner.pipeline.md'), 'utf8');
  const engine = await readFile(join(ROOT, '_criminalsquad/core/skills.engine.md'), 'utf8');

  for (const content of [runner, engine]) {
    assert.match(content, /criminalsquad resolve-skills/);
    assert.match(content, /high_performance_eligible|highPerformanceEligible/);
    assert.match(content, /supervis/i);
    assert.match(content, /pilot.*opt-in/is);
  }
  assert.match(runner, /manifesto de runtime/);
  assert.match(runner, /nunca faça bypass nem `skip` silencioso/);
  assert.match(engine, /stop before reading its body/);
});

test('CLI propaga o gate pelo exit code e entrega manifesto JSON', () => {
  const bin = join(ROOT, 'bin/criminalsquad.js');
  const blocked = spawnSync(process.execPath, [
    bin,
    'resolve-skills',
    'demo-peca-alpha',
    '--json',
  ], { cwd: AREA_DEMO, encoding: 'utf8' });
  const supervised = spawnSync(process.execPath, [
    bin,
    'resolve-skills',
    'demo-peca-alpha',
    '--supervised',
    '--json',
  ], { cwd: AREA_DEMO, encoding: 'utf8' });
  const explicitlySelected = spawnSync(process.execPath, [
    bin,
    'resolve-skills',
    'demo-peca-alpha',
    '--explicit-selection',
    '--supervised',
    '--json',
  ], { cwd: AREA_DEMO, encoding: 'utf8' });

  assert.equal(blocked.status, 1, blocked.stderr);
  assert.equal(JSON.parse(blocked.stdout).decisions[0].reasons[0].code, 'human-supervision-required');
  assert.equal(supervised.status, 0, supervised.stderr);
  assert.equal(JSON.parse(supervised.stdout).decisions[0].disposition, 'supervised-contracted');
  assert.equal(explicitlySelected.status, 0, explicitlySelected.stderr);
  assert.equal(JSON.parse(explicitlySelected.stdout).selected, 'demo-peca-alpha');
});

test('skills nativas puras resolvem sem skills/ no disco (curto-circuito antes do catálogo)', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const raizSemSkills = await mkdtemp(join(tmpdir(), 'runtime-sem-skills-'));

  try {
    // Um squad que só usa ferramentas nativas (web_search/web_fetch) não pode
    // ser bloqueado pela ausência do catálogo — as nativas têm bypass declarado
    // e não dependem de skills/ para nada.
    const resultado = resolveSkillRuntime(['web_search', 'web_fetch'], {
      rootDir: raizSemSkills,
    });

    assert.equal(resultado.success, true);
    assert.deepEqual(
      resultado.decisions.map((decisao) => decisao.disposition),
      ['native', 'native']
    );

    // O fail-closed continua intacto para o que NÃO é nativo: qualquer id de
    // catálogo na lista volta a exigir skills/ e a ausência segue sendo erro.
    assert.throws(
      () => resolveSkillRuntime(['web_search', 'demo-peca-alpha'], { rootDir: raizSemSkills }),
      /Diretório de skills ausente/
    );
  } finally {
    await rm(raizSemSkills, { recursive: true, force: true });
  }
});

test('lista vazia é rejeitada sem tocar o catálogo (mesmo com skills/ ausente)', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const raizSemSkills = await mkdtemp(join(tmpdir(), 'runtime-vazio-'));

  try {
    // Efeito colateral do curto-circuito nativo: a checagem de lista vazia
    // passou a vir ANTES do load do catálogo. Antes lançava "Diretório de
    // skills ausente"; agora devolve o erro semanticamente correto. Fica preso
    // aqui para a ordem não regredir por acidente.
    const resultado = resolveSkillRuntime([], { rootDir: raizSemSkills });

    assert.equal(resultado.success, false);
    assert.equal(resultado.error.code, 'skill-list-empty');
    assert.deepEqual(resultado.decisions, []);
  } finally {
    await rm(raizSemSkills, { recursive: true, force: true });
  }
});

test('modo selection não promove skill nativa a candidata de alta performance', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const raizSemSkills = await mkdtemp(join(tmpdir(), 'runtime-selecao-'));

  try {
    // Nativa tem bypass do gate de catálogo, mas NÃO é evidence-certified:
    // seleção automática continua exigindo high_performance_eligible.
    const resultado = resolveSkillRuntime(['web_search'], {
      rootDir: raizSemSkills,
      mode: 'selection',
    });

    assert.equal(resultado.success, false);
    assert.equal(resultado.selected, null);
    assert.equal(resultado.error.code, 'no-high-performance-candidate');
  } finally {
    await rm(raizSemSkills, { recursive: true, force: true });
  }
});
