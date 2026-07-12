import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `_test_stats_perfil_${process.pid}.db`);
process.env.TURSO_URL = `file:${DB_FILE}`;
process.env.JWT_SECRET = 'test-secret';

const { db, enableForeignKeys } = await import('../src/db.js');
const { statsRouter } = await import('../src/routes/stats.js');
const { gerarToken } = await import('../src/lib/auth.js');
const express = (await import('express')).default;

const migDir = join(__dirname, '..', 'src', 'migrations');
let server, base, token, usuarioId;

function req(path) {
  return fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
}
async function farmacia(perfilManual, ehCliente = 1) {
  const r = await db.execute({
    sql: "INSERT INTO farmacias (nome, latitude, longitude, eh_cliente, perfil_pagamento) VALUES ('F',-9.65,-35.71,?,?)",
    args: [ehCliente, perfilManual],
  });
  return Number(r.lastInsertRowid);
}
async function pedido(farmaciaId, status, data) {
  await db.execute({
    sql: 'INSERT INTO pedidos (farmacia_id, usuario_id, valor_centavos, status_pagamento, data_pedido) VALUES (?,?,?,?,?)',
    args: [farmaciaId, usuarioId, 1000, status, data],
  });
}

test.before(async () => {
  await enableForeignKeys();
  for (const arq of ['001_init.sql', '002_origem.sql']) {
    await db.executeMultiple(readFileSync(join(migDir, arq), 'utf8'));
  }
  const u = await db.execute("INSERT INTO usuarios (nome, email, senha_hash) VALUES ('T','t@t.com','x')");
  usuarioId = Number(u.lastInsertRowid);
  token = gerarToken({ id: usuarioId, nome: 'T', email: 't@t.com' });

  const f1 = await farmacia('nao_paga');        // override manual
  await pedido(f1, 'pago', '2026-07-10');        // ignorado pelo override
  const f2 = await farmacia(null);               // sem manual
  await pedido(f2, 'pago', '2026-07-10');         // → paga_em_dia
  await farmacia(null);                           // sem manual, sem pedido → não conta

  const app = express();
  app.use(express.json());
  app.use('/stats', statsRouter);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server?.close(); await db.close(); try { rmSync(DB_FILE); } catch { /* já removido */ } });

test('carteira conta por perfil efetivo (override + farmácia só-com-pedido)', async () => {
  const s = await (await req('/stats?periodo=30')).json();
  assert.equal(s.perfil_pagamento_carteira.nao_paga, 1);    // f1 override
  assert.equal(s.perfil_pagamento_carteira.paga_em_dia, 1); // f2 pelo pedido
  assert.equal(s.perfil_pagamento_carteira.atrasa, 0);
});

test('lista por cliente inclui a farmácia que só tem pedido', async () => {
  const s = await (await req('/stats?periodo=30')).json();
  const perfis = s.perfil_pagamento_clientes.map((c) => c.perfil_pagamento).sort();
  assert.deepEqual(perfis, ['nao_paga', 'paga_em_dia']);
});
