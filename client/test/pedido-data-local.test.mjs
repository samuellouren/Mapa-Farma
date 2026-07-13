// Regressão do bug de fuso (achado testando o APK de produção): um pedido criado
// à noite no Brasil (UTC-3) era gravado com data_pedido em UTC — o "dia seguinte" —
// e sumia do gráfico "Vendas em R$" (modo Semana), mesmo contando no total geral.
// Ver docs/superpowers: causa raiz = escrita UTC vs leitura local.
process.env.TZ = 'America/Maceio'; // simula o fuso do dispositivo do vendedor
import test from 'node:test';
import assert from 'node:assert/strict';
import { dataLocalYMD } from '../src/lib/formato.js';
import { agrupar } from '../src/lib/grafico.js';

test('dataLocalYMD usa a data LOCAL do aparelho, não a UTC', () => {
  // Domingo 12/07 22:15 em Maceió = Segunda 13/07 01:15 UTC (criado_em real do bug).
  const instante = new Date('2026-07-13T01:15:08Z');
  assert.equal(dataLocalYMD(instante), '2026-07-12');                  // local (correto)
  assert.notEqual(instante.toISOString().slice(0, 10), '2026-07-12');  // UTC daria 13/07 (bug antigo)
  assert.match(dataLocalYMD(), /^\d{4}-\d{2}-\d{2}$/);                 // sem argumento: instante atual
});

test('semana: pedido do dia local aparece no gráfico (o que o bug zerava)', () => {
  const hoje = new Date('2026-07-12T18:00:00'); // domingo local, semana ISO 06→12/07

  // Com o fix: data_pedido = data LOCAL (12/07) → soma no bucket de domingo.
  const local = [{ data_pedido: '2026-07-12', valor_centavos: 240000 }];
  assert.equal(agrupar(local, 'semana', hoje).find((b) => b.label === 'dom').total, 240000);

  // Documenta o bug antigo: com a data UTC (13/07) o pedido cai na semana seguinte,
  // some do gráfico da semana corrente (todas as barras zeradas).
  const utc = [{ data_pedido: '2026-07-13', valor_centavos: 240000 }];
  assert.equal(agrupar(utc, 'semana', hoje).reduce((s, b) => s + b.total, 0), 0);
});
