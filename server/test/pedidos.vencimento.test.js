import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `_test_ped_venc_${process.pid}.db`);
process.env.TURSO_URL = `file:${DB_FILE}`;
process.env.JWT_SECRET = 'test-secret';

const { db, enableForeignKeys } = await import('../src/db.js');
const { pedidosRouter } = await import('../src/routes/pedidos.js');
const { gerarToken } = await import('../src/lib/auth.js');
const express = (await import('express')).default;

const migDir = join(__dirname, '..', 'src', 'migrations');
let server, base, token, usuarioId, farmaciaId;

function req(path, opts = {}) {
  return fetch(base + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
}

test.before(async () => {
  await enableForeignKeys();
  for (const arq of ['001_init.sql', '002_origem.sql', '003_notificacoes.sql']) {
    await db.executeMultiple(readFileSync(join(migDir, arq), 'utf8'));
  }
  const u = await db.execute("INSERT INTO usuarios (nome, email, senha_hash) VALUES ('T','t@t.com','x')");
  usuarioId = Number(u.lastInsertRowid);
  token = gerarToken({ id: usuarioId, nome: 'T', email: 't@t.com' });
  const f = await db.execute("INSERT INTO farmacias (nome, latitude, longitude) VALUES ('F',-9.65,-35.71)");
  farmaciaId = Number(f.lastInsertRowid);

  const app = express();
  app.use(express.json());
  app.use('/pedidos', pedidosRouter);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server?.close(); await db.close(); try { rmSync(DB_FILE); } catch { /* ok */ } });

test('POST aceita data_vencimento e GET retorna', async () => {
  const r = await req('/pedidos', { method: 'POST', body: JSON.stringify({
    farmacia_id: farmaciaId, valor_centavos: 1000, data_vencimento: '2026-08-01',
  }) });
  const p = await r.json();
  assert.equal(p.data_vencimento, '2026-08-01');
});

test('POST sem data_vencimento grava null', async () => {
  const r = await req('/pedidos', { method: 'POST', body: JSON.stringify({ farmacia_id: farmaciaId, valor_centavos: 1000 }) });
  const p = await r.json();
  assert.equal(p.data_vencimento, null);
});

test('POST com data_vencimento inválida → 400', async () => {
  const r = await req('/pedidos', { method: 'POST', body: JSON.stringify({ farmacia_id: farmaciaId, valor_centavos: 1000, data_vencimento: '01/08/2026' }) });
  assert.equal(r.status, 400);
});

test('PATCH atualiza data_vencimento (inclusive limpando p/ null)', async () => {
  const criado = await (await req('/pedidos', { method: 'POST', body: JSON.stringify({ farmacia_id: farmaciaId, valor_centavos: 1000, data_vencimento: '2026-08-01' }) })).json();
  const upd = await (await req(`/pedidos/${criado.id}`, { method: 'PATCH', body: JSON.stringify({ data_vencimento: null }) })).json();
  assert.equal(upd.data_vencimento, null);
});
