import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { encodeEntity, selarPacote, verificarPacote } from '../src/pack-format.js';

// Determinismo do container (SPEC §6.6). Sem ele o `content_hash` não é
// verificável por terceiro e o delta não é calculável: dois builds do mesmo
// conteúdo têm de produzir o MESMO byte, em qualquer máquina.
//
// A armadilha é a ordem. Duas fontes de não-determinismo entram calado:
// a ordem em que os registros chegam (depende de readdir, que depende do
// sistema de arquivos) e a ordem das chaves de cada objeto (depende de como
// o objeto foi montado). As duas precisam ser canonizadas antes de comprimir.

test('a ordem em que os registros chegam não muda o byte de saída', () => {
  const direto = encodeEntity([
    { path: 'skills/alfa/SKILL.md', sha256: 'aaa', bytes: 1 },
    { path: 'skills/beta/SKILL.md', sha256: 'bbb', bytes: 2 },
  ]);
  const invertido = encodeEntity([
    { path: 'skills/beta/SKILL.md', sha256: 'bbb', bytes: 2 },
    { path: 'skills/alfa/SKILL.md', sha256: 'aaa', bytes: 1 },
  ]);

  assert.deepEqual(
    invertido,
    direto,
    'readdir devolve ordem dependente do sistema de arquivos — o empacotador ' +
      'tem de ordenar por byte-order antes de comprimir, ou o mesmo conteúdo ' +
      'produz hashes diferentes em máquinas diferentes'
  );
});

test('a ordem das chaves de um registro não muda o byte de saída', () => {
  // `JSON.stringify` preserva a ordem de INSERÇÃO. Dois caminhos de código que
  // montam o mesmo registro em ordem diferente produziriam bytes diferentes —
  // não-determinismo que só aparece quando alguém refatora o construtor.
  const direto = encodeEntity([{ path: 'x.md', sha256: 'aaa', bytes: 1 }]);
  const trocado = encodeEntity([{ bytes: 1, sha256: 'aaa', path: 'x.md' }]);

  assert.deepEqual(trocado, direto, 'as chaves precisam ser canonizadas antes de serializar');
});

test('registro com identidade repetida é recusado no build', () => {
  // O cliente já recusa o pacote inteiro se um `path` se repetir (§6.5, regra 4).
  // Produzir um pacote assim seria gerar, com esforço, algo que o próprio motor
  // rejeita — o erro tem de aparecer no build, com o caminho no texto.
  assert.throws(
    () => encodeEntity([
      { path: 'skills/alfa/SKILL.md', sha256: 'aaa' },
      { path: 'skills/alfa/SKILL.md', sha256: 'bbb' },
    ]),
    /skills\/alfa\/SKILL\.md/,
    'a mensagem precisa dizer QUAL identidade duplicou'
  );
});

// ── Selo: content_hash + assinatura Ed25519 destacada (§6.6, §6.7) ──────────

const CHAVES = generateKeyPairSync('ed25519');

/** Monta um pacote mínimo e válido, para os testes terem o que adulterar. */
function pacoteDeTeste() {
  const entidades = [
    { file: 'catalog.jsonl.zst', role: 'catalog', buffer: encodeEntity([{ id: 'alfa', kind: 'skill' }]) },
    { file: 'skills.jsonl.zst', role: 'content', buffer: encodeEntity([{ path: 'skills/alfa/SKILL.md', sha256: 'aaa' }]) },
  ];
  const manifesto = selarPacote(
    { pack_id: 'area.demo', version: '2026.07.1', payload_kind: 'tree', applies_to: ['skills/'] },
    entidades,
    CHAVES.privateKey,
    { signing_kid: '2026-a' }
  );
  return { manifesto, entidades };
}

test('pacote íntegro é aceito na verificação', () => {
  const { manifesto, entidades } = pacoteDeTeste();

  const veredito = verificarPacote(manifesto, entidades, CHAVES.publicKey);

  assert.deepEqual(veredito.problemas, []);
  assert.equal(veredito.ok, true);
});

