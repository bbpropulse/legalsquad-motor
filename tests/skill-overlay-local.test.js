import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ehUserOwned } from '../src/pack-format.js';
import { aplicarPacote } from '../src/pack-apply.js';
import { discoverSkillCatalog } from '../src/skill-catalog.js';

// O Arquiteto pode ENRIQUECER uma skill que veio do pacote — preencher com
// conteúdo real um título que chegou oco. Isso cria um problema de posse que
// não existia: `skills/` é gerenciada pelo pacote e o `pack-apply` sobrescreve
// sem checar. Sem proteção, o enriquecimento sumiria no próximo `sync`, **em
// silêncio** — o pior modo de falha possível, porque some trabalho e não sobra
// erro.
//
// Solução: `SKILL.local.md` ao lado do `SKILL.md`. O pacote continua dono do
// `SKILL.md` (e pode atualizá-lo à vontade); a camada local é do usuário,
// nenhum pacote a toca, e é ela que o motor carrega.

function skillDePacote(id) {
  return `---\nname: ${id}\ndescription: versão do PACOTE\nmetadata:\n  lifecycle: "active"\n---\n\ncorpo do pacote\n`;
}

function skillLocal(id) {
  return `---\nname: ${id}\ndescription: versão LOCAL enriquecida\nmetadata:\n  lifecycle: "active"\n---\n\ncorpo enriquecido pelo Arquiteto\n`;
}

test('SKILL.local.md é user-owned — nenhum pacote pode escrevê-lo', () => {
  assert.equal(ehUserOwned('skills/prazo-airc/SKILL.local.md'), true);
  assert.equal(ehUserOwned('skills/prazo-airc/SKILL.md'), false, 'o SKILL.md segue gerenciado pelo pacote');
});

test('a proteção vale em qualquer subárvore, não só em skills/', () => {
  // Um pacote hostil declarando outra raiz não pode contornar a regra.
  assert.equal(ehUserOwned('qualquer/caminho/SKILL.local.md'), true);
  assert.equal(ehUserOwned('_legalsquad/core/best-practices/redacao.local.md'), true);
});

test('pacote que tenta escrever um .local.md é RECUSADO por inteiro', () => {
  const destino = mkdtempSync(join(tmpdir(), 'legalsquad-overlay-'));
  const manifesto = { pack_id: 'area.demo', version: '1', payload_kind: 'tree', applies_to: ['skills/'] };

  const veredito = aplicarPacote(destino, manifesto, [
    { path: 'skills/alfa/SKILL.local.md', sha256: 'x', text: 'tentativa de sobrescrever o enriquecimento' },
  ]);

  assert.equal(veredito.ok, false);
  assert.match(veredito.problemas.join(' '), /user-owned|usu[áa]rio/i);
  assert.deepEqual(veredito.escritos, [], 'nada pode ser escrito quando o pacote viola a posse');
});

// --- o motor carrega a camada local, não a do pacote ---

function projetoComSkill({ comLocal }) {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-overlay-cat-'));
  const dir = join(raiz, 'skills', 'prazo-airc');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), skillDePacote('prazo-airc'));
  if (comLocal) writeFileSync(join(dir, 'SKILL.local.md'), skillLocal('prazo-airc'));
  return join(raiz, 'skills');
}

test('sem camada local, o motor carrega a versão do pacote (comportamento de sempre)', () => {
  const catalogo = discoverSkillCatalog(projetoComSkill({ comLocal: false }));
  const skill = catalogo.entries.find((e) => e.id === 'prazo-airc');
  assert.match(skill.raw, /corpo do pacote/);
  assert.equal(skill.local, false);
});

test('com camada local, ela VENCE — é o conteúdo enriquecido que o agente recebe', () => {
  const catalogo = discoverSkillCatalog(projetoComSkill({ comLocal: true }));
  const skill = catalogo.entries.find((e) => e.id === 'prazo-airc');

  assert.match(skill.raw, /corpo enriquecido pelo Arquiteto/);
  assert.doesNotMatch(skill.raw, /corpo do pacote/);
  assert.equal(skill.metadata.description, 'versão LOCAL enriquecida');
});

test('a entrada declara que é local — sem isso ninguém sabe que o conteúdo divergiu do pacote', () => {
  // Procedência importa: o usuário precisa poder distinguir o que o curador
  // publicou do que ele mesmo adaptou.
  const catalogo = discoverSkillCatalog(projetoComSkill({ comLocal: true }));
  assert.equal(catalogo.entries.find((e) => e.id === 'prazo-airc').local, true);
});

test('skill só-local (sem SKILL.md do pacote) também é carregada — o Arquiteto pode criar do zero', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-overlay-nova-'));
  const dir = join(raiz, 'skills', 'skill-nova');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.local.md'), skillLocal('skill-nova'));

  const catalogo = discoverSkillCatalog(join(raiz, 'skills'));
  const skill = catalogo.entries.find((e) => e.id === 'skill-nova');
  assert.ok(skill, 'skill criada localmente precisa entrar no catálogo');
  assert.equal(skill.local, true);
  assert.equal(catalogo.missingSkillFiles.includes('skill-nova'), false, 'ter só a local não é "SKILL.md faltando"');
});
