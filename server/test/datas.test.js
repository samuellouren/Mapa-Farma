import test from 'node:test';
import assert from 'node:assert/strict';
import { dataLocalMaceio } from '../src/lib/datas.js';

// Defesa em profundidade: se o client não mandar data_pedido, o fallback do
// servidor deve usar a data local de Maceió (UTC-3), NÃO a data UTC — senão um
// pedido criado à noite no Brasil é gravado com a data do dia seguinte.
// Independe do fuso do host (cálculo por offset), então roda igual em qualquer máquina.
test('dataLocalMaceio: instante UTC → data local de Maceió (UTC-3)', () => {
  // 13/07 01:15 UTC = 12/07 22:15 em Maceió → dia 12.
  assert.equal(dataLocalMaceio(new Date('2026-07-13T01:15:08Z')), '2026-07-12');
  // Meio-dia UTC: mesmo dia.
  assert.equal(dataLocalMaceio(new Date('2026-07-13T12:00:00Z')), '2026-07-13');
  // Logo após a meia-noite UTC: ainda é o dia anterior em Maceió.
  assert.equal(dataLocalMaceio(new Date('2026-07-13T02:59:00Z')), '2026-07-12');
  // Às 03:00 UTC vira o novo dia em Maceió.
  assert.equal(dataLocalMaceio(new Date('2026-07-13T03:00:00Z')), '2026-07-13');
});
