import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIdeTemplates } from '../src/build-ide-templates.js';

// The IDE template bodies are generated from templates/ide-assets/ (single
// source). This locks them: if a template body is edited directly without
// updating the asset — or the asset is changed without regenerating — CI fails.
test('IDE template bodies are in sync with templates/ide-assets/ (run `npm run build:ide`)', async () => {
  const outOfSync = await buildIdeTemplates({ check: true });
  assert.deepEqual(
    outOfSync,
    [],
    `These IDE template bodies drifted from templates/ide-assets/. Run "npm run build:ide":\n  ${outOfSync.join('\n  ')}`
  );
});
