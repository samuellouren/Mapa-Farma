import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Banco descartável DEFINIDO antes de importar db.js (que lê TURSO_URL no import).
const DB_FILE = join(__dirname, `_test_farmacias_${process.pid}.db`);
process.env.TURSO_URL = `file:${DB_FILE}`;
process.env.JWT_SECRET = 'test-secret';

const { db, enableForeignKeys } = await import('../src/db.js');
const { farmaciasRouter } = await import('../src/routes/farmacias.js');
const { gerarToken } = await import('../src/lib/auth.js');
const express = (await import('express')).default;

const migDir = join(__dirname, '..', 'src', 'migrations');
let server, base, token, usuarioId;

async function inserirFarmacia(origem) {
  const r = await db.execute({
    sql: 'INSERT INTO farmacias (nome, latitude, longitude, origem) VALUES (?,?,?,?)',
    args: ['Farmácia Teste', -9.6498, -35.7089, origem],
  });
  return r.lastInsertRowid;
}
async function inserirVisita(farmaciaId) {
  await db.execute({
    sql: 'INSERT INTO relatorios_visita (farmacia_id, usuario_id, data_visita) VALUES (?,?,?)',
    args: [farmaciaId, usuarioId, '2026-07-10'],
  });
}
async function inserirPedido(farmaciaId) {
  await db.execute({
    sql: 'INSERT INTO pedidos (farmacia_id, usuario_id, valor_centavos, data_pedido) VALUES (?,?,?,?)',
    args: [farmaciaId, usuarioId, 1000, '2026-07-10'],
  });
}
function req(path, opts = {}) {
  return fetch(base + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
}

test.before(async () => {
  await enableForeignKeys();
  for (const arq of ['001_init.sql', '002_origem.sql']) {
    await db.executeMultiple(readFileSync(join(migDir, arq), 'utf8'));
  }
  const u = await db.execute({
    sql: "INSERT INTO usuarios (nome, email, senha_hash) VALUES ('T','t@t.com','x')",
  });
  // libsql sempre retorna lastInsertRowid como BigInt nativo (intMode:'number'
  // só converte colunas de linhas de SELECT, não o rowid do INSERT); jwt.sign
  // não serializa BigInt, então convertemos aqui — igual ao que já acontece
  // naturalmente em produção, onde o token vem de um usuario carregado via SELECT.
  usuarioId = Number(u.lastInsertRowid);
  token = gerarToken({ id: usuarioId, nome: 'T', email: 't@t.com' });
  const app = express();
  app.use(express.json());
  app.use('/farmacias', farmaciasRouter);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  await db.close();
  try { rmSync(DB_FILE); } catch { /* já removido */ }
});

test('POST grava origem=manual', async () => {
  const r = await req('/farmacias', {
    method: 'POST',
    body: JSON.stringify({ nome: 'Nova', latitude: -9.6498, longitude: -35.7089 }),
  });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).origem, 'manual');
});

test('GET detalhe traz relatorios_count e pedidos_count', async () => {
  const id = await inserirFarmacia('manual');
  await inserirVisita(id);
  const f = await (await req(`/farmacias/${id}`)).json();
  assert.equal(f.relatorios_count, 1);
  assert.equal(f.pedidos_count, 0);
});

test('PATCH nome em seed → 403', async () => {
  const id = await inserirFarmacia('seed');
  const r = await req(`/farmacias/${id}`, { method: 'PATCH', body: JSON.stringify({ nome: 'X' }) });
  assert.equal(r.status, 403);
});

test('PATCH eh_cliente em seed continua permitido → 200', async () => {
  const id = await inserirFarmacia('seed');
  const r = await req(`/farmacias/${id}`, { method: 'PATCH', body: JSON.stringify({ eh_cliente: true }) });
  assert.equal(r.status, 200);
});

test('PATCH nome em manual → 200 e persiste', async () => {
  const id = await inserirFarmacia('manual');
  const r = await req(`/farmacias/${id}`, { method: 'PATCH', body: JSON.stringify({ nome: 'Editada' }) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).nome, 'Editada');
});

test('PATCH lat/lng fora de Maceió → 400', async () => {
  const id = await inserirFarmacia('manual');
  const r = await req(`/farmacias/${id}`, { method: 'PATCH', body: JSON.stringify({ latitude: 0, longitude: 0 }) });
  assert.equal(r.status, 400);
});

test('DELETE seed → 403', async () => {
  const id = await inserirFarmacia('seed');
  const r = await req(`/farmacias/${id}`, { method: 'DELETE' });
  assert.equal(r.status, 403);
});

test('DELETE manual com pedido → 409 e não apaga', async () => {
  const id = await inserirFarmacia('manual');
  await inserirPedido(id);
  const r = await req(`/farmacias/${id}`, { method: 'DELETE' });
  assert.equal(r.status, 409);
  const ainda = await db.execute({ sql: 'SELECT 1 FROM farmacias WHERE id = ?', args: [id] });
  assert.equal(ainda.rows.length, 1);
});

test('DELETE manual só com visitas → 200 e cascata apaga visitas', async () => {
  const id = await inserirFarmacia('manual');
  await inserirVisita(id);
  const r = await req(`/farmacias/${id}`, { method: 'DELETE' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).visitas_apagadas, 1);
  const vis = await db.execute({ sql: 'SELECT 1 FROM relatorios_visita WHERE farmacia_id = ?', args: [id] });
  assert.equal(vis.rows.length, 0);
});

test('DELETE manual limpa → 200 e some', async () => {
  const id = await inserirFarmacia('manual');
  const r = await req(`/farmacias/${id}`, { method: 'DELETE' });
  assert.equal(r.status, 200);
  const ainda = await db.execute({ sql: 'SELECT 1 FROM farmacias WHERE id = ?', args: [id] });
  assert.equal(ainda.rows.length, 0);
});
