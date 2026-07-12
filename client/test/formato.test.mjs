import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatarNomeFarmacia, formatarNomeFarmaciaCompacto, formatarEnderecoFarmacia, centavosParaInput,
  dataVencimentoDe,
} from '../src/lib/formato.js';

test('regra 1: nome + bairro + endereço → mostra os três', () => {
  const f = { nome: 'Pague Menos', bairro: 'Ponta Verde', endereco: 'Av. Fernandes Lima' };
  assert.equal(formatarNomeFarmacia(f), 'Pague Menos · Ponta Verde · Av. Fernandes Lima');
});

test('regra 2: sem bairro → junta só o que tem, sem separador sobrando', () => {
  const f = { nome: 'Drogasil', bairro: '', endereco: 'Rua do Sol' };
  assert.equal(formatarNomeFarmacia(f), 'Drogasil · Rua do Sol');
});

test('regra 2: sem endereço → junta só nome + bairro', () => {
  const f = { nome: 'Drogasil', bairro: 'Farol', endereco: null };
  assert.equal(formatarNomeFarmacia(f), 'Drogasil · Farol');
});

test('regra 3: só o nome → mostra só o nome, sem "undefined"', () => {
  assert.equal(formatarNomeFarmacia({ nome: 'Pague Menos' }), 'Pague Menos');
  assert.equal(formatarNomeFarmacia({ nome: 'Pague Menos', bairro: undefined, endereco: undefined }), 'Pague Menos');
});

test('espaços em branco no dado do seed não viram parte visível', () => {
  const f = { nome: 'Farmácia X', bairro: '   ', endereco: '' };
  assert.equal(formatarNomeFarmacia(f), 'Farmácia X');
});

test('farmácia nula/indefinida → string vazia (não quebra a lista)', () => {
  assert.equal(formatarNomeFarmacia(null), '');
  assert.equal(formatarNomeFarmacia(undefined), '');
});

test('compacto: nome + bairro, ignorando a rua (lista de estatística)', () => {
  const f = { nome: 'Pague Menos', bairro: 'Ponta Verde', endereco: 'Av. Fernandes Lima' };
  assert.equal(formatarNomeFarmaciaCompacto(f), 'Pague Menos · Ponta Verde');
});

test('compacto: sem bairro → só o nome', () => {
  assert.equal(formatarNomeFarmaciaCompacto({ nome: 'Drogasil', endereco: 'Rua do Sol' }), 'Drogasil');
  assert.equal(formatarNomeFarmaciaCompacto(null), '');
});

test('endereço: bairro + rua, sem o nome (header da Ficha)', () => {
  const f = { nome: 'Drogaria Poço', bairro: 'Poço', endereco: 'R. Melo Moraes' };
  assert.equal(formatarEnderecoFarmacia(f), 'Poço · R. Melo Moraes');
});

test('endereço: só bairro, ou só rua, ou nada', () => {
  assert.equal(formatarEnderecoFarmacia({ nome: 'X', bairro: 'Farol' }), 'Farol');
  assert.equal(formatarEnderecoFarmacia({ nome: 'X', endereco: 'Rua Y' }), 'Rua Y');
  assert.equal(formatarEnderecoFarmacia({ nome: 'X' }), '');
  assert.equal(formatarEnderecoFarmacia(null), '');
});

test('centavosParaInput: centavos → string com vírgula decimal, sem milhar', () => {
  assert.equal(centavosParaInput(123456), '1234,56');
  assert.equal(centavosParaInput(100), '1,00');
  assert.equal(centavosParaInput(5), '0,05');
  assert.equal(centavosParaInput(0), '0,00');
});

test('centavosParaInput: round-trip com o parser do sheet', () => {
  // parser equivalente ao centavosDe do NovoPedidoSheet
  const centavosDe = (texto) => {
    let s = String(texto).replace(/[^\d.,]/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  };
  for (const c of [1, 5, 100, 999, 123456, 1000000]) {
    assert.equal(centavosDe(centavosParaInput(c)), c);
  }
});

test('dataVencimentoDe: dd/mm/aaaa → YYYY-MM-DD', () => {
  assert.equal(dataVencimentoDe('01/08/2026'), '2026-08-01');
});
test('dataVencimentoDe: aceita já-ISO', () => {
  assert.equal(dataVencimentoDe('2026-08-01'), '2026-08-01');
});
test('dataVencimentoDe: vazio → null (opcional)', () => {
  assert.equal(dataVencimentoDe(''), null);
  assert.equal(dataVencimentoDe('  '), null);
});
test('dataVencimentoDe: incompleto/ inválido → null', () => {
  assert.equal(dataVencimentoDe('01/08'), null);
  assert.equal(dataVencimentoDe('32/01/2026'), null);
});
