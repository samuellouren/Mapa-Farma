// Baixa o polígono do município de Maceió (Nominatim/OSM) e salva em
// src/lib/maceio-limite.json. Rodar só quando o limite municipal mudar:
//   npm run limite:atualizar
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const URL_NOMINATIM =
  'https://nominatim.openstreetmap.org/search?q=Macei%C3%B3%2C%20Alagoas%2C%20Brasil&format=json&polygon_geojson=1&limit=1';
const UA = 'MapaFarma/1.0 (apoio comercial; contato: samuel.lourenco.sls@gmail.com)';

const r = await fetch(URL_NOMINATIM, { headers: { 'User-Agent': UA } });
if (!r.ok) {
  console.error(`Nominatim respondeu ${r.status}`);
  process.exit(1);
}
const j = await r.json();
const geo = j[0]?.geojson;
if (!geo || !['Polygon', 'MultiPolygon'].includes(geo.type)) {
  console.error('Resposta do Nominatim sem polígono utilizável.');
  process.exit(1);
}
const destino = fileURLToPath(new URL('../lib/maceio-limite.json', import.meta.url));
writeFileSync(destino, JSON.stringify(geo));
console.log(`Polígono ${geo.type} salvo em ${destino}`);
