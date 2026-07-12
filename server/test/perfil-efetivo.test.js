import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `_test_perfil_${process.pid}.db`);
process.env.TURSO_URL = `file:${DB_FILE}`;
process.env.JWT_SECRET = 'test-secret';

const { db, enableForeignKeys } = await import('../src/db.js');
const { sqlPerfilEfetivo, STATUS_PARA_PERFIL } = await import('../src/lib/perfilPagamento.js');

const migDir = join(__dirname, '..', 'src', 'migrations');
let usuarioId;

async function novaFarmacia(perfilManual = null) {
  const r = await db.execute({
    sql: "INSERT INTO farmacias (nome, latitude, longitude, perfil_pagamento) VALUES ('F', -9.65, -35.71, ?)",
    args: [perfilManual],
  });
  return Number(r.lastInsertRowid);
}
async function novoPedido(farmaciaId, status, data) {
  await db.execute({
    sql: 'INSERT INTO pedidos (farmacia_id, usuario_id, valor_centavos, status_pagamento, data_pedido) VALUES (?,?,?,?,?)',
    args: [farmaciaId, usuarioId, 1000, status, data],
  });
}
async function efetivo(farmaciaId) {
  const r = await db.execute({
    sql: `SELECT ${sqlPerfilEfetivo('f')} AS perfil FROM farmacias f WHERE f.id = ?`,
    args: [farmaciaId],
  });
  return r.rows[0].perfil;
}

test.before(async () => {
  await enableForeignKeys();
  for (const arq of ['001_init.sql', '002_origem.sql']) {
    await db.executeMultiple(readFileSync(join(migDir, arq), 'utf8'));
  }
  const u = await db.execute("INSERT INTO usuarios (nome, email, senha_hash) VALUES ('T','t@t.com','x')");
  usuarioId = Number(u.lastInsertRowid);
});
test.after(async () => { await db.close(); try { rmSync(DB_FILE); } catch { /* já removido */ } });

test('override manual vence sobre os pedidos', async () => {
  const f = await novaFarmacia('nao_paga');
  await novoPedido(f, 'pago', '2026-07-10');
  assert.equal(await efetivo(f), 'nao_paga');
});

test('sem manual, usa o status do pedido mais recente', async () => {
  const f = await novaFarmacia(null);
  await novoPedido(f, 'nao_pago', '2026-07-01');
  await novoPedido(f, 'pago', '2026-07-10');
  assert.equal(await efetivo(f), 'paga_em_dia');
});

test('mapeia atrasado→atrasa e nao_pago→nao_paga', async () => {
  const fa = await novaFarmacia(null);
  await novoPedido(fa, 'atrasado', '2026-07-05');
  assert.equal(await efetivo(fa), 'atrasa');
  const fn = await novaFarmacia(null);
  await novoPedido(fn, 'nao_pago', '2026-07-05');
  assert.equal(await efetivo(fn), 'nao_paga');
});

test('sem manual e sem pedido → NULL', async () => {
  const f = await novaFarmacia(null);
  assert.equal(await efetivo(f), null);
});

test('empate de data desempata pelo id maior (mais recente)', async () => {
  const f = await novaFarmacia(null);
  await novoPedido(f, 'pago', '2026-07-10');      // id menor
  await novoPedido(f, 'nao_pago', '2026-07-10');  // id maior → decide
  assert.equal(await efetivo(f), 'nao_paga');
});

test('STATUS_PARA_PERFIL cobre os três status', () => {
  assert.deepEqual(STATUS_PARA_PERFIL, { pago: 'paga_em_dia', atrasado: 'atrasa', nao_pago: 'nao_paga' });
});
