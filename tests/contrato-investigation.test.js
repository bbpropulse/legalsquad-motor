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
  join(RAIZ, '_criminalsquad', 'core', 'prompts', 'discovery.prompt.md'),
  'utf8'
);
const commandBody = readFileSync(
  join(RAIZ, 'templates', 'ide-assets', 'command-body.md'),
  'utf8'
);

test('discovery.prompt.md declara o schema investigation.enabled + profiles', () => {
  assert.match(discovery, /investigation:\s*\n\s*enabled:/, 'schema deve ter investigation.enabled');
  assert.match(discovery, /profiles:/, 'schema deve ter investigation.profiles');
  assert.match(discovery, /investigation_mode:/, 'cada profile deve ter investigation_mode');
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
