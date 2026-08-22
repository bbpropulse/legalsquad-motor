import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSquad } from '../src/squad-check.js';
import { SKILLS_DEMO, SQUADS_DEMO } from './fixtures/caminhos.js';
import { cpSync, mkdtempSync, writeFileSync, readFileSync as rf } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = readFileSync(join(ROOT, '_legalsquad', 'core', 'runner.pipeline.md'), 'utf8');

// O Mike era 100% prosa sem nenhum teste — um refactor do runner podia apagá-lo
// e nada falhava (o risco inverso apontado pelo mapeamento). Estes testes
// transformam a correção da dupla voz em CONTRATO: as âncoras da seção do
// chefe têm de existir, e os templates anônimos em inglês que a contradiziam
// não podem voltar.

test('a seção do chefe existe com suas âncoras constitucionais', () => {
  assert.match(RUNNER, /O chefe do squad — a voz do run/);
  assert.match(RUNNER, /O chefe é a VOZ\. O `pipeline\.yaml` continua sendo a LEI/);
  assert.match(RUNNER, /Pedido fora do fluxo/);
  assert.match(RUNNER, /não redige peça, parecer ou memorial na conversa/);
});

test('os templates anônimos em inglês NÃO voltaram — a dupla voz morreu', () => {
  // Cada um destes era EMITIDO pelo corpo do runner em contradição com a
  // seção do chefe. A única menção legítima é a citação pedagógica da própria
  // seção ("Em vez de X, o chefe diz…") — qualquer outra é regressão.
  for (const proibido of [
    'Running squad:',
    'Pipeline complete!',
    "'s output was not generated",
    "'s output triggered a veto",
  ]) {
    assert.equal(RUNNER.includes(proibido), false, `template anônimo voltou: "${proibido}"`);
  }
  const linhasComWorking = RUNNER.split('\n').filter((l) => l.includes('{Agent Name} is working'));
  assert.ok(linhasComWorking.length <= 1, `"is working" além da citação pedagógica: ${linhasComWorking.length}`);
  for (const linha of linhasComWorking) {
    assert.match(linha, /Em vez de/, 'a única menção permitida é a citação "Em vez de…" da seção do chefe');
  }
});

test('os momentos de voz nova estão presentes (abertura, rigor, escalada, retomada)', () => {
  assert.match(RUNNER, /A abertura é do chefe/);
  assert.match(RUNNER, /Narre o rigor — inclusive quando PASSA/);
  assert.match(RUNNER, /O slug é para o ledger; para o aluno, o chefe traduz/);
  assert.match(RUNNER, /O molde da reapresentação/);
  assert.match(RUNNER, /A conclusão é a entrega do chefe/);
  assert.match(RUNNER, /O chefe emoldura antes da pergunta/);
  assert.match(RUNNER, /Voz da memória/);
  assert.match(RUNNER, /Despachei \{N\} em paralelo/);
});

test('warns novos do chefe: campo desconhecido e icon vazio — warn, nunca error', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-chefe-'));
  const squadsDir = join(raiz, 'squads');
  cpSync(SQUADS_DEMO, squadsDir, { recursive: true });
  const yamlPath = join(squadsDir, 'demo-squad', 'squad.yaml');
  writeFileSync(yamlPath, `${rf(yamlPath, 'utf8')}\nchefe:\n  nome: "Helena"\n  icone: "🎩"\n  icon: ""\n`);

  const r = checkSquad('demo-squad', { squadsDir, skillsDir: SKILLS_DEMO });
  const warns = r.issues.filter((i) => i.severity === 'warn').map((i) => i.code);
  assert.ok(warns.includes('chefe-campo-desconhecido'), `esperava typo pego: ${warns}`);
  assert.ok(warns.includes('chefe-icon-vazio'));
  assert.match(JSON.stringify(r.issues), /chefe\.icone/);
  assert.equal(r.issues.some((i) => i.severity === 'error' && i.code.startsWith('chefe-campo')), false);
});
