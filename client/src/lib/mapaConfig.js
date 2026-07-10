// Config do mapa compartilhada entre a tela principal (MapaScreen) e o seletor
// de localização (SeletorLocalizacao) — mesma base de tiles, mesmo centro e
// mesmo teto de zoom, sem duplicar.

// Maceió/AL como centro inicial (fallback se o GPS for negado/indisponível).
export const MACEIO = { center: [-35.7089, -9.6498], zoom: 11.5 };

// Zoom máximo: os tiles padrão do OSM existem só até z19. Passar disso gera
// requisição de tile inexistente (HTTP 400). Trava dura na câmera.
export const ZOOM_MAX = 19;

// Estilo MapLibre com tiles OpenStreetMap — sem Google, sem chave de API.
// `maxzoom: 19` no source faz o MapLibre reescalar o tile de z19 em vez de
// pedir z20+ (defesa a mais além do trava-câmera).
export const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: ZOOM_MAX,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

// Bbox de Maceió pra feedback imediato no cliente (arrastar o mapa); o polígono
// fino é validado no servidor (/geo/reverse e POST /farmacias).
const BBOX = { latMin: -9.72, latMax: -9.38, lngMin: -35.8, lngMax: -35.6 };

export function dentroDaBboxMaceio(lng, lat) {
  return Number.isFinite(lng) && Number.isFinite(lat)
    && lat >= BBOX.latMin && lat <= BBOX.latMax
    && lng >= BBOX.lngMin && lng <= BBOX.lngMax;
}
