import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `_test_stats_nv_${process.pid}.db`);
process.env.TURSO_URL = `file:${DB_FILE}`;
process.env.JWT_SECRET = 'test-secret';

const { db, enableForeignKeys } = await import('../src/db.js');
const { statsRouter } = await import('../src/routes/stats.js');
const { gerarToken } = await import('../src/lib/auth.js');
const express = (await import('express')).default;

const migDir = join(__dirname, '..', 'src', 'migrations');
let server, base, token, usuarioId;

function req(path) { return fetch(base + path, { headers: { Authorization: `Bearer ${token}` } }); }
async function farmacia(nome, lat, lng) {
  const r = await db.execute({ sql: "INSERT INTO farmacias (nome, latitude, longitude) VALUES (?,?,?)", args: [nome, lat, lng] });
  return Number(r.lastInsertRowid);
}
async function visita(farmaciaId, data) {
  await db.execute({ sql: "INSERT INTO relatorios_visita (farmacia_id, usuario_id, data_visita) VALUES (?,?,?)", args: [farmaciaId, usuarioId, data] });
}

test.before(async () => {
  await enableForeignKeys();
  for (const arq of ['001_init.sql', '002_origem.sql', '003_notificacoes.sql']) {
    await db.executeMultiple(readFileSync(join(migDir, arq), 'utf8'));
  }
  const u = await db.execute("INSERT INTO usuarios (nome, email, senha_hash) VALUES ('T','t@t.com','x')");
  usuarioId = Number(u.lastInsertRowid);
  token = gerarToken({ id: usuarioId, nome: 'T', email: 't@t.com' });

  const visitada = await farmacia('Visitada', -9.65, -35.71);
  await visita(visitada, '2026-01-01');            // visitada há muito tempo
  await farmacia('Nunca A', -9.66, -35.72);         // nunca visitada, com coord
  await farmacia('Nunca B', -9.67, -35.73);         // nunca visitada, com coord
  await db.execute("INSERT INTO farmacias (nome, latitude, longitude) VALUES ('SemCoord', NULL, NULL)"); // fora

  const app = express();
  app.use(express.json());
  app.use('/stats', statsRouter);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server?.close(); await db.close(); try { rmSync(DB_FILE); } catch { /* ok */ } });

test('nunca_visitadas: só sem relatório E com coordenada', async () => {
  const s = await (await req('/stats?periodo=30')).json();
  const nomes = s.nunca_visitadas.map((f) => f.nome).sort();
  assert.deepEqual(nomes, ['Nunca A', 'Nunca B']);
  assert.ok(s.nunca_visitadas.every((f) => f.latitude != null && f.longitude != null));
});

test('sem_visita_ha_mais_tempo exclui nunca-visitadas', async () => {
  const s = await (await req('/stats?periodo=30')).json();
  const nomes = s.sem_visita_ha_mais_tempo.map((f) => f.nome);
  assert.ok(nomes.includes('Visitada'));
  assert.ok(!nomes.includes('Nunca A') && !nomes.includes('Nunca B'));
});
