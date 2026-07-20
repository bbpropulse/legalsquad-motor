import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { consolidarCarteira, toCsv, writeCarteira, metricasCarteira, CARTEIRA_COLUNAS } from '../scripts/orchestra/carteira-consolidar.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'carteira-'));
  const casos = join(root, 'acervo', 'casos');
  const caso = (nome, row) => {
    const dir = join(casos, nome);
    mkdirSync(dir, { recursive: true });
    if (row !== undefined) writeFileSync(join(dir, 'carteira-row.json'), typeof row === 'string' ? row : JSON.stringify(row));
  };
  caso('00008325520234013800', {
    processo: '00008325520234013800', polo: 'defesa', reu: 'Fulano',
    tipos_penais: ['art. 157 CP', 'art. 288 CP'], data_fato: '2023-01-15',
    prazo_fatal: '2026-07-20', riscos: ['réu preso'], o_que_falta: ['laudo'], confianca: 'media',
  });
  caso('11122233420248260100', {
    processo: '11122233420248260100', polo: 'defesa', reu: 'Beltrano',
    tipos_penais: ['art. 33 Lei 11.343'], prazo_fatal: '2026-07-05', riscos_n: 0, o_que_falta_n: 2,
  });
  caso('_carteira'); // pasta reservada — deve ser ignorada
  caso('caso-sem-row'); // sem carteira-row.json — ignorado
  caso('caso-quebrado', '{ invalido'); // JSON inválido — pulado, não derruba
  caso('caso-sem-processo', { polo: 'defesa', reu: 'Sicrano' }); // sem processo — pulado
  return { root, casos };
}

test('consolida rows válidas, ignora _reservadas e pula malformadas', () => {
  const { casos } = fixture();
  const { rows, skipped } = consolidarCarteira(casos);
  assert.equal(rows.length, 2);
  assert.equal(skipped.length, 2); // caso-quebrado + caso-sem-processo
  assert.ok(skipped.some((s) => s.dir === 'caso-quebrado'));
  assert.ok(skipped.some((s) => s.dir === 'caso-sem-processo'));
});

test('ordena por prazo fatal ascendente (mais urgente primeiro)', () => {
  const { casos } = fixture();
  const { rows } = consolidarCarteira(casos);
  assert.equal(rows[0].prazo_fatal, '2026-07-05');
  assert.equal(rows[1].prazo_fatal, '2026-07-20');
});

test('deriva contagens a partir de listas quando *_n ausente', () => {
  const { casos } = fixture();
  const { rows } = consolidarCarteira(casos);
  const comLista = rows.find((r) => r.processo === '00008325520234013800');
  assert.equal(comLista.riscos_n, 1);
  assert.equal(comLista.o_que_falta_n, 1);
});

test('CSV tem cabeçalho canônico e escapa vírgulas/aspas', () => {
  const csv = toCsv([{ processo: 'X', tipos_penais: ['a, b'], reu: 'Fu "Aspas"' }]);
  const [header, linha] = csv.split('\n');
  assert.equal(header, CARTEIRA_COLUNAS.join(','));
  assert.ok(linha.includes('"a, b"'));
  assert.ok(linha.includes('"Fu ""Aspas"""'));
});

test('CSV neutraliza injeção de fórmula (=+-@) prefixando com apóstrofo', () => {
  const linha = toCsv([{ reu: '=SUM(A1)', proximo_ato: '+1', fase: '-1', confianca: '@x' }]).split('\n')[1];
  assert.ok(linha.includes("'=SUM(A1)"), linha);
  assert.ok(linha.includes("'+1"));
  assert.ok(linha.includes("'-1"));
  assert.ok(linha.includes("'@x"));
  // célula benigna não é prefixada
  const benigno = toCsv([{ reu: 'Fulano' }]).split('\n')[1];
  assert.ok(!benigno.includes("'Fulano"));
});

test('writeCarteira grava carteira.json e carteira.csv em _carteira', () => {
  const { casos } = fixture();
  const summary = writeCarteira(casos);
  assert.equal(summary.total, 2);
  assert.ok(existsSync(join(casos, '_carteira', 'carteira.json')));
  assert.ok(existsSync(join(casos, '_carteira', 'carteira.csv')));
  const parsed = JSON.parse(readFileSync(join(casos, '_carteira', 'carteira.json'), 'utf8'));
  assert.equal(parsed.length, 2);
});

test('diretório de casos ausente não estoura', () => {
  const { rows, skipped } = consolidarCarteira(join(tmpdir(), 'nao-existe-xyz'));
  assert.equal(rows.length, 0);
  assert.equal(skipped.length, 0);
});

test('metricasCarteira agrega total, risco, pendência, prazo e confiança', () => {
  const { casos } = fixture();
  const m = metricasCarteira(casos);
  assert.equal(m.total, 2);
  assert.equal(m.pulados, 2);
  assert.equal(m.em_risco, 1);        // caso 1 tem riscos_n=1; caso 2 riscos_n=0
  assert.equal(m.com_pendencia, 2);   // ambos têm o_que_falta > 0
  assert.equal(m.com_prazo, 2);
  assert.equal(m.sem_prazo, 0);
  assert.equal(m.por_fase.sem_fase, 2); // nenhum caso da fixture tem fase
  assert.equal(m.por_confianca.media, 1);
  assert.equal(m.por_confianca.sem, 1); // caso 2 não declara confiança
  assert.equal(m.valor_total, 0);
});

function casosCom(rowsByName) {
  const casos = join(mkdtempSync(join(tmpdir(), 'carteira-v-')), 'acervo', 'casos');
  for (const [nome, row] of Object.entries(rowsByName)) {
    const dir = join(casos, nome);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'carteira-row.json'), JSON.stringify(row));
  }
  return casos;
}

test('valor_total soma número e formato BR; ignora lixo; sem soma parcial silenciosa', () => {
  const casos = casosCom({
    a: { processo: 'a', valor: 50000 },
    b: { processo: 'b', valor: '50.000' },            // milhar BR = 50000 (não 50)
    c: { processo: 'c', valor: 'R$ 1.500.000,00' },   // = 1500000
    d: { processo: 'd', valor: 'abc' },                // lixo -> não soma
    e: { processo: 'e' },                              // ausente -> não soma
  });
  const m = metricasCarteira(casos);
  assert.equal(m.total, 5);
  assert.equal(m.valor_total, 50000 + 50000 + 1500000);
});

test('valor "50.000" não vira 50 (parseFloat ingênuo erraria 1000x)', () => {
  assert.equal(metricasCarteira(casosCom({ a: { processo: 'a', valor: '50.000' } })).valor_total, 50000);
});

test('fase e confiança acentuadas contam na categoria certa', () => {
  const m = metricasCarteira(casosCom({
    a: { processo: 'a', fase: 'Execução', confianca: 'Média' },
    b: { processo: 'b', fase: 'instrução', confianca: 'alta' },
  }));
  assert.equal(m.por_fase.execucao, 1);
  assert.equal(m.por_fase.instrucao, 1);
  assert.equal(m.por_fase.sem_fase, 0);
  assert.equal(m.por_confianca.media, 1);
  assert.equal(m.por_confianca.alta, 1);
});
