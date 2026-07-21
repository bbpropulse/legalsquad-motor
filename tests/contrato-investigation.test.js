import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// O contrato entre a Discovery (que ESCREVE discovery.yaml) e o orquestrador
// (que LÊ discovery.yaml na Phase 2 do command-body) já quebrou uma vez por
// deriva silenciosa: o corpo do comando lia `investigation.mode`/`targets`,
// campos que a Discovery nunca emitiu — a fase Sherlock nunca dispararia pelo
// caminho especificado. Estes testes prendem os dois lados ao mesmo schema.

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const discovery = readFileSync(
  join(RAIZ, '_legalsquad', 'core', 'prompts', 'discovery.prompt.md'),
  'utf8'
);
const commandBody = readFileSync(
  join(RAIZ, 'templates', 'ide-assets', 'command-body.md'),
  'utf8'
);

// O bloco `investigation:` do schema, isolado — as asserções do lado Discovery
// precisam ser ancoradas nele. `investigation_mode` também aparece em prosa
// (Step 5), então casar o arquivo inteiro não provaria que o SCHEMA tem o campo.
const blocoInvestigation =
  discovery.match(/^investigation:\n(?:[ \t]+.*\n|\n)*/m)?.[0] ?? '';

test('discovery.prompt.md declara o schema investigation.enabled + profiles', () => {
  assert.ok(blocoInvestigation, 'o bloco `investigation:` deve existir no schema de saída');
  assert.match(blocoInvestigation, /^\s+enabled:/m, 'o bloco deve ter enabled');
  assert.match(blocoInvestigation, /^\s+profiles:/m, 'o bloco deve ter profiles');
  for (const campo of ['url', 'platform', 'investigation_mode']) {
    assert.match(
      blocoInvestigation,
      new RegExp(`^\\s+-?\\s*${campo}:`, 'm'),
      `cada profile deve declarar ${campo} dentro do bloco investigation:`
    );
  }
});

test('command-body lê os campos que a Discovery realmente escreve', () => {
  assert.match(
    commandBody,
    /investigation\.enabled/,
    'a Phase 2 deve ler investigation.enabled (o campo que a Discovery emite)'
  );
  assert.match(
    commandBody,
    /investigation\.profiles/,
    'a Phase 2 deve iterar investigation.profiles'
  );
});

test('a Phase 2 consome os campos por-perfil em vez de re-derivá-los', () => {
  // Segunda metade da correção: a Discovery já detectou a plataforma, então o
  // orquestrador usa `platform` do perfil em vez de re-detectar da URL. Sem
  // esta asserção, uma regressão parcial passaria em silêncio.
  const phase2 = commandBody.match(/### Phase 2: Investigation[\s\S]*?(?=\n### )/)?.[0] ?? '';
  assert.ok(phase2, 'a Phase 2 deve existir no command-body');

  for (const campo of ['platform', 'url', 'investigation_mode']) {
    assert.match(
      phase2,
      new RegExp(`\`${campo}\``),
      `a Phase 2 deve consumir o campo \`${campo}\` do perfil`
    );
  }
  assert.match(
    phase2,
    /não re-detecte da URL|nao re-detecte da URL/,
    'a Phase 2 deve proibir explicitamente re-detectar a plataforma da URL'
  );
});

test('command-body não referencia campos que a Discovery nunca emite', () => {
  assert.doesNotMatch(
    commandBody,
    /investigation\.mode/,
    'investigation.mode não existe no schema da Discovery — contrato quebrado'
  );
  assert.doesNotMatch(
    commandBody,
    /investigation\.targets/,
    'investigation.targets não existe no schema da Discovery — contrato quebrado'
  );
});
