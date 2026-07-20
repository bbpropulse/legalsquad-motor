// Um lugar só para a raiz da fixture sintética — nenhum teste hardcodar caminho.
// Ver tests/fixtures/gerar-area-demo.mjs para como a árvore abaixo é gerada.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

export const AREA_DEMO = join(AQUI, 'area-demo');
export const SKILLS_DEMO = join(AREA_DEMO, 'skills');
export const ACERVO_DEMO = join(AREA_DEMO, 'acervo');
export const SQUADS_DEMO = join(AREA_DEMO, 'squads');
export const CORE_DEMO = join(AREA_DEMO, 'core');
