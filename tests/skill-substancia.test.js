import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSkillCatalog, renderSkillIndex } from '../src/skill-catalog.js';
import { lerSubstanciaDoIndice, ehTituloOco, LIMITE_TITULO_OCO } from '../src/skill-substancia.js';

// O Arquiteto decide REUSAR ou CRIAR a partir da shortlist. Hoje a shortlist
// diz que a skill existe, é `active` e tem descrição impecável — e não diz que
// o corpo está vazio. Com a regra "nunca crie o que já existe", ele reusa
// casca e nunca cria nada. O catálogo largo vira armadilha.
//
// O sinal precisa ser ABSOLUTO, não razão. Extrair boilerplate para
// best-practice derruba o denominador e infla a razão sem escrever uma
// palavra: a mesma skill oca saltaria de 1,6% para ~14%. Sete linhas próprias
// são poucas tenha o arquivo 437 linhas ou 50.

function corpus(skills) {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-substancia-'));
  const skillsDir = join(raiz, 'skills');
  for (const [id, corpo] of Object.entries(skills)) {
    mkdirSync(join(skillsDir, id), { recursive: true });
    writeFileSync(
      join(skillsDir, id, 'SKILL.md'),
      `---\nname: ${id}\ndescription: skill ${id}\nmetadata:\n  lifecycle: "active"\n---\n\n${corpo}\n`
    );
  }
  return skillsDir;
}

const MOLDE = ['## Regras', 'Não presuma competência.', 'Cite a fonte oficial.', '## Red team', 'Revise antes de liberar.'].join('\n');

test('o índice publica linhas próprias E originalidade de cada skill', () => {
  const skillsDir = corpus({
    'skill-oca': MOLDE,
    'skill-cheia': `${MOLDE}\nO prazo do art. 3o da LC 64/90 e de cinco dias.\nO marco e a publicacao do edital.\nContagem exclui o dia inicial.`,
  });

  const indice = renderSkillIndex(discoverSkillCatalog(skillsDir));

  assert.match(indice, /linhas_proprias:/, 'o número absoluto precisa estar no índice');
  assert.match(indice, /originalidade:/, 'a razão também — as duas medem coisas diferentes');
});

test('skill que é só molde tem ZERO linhas próprias; a que tem conteúdo tem mais', () => {
  const skillsDir = corpus({
    'skill-oca': MOLDE,
    'skill-cheia': `${MOLDE}\nO prazo do art. 3o da LC 64/90 e de cinco dias.\nO marco e a publicacao do edital.\nContagem exclui o dia inicial.`,
  });

  const substancia = lerSubstanciaDoIndice(renderSkillIndex(discoverSkillCatalog(skillsDir)));

  assert.equal(substancia.get('skill-oca').linhasProprias, 0);
  assert.equal(substancia.get('skill-cheia').linhasProprias, 3);
});

test('ehTituloOco decide pelo ABSOLUTO — extrair boilerplate não pode "curar" skill vazia', () => {
  // Mesma skill, dois tamanhos de arquivo: antes e depois de extrair o molde
  // para best-practice. O veredito tem de ser o mesmo nos dois casos.
  const antesDaExtracao = { linhasProprias: 3, originalidade: 3 / 437 };
  const depoisDaExtracao = { linhasProprias: 3, originalidade: 3 / 20 };

  assert.equal(ehTituloOco(antesDaExtracao), true);
  assert.equal(
    ehTituloOco(depoisDaExtracao),
    true,
    'a razão subiu 9x sem uma palavra nova — o veredito não pode mudar por isso'
  );
});

test('ehTituloOco aprova skill com substância de verdade', () => {
  assert.equal(ehTituloOco({ linhasProprias: LIMITE_TITULO_OCO, originalidade: 0.5 }), false);
  assert.equal(ehTituloOco({ linhasProprias: 200, originalidade: 0.9 }), false);
});

test('substância ausente do índice NÃO é tratada como oca — ausência não é medida', () => {
  // Índice antigo, gerado antes desta versão, não traz o campo. Tratar isso
  // como "oco" faria o Arquiteto recriar o catálogo inteiro do nada.
  assert.equal(ehTituloOco(undefined), false);
  assert.equal(ehTituloOco({}), false);
});

test('lerSubstanciaDoIndice devolve mapa vazio para índice ilegível, sem lançar', () => {
  assert.equal(lerSubstanciaDoIndice('').size, 0);
  assert.equal(lerSubstanciaDoIndice(null).size, 0);
  assert.equal(lerSubstanciaDoIndice('lixo: sem skills').size, 0);
});
