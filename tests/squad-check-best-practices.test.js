import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSquad } from '../src/squad-check.js';
import { CORE_DEMO, SQUADS_DEMO } from './fixtures/caminhos.js';

// A mesma classe de defeito que `checarSkillsDeclaradas` fechou pra skills
// (declaração que ninguém confere) existia intacta pra best-practices: `data:`
// no squad.yaml e `format:` no step são DECLARAÇÃO — e nada verificava que o
// arquivo existe, muito menos que sobrevive ao remapeamento autoria→instalação
// (`_legalsquad/core/best-practices/`, ver pack-build.js) que esta mesma sessão
// introduziu. A fixture original tinha exatamente essa dívida: `data:` apontava
// pro caminho de AUTORIA (`core/best-practices/...`), que não existe mais depois
// de instalado.

const BEST_PRACTICES_DEMO = join(CORE_DEMO, 'best-practices');

function squadTemp() {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-squad-bp-'));
  const squadsDir = join(raiz, 'squads');
  cpSync(SQUADS_DEMO, squadsDir, { recursive: true });
  return squadsDir;
}

function reescreverSquadYaml(squadsDir, transformar) {
  const yamlPath = join(squadsDir, 'demo-squad', 'squad.yaml');
  writeFileSync(yamlPath, transformar(readFileSync(yamlPath, 'utf8')));
}

function reescreverPipeline(squadsDir, transformar) {
  const pipelinePath = join(squadsDir, 'demo-squad', 'pipeline', 'pipeline.yaml');
  writeFileSync(pipelinePath, transformar(readFileSync(pipelinePath, 'utf8')));
}

function codigos(resultado, severidade) {
  return resultado.issues.filter((i) => i.severity === severidade).map((i) => i.code);
}

test('squad da fixture, com best-practices instaladas e `data:`/`format:` corretos, passa limpo', () => {
  const resultado = checkSquad('demo-squad', { squadsDir: SQUADS_DEMO, bestPracticesDir: BEST_PRACTICES_DEMO });

  assert.deepEqual(
    codigos(resultado, 'error').filter((c) => c.startsWith('best-practice') || c.startsWith('format-')),
    [],
    `caminho feliz não pode falhar — ${JSON.stringify(resultado.issues)}`
  );
});

test('sem diretório de best-practices instalado, degrada com UM aviso — não N erros', () => {
  // Default: `_legalsquad/core/best-practices/` sob AREA_DEMO não existe (é
  // fixture de AUTORIA, não de instalação) — mesmo estado normal que skills/
  // já trata como "área não instalada", nunca como "squad quebrado".
  const resultado = checkSquad('demo-squad', { squadsDir: SQUADS_DEMO });

  assert.deepEqual(codigos(resultado, 'error').filter((c) => c.startsWith('best-practice') || c.startsWith('format-')), []);
  assert.deepEqual(
    codigos(resultado, 'warn').filter((c) => c === 'best-practices-nao-instaladas'),
    ['best-practices-nao-instaladas'],
    'exatamente um aviso, não um por referência'
  );
});

test('`data:` no caminho de AUTORIA (não remapeado) é aviso — pega a dívida que esta sessão criou', () => {
  const squadsDir = squadTemp();
  reescreverSquadYaml(squadsDir, (yaml) => yaml.replace(
    '_legalsquad/core/best-practices/fluxo-demo-basico.md',
    'core/best-practices/fluxo-demo-basico.md'
  ));

  const resultado = checkSquad('demo-squad', { squadsDir, bestPracticesDir: BEST_PRACTICES_DEMO });

  assert.ok(codigos(resultado, 'warn').includes('best-practice-caminho-de-autoria'));
  assert.match(JSON.stringify(resultado.issues), /core\/best-practices\/fluxo-demo-basico\.md/);
});

test('`data:` referencia best-practice que não existe no disco é erro, e o caminho aparece', () => {
  const squadsDir = squadTemp();
  reescreverSquadYaml(squadsDir, (yaml) => yaml.replace(
    '_legalsquad/core/best-practices/fluxo-demo-basico.md',
    '_legalsquad/core/best-practices/nao-existe.md'
  ));

  const resultado = checkSquad('demo-squad', { squadsDir, bestPracticesDir: BEST_PRACTICES_DEMO });

  assert.ok(codigos(resultado, 'error').includes('best-practice-declarada-inexistente'));
  assert.match(JSON.stringify(resultado.issues), /nao-existe\.md/);
  assert.equal(resultado.ok, false);
});

