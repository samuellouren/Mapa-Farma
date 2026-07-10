import 'dotenv/config';
import { db, enableForeignKeys } from '../db.js';
import { dentroDeMaceio } from '../lib/limite-maceio.js';

// Seed complementar: farmácias de Maceió do CNES (DataSUS), via API pública
// de Dados Abertos (DEMAS) — gratuita, sem chave, sem cartão.
//   Endpoint: /cnes/estabelecimentos?codigo_municipio=270430&codigo_tipo_unidade=43
//   270430 = Maceió/AL (código CNES 6 dígitos) · 43 = FARMACIA
//
// Filtros aplicados na importação:
//  - INSTITUCIONAIS: CEAF, farmácia de acolhimento, hospital, etc. são
//    unidades públicas de dispensação, não drogarias comerciais → descartadas.
//  - FORA DE MACEIÓ: alguns registros do CNES têm lat/lng errados (caem em
//    Rio Largo, na lagoa, etc.). Um teste point-in-polygon contra o limite
//    real do município descarta coordenadas fora de Maceió.
//
// Dedup com o que já existe (Overpass): mesma farmácia a ≤150m com nome
// compatível → enriquece campos vazios; senão insere nova.
//
// Uso: `npm run seed:cnes`  ·  `node src/seed/cnes.js --dry` (só simula)

const API = process.env.CNES_API || 'https://apidadosabertos.saude.gov.br/cnes/estabelecimentos';
const MUNICIPIO = 270430;
const TIPO_FARMACIA = 43;
const RAIO_METROS = 150;
const UA = 'MapaFarma/1.0 (apoio comercial; contato: samuel.lourenco.sls@gmail.com)';
const dry = process.argv.includes('--dry');

// Padrões de nome que indicam unidade pública/institucional (não comercial).
const PADROES_INSTITUCIONAIS = [
  'central de abastecimento', 'ceaf', 'acolhimento', 'secretaria', 'hospital',
  'maternidade', 'sesau', 'alto custo', 'posto de saude', 'unidade basica',
  ' ubs ', 'popular do brasil', 'farmacia municipal', 'farmacia estadual',
  'farmacia do estado', 'universitario',
];

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

function ehInstitucional(nome) {
  const n = ' ' + semAcento(nome).toLowerCase() + ' ';
  return PADROES_INSTITUCIONAIS.some((p) => n.includes(p));
}

function normNome(s) {
  return semAcento(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(farmacia|farmacias|drogaria|drogarias|drogas|droga|ltda|me|epp|eireli|comercio|com|de|da|do|dos|das|e)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const titulo = (s) => String(s || '').toLowerCase().replace(/(^|[\s/])([\p{L}])/gu, (m) => m.toUpperCase());

function haversine(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nomesBatem(a, b) {
  const na = normNome(a);
  const nb = normNome(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const tb = new Set(nb.split(' '));
  return na.split(' ').some((t) => t.length >= 3 && tb.has(t));
}

async function buscarCnes() {
  let offset = 0;
  let todas = [];
  let pagina;
  do {
    const url = `${API}?codigo_municipio=${MUNICIPIO}&codigo_tipo_unidade=${TIPO_FARMACIA}&limit=20&offset=${offset}`;
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`CNES API respondeu ${r.status}`);
    const j = await r.json();
    pagina = j.estabelecimentos || [];
    todas = todas.concat(pagina);
    offset += 20;
  } while (pagina.length === 20 && offset < 2000);
  return todas;
}

await enableForeignKeys();

const cnes = await buscarCnes();
console.log(`CNES retornou ${cnes.length} farmácias em Maceió.`);

const existentes = (await db.execute('SELECT * FROM farmacias')).rows;

let novas = 0;
let enriquecidas = 0;
let duplicadas = 0;
let semCoord = 0;
let institucionais = 0;
let foraDeMaceio = 0;

for (const c of cnes) {
  const nomeCru = c.nome_fantasia || c.nome_razao_social || 'Farmácia sem nome';
  if (ehInstitucional(nomeCru)) { institucionais++; continue; }

  const lat = c.latitude_estabelecimento_decimo_grau;
  const lon = c.longitude_estabelecimento_decimo_grau;
  if (lat == null || lon == null) { semCoord++; continue; }
  if (!dentroDeMaceio(lon, lat)) { foraDeMaceio++; continue; }

  const nome = titulo(nomeCru);
  const numero = c.numero_estabelecimento && c.numero_estabelecimento !== 'S/N' ? c.numero_estabelecimento : null;
  const endereco = [c.endereco_estabelecimento, numero].filter(Boolean).join(', ') || null;
  const bairro = c.bairro_estabelecimento ? titulo(c.bairro_estabelecimento) : null;

  let melhor = null;
  let melhorDist = Infinity;
  for (const e of existentes) {
    if (e.latitude == null || e.longitude == null) continue;
    const d = haversine(lat, lon, e.latitude, e.longitude);
    if (d <= RAIO_METROS && (d < 40 || nomesBatem(nome, e.nome)) && d < melhorDist) {
      melhor = e;
      melhorDist = d;
    }
  }

  if (melhor) {
    const campos = [];
    const args = [];
    if (!melhor.endereco && endereco) { campos.push('endereco = ?'); args.push(endereco); melhor.endereco = endereco; }
    if (!melhor.bairro && bairro) { campos.push('bairro = ?'); args.push(bairro); melhor.bairro = bairro; }
    if (campos.length) {
      enriquecidas++;
      if (!dry) { args.push(melhor.id); await db.execute({ sql: `UPDATE farmacias SET ${campos.join(', ')} WHERE id = ?`, args }); }
    } else {
      duplicadas++;
    }
  } else {
    novas++;
    let novoId = -1;
    if (!dry) {
      const ins = await db.execute({
        sql: 'INSERT INTO farmacias (nome, endereco, bairro, latitude, longitude, origem) VALUES (?,?,?,?,?, \'seed\')',
        args: [nome, endereco, bairro, lat, lon],
      });
      novoId = ins.lastInsertRowid;
    }
    existentes.push({ id: novoId, nome, endereco, bairro, latitude: lat, longitude: lon });
  }
}

console.log(
  `${dry ? '[DRY-RUN] ' : ''}${novas} novas · ${enriquecidas} enriquecidas · ${duplicadas} já existiam` +
  ` | descartadas: ${institucionais} institucionais, ${foraDeMaceio} fora de Maceió, ${semCoord} sem coordenada`
);
const total = (await db.execute('SELECT COUNT(*) AS n FROM farmacias')).rows[0].n;
console.log(`Total de farmácias no banco ${dry ? '(inalterado no dry-run)' : 'agora'}: ${total}`);
await db.close();
