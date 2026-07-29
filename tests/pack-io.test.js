import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gravarPacote, lerPacoteDoDisco } from '../src/pack-io.js';
import { verificarPacote } from '../src/pack-format.js';
import { construirPacotes } from '../src/pack-build.js';
import { AREA_DEMO } from './fixtures/caminhos.js';

// Ida e volta pelo DISCO. O empacotador devolve buffers em memória e o teste de
// `pack-build` para aí — mas em produção o pacote é gravado, transportado e lido
// de novo. É nesse trecho que a adulteração acontece, e é ele que este arquivo
// prende.

const CHAVES = generateKeyPairSync('ed25519');

function construirEGravar() {
  const { pacotes } = construirPacotes({
    raizConteudo: AREA_DEMO,
    areaId: 'demo',
    chavePrivada: CHAVES.privateKey,
    versao: '2026.07.1',
  });
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-pacote-'));
  const gravados = pacotes.map((pacote) => gravarPacote(raiz, pacote));
  return { pacotes, raiz, gravados };
}

test('pacote gravado e lido de volta continua verificando', () => {
  const { gravados } = construirEGravar();

  for (const dir of gravados) {
    const { manifesto, entidades } = lerPacoteDoDisco(dir);
    assert.deepEqual(
      verificarPacote(manifesto, entidades, CHAVES.publicKey).problemas,
      [],
      `${dir} não verificou depois de passar pelo disco`
    );
  }
});

test('entidade adulterada no disco é recusada na leitura', () => {
  // O caminho real do ataque: o pacote sai íntegro do build e alguém mexe nos
  // bytes no trânsito ou no repositório de distribuição. Se a verificação
  // acontecesse só em memória, no build, ela não protegeria ninguém.
  const { gravados } = construirEGravar();
  const dir = gravados[0];

  const alvo = join(dir, 'catalog.jsonl.zst');
  const bytes = readFileSync(alvo);
  bytes[bytes.length - 1] ^= 0xff;
  writeFileSync(alvo, bytes);

  const { manifesto, entidades } = lerPacoteDoDisco(dir);
  const veredito = verificarPacote(manifesto, entidades, CHAVES.publicKey);

  assert.equal(veredito.ok, false);
  assert.ok(veredito.problemas.some((p) => p.includes('catalog.jsonl.zst')));
});

test('manifesto ilegível falha ruidosamente, nomeando o arquivo', () => {
  // "Não sei ler" nunca pode virar "não existe": um manifesto corrompido tem de
  // parar a instalação com o caminho na mensagem, não devolver pacote vazio.
  const { gravados } = construirEGravar();
  writeFileSync(join(gravados[0], 'manifest.json'), '{ isto não é json');

  assert.throws(() => lerPacoteDoDisco(gravados[0]), /manifest\.json/);
});

test('entidade declarada e ausente do disco falha ruidosamente', () => {
  const { gravados } = construirEGravar();
  const dir = gravados[0];
  const manifesto = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  manifesto.entities.push({ file: 'fantasma.jsonl.zst', role: 'content', sha256: 'x', bytes: 1 });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifesto));

  assert.throws(() => lerPacoteDoDisco(dir), /fantasma\.jsonl\.zst/);
});
