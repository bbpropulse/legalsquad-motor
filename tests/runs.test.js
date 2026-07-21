import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listRuns, formatDuration } from '../src/runs.js';

test('listRuns returns empty array when no squads exist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'osq-runs-'));
  try {
    const runs = await listRuns(null, dir);
    assert.equal(runs.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listRuns finds state.json in output directories', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'osq-runs-'));
  try {
    const runDir = join(dir, 'squads', 'my-squad', 'output', '2026-03-17-120000');
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'state.json'), JSON.stringify({
      squad: 'my-squad',
      status: 'completed',
      step: { current: 3, total: 3 },
      startedAt: '2026-03-17T12:00:00Z',
      completedAt: '2026-03-17T12:05:00Z',
    }), 'utf-8');

    const runs = await listRuns(null, dir);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].squad, 'my-squad');
    assert.equal(runs[0].status, 'completed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listRuns filters by squad name', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'osq-runs-'));
  try {
    for (const name of ['squad-a', 'squad-b']) {
      const runDir = join(dir, 'squads', name, 'output', '2026-03-17-120000');
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, 'state.json'), JSON.stringify({
        squad: name, status: 'completed', step: { current: 1, total: 1 },
        startedAt: '2026-03-17T12:00:00Z', completedAt: '2026-03-17T12:01:00Z',
      }), 'utf-8');
    }

    const runs = await listRuns('squad-a', dir);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].squad, 'squad-a');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listRuns returns unknown for runs without state.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'osq-runs-'));
  try {
    const runDir = join(dir, 'squads', 'my-squad', 'output', '2026-03-17-120000');
    await mkdir(runDir, { recursive: true });

    const runs = await listRuns(null, dir);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'unknown');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listRuns handles malformed state.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'osq-runs-'));
  try {
    const runDir = join(dir, 'squads', 'my-squad', 'output', '2026-03-17-120000');
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'state.json'), 'not json', 'utf-8');

    const runs = await listRuns(null, dir);
    assert.equal(runs.length, 1);
    // Antes esperava `unknown` — o mesmo valor de um run que nunca escreveu
    // estado. Essa asserção documentava o defeito: state ilegível quase sempre
    // é um run que MORREU no meio da escrita, que é o caso a investigar.
    assert.equal(runs[0].status, 'corrupted');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listRuns sorts by runId descending', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'osq-runs-'));
  try {
    for (const ts of ['2026-03-17-100000', '2026-03-17-120000', '2026-03-17-080000']) {
      const runDir = join(dir, 'squads', 'my-squad', 'output', ts);
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, 'state.json'), JSON.stringify({
        squad: 'my-squad', status: 'completed', step: { current: 1, total: 1 },
        startedAt: `2026-03-17T${ts.slice(11, 13)}:00:00Z`,
        completedAt: `2026-03-17T${ts.slice(11, 13)}:01:00Z`,
      }), 'utf-8');
    }

    const runs = await listRuns(null, dir);
    assert.equal(runs[0].runId, '2026-03-17-120000');
    assert.equal(runs[1].runId, '2026-03-17-100000');
    assert.equal(runs[2].runId, '2026-03-17-080000');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listRuns limits to 20 results', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'osq-runs-'));
  try {
    for (let i = 0; i < 25; i++) {
      const ts = `2026-03-${String(i + 1).padStart(2, '0')}-120000`;
      const runDir = join(dir, 'squads', 'my-squad', 'output', ts);
      await mkdir(runDir, { recursive: true });
    }

    const runs = await listRuns(null, dir);
    assert.equal(runs.length, 20);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('formatDuration formats milliseconds', () => {
  assert.equal(formatDuration(150000), '2m 30s');
  assert.equal(formatDuration(3600000), '1h 0m');
  assert.equal(formatDuration(3661000), '1h 1m');
  assert.equal(formatDuration(45000), '45s');
  assert.equal(formatDuration(0), '0s');
});

test('listRuns calculates duration from timestamps', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'osq-runs-'));
  try {
    const runDir = join(dir, 'squads', 'my-squad', 'output', '2026-03-17-120000');
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'state.json'), JSON.stringify({
      squad: 'my-squad', status: 'completed',
      step: { current: 3, total: 3 },
      startedAt: '2026-03-17T12:00:00Z',
      completedAt: '2026-03-17T12:05:30Z',
    }), 'utf-8');

    const runs = await listRuns(null, dir);
    assert.equal(runs[0].duration, '5m 30s');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listRuns ignores non-directory entries in output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'osq-runs-'));
  try {
    const outputDir = join(dir, 'squads', 'my-squad', 'output');
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'random-file.txt'), 'not a run', 'utf-8');

    const runs = await listRuns(null, dir);
    assert.equal(runs.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listRuns distingue state ausente de state corrompido', async (t) => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const raiz = await mkdtemp(join(tmpdir(), 'runs-corrompido-'));
  t.after(() => rm(raiz, { recursive: true, force: true }));

  const base = join(raiz, 'squads', 'demo', 'output');
  await mkdir(join(base, '2026-07-20-100000'), { recursive: true });
  await mkdir(join(base, '2026-07-20-110000'), { recursive: true });
  // Um run sem state (ainda não escreveu) e outro com state TRUNCADO —
  // exatamente o cenário de crash no meio da escrita, que é quando mais
  // importa saber o que houve.
  await writeFile(join(base, '2026-07-20-110000', 'state.json'), '{"status":"run');

  const runs = await listRuns(null, raiz);
  const semState = runs.find((r) => r.runId === '2026-07-20-100000');
  const corrompido = runs.find((r) => r.runId === '2026-07-20-110000');

  assert.equal(semState.status, 'unknown', 'run sem state permanece unknown');
  assert.equal(
    corrompido.status,
    'corrupted',
    'run cujo state está ilegível precisa ser distinguível de um que nunca escreveu — ' +
    'o primeiro provavelmente FALHOU, o segundo talvez nem tenha começado'
  );
});

test('listRuns avisa quando corta a listagem em vez de sumir com runs', async (t) => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const raiz = await mkdtemp(join(tmpdir(), 'runs-corte-'));
  t.after(() => rm(raiz, { recursive: true, force: true }));

  // Dois squads; o segundo tem runs mais ANTIGOS. Com corte global por data,
  // um squad inteiro pode sumir da listagem sem qualquer aviso — e o advogado
  // conclui que a execução não existiu.
  for (const [squad, ano] of [['squad-novo', '2026'], ['squad-antigo', '2020']]) {
    for (let i = 0; i < 15; i++) {
      const runId = `${ano}-01-${String(i + 1).padStart(2, '0')}-120000`;
      await mkdir(join(raiz, 'squads', squad, 'output', runId), { recursive: true });
      await writeFile(join(raiz, 'squads', squad, 'output', runId, 'state.json'), '{"status":"completed"}');
    }
  }

  const runs = await listRuns(null, raiz);
  assert.ok(Array.isArray(runs));
  assert.ok(runs.truncated, 'a listagem cortada precisa se declarar cortada');
  assert.ok(runs.total > runs.length, `total (${runs.total}) deve exceder o exibido (${runs.length})`);
});
