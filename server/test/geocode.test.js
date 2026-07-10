import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairEndereco, formatarResultadoBusca } from '../src/lib/geocode.js';

// Formato real do reverse do Nominatim: { address: { road, house_number,
// suburb, neighbourhood, city_district, ... } }.

test('endereço completo: road + house_number, bairro do suburb', () => {
  const j = { address: { road: 'Avenida Fernandes Lima', house_number: '452', suburb: 'Farol' } };
  assert.deepEqual(extrairEndereco(j), { endereco: 'Avenida Fernandes Lima, 452', bairro: 'Farol' });
});

test('sem house_number: endereço só com a rua', () => {
  const j = { address: { road: 'Rua do Sol', suburb: 'Centro' } };
  assert.deepEqual(extrairEndereco(j), { endereco: 'Rua do Sol', bairro: 'Centro' });
});

test('sem road: endereço null (não inventa)', () => {
  const j = { address: { house_number: '10', suburb: 'Farol' } };
  assert.deepEqual(extrairEndereco(j), { endereco: null, bairro: 'Farol' });
});

test('bairro cai pra neighbourhood, depois city_district', () => {
  assert.equal(extrairEndereco({ address: { neighbourhood: 'Jatiúca' } }).bairro, 'Jatiúca');
  assert.equal(extrairEndereco({ address: { city_district: 'Tabuleiro' } }).bairro, 'Tabuleiro');
  assert.equal(extrairEndereco({ address: { suburb: 'Farol', neighbourhood: 'X' } }).bairro, 'Farol');
});

test('sem address / entrada nula → tudo null (não quebra)', () => {
  assert.deepEqual(extrairEndereco({}), { endereco: null, bairro: null });
  assert.deepEqual(extrairEndereco(null), { endereco: null, bairro: null });
  assert.deepEqual(extrairEndereco(undefined), { endereco: null, bairro: null });
});

test('espaços em branco viram null, não string vazia', () => {
  assert.deepEqual(extrairEndereco({ address: { road: '   ', suburb: '  ' } }), { endereco: null, bairro: null });
});

// --- busca (forward geocoding) ---

test('busca: item do Nominatim vira {label, latitude, longitude, endereco, bairro}', () => {
  const item = {
    lat: '-9.6633', lon: '-35.7351',
    display_name: 'Rua Melo Moraes, Poço, Maceió, Alagoas, Brasil',
    address: { road: 'Rua Melo Moraes', house_number: '10', suburb: 'Poço' },
  };
  assert.deepEqual(formatarResultadoBusca(item), {
    label: 'Rua Melo Moraes, 10 · Poço',
    latitude: -9.6633,
    longitude: -35.7351,
    endereco: 'Rua Melo Moraes, 10',
    bairro: 'Poço',
    preciso: true,
  });
});

test('busca: sem house_number → preciso false (só rua, cliente pede ajuste)', () => {
  const item = {
    lat: '-9.66', lon: '-35.73',
    display_name: 'Rua do Sol, Centro, Maceió',
    address: { road: 'Rua do Sol', suburb: 'Centro' },
  };
  const r = formatarResultadoBusca(item);
  assert.equal(r.preciso, false);
  assert.equal(r.endereco, 'Rua do Sol');
});

test('busca: sem address usa o começo do display_name como label', () => {
  const item = { lat: '-9.66', lon: '-35.73', display_name: 'Shopping Pátio, Avenida X, Maceió, Brasil' };
  const r = formatarResultadoBusca(item);
  assert.equal(r.label, 'Shopping Pátio, Avenida X');
  assert.equal(r.endereco, null);
  assert.equal(r.bairro, null);
  assert.equal(r.preciso, false);
});

test('busca: lat/lon inválidos → latitude/longitude null (rota descarta)', () => {
  const r = formatarResultadoBusca({ lat: 'x', lon: undefined, display_name: 'Y' });
  assert.equal(r.latitude, null);
  assert.equal(r.longitude, null);
});
