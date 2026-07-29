import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const HOOK = join(ROOT, '.claude', 'hooks', 'verifica-redacao.mjs');
let sandbox;

before(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'legalsquad-redacao-gate-'));
});

after(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

async function put(relativePath, content) {
  const path = join(sandbox, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return path;
}

const CONTRATO = `# Contrato\n\n## Contrato de saída\n\n- status: ready\n- conclusão calibrada\n\n## Hard stops\n- objetivo indefinido\n`;
const ENTRADA = 'Processo 0801234-56.2025.8.19.0001. ACME LTDA, contrato de 12/03/2024, valor R$ 48.500,00.';
const PECA_ANCORADA = `# Peça\n\nstatus: ready\n\nACME LTDA, contrato de 12/03/2024, R$ 48.500,00, autos 0801234-56.2025.8.19.0001.\n\n## Conclusão\nProcede.\n`;
const PECA_GENERICA = `# Petição inicial\n\nA parte requer o que de direito.\n`;

async function montarSquad({ peca }) {
  await put('squads/demo/squad.yaml', 'code: demo\nskills:\n  - notif\n');
  await put('skills/notif/references/high-performance-contract.md', CONTRATO);
  await put('squads/demo/output/pesquisa.md', ENTRADA);
  return put('squads/demo/output/peticao-final.md', peca);
}

function checkJson(alvo) {
  return spawnSync(process.execPath, [HOOK, '--check', alvo, '--json'], { encoding: 'utf8' });
}

function hookViaStdin(filePath) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
    encoding: 'utf8',
  });
}

test('--check --json nunca bloqueia — é consulta, não enforcement', async () => {
  // O runner precisa poder perguntar "como está a minuta?" sem que a resposta
  // vire exit 2. Enforcement continua sendo só o hook passivo (PostToolUse).
  const alvo = await montarSquad({ peca: PECA_GENERICA });

  const r = checkJson(alvo);

  assert.equal(r.status, 0, `--json não pode sair com erro — stderr: ${r.stderr}`);
  const veredito = JSON.parse(r.stdout);
  assert.equal(veredito.ok, false);
  assert.ok(veredito.problemas.some((p) => /ancorag/i.test(p)));
});

test('--check --json avalia a MINUTA, não só o artefato "final" por nome', async () => {
  // A heurística de "é artefato final?" existe para escopar o hook PASSIVO —
  // evitar falso positivo em nota interna. O runner já sabe que este é o output
  // do step de redação; a heurística de nome não deve impedir a consulta.
  await put('squads/demo/squad.yaml', 'code: demo\nskills:\n  - notif\n');
  await put('skills/notif/references/high-performance-contract.md', CONTRATO);
  await put('squads/demo/output/pesquisa.md', ENTRADA);
  const minuta = await put('squads/demo/output/minuta-v1.md', PECA_ANCORADA);

  const r = checkJson(minuta);

  const veredito = JSON.parse(r.stdout);
  assert.equal(veredito.ok, true, `minuta ancorada não devia falhar: ${JSON.stringify(veredito)}`);
});

test('--json devolve os TRÊS sinais nomeados, para o runner decidir com precisão', async () => {
  const alvo = await montarSquad({ peca: PECA_ANCORADA });

  const veredito = JSON.parse(checkJson(alvo).stdout);

  assert.deepEqual(Object.keys(veredito.sinais).sort(), ['ancoragem', 'andaime', 'cobertura']);
});

test('fora de squads/*/output/, --json reporta impossibilidade sem lançar', () => {
  const r = checkJson(join(sandbox, 'fora-do-squad.md'));

  assert.equal(r.status, 0);
  const veredito = JSON.parse(r.stdout);
  assert.equal(veredito.ok, null, '"impossível avaliar" é distinto de aprovado/reprovado');
});

test('regressão: o hook PASSIVO continua bloqueando peça final rasa (exit 2)', async () => {
  // O refactor para --json não pode enfraquecer o backstop automático.
  const alvo = await montarSquad({ peca: PECA_GENERICA });

  const r = hookViaStdin(alvo);

  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOQUEADO/);
});

test('regressão: o hook PASSIVO segue peça final ancorada (exit 0)', async () => {
  const alvo = await montarSquad({ peca: PECA_ANCORADA });

  const r = hookViaStdin(alvo);

  assert.equal(r.status, 0, r.stderr);
});
