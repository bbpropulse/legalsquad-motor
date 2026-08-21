import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  lerUsoDeSkill,
  registrarUsoDeSkills,
  skillsDeclaradasDoSquad,
} from '../src/skill-uso.js';
import { detailSkill } from '../src/skill-detail.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// O registro de uso é o elo execução → seleção: cada ciclo FECHADO de
// revisão/gate vira um evento por skill carregada, e o `detail-skill` devolve
// o agregado na hora da decisão. Estes testes prendem o contrato — inclusive
// as duas propriedades inegociáveis: telemetria degrada em silêncio (nunca
// derruba veredito) e ausência de medida ≠ medida zero.

function projetoSintetico({ comSkillsDir = true } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-uso-'));
  const squadDir = join(raiz, 'squads', 'sq-x');
  mkdirSync(join(squadDir, 'agents'), { recursive: true });
  if (comSkillsDir) mkdirSync(join(raiz, 'skills'), { recursive: true });
  writeFileSync(join(squadDir, 'squad.yaml'), 'name: sq-x\nskills:\n  - skill-a\n  - skill-b\n');
  writeFileSync(join(squadDir, 'agents', 'redator.md'), '---\nskills: [skill-c]\n---\ncorpo');
  return { raiz, squadDir };
}

test('skillsDeclaradasDoSquad une squad.yaml (bloco) e agente (inline), ordenado', () => {
  const { squadDir } = projetoSintetico();
  assert.deepEqual(skillsDeclaradasDoSquad(squadDir), ['skill-a', 'skill-b', 'skill-c']);
});

test('registrar grava um evento por skill; ler agrega; detail-skill expõe', () => {
  const { raiz, squadDir } = projetoSintetico();
  registrarUsoDeSkills(squadDir, { squad: 'sq-x', gate: 'revisao', verdict: 'REJECT', data: '2026-08-20' });
  registrarUsoDeSkills(squadDir, { squad: 'sq-x', gate: 'revisao', verdict: 'APPROVE', data: '2026-08-21' });

  const uso = lerUsoDeSkill(raiz, 'skill-a');
  assert.deepEqual(uso, {
    ciclos: 2,
    aprovacoes: 1,
    rejeicoes: 1,
    squads_distintos: 1,
    ultimo_uso: '2026-08-21',
    ultima_rejeicao: '2026-08-20',
  });

  // O digest devolve o agregado — é assim que a Phase D.5 o consome.
  mkdirSync(join(raiz, 'skills', 'skill-a'), { recursive: true });
  writeFileSync(join(raiz, 'skills', 'skill-a', 'SKILL.md'), '---\nname: skill-a\n---\n## Corpo\nx');
  const digest = detailSkill('skill-a', raiz);
  assert.equal(digest.uso.ciclos, 2);
});

test('ausência de medida é null, nunca zero — e linha corrompida é ignorada', () => {
  const { raiz, squadDir } = projetoSintetico();
  assert.equal(lerUsoDeSkill(raiz, 'skill-a'), null);

  registrarUsoDeSkills(squadDir, { squad: 'sq-x', gate: 'revisao', verdict: 'APPROVE', data: '2026-08-21' });
  const caminho = join(raiz, 'skills', '_evals', 'uso', 'skill-a.jsonl');
  writeFileSync(caminho, `${readFileSync(caminho, 'utf8')}{lixo nao-json\n`);
  const uso = lerUsoDeSkill(raiz, 'skill-a');
  assert.equal(uso.ciclos, 1, 'linha ilegível não conta nem derruba a leitura');
});

test('sem skills/ no disco, registrar é no-op silencioso — área ausente é normal', () => {
  const { squadDir } = projetoSintetico({ comSkillsDir: false });
  const r = registrarUsoDeSkills(squadDir, { squad: 'sq-x', gate: 'revisao', verdict: 'APPROVE' });
  assert.deepEqual(r, { gravados: 0 });
});

// ---------------------------------------------------------------------------
// Paridade das cópias — mesmo idioma do review-loop: o script do usuário é
// auto-contido, então o bloco skill-uso é copiado verbatim e guardado aqui.
// ---------------------------------------------------------------------------

const BEGIN = '// >>> skill-uso:begin';
const END = '// <<< skill-uso:end';

function bloco(raw, file) {
  const from = raw.indexOf(BEGIN);
  const to = raw.indexOf(END);
  assert.ok(from >= 0 && to > from, `marcadores skill-uso ausentes em ${file}`);
  return raw.slice(from + BEGIN.length, to).trim();
}

test('o registro de uso é o MESMO em src/, scripts/ e templates/scripts/', () => {
  const files = [
    join(ROOT, 'src', 'skill-uso.js'),
    join(ROOT, 'scripts', 'squad-state.mjs'),
    join(ROOT, 'templates', 'scripts', 'squad-state.mjs'),
  ];
  const [referencia, ...resto] = files.map((f) => bloco(readFileSync(f, 'utf-8'), f));
  assert.ok(referencia.length > 500, 'bloco de referência parece curto demais');
  resto.forEach((b, i) => assert.equal(b, referencia, `bloco divergiu em ${files[i + 1]}`));
});
