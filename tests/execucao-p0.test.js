import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const TARGET_SKILLS = [
  'cooperacao-transferencia-pessoas-condenadas-tratado',
  'execucao-comutacao-pena-hediondo',
  'execucao-defesa-regressao-regime',
  'execucao-detracao-penal',
  'execucao-excesso-de-execucao',
  'execucao-incidente-cumprimento-pena-estrangeiro-transferencia',
  'execucao-liquidacao-pena-atestado',
  'execucao-livramento-condicional',
  'execucao-monitoracao-eletronica',
  'execucao-pedido-vep-assistencial',
  'execucao-prisao-domiciliar-apenado',
  'execucao-progressao-regime',
  'execucao-trabalho-externo',
  'transferencia-direitos-preso',
];

const walkFiles = (dir) => {
  const abs = join(ROOT, dir);
  return readdirSync(abs).flatMap((name) => {
    const full = join(abs, name);
    const rel = relative(ROOT, full);
    return statSync(full).isDirectory() ? walkFiles(rel) : [rel];
  });
};

// A raiz squads/ é uma instância de desenvolvimento: memória e saídas são
// deliberadamente ignoradas por sigilo/LGPD. O template distribui apenas os
// scaffolds vazios correspondentes, então a paridade deve comparar o conteúdo
// versionável — nunca depender de arquivos privados presentes só na máquina.
const isVersionedSquadFile = (path) => (
  !path.includes('/_memory/') && !path.includes('/output/')
);

test('matriz temporal do art. 112 tem proveniência oficial e bloqueio P0', () => {
  const matrix = read('acervo/legislacao/matriz-temporal-art-112-lep.md');
  assert.match(matrix, /confianca: VERIFIED_OFFICIAL/);
  assert.match(matrix, /consultado_em: "2026-07-09"/);
  assert.match(matrix, /proxima_revalidacao: "no mesmo dia de cada uso"/);
  assert.match(matrix, /status_operacional: bloqueado_p0_ate_revisao_humana/);
  assert.match(matrix, /BLOQUEADO — REGRA TEMPORAL DO ART\. 112 NÃO VERIFICADA/);
  assert.match(matrix, /Lei 15\.358\/2026/);
  assert.match(matrix, /Lei 15\.402\/2026/);

  const urls = [...matrix.matchAll(/https:\/\/[^)\s"]+/g)].map((match) => match[0]);
  assert.ok(urls.length >= 10, 'a matriz deve registrar fontes oficiais suficientes');
  for (const url of urls) {
    assert.match(
      new URL(url).hostname,
      /(^|\.)(planalto\.gov\.br|camara\.leg\.br|stf\.jus\.br|stj\.jus\.br)$/,
      `fonte não oficial na matriz: ${url}`,
    );
  }
});

test('as 14 skills afetadas contêm freshness gate e Lei 15.402/2026', () => {
  assert.equal(TARGET_SKILLS.length, 14);
  for (const skill of TARGET_SKILLS) {
    const content = read(`skills/${skill}/SKILL.md`);
    assert.match(content, /15\.402\/2026/, `${skill} não menciona a lei superveniente`);
    assert.match(content, /matriz-temporal-art-112-lep\.md/, `${skill} não aponta a matriz`);
    assert.match(
      content,
      /BLOQUEADO — REGRA TEMPORAL DO ART\. 112 NÃO VERIFICADA/,
      `${skill} não contém o hard stop`,
    );
  }
});

test('tabelas históricas de progressão não permanecem nas duas skills críticas', () => {
  for (const skill of ['execucao-progressao-regime', 'execucao-comutacao-pena-hediondo']) {
    const content = read(`skills/${skill}/SKILL.md`);
    assert.doesNotMatch(content, /os (?:8|oito) percentuais/i);
    assert.doesNotMatch(content, /\|\s*I\s*\|\s*16%/);
    assert.doesNotMatch(content, /16\/20\/25\/30\/40\/50\/60\/70/);
  }
});

test('pipeline bloqueia art. 112 da pesquisa ao protocolo', () => {
  const required = [
    'pipeline/steps/step-03-pesquisa-juridica.md',
    'pipeline/steps/step-04-requisitos-instituto.md',
    'pipeline/steps/step-05-redacao-pedido.md',
    'pipeline/steps/step-06-aprovar-minuta.md',
    'pipeline/steps/step-07-revisao-juridica.md',
    'pipeline/steps/step-08-aprovar-final.md',
    'pipeline/steps/step-09-protocolo.md',
  ];

  for (const rel of required) {
    const content = read(`squads/execucao-penal/${rel}`);
    assert.match(content, /verificacao-temporal-art-112\.yaml|temporal gate|freshness gate|gate temporal/i);
  }

  const protocol = read('squads/execucao-penal/pipeline/steps/step-09-protocolo.md');
  assert.match(protocol, /é proibido gerar `peticao-execucao-final\.md`/);
  assert.match(protocol, /output\/bloqueio-protocolo\.md/);
});

test('squad instalado e template de execução penal permanecem em paridade', () => {
  const installed = walkFiles('squads/execucao-penal')
    .filter(isVersionedSquadFile)
    .map((path) => path.replace('squads/execucao-penal/', ''))
    .sort();
  const template = walkFiles('templates/squads/execucao-penal')
    .filter(isVersionedSquadFile)
    .map((path) => path.replace('templates/squads/execucao-penal/', ''))
    .sort();

  assert.deepEqual(installed, template);
  for (const rel of installed) {
    assert.equal(
      read(`squads/execucao-penal/${rel}`),
      read(`templates/squads/execucao-penal/${rel}`),
      `divergência no arquivo ${rel}`,
    );
  }
});
