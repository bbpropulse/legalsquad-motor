import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX = join(__dirname, '..', 'acervo', '_index.yaml');

function entries(index) {
  return index.split(/^ {2}- path: /m).slice(1).map((block) => {
    const lines = block.split('\n');
    const value = (key) => {
      const line = lines.find((item) => item.startsWith(`    ${key}: `));
      return line ? line.slice(`    ${key}: `.length).replace(/^"|"$/g, '') : null;
    };
    return {
      path: lines[0].trim(),
      confianca: value('confianca'),
      urlOficial: value('url_oficial'),
      consultadoEm: value('consultado_em'),
    };
  });
}

test('acervo: todo item tem classificação de confiança explícita no índice', () => {
  const items = entries(readFileSync(INDEX, 'utf8'));
  assert.ok(items.length > 0);
  const allowed = new Set(['VERIFIED_OFFICIAL', 'DISCOVERY_ONLY', 'QUARANTINED']);
  assert.deepEqual(
    items.filter((item) => !allowed.has(item.confianca)),
    [],
    'rode `npm run indexar-acervo` e corrija classificações inválidas',
  );
});

test('acervo: VERIFIED_OFFICIAL exige URL oficial e data de consulta', () => {
  const verified = entries(readFileSync(INDEX, 'utf8'))
    .filter((item) => item.confianca === 'VERIFIED_OFFICIAL');
  assert.deepEqual(
    verified.filter((item) => !item.urlOficial || !item.consultadoEm),
    [],
    'não marque VERIFIED_OFFICIAL sem url_oficial e consultado_em',
  );
});
