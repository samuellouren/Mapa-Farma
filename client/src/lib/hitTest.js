// Hit-test de marcador em JS, independente do hit-test nativo do MarkerView do
// MapLibre (que no Android usa posições v.x/v.y que ficam defasadas em zoom
// normal, fazendo o toque simples "não reagir"). Aqui, dado o ponto tocado
// (lng/lat, vindo do Map.onPress) e o zoom atual, achamos a farmácia mais
// próxima dentro de um raio de toque em pixels — convertido para metros pela
// resolução do Web Mercator naquele zoom/latitude.

const RAIO_TERRA = 6378137; // m (esfera do Web Mercator)

// Metros por pixel do Web Mercator em dado zoom/latitude (tiles de 256px).
export function metrosPorPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

// Distância em metros entre dois pontos (haversine).
export function distanciaMetros(aLat, aLng, bLat, bLng) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA * Math.asin(Math.sqrt(s));
}

// Farmácia mais próxima do toque dentro de `raioPx` pixels, ou null.
export function farmaciaMaisProxima(farmacias, lng, lat, zoom, raioPx = 26) {
  const raioM = raioPx * metrosPorPixel(lat, zoom);
  let melhor = null;
  let melhorD = Infinity;
  for (const f of farmacias) {
    if (f == null || f.latitude == null || f.longitude == null) continue;
    const d = distanciaMetros(lat, lng, f.latitude, f.longitude);
    if (d <= raioM && d < melhorD) {
      melhor = f;
      melhorD = d;
    }
  }
  return melhor;
}

// As `n` farmácias mais próximas de (lat,lng), ordenadas por distância, cada
// uma com `distancia_m` anexado. Ignora as sem coordenada.
export function farmaciasMaisProximas(farmacias, lat, lng, n = 5) {
  return farmacias
    .filter((f) => f && f.latitude != null && f.longitude != null)
    .map((f) => ({ ...f, distancia_m: distanciaMetros(lat, lng, f.latitude, f.longitude) }))
    .sort((a, b) => a.distancia_m - b.distancia_m)
    .slice(0, n);
}
