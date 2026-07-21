// Testes do subsistema de captura (scripts/captura/*.py).
//
// O que se guarda aqui é sigilo, não funcionalidade bonita: a guarda fail-closed
// da nuvem (áudio de audiência nunca sobe sem afirmação explícita de mídia
// pública) e a retenção de cópias derivadas em disco. Por isso os testes rodam o
// Python de verdade — a lógica auditada é a que executa, não uma reimplementação
// em JS que poderia divergir do script sem ninguém perceber.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURA = join(ROOT, 'scripts', 'captura');

function hasBin(bin) {
  return spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin]).status === 0;
}

// Sem python3/ffmpeg o teste NÃO passa em silêncio: ele skipa dizendo o motivo.
// Uma guarda de sigilo que "passa" porque nada rodou é pior que teste nenhum.
const missing = ['python3', 'ffmpeg', 'ffprobe'].filter((b) => !hasBin(b));
const SKIP = missing.length ? `dependência ausente no ambiente: ${missing.join(', ')}` : false;

function python(args, options = {}) {
  return spawnSync('python3', args, { encoding: 'utf-8', ...options });
}

function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), 'captura-test-'));
}

function makeAudio(dir) {
  const out = join(dir, 'audiencia.mp3');
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', out]);
  assert.equal(r.status, 0, 'fixture de áudio não pôde ser gerada');
  return out;
}

function makeVideo(dir) {
  const out = join(dir, 'audiencia.mp4');
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest', out]);
  assert.equal(r.status, 0, 'fixture de vídeo não pôde ser gerada');
  return out;
}

function workDirFrom(stderr) {
  const m = /\[watch\] working dir: (.+)/.exec(stderr || '');
  return m ? m[1].trim() : null;
}

function watch(args, options = {}) {
  return python([join(CAPTURA, 'watch.py'), ...args], options);
}

// --- Guarda fail-closed da nuvem -------------------------------------------

test('nuvem bloqueada sem afirmação de mídia pública (fail-closed)', { skip: SKIP }, () => {
  const r = python(['-c', `
import sys
sys.path.insert(0, ${JSON.stringify(CAPTURA)})
from pathlib import Path
from providers import transcribe_video
try:
    transcribe_video("inexistente.mp4", Path("/dev/null"), provider="openrouter", allow_cloud=False)
except SystemExit as exc:
    print("BLOQUEIO:", exc)
else:
    print("PASSOU")
`]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /BLOQUEIO:/);
  assert.match(r.stdout, /BLOQUEADO/);
});

test('provider desconhecido não vira nuvem por acidente', { skip: SKIP }, () => {
  const r = python(['-c', `
import sys
sys.path.insert(0, ${JSON.stringify(CAPTURA)})
from pathlib import Path
from providers import transcribe_video
try:
    transcribe_video("inexistente.mp4", Path("/dev/null"), provider="nuvem-magica", allow_cloud=True)
except SystemExit as exc:
    print("ERRO:", exc)
`]);
  assert.match(r.stdout, /provider desconhecido/);
});