test('um byte adulterado em qualquer entidade recusa o pacote', () => {
  // O teste que impede uma verificação que sempre diz "ok". Sem ele, todo o
  // resto do formato é decoração: assinatura que não recusa nada não prova nada.
  const { manifesto, entidades } = pacoteDeTeste();

  for (const alvo of entidades) {
    const adulteradas = entidades.map((e) => (e === alvo
      ? { ...e, buffer: Buffer.concat([e.buffer.subarray(0, e.buffer.length - 1), Buffer.from([e.buffer.at(-1) ^ 0xff])]) }
      : e));

    const veredito = verificarPacote(manifesto, adulteradas, CHAVES.publicKey);

    assert.equal(veredito.ok, false, `adulterar ${alvo.file} tinha de recusar o pacote`);
    assert.ok(
      veredito.problemas.some((p) => p.includes(alvo.file)),
      `o motivo precisa nomear a entidade adulterada — recebido: ${JSON.stringify(veredito.problemas)}`
    );
  }
});

test('assinatura de outra chave recusa o pacote', () => {
  // Hash confere, conteúdo confere — só a origem não. Sem checar a assinatura, um
  // pacote de qualquer um materializa arquivos na máquina de um advogado.
  const { manifesto, entidades } = pacoteDeTeste();
  const intruso = generateKeyPairSync('ed25519');

  const veredito = verificarPacote(manifesto, entidades, intruso.publicKey);

  assert.equal(veredito.ok, false);
  assert.ok(veredito.problemas.some((p) => /assinatura/i.test(p)));
});

// ── Regras de catálogo (§6.1) — aceite 5 e 6 do F1 ─────────────────────────

test('pacote sem catálogo é recusado', () => {
  // Fail-closed. Sem catálogo a área é invisível para a busca local, e invisível
  // é indistinguível de inexistente — o modo de falha que este motor persegue.
  const entidades = [
    { file: 'skills.jsonl.zst', role: 'content', buffer: encodeEntity([{ path: 'skills/a/SKILL.md' }]) },
  ];
  const manifesto = selarPacote(
    { pack_id: 'area.demo', version: '2026.07.1', payload_kind: 'tree' },
    entidades,
    CHAVES.privateKey
  );

  const veredito = verificarPacote(manifesto, entidades, CHAVES.publicKey);

  assert.equal(veredito.ok, false, 'um pacote sem catálogo não pode ser aceito');
  assert.ok(veredito.problemas.some((p) => /cat[áa]logo/i.test(p)));
});

test('pacote com mais de um catálogo é recusado', () => {
  // Dois catálogos significam duas verdades sobre o mesmo conteúdo — e nada no
  // formato diz qual vale.
  const entidades = [
    { file: 'catalog.jsonl.zst', role: 'catalog', buffer: encodeEntity([{ id: 'a' }]) },
    { file: 'catalog-extra.jsonl.zst', role: 'catalog', buffer: encodeEntity([{ id: 'b' }]) },
  ];
  const manifesto = selarPacote(
    { pack_id: 'area.demo', version: '2026.07.1', payload_kind: 'tree' },
    entidades,
    CHAVES.privateKey
  );

  const veredito = verificarPacote(manifesto, entidades, CHAVES.publicKey);

  assert.equal(veredito.ok, false);
  assert.ok(veredito.problemas.some((p) => /exatamente um/i.test(p)));
});

test('entidade faltando ou sobrando em relação ao manifesto recusa o pacote', () => {
  const { manifesto, entidades } = pacoteDeTeste();

  const faltando = verificarPacote(manifesto, entidades.slice(0, 1), CHAVES.publicKey);
  assert.equal(faltando.ok, false);
  assert.ok(faltando.problemas.some((p) => /ausente do pacote/.test(p)));

  const sobrando = verificarPacote(
    manifesto,
    [...entidades, { file: 'clandestina.jsonl.zst', role: 'content', buffer: encodeEntity([{ id: 'x' }]) }],
    CHAVES.publicKey
  );
  assert.equal(sobrando.ok, false, 'entidade não declarada viaja fora da assinatura — recuse');
  assert.ok(sobrando.problemas.some((p) => /n[ãa]o declarada/.test(p)));
});
