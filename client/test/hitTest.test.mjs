import test from 'node:test';
import assert from 'node:assert/strict';
import { farmaciaMaisProxima, metrosPorPixel, distanciaMetros } from '../src/lib/hitTest.js';

// Farmácia real de Maceió (centro).
const centro = { id: 1, nome: 'Drogaria Poço', latitude: -9.6498, longitude: -35.7089 };
const M_POR_GRAU_LAT = 111320; // metros por grau de latitude (~constante)

// Constrói um toque a `px` pixels ao norte de um ponto, no dado zoom.
function toqueAoNorte(lat, lng, px, zoom) {
  const metros = px * metrosPorPixel(lat, zoom);
  return { lat: lat + metros / M_POR_GRAU_LAT, lng };
}

test('toque exatamente no marcador seleciona a farmácia', () => {
  const r = farmaciaMaisProxima([centro], centro.longitude, centro.latitude, 16);
  assert.equal(r?.id, 1);
});

test('toque a ~15px do pino (dentro do raio de 26px) seleciona — este é o caso de zoom normal que falhava', () => {
  const t = toqueAoNorte(centro.latitude, centro.longitude, 15, 16);
  const r = farmaciaMaisProxima([centro], t.lng, t.lat, 16);
  assert.equal(r?.id, 1);
});

test('toque a ~60px do pino (fora do raio) NÃO seleciona', () => {
  const t = toqueAoNorte(centro.latitude, centro.longitude, 60, 16);
  const r = farmaciaMaisProxima([centro], t.lng, t.lat, 16);
  assert.equal(r, null);
});

test('entre duas farmácias próximas, escolhe a mais perto do toque', () => {
  const a = { id: 1, nome: 'A', latitude: -9.6498, longitude: -35.7089 };
  const b = { id: 2, nome: 'B', latitude: -9.6501, longitude: -35.7089 };
  // toque quase em cima de B
  const r = farmaciaMaisProxima([a, b], -35.7089, -9.65005, 16);
  assert.equal(r?.id, 2);
});

test('em zoom menor o raio em metros é maior (área de toque cresce ao afastar)', () => {
  assert.ok(metrosPorPixel(centro.latitude, 13) > metrosPorPixel(centro.latitude, 16));
});

test('o mesmo toque a 60px: erra em zoom 16 mas acerta em zoom 14 (raio maior)', () => {
  const t = toqueAoNorte(centro.latitude, centro.longitude, 60, 16); // 60px @ z16 em metros
  assert.equal(farmaciaMaisProxima([centro], t.lng, t.lat, 16), null);
  // a mesma distância em metros equivale a menos pixels em z14 → dentro do raio
  assert.equal(farmaciaMaisProxima([centro], t.lng, t.lat, 14)?.id, 1);
});

test('ignora farmácia sem coordenada e lista vazia', () => {
  assert.equal(farmaciaMaisProxima([{ id: 9, latitude: null, longitude: null }], -35.7089, -9.6498, 16), null);
  assert.equal(farmaciaMaisProxima([], -35.7089, -9.6498, 16), null);
});

test('sanidade: distanciaMetros ~0 no mesmo ponto e ~111km por grau de lat', () => {
  assert.ok(distanciaMetros(-9.65, -35.7, -9.65, -35.7) < 1);
  const d = distanciaMetros(-9.65, -35.7, -8.65, -35.7); // 1 grau de lat
  assert.ok(d > 110000 && d < 112000);
});
