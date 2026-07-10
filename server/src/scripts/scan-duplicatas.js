import 'dotenv/config';
import { db } from '../db.js';

// Varredura READ-ONLY de possíveis farmácias duplicadas. Não altera nada.
// Reaproveita EXATAMENTE a lógica de dedup do seed CNES (normNome + haversine
// + nomesBatem, raio 150m) para ser consistente com como a base foi montada.

const RAIO_METROS = 150;

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

function normNome(s) {
  return semAcento(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(farmacia|farmacias|drogaria|drogarias|drogas|droga|ltda|me|epp|eireli|comercio|com|de|da|do|dos|das|e)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

const farmacias = (await db.execute('SELECT id, nome, bairro, latitude, longitude FROM farmacias ORDER BY id')).rows;

// Histórico vinculado (importa pra decidir qual manter).
const visitas = (await db.execute('SELECT farmacia_id, COUNT(*) AS n FROM relatorios_visita GROUP BY farmacia_id')).rows;
const pedidos = (await db.execute('SELECT farmacia_id, COUNT(*) AS n FROM pedidos GROUP BY farmacia_id')).rows;
const nVisitas = new Map(visitas.map((r) => [r.farmacia_id, r.n]));
const nPedidos = new Map(pedidos.map((r) => [r.farmacia_id, r.n]));

const hist = (id) => `${nVisitas.get(id) || 0}v/${nPedidos.get(id) || 0}p`;
const temCoord = (f) => f.latitude != null && f.longitude != null;

const paresNomeCoord = []; // A: nome bate + ≤150m
const paresProximidade = []; // B: ≤150m mas nome NÃO bate
const paresNomeSemCoord = []; // C: nome normalizado idêntico, sem coord p/ medir

for (let i = 0; i < farmacias.length; i++) {
  for (let j = i + 1; j < farmacias.length; j++) {
    const a = farmacias[i];
    const b = farmacias[j];
    const nomeBate = nomesBatem(a.nome, b.nome);

    if (temCoord(a) && temCoord(b)) {
      const d = haversine(a.latitude, a.longitude, b.latitude, b.longitude);
      if (d <= RAIO_METROS) {
        (nomeBate ? paresNomeCoord : paresProximidade).push({ a, b, d });
      }
    } else if (nomeBate && normNome(a.nome) === normNome(b.nome)) {
      // Sem as duas coordenadas não dá pra medir distância; sinaliza só se o
      // nome normalizado for idêntico (candidato mais forte).
      paresNomeSemCoord.push({ a, b, d: null });
    }
  }
}

function imprimir(titulo, pares) {
  console.log(`\n===== ${titulo} (${pares.length}) =====`);
  if (pares.length === 0) { console.log('(nenhum)'); return; }
  pares.sort((x, y) => (x.d ?? 1e9) - (y.d ?? 1e9));
  for (const { a, b, d } of pares) {
    const dist = d == null ? 'sem coord' : `${d.toFixed(0)}m`;
    console.log(`  • ${dist}`);
    console.log(`      [${a.id}] ${a.nome}  — bairro: ${a.bairro || '—'}  — hist: ${hist(a.id)}`);
    console.log(`      [${b.id}] ${b.nome}  — bairro: ${b.bairro || '—'}  — hist: ${hist(b.id)}`);
  }
}

console.log(`Total de farmácias no banco: ${farmacias.length}`);
console.log(`Sem coordenada: ${farmacias.filter((f) => !temCoord(f)).length}`);
console.log('Legenda hist: Nv/Mp = N relatórios de visita / M pedidos vinculados');

imprimir('A) MESMO NOME (normalizado) + ≤150m — candidatas fortes a duplicata', paresNomeCoord);
imprimir('B) ≤150m com NOMES DIFERENTES — verificar (pode ser mesma unidade em 2 fontes, ou vizinhas legítimas)', paresProximidade);
imprimir('C) NOME normalizado IDÊNTICO mas sem coordenada p/ medir distância', paresNomeSemCoord);