test('watch.py degrada openrouter para local sem --publico', { skip: SKIP }, () => {
  const ws = makeWorkspace();
  try {
    const audio = makeAudio(ws);
    const r = watch([audio, '--detail', 'transcript', '--transcribe', 'openrouter']);
    assert.match(r.stderr, /nuvem NAO liberada/);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test('watch.py com --sigiloso ignora pedido de nuvem', { skip: SKIP }, () => {
  const ws = makeWorkspace();
  try {
    const audio = makeAudio(ws);
    const r = watch([audio, '--detail', 'transcript', '--transcribe', 'openrouter', '--sigiloso',
      '--out-dir', join(ws, 'work')]);
    assert.match(r.stderr, /--sigiloso: forcando transcricao LOCAL/);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

// --- Mídia só-áudio ---------------------------------------------------------

test('mídia só-áudio não aborta: segue para transcrição', { skip: SKIP }, () => {
  const ws = makeWorkspace();
  try {
    const audio = makeAudio(ws);
    const r = watch([audio, '--detail', 'balanced']);
    assert.equal(r.status, 0, `watch abortou em mídia só-áudio:\n${r.stderr}`);
    assert.match(r.stdout, /sem faixa de v[ií]deo/i);
    assert.doesNotMatch(r.stdout, /## Frames\n\n(?!_No frames)/);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

// --- Retenção de material derivado -----------------------------------------

test('work dir temporário é removido ao fim da execução', { skip: SKIP }, () => {
  const ws = makeWorkspace();
  try {
    const audio = makeAudio(ws);
    const r = watch([audio, '--detail', 'transcript']);
    const work = workDirFrom(r.stderr);
    assert.ok(work, 'work dir não anunciado no stderr');
    assert.equal(existsSync(work), false, `resíduo em ${work}`);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test('--keep-work preserva o work dir e avisa no relatório', { skip: SKIP }, () => {
  const ws = makeWorkspace();
  let work = null;
  try {
    const audio = makeAudio(ws);
    const r = watch([audio, '--detail', 'transcript', '--keep-work']);
    work = workDirFrom(r.stderr);
    assert.ok(work && existsSync(work), '--keep-work deveria preservar o work dir');
    assert.match(r.stdout, /--keep-work/);
  } finally {
    if (work) rmSync(work, { recursive: true, force: true });
    rmSync(ws, { recursive: true, force: true });
  }
});

test('--keep-work é recusado sob --sigiloso', { skip: SKIP }, () => {
  const ws = makeWorkspace();
  try {
    const audio = makeAudio(ws);
    const r = watch([audio, '--detail', 'transcript', '--sigiloso', '--keep-work']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /--keep-work/);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test('--sigiloso marca o relatório e não deixa resíduo sem frames', { skip: SKIP }, () => {
  const ws = makeWorkspace();
  const work = join(ws, 'dossie');
  try {
    const audio = makeAudio(ws);
    const r = watch([audio, '--detail', 'transcript', '--sigiloso', '--out-dir', work]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /SIGILOSO/);
    assert.equal(existsSync(join(work, 'audio.mp3')), false, 'áudio derivado ficou em disco');
    assert.equal(existsSync(join(work, 'download')), false, 'cópia da mídia ficou em disco');
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test('--sigiloso com frames: 0700 no dir, 0600 nos frames, intermediários limpos', { skip: SKIP }, () => {
  const ws = makeWorkspace();
  const work = join(ws, 'dossie');
  try {
    const video = makeVideo(ws);
    const r = watch([video, '--detail', 'balanced', '--sigiloso', '--out-dir', work]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /SIGILOSO/);
    assert.equal(statSync(work).mode & 0o777, 0o700, 'work dir sigiloso sem permissão restritiva');
    assert.equal(existsSync(join(work, 'download')), false, 'cópia da mídia ficou em disco');
    assert.equal(existsSync(join(work, 'audio.mp3')), false, 'áudio derivado ficou em disco');
    const frame = /`([^`]+\.jpg)`/.exec(r.stdout);
    assert.ok(frame, 'nenhum frame listado no relatório');
    assert.equal(statSync(frame[1]).mode & 0o777, 0o600, 'frame sigiloso legível por terceiros');
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test('--sigiloso com frames exige --out-dir explícito', { skip: SKIP }, () => {
  const ws = makeWorkspace();
  try {
    const video = makeVideo(ws);
    const r = watch([video, '--detail', 'balanced', '--sigiloso']);
    assert.notEqual(r.status, 0, 'frames sigilosos não podem cair no temp do sistema');
    assert.match(r.stderr, /--out-dir/);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

// --- Cue frames -------------------------------------------------------------

test('cue frame que falha é contado e nomeado no relatório', { skip: SKIP }, () => {
  const ws = makeWorkspace();
  try {
    const video = makeVideo(ws);
    // 1:40 está além do fim do vídeo de 2s: o ffmpeg não produz o frame.
    const r = watch([video, '--detail', 'transcript', '--timestamps', '0:01,1:40',
      '--out-dir', join(ws, 'work'), '--keep-work']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Cue frames:\*\* 1 de 2/);
    assert.match(r.stdout, /1:40/);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

// --- Empacotamento ----------------------------------------------------------

test('.npmignore exclui bytecode Python do tarball', () => {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT, encoding: 'utf-8' });
  assert.equal(r.status, 0, r.stderr);
  const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  const leaked = files.filter((f) => f.includes('__pycache__') || f.endsWith('.pyc'));
  assert.deepEqual(leaked, [], `bytecode Python no tarball: ${leaked.join(', ')}`);
});
