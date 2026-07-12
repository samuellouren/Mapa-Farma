import test from 'node:test';
import assert from 'node:assert/strict';
import { agrupar } from '../src/lib/grafico.js';

// Dados reais de teste: 08/07 (qua) e 12/07 (dom, dois pedidos). Domingo é o
// último dia da semana ISO que começa na segunda 06/07.
const PEDIDOS = [
  { data_pedido: '2026-07-08', valor_centavos: 250000 },
  { data_pedido: '2026-07-12', valor_centavos: 300000 },
  { data_pedido: '2026-07-12', valor_centavos: 700000 },
];
const HOJE = new Date('2026-07-12T00:00:00'); // domingo da semana 06→12/07

test('semana: sempre 7 barras fixas, seg..dom, mesmo com dias vazios', () => {
  const b = agrupar(PEDIDOS, 'semana', HOJE);
  assert.equal(b.length, 7);
  assert.deepEqual(b.map((x) => x.label), ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']);
});

test('semana: soma cada pedido no dia certo; dias sem pedido ficam zerados', () => {
  const b = agrupar(PEDIDOS, 'semana', HOJE);
  const porDia = Object.fromEntries(b.map((x) => [x.label, x.total]));
  assert.deepEqual(porDia, {
    seg: 0, ter: 0, qua: 250000, qui: 0, sex: 0, sáb: 0, dom: 1000000,
  });
});

test('semana: pedido fora da semana corrente é ignorado (recorte só da semana atual)', () => {
  const comForaDaSemana = [
    ...PEDIDOS,
    { data_pedido: '2026-07-05', valor_centavos: 999999 }, // domingo anterior
    { data_pedido: '2026-07-13', valor_centavos: 888888 }, // segunda seguinte
  ];
  const b = agrupar(comForaDaSemana, 'semana', HOJE);
  const total = b.reduce((s, x) => s + x.total, 0);
  assert.equal(total, 1250000); // só os três pedidos da semana 06→12/07
});

test('semana: chaves são as datas locais dos 7 dias (seg 06/07 → dom 12/07)', () => {
  const b = agrupar(PEDIDOS, 'semana', HOJE);
  assert.deepEqual(b.map((x) => x.chave), [
    '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12',
  ]);
});

test('semana: hoje no meio da semana (quarta) usa a mesma semana ISO', () => {
  const b = agrupar(PEDIDOS, 'semana', new Date('2026-07-08T00:00:00'));
  assert.equal(b[0].chave, '2026-07-06'); // ainda ancora na segunda 06/07
  assert.equal(b.find((x) => x.label === 'dom').total, 1000000);
});

test('mes: inalterado — uma barra por mês, soma do mês', () => {
  const b = agrupar(PEDIDOS, 'mes', HOJE);
  assert.equal(b.length, 1);
  assert.equal(b[0].label, 'jul');
  assert.equal(b[0].total, 1250000);
});

test('mes: meses diferentes viram barras distintas, em ordem cronológica', () => {
  const multi = [
    { data_pedido: '2026-06-15', valor_centavos: 100000 },
    { data_pedido: '2026-07-01', valor_centavos: 200000 },
    { data_pedido: '2026-07-12', valor_centavos: 300000 },
  ];
  const b = agrupar(multi, 'mes', HOJE);
  assert.deepEqual(b.map((x) => x.label), ['jun', 'jul']);
  assert.deepEqual(b.map((x) => x.total), [100000, 500000]);
});
