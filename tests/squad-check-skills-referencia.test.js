import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSquad } from '../src/squad-check.js';
import { SKILLS_DEMO, SQUADS_DEMO } from './fixtures/caminhos.js';

// O check tratava `skills:` como um Set único — a ORIGEM (squad.yaml × agente)
// era descartada na coleta, e com ela qualquer chance de conferir promessa por
// agente. Estes testes prendem o aviso novo: skill declarada só no squad.yaml,
// que nenhum agente declara e nenhum step menciona, entra na união global sem
// passo que a use. É warn, não error: menção textual é proxy mecânico, e
// injeção global pode ser escolha legítima.

function squadTemporario() {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-skills-ref-'));
  const squadsDir = join(raiz, 'squads');
  cpSync(SQUADS_DEMO, squadsDir, { recursive: true });
  return { squadsDir, dir: join(squadsDir, 'demo-squad') };
}

function warns(resultado) {
  return resultado.issues.filter((i) => i.severity === 'warn').map((i) => i.code);
}

test('skill só no squad.yaml, sem agente e sem step que a mencione, gera warn', () => {
  const { squadsDir } = squadTemporario();
  const resultado = checkSquad('demo-squad', { squadsDir, skillsDir: SKILLS_DEMO });
  assert.ok(warns(resultado).includes('skill-declarada-nao-referenciada'));
  // Warn nunca derruba o squad — o contrato do check é `ok` cair só com error.
  assert.equal(resultado.ok, true);
});

test('a MESMA skill mencionada num step deixa de gerar o warn', () => {
  const { squadsDir, dir } = squadTemporario();
  const resultado0 = checkSquad('demo-squad', { squadsDir, skillsDir: SKILLS_DEMO });
  const alvo = resultado0.issues.find((i) => i.code === 'skill-declarada-nao-referenciada');
  assert.ok(alvo, 'pré-condição: fixture emite o warn');
  const id = alvo.detail.match(/skill "([^"]+)"/)[1];

  // Menciona a skill num step existente do pipeline — vira referenciada.
  const stepsDir = join(dir, 'pipeline');
  const pipeline = readFileSync(join(stepsDir, 'pipeline.yaml'), 'utf8');
  const primeiroFile = pipeline.match(/^ {4}file: (\S+)\s*$/m)?.[1];
  assert.ok(primeiroFile, 'fixture tem step com file:');
  const stepPath = join(stepsDir, primeiroFile);
  writeFileSync(stepPath, `${readFileSync(stepPath, 'utf8')}\n\nCarregue a skill \`${id}\`.\n`);

  const resultado = checkSquad('demo-squad', { squadsDir, skillsDir: SKILLS_DEMO });
  const restantes = resultado.issues
    .filter((i) => i.code === 'skill-declarada-nao-referenciada')
    .map((i) => i.detail);
  assert.equal(restantes.some((d) => d.includes(`"${id}"`)), false,
    `"${id}" mencionada em step não pode mais gerar o warn — restantes: ${restantes}`);
});

test('skill declarada por um AGENTE nunca gera o warn — o runner a injeta dirigida', () => {
  const { squadsDir, dir } = squadTemporario();
  const resultado0 = checkSquad('demo-squad', { squadsDir, skillsDir: SKILLS_DEMO });
  const alvo = resultado0.issues.find((i) => i.code === 'skill-declarada-nao-referenciada');
  assert.ok(alvo, 'pré-condição: fixture emite o warn');
  const id = alvo.detail.match(/skill "([^"]+)"/)[1];

  // Declara a mesma skill no frontmatter de um agente do squad.
  const agentPath = join(dir, 'agents');
  const primeiroAgente = readdirSync(agentPath).find((f) => f.endsWith('.md'));
  assert.ok(primeiroAgente, 'fixture tem agente');
  const caminho = join(agentPath, primeiroAgente);
  const texto = readFileSync(caminho, 'utf8');
  const comSkill = texto.includes('skills:')
    ? texto.replace(/^skills:.*$/m, `skills: [${id}]`)
    : texto.replace(/^---\n/, `---\nskills: [${id}]\n`);
  writeFileSync(caminho, comSkill);

  const resultado = checkSquad('demo-squad', { squadsDir, skillsDir: SKILLS_DEMO });
  const restantes = resultado.issues
    .filter((i) => i.code === 'skill-declarada-nao-referenciada')
    .map((i) => i.detail);
  assert.equal(restantes.some((d) => d.includes(`"${id}"`)), false);
});
