import test from 'node:test';
import assert from 'node:assert/strict';
import { farmaciasMaisProximas } from '../src/lib/hitTest.js';

const base = { lat: -9.6498, lng: -35.7089 };
const lista = [
  { id: 1, nome: 'Longe',  latitude: -9.70, longitude: -35.75 },
  { id: 2, nome: 'Perto',  latitude: -9.6499, longitude: -35.7090 },
  { id: 3, nome: 'Médio',  latitude: -9.66, longitude: -35.72 },
  { id: 4, nome: 'SemCoord', latitude: null, longitude: null },
];

test('ordena por distância crescente e anexa distancia_m', () => {
  const r = farmaciasMaisProximas(lista, base.lat, base.lng, 5);
  assert.deepEqual(r.map((f) => f.id), [2, 3, 1]);
  assert.ok(r[0].distancia_m < r[1].distancia_m);
});

test('respeita o top N', () => {
  const r = farmaciasMaisProximas(lista, base.lat, base.lng, 2);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((f) => f.id), [2, 3]);
});

test('ignora farmácia sem coordenada', () => {
  const r = farmaciasMaisProximas(lista, base.lat, base.lng, 5);
  assert.ok(!r.some((f) => f.id === 4));
});

test('lista vazia → []', () => {
  assert.deepEqual(farmaciasMaisProximas([], base.lat, base.lng, 5), []);
});
