import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Paridade de COBERTURA dos agentes do motor entre os alvos de IDE.
//
// Não é paridade de bytes: o `.toml` do Codex é adaptado de propósito (ele
// varre `.Codex/agents/*.toml` além de `.claude/agents/*.md`, coisa que a
// versão Markdown não precisa dizer). Exigir texto idêntico apagaria adaptação
// legítima e empurraria alguém a manter as duas cópias iguais na marra.
//
// O que se exige é que o agente EXISTA. Medido antes deste guarda: uma
// instalação Codex recebia só `catalog-scout` — `verificador-citacoes` e
// `avaliador-squad`, os dois juízes do loop de qualidade, não existiam lá. Os
// prompts delegam a eles pelo nome, então a delegação apontava para o vazio, em
// silêncio, na IDE inteira. O hook mecânico de citações está no Codex e
// continua bloqueando; o que faltava era o juiz que classifica cada citação.

const RAIZ = join(import.meta.dirname, '..');
const FONTE = join(RAIZ, 'templates', 'ide-templates', 'claude-code', '.claude', 'agents');

/** Alvos que têm pasta própria de agentes, com a extensão de cada um. */
const ALVOS = [
  { id: 'codex', dir: join(RAIZ, 'templates', 'ide-templates', 'codex', '.Codex', 'agents'), ext: '.toml' },
];

function idsEm(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(ext))
    .map((n) => n.slice(0, -ext.length))
    .sort();
}

test('todo agente do motor existe em TODOS os alvos de IDE que têm pasta de agentes', () => {
  const esperados = idsEm(FONTE, '.md');
  assert.ok(esperados.length >= 3, `esperava os agentes do motor na fonte, achei ${esperados.length}`);

  for (const alvo of ALVOS) {
    const presentes = idsEm(alvo.dir, alvo.ext);
    const faltando = esperados.filter((id) => !presentes.includes(id));

    assert.deepEqual(
      faltando,
      [],
      `${alvo.id} não tem ${faltando.join(', ')} — os prompts delegam a esses agentes pelo NOME, `
      + 'e numa instalação dessa IDE a delegação aponta para o vazio sem nada gritar'
    );
  }
});

test('o agente portado carrega os campos que a IDE exige, não um arquivo vazio', () => {
  // Cobertura sem conteúdo seria pior que ausência: um arquivo existe, o teste
  // acima fica verde, e a IDE carrega um agente que não sabe o que fazer.
  for (const alvo of ALVOS) {
    for (const id of idsEm(alvo.dir, alvo.ext)) {
      const texto = readFileSync(join(alvo.dir, `${id}${alvo.ext}`), 'utf-8');

      assert.match(texto, new RegExp(`name\\s*=\\s*["']${id}["']`), `${alvo.id}/${id}: falta \`name\``);
      assert.match(texto, /description\s*=\s*["']/, `${alvo.id}/${id}: falta \`description\``);
      assert.match(texto, /developer_instructions\s*=\s*"""/, `${alvo.id}/${id}: falta \`developer_instructions\``);
      assert.ok(
        texto.length > 800,
        `${alvo.id}/${id}: ${texto.length} bytes — curto demais para carregar o contrato do agente`
      );
    }
  }
});

test('o agente portado é READ-ONLY onde o original é READ-ONLY', () => {
  // `verificador-citacoes` e `avaliador-squad` são juízes: quem avalia não pode
  // editar o que avalia. Perder essa restrição na tradução transformaria o gate
  // anti-alucinação em mais um escritor.
  for (const alvo of ALVOS) {
    for (const id of ['verificador-citacoes', 'avaliador-squad']) {
      const caminho = join(alvo.dir, `${id}${alvo.ext}`);
      if (!existsSync(caminho)) continue; // o primeiro teste já cobra a ausência
      const texto = readFileSync(caminho, 'utf-8');

      assert.match(
        texto,
        /READ-ONLY|read-only|n[ãa]o edita/i,
        `${alvo.id}/${id}: a restrição read-only sumiu na tradução — quem julga não pode escrever`
      );
    }
  }
});