test('`format:` de step apontando pra arquivo inexistente é erro', () => {
  const squadsDir = squadTemp();
  reescreverPipeline(squadsDir, (pipeline) => pipeline.replace('format: fluxo-demo-basico', 'format: formato-fantasma'));

  const resultado = checkSquad('demo-squad', { squadsDir, bestPracticesDir: BEST_PRACTICES_DEMO });

  assert.ok(codigos(resultado, 'error').includes('format-declarado-inexistente'));
  assert.match(JSON.stringify(resultado.issues), /formato-fantasma/);
});

test('`data:` com subpasta errada não passa por colisão de basename com arquivo real em outro lugar', () => {
  // Achado do code-review adversarial: a checagem comparava só o BASENAME, não
  // o caminho completo. Um `data:` apontando pra uma subpasta inexistente
  // passava limpo se existisse um arquivo de MESMO NOME solto na raiz de
  // `bestPracticesDir` — mesmo que o caminho literal declarado nunca resolva
  // (o runner faz `Read` do caminho exato, não busca por nome em subpastas).
  const squadsDir = squadTemp();
  reescreverSquadYaml(squadsDir, (yaml) => yaml.replace(
    '_legalsquad/core/best-practices/fluxo-demo-basico.md',
    '_legalsquad/core/best-practices/subdir-errado/fluxo-demo-basico.md'
  ));

  const resultado = checkSquad('demo-squad', { squadsDir, bestPracticesDir: BEST_PRACTICES_DEMO });

  assert.ok(
    codigos(resultado, 'error').includes('best-practice-declarada-inexistente'),
    `caminho com subpasta errada tem de reprovar, mesmo com "fluxo-demo-basico.md" existindo na raiz — recebido: ${JSON.stringify(resultado.issues)}`
  );
});

test('`format:` de step apontando pra arquivo SEM frontmatter é erro — contrato do runner (Agent Loading 4a)', () => {
  const squadsDir = squadTemp();
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-bp-sem-frontmatter-'));
  const bestPracticesDir = join(raiz, 'best-practices');
  mkdirSync(bestPracticesDir, { recursive: true });
  // Best-practice real (sem frontmatter) — a maioria delas é assim; só quem é
  // consumida via `format:` precisa do contrato.
  writeFileSync(join(bestPracticesDir, 'fluxo-demo-basico.md'), '# Fluxo Demo Básico\n\nsem frontmatter\n');
  writeFileSync(join(bestPracticesDir, 'revisao-dupla-demo.md'), '# Revisão Dupla\n\nsem frontmatter\n');

  const resultado = checkSquad('demo-squad', { squadsDir, bestPracticesDir });

  assert.ok(
    codigos(resultado, 'error').includes('format-sem-frontmatter'),
    `esperava format-sem-frontmatter — recebido: ${JSON.stringify(resultado.issues)}`
  );
});

test('`format:` com BOM antes do frontmatter não é falso-positivo de "sem frontmatter"', () => {
  // Mesmo caso que frontmatter.js:extractFrontMatter já resolve pra SKILL.md
  // (Notepad/Word grava BOM por padrão) — a checagem nova reimplementava o
  // parse de frontmatter sem o strip, reintroduzindo o bug num terceiro lugar.
  const squadsDir = squadTemp();
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-bp-bom-'));
  const bestPracticesDir = join(raiz, 'best-practices');
  mkdirSync(bestPracticesDir, { recursive: true });
  const BOM = String.fromCharCode(0xfeff);
  writeFileSync(
    join(bestPracticesDir, 'fluxo-demo-basico.md'),
    `${BOM}---\nname: "Fluxo Demo Básico"\n---\n\n# Fluxo Demo Básico\n\ntexto\n`
  );
  writeFileSync(join(bestPracticesDir, 'revisao-dupla-demo.md'), '# Revisão Dupla\n\ntexto\n');

  const resultado = checkSquad('demo-squad', { squadsDir, bestPracticesDir });

  assert.equal(
    codigos(resultado, 'error').includes('format-sem-frontmatter'),
    false,
    `BOM antes do frontmatter válido não pode virar falso-positivo — recebido: ${JSON.stringify(resultado.issues)}`
  );
});
