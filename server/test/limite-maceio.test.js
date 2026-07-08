import test from 'node:test';
import assert from 'node:assert/strict';
import { dentroDeMaceio } from '../src/lib/limite-maceio.js';

// Pontos reais do saneamento de 2026-07-08 (ver spec de adicionar farmácia).
test('centro de Maceió está dentro', () => {
  assert.equal(dentroDeMaceio(-35.7089, -9.6498), true);
});

test('Benedito Bentes (extremo norte, pegadinha da bbox) está dentro', () => {
  assert.equal(dentroDeMaceio(-35.7298841, -9.5552054), true);
});

test('Lagoa Mundaú está fora (bbox aceitaria)', () => {
  assert.equal(dentroDeMaceio(-35.7881228, -9.6241022), false);
});

test('Rio Largo está fora', () => {
  assert.equal(dentroDeMaceio(-35.9452453, -9.6071743), false);
});

test('litoral norte (90km) está fora', () => {
  assert.equal(dentroDeMaceio(-35.2170054, -9.0077239), false);
});

test('entrada não numérica retorna false', () => {
  assert.equal(dentroDeMaceio('a', null), false);
  assert.equal(dentroDeMaceio(NaN, -9.6), false);
  assert.equal(dentroDeMaceio(undefined, undefined), false);
});
