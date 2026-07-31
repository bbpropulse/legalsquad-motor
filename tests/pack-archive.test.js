import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { encodeEntity, selarPacote, verificarPacote } from '../src/pack-format.js';
import { empacotarParaTransporte, desempacotarDeTransporte } from '../src/pack-archive.js';

// Formato de transporte: um pacote inteiro (manifesto + entidades) num Buffer
// só, pra viajar como UM download em `/v1/catalog` (§7.1 — uma url por
// catalog/content). Não existe hoje um jeito de fazer isso: `pack-io.js` só
// lê de disco, um arquivo por entidade. Usado nas duas pontas — o publicador
// (motor→servidor) e o download do sync (servidor→motor).

const CHAVES = generateKeyPairSync('ed25519');

function pacoteReal() {
  const catalogo = encodeEntity([{ path: 'a', v: 1 }]);
  const conteudo = encodeEntity([{ path: 'b', v: 2 }]);
  const entidades = [
    { file: 'catalog.jsonl.zst', role: 'catalog', buffer: catalogo },
    { file: 'skills.jsonl.zst', role: 'content', buffer: conteudo },
  ];
  const manifesto = selarPacote(
    { pack_id: 'area.demo', version: '2026.07.1', payload_kind: 'tree' },
    entidades,
    CHAVES.privateKey
  );
  return { manifesto, entidades };
}

test('empacotar + desempacotar faz ida e volta fiel: mesmo manifesto, mesmas entidades byte a byte', () => {
  const { manifesto, entidades } = pacoteReal();
  const buffer = empacotarParaTransporte(manifesto, entidades);
  const desempacotado = desempacotarDeTransporte(buffer);

  assert.deepEqual(desempacotado.manifesto, manifesto);
  assert.equal(desempacotado.entidades.length, entidades.length);
  for (const original of entidades) {
    const devolvida = desempacotado.entidades.find((e) => e.file === original.file);
    assert.ok(devolvida, `entidade ${original.file} não sobreviveu ao transporte`);
    assert.equal(devolvida.role, original.role);
    assert.ok(Buffer.compare(devolvida.buffer, original.buffer) === 0, `bytes de ${original.file} divergem`);
  }
});

test('o pacote desempacotado ainda passa em verificarPacote — o transporte não corrompe a assinatura', () => {
  const { manifesto, entidades } = pacoteReal();
  const buffer = empacotarParaTransporte(manifesto, entidades);
  const desempacotado = desempacotarDeTransporte(buffer);

  const veredito = verificarPacote(desempacotado.manifesto, desempacotado.entidades, CHAVES.publicKey);
  assert.equal(veredito.ok, true, `esperava veredito ok — recebido: ${JSON.stringify(veredito.problemas)}`);
});

test('buffer curto demais pra ter cabeçalho é recusado, não lança exceção obscura', () => {
  assert.throws(() => desempacotarDeTransporte(Buffer.from('xx')), /curto demais/);
});

test('buffer truncado no meio do cabeçalho declarado é recusado', () => {
  const { manifesto, entidades } = pacoteReal();
  const buffer = empacotarParaTransporte(manifesto, entidades);
  const truncado = buffer.subarray(0, 10);
  assert.throws(() => desempacotarDeTransporte(truncado), /truncado/);
});

test('buffer truncado no meio de uma entidade declarada é recusado', () => {
  const { manifesto, entidades } = pacoteReal();
  const buffer = empacotarParaTransporte(manifesto, entidades);
  const truncado = buffer.subarray(0, buffer.length - 5);
  assert.throws(() => desempacotarDeTransporte(truncado), /truncado/);
});

test('cabeçalho JSON ilegível é recusado', () => {
  const lixo = Buffer.alloc(4);
  lixo.writeUInt32BE(3, 0);
  const buffer = Buffer.concat([lixo, Buffer.from('xyz'), Buffer.from('resto')]);
  assert.throws(() => desempacotarDeTransporte(buffer), /cabeçalho ilegível/);
});

test('bytes sobrando depois da última entidade declarada é recusado — buffer adulterado', () => {
  const { manifesto, entidades } = pacoteReal();
  const buffer = empacotarParaTransporte(manifesto, entidades);
  const comLixoNoFim = Buffer.concat([buffer, Buffer.from('lixo extra')]);
  assert.throws(() => desempacotarDeTransporte(comLixoNoFim), /sobrando/);
});
