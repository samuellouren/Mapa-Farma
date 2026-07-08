// Limite geográfico do município de Maceió (point-in-polygon por ray
// casting). O polígono vem de src/lib/maceio-limite.json (gerado por
// `npm run limite:atualizar`); se o arquivo faltar, cai numa bounding box
// aproximada (menos precisa perto da lagoa e das bordas).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BBOX = { latMin: -9.72, latMax: -9.38, lngMin: -35.80, lngMax: -35.60 };

function pontoNoAnel(lng, lat, anel) {
  let dentro = false;
  for (let i = 0, k = anel.length - 1; i < anel.length; k = i++) {
    const xi = anel[i][0], yi = anel[i][1], xj = anel[k][0], yj = anel[k][1];
    const cruza = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function carregarPoligonos() {
  try {
    const caminho = fileURLToPath(new URL('./maceio-limite.json', import.meta.url));
    const geo = JSON.parse(readFileSync(caminho, 'utf8'));
    const polis = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates;
    if (!Array.isArray(polis) || !polis.length) throw new Error('geojson vazio');
    return polis;
  } catch {
    console.warn('maceio-limite.json indisponível — usando bounding box de Maceió como fallback.');
    return null;
  }
}

const poligonos = carregarPoligonos();

export function dentroDeMaceio(lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  if (!poligonos) {
    return lat <= BBOX.latMax && lat >= BBOX.latMin && lng <= BBOX.lngMax && lng >= BBOX.lngMin;
  }
  return poligonos.some((poly) => pontoNoAnel(lng, lat, poly[0]));
}
