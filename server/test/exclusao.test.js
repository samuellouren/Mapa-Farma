import test from 'node:test';
import assert from 'node:assert/strict';
import { avaliarExclusao } from '../src/lib/exclusao.js';

test('não-manual (seed) não pode ser excluída', () => {
  assert.deepEqual(
    avaliarExclusao({ origem: 'seed', pedidos_count: 0, relatorios_count: 0 }),
    { permitido: false, motivo: 'nao_manual' }
  );
});

test('manual com pedidos → bloqueia (preserva financeiro)', () => {
  assert.deepEqual(
    avaliarExclusao({ origem: 'manual', pedidos_count: 2, relatorios_count: 5 }),
    { permitido: false, motivo: 'tem_pedidos' }
  );
});

test('manual só com visitas → permite e informa quantas apaga', () => {
  assert.deepEqual(
    avaliarExclusao({ origem: 'manual', pedidos_count: 0, relatorios_count: 3 }),
    { permitido: true, apagaVisitas: 3 }
  );
});

test('manual sem vínculo → permite direto', () => {
  assert.deepEqual(
    avaliarExclusao({ origem: 'manual', pedidos_count: 0, relatorios_count: 0 }),
    { permitido: true, apagaVisitas: 0 }
  );
});
