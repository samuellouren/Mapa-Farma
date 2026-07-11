import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_FILE = join(__dirname, `_test_pedidos_${process.pid}.db`);
process.env.TURSO_URL = `file:${DB_FILE}`;
process.env.JWT_SECRET = 'test-secret';

const { db, enableForeignKeys } = await import('../src/db.js');
const { pedidosRouter } = await import('../src/routes/pedidos.js');
const { gerarToken } = await import('../src/lib/auth.js');
const express = (await import('express')).default;

const migDir = join(__dirname, '..', 'src', 'migrations');
let server, base, token, usuarioId, farmA, farmB;

async function inserirPedido({ farmacia_id, valor = 1000, status = 'pago', data = '2026-01-01' }) {
  const r = await db.execute({
    sql: 'INSERT INTO pedidos (farmacia_id, usuario_id, valor_centavos, status_pagamento, data_pedido) VALUES (?,?,?,?,?)',
    args: [farmacia_id, usuarioId, valor, status, data],
  });
  return r.lastInsertRowid;
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
  const u = await db.execute({ sql: "INSERT INTO usuarios (nome, email, senha_hash) VALUES ('T','t@t.com','x')" });
  usuarioId = Number(u.lastInsertRowid);
  const a = await db.execute({ sql: "INSERT INTO farmacias (nome, latitude, longitude) VALUES ('Farmácia A', -9.6498, -35.7089)" });
  const b = await db.execute({ sql: "INSERT INTO farmacias (nome, latitude, longitude) VALUES ('Farmácia B', -9.6498, -35.7089)" });
  farmA = Number(a.lastInsertRowid);
  farmB = Number(b.lastInsertRowid);
  token = gerarToken({ id: usuarioId, nome: 'T', email: 't@t.com' });
  const app = express();
  app.use(express.json());
  app.use('/pedidos', pedidosRouter);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  await db.close();
  try { rmSync(DB_FILE); } catch { /* já removido */ }
});

test('PATCH valor_centavos → 200, atualiza e NÃO muda data_pedido', async () => {
  const id = await inserirPedido({ farmacia_id: farmA, valor: 1000, data: '2026-01-01' });
  const r = await req(`/pedidos/${id}`, { method: 'PATCH', body: JSON.stringify({ valor_centavos: 2550 }) });
  assert.equal(r.status, 200);
  const p = await r.json();
  assert.equal(p.valor_centavos, 2550);
  assert.equal(String(p.data_pedido).slice(0, 10), '2026-01-01');
});

test('PATCH farmacia_id válido → 200 e reflete no join', async () => {
  const id = await inserirPedido({ farmacia_id: farmA });
  const r = await req(`/pedidos/${id}`, { method: 'PATCH', body: JSON.stringify({ farmacia_id: farmB }) });
  assert.equal(r.status, 200);
  const p = await r.json();
  assert.equal(p.farmacia_id, farmB);
  assert.equal(p.farmacia_nome, 'Farmácia B');
});

test('PATCH farmacia_id inexistente → 404', async () => {
  const id = await inserirPedido({ farmacia_id: farmA });
  const r = await req(`/pedidos/${id}`, { method: 'PATCH', body: JSON.stringify({ farmacia_id: 999999 }) });
  assert.equal(r.status, 404);
});

test('PATCH valor_centavos <= 0 → 400', async () => {
  const id = await inserirPedido({ farmacia_id: farmA });
  const r = await req(`/pedidos/${id}`, { method: 'PATCH', body: JSON.stringify({ valor_centavos: 0 }) });
  assert.equal(r.status, 400);
});

test('PATCH status inválido → 400', async () => {
  const id = await inserirPedido({ farmacia_id: farmA });
  const r = await req(`/pedidos/${id}`, { method: 'PATCH', body: JSON.stringify({ status_pagamento: 'xpto' }) });
  assert.equal(r.status, 400);
});

test('PATCH corpo vazio → 400', async () => {
  const id = await inserirPedido({ farmacia_id: farmA });
  const r = await req(`/pedidos/${id}`, { method: 'PATCH', body: JSON.stringify({}) });
  assert.equal(r.status, 400);
});

test('DELETE → 200 e some', async () => {
  const id = await inserirPedido({ farmacia_id: farmA });
  const r = await req(`/pedidos/${id}`, { method: 'DELETE' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  const ainda = await db.execute({ sql: 'SELECT 1 FROM pedidos WHERE id = ?', args: [id] });
  assert.equal(ainda.rows.length, 0);
});

test('DELETE inexistente → 404', async () => {
  const r = await req('/pedidos/999999', { method: 'DELETE' });
  assert.equal(r.status, 404);
});

test('PATCH status-only → 200, atualiza status e mantém valor', async () => {
  const id = await inserirPedido({ farmacia_id: farmA, valor: 1000, status: 'pago' });
  const r = await req(`/pedidos/${id}`, { method: 'PATCH', body: JSON.stringify({ status_pagamento: 'atrasado' }) });
  assert.equal(r.status, 200);
  const p = await r.json();
  assert.equal(p.status_pagamento, 'atrasado');
  assert.equal(p.valor_centavos, 1000);
});

test('PATCH multi-campo → 200, atualiza valor e status', async () => {
  const id = await inserirPedido({ farmacia_id: farmA, valor: 1000, status: 'pago' });
  const r = await req(`/pedidos/${id}`, { method: 'PATCH', body: JSON.stringify({ valor_centavos: 7777, status_pagamento: 'nao_pago' }) });
  assert.equal(r.status, 200);
  const p = await r.json();
  assert.equal(p.valor_centavos, 7777);
  assert.equal(p.status_pagamento, 'nao_pago');
});

test('PATCH id inexistente → 404', async () => {
  const r = await req('/pedidos/999999', { method: 'PATCH', body: JSON.stringify({ valor_centavos: 500 }) });
  assert.equal(r.status, 404);
});

test('GET / → { pedidos, totais } com SUM correto no servidor', async () => {
  await inserirPedido({ farmacia_id: farmA, valor: 3000, status: 'pago' });
  await inserirPedido({ farmacia_id: farmA, valor: 2000, status: 'atrasado' });
  const body = await (await req('/pedidos')).json();
  assert.ok(Array.isArray(body.pedidos));
  assert.equal(typeof body.totais.vendido, 'number');
  // invariante: todo pedido cai em recebido (pago) ou a_receber (resto)
  assert.equal(body.totais.vendido, body.totais.recebido + body.totais.a_receber);
  // totais batem com a soma da lista (hoje sem paginação, lista = tudo)
  const somaLista = body.pedidos.reduce((s, p) => s + p.valor_centavos, 0);
  assert.equal(body.totais.vendido, somaLista);
});
