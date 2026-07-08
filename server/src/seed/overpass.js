import 'dotenv/config';
import { db, enableForeignKeys } from '../db.js';

// Carga inicial das farmácias de Maceió a partir do OpenStreetMap (Overpass).
// Roda UMA vez para popular o banco; o app nunca consulta o Overpass em runtime.
// Uso: `npm run seed` (ou `node src/seed/overpass.js --force` para reimportar).

const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const forcar = process.argv.includes('--force');
const resetar = process.argv.includes('--reset');

const query = `
[out:json][timeout:90];
area["name"="Maceió"]["boundary"="administrative"]->.a;
(
  node["amenity"="pharmacy"](area.a);
  way["amenity"="pharmacy"](area.a);
  relation["amenity"="pharmacy"](area.a);
);
out center tags;
`;

await enableForeignKeys();

if (resetar) {
  // ON DELETE CASCADE remove relatórios e pedidos junto; usuários ficam.
  await db.execute('DELETE FROM farmacias');
  console.log('Farmácias (e relatórios/pedidos por cascata) apagados antes de reimportar.');
}

const cont = await db.execute('SELECT COUNT(*) AS n FROM farmacias');
if (cont.rows[0].n > 0 && !forcar) {
  console.log(`Já existem ${cont.rows[0].n} farmácias no banco. Use --reset (limpa) ou --force (adiciona).`);
  process.exit(0);
}

console.log('Consultando Overpass API…');
const resp = await fetch(OVERPASS, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    // Overpass rejeita (406/429) requisições sem User-Agent identificável.
    'User-Agent': 'MapaFarma/1.0 (apoio comercial; contato: samuel.lourenco.sls@gmail.com)',
    'Accept': 'application/json',
  },
  body: 'data=' + encodeURIComponent(query),
});
if (!resp.ok) {
  console.error('Overpass falhou:', resp.status, (await resp.text()).slice(0, 300));
  process.exit(1);
}
const dados = await resp.json();
const elementos = dados.elements || [];
console.log(`Overpass retornou ${elementos.length} elementos.`);

let inseridas = 0;
let semCoord = 0;
for (const el of elementos) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) { semCoord++; continue; }

  const t = el.tags || {};
  const nome = t.name || t['name:pt'] || 'Farmácia sem nome';
  const endereco = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ') || null;
  const bairro = t['addr:suburb'] || t['addr:neighbourhood'] || t['addr:district'] || null;

  await db.execute({
    sql: 'INSERT INTO farmacias (nome, endereco, bairro, latitude, longitude) VALUES (?,?,?,?,?)',
    args: [nome, endereco, bairro, lat, lon],
  });
  inseridas++;
}

console.log(`Importadas ${inseridas} farmácias (${semCoord} sem coordenada, ignoradas).`);
process.exit(0);
