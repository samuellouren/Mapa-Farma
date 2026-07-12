# Perfil de pagamento efetivo (fase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calcular o perfil de pagamento efetivo de cada farmácia (override manual, senão status do pedido mais recente) no servidor e usá-lo em todo o app.

**Architecture:** Um fragmento SQL reutilizável (`sqlPerfilEfetivo`) calcula o efetivo em cada leitura de farmácia e nas agregações do Painel. As rotas passam a expor `perfil_pagamento_efetivo`; o cliente consome esse campo. Override manual continua no campo `farmacias.perfil_pagamento`.

> ### ⚠️ Emenda de escopo — 2026-07-12 (pós-implementação)
>
> O Painel deixou de usar o perfil **efetivo** (manual ⟶ pedido) em três agregados e passou a usar um perfil **só-por-pedido** (ignora `perfil_pagamento` manual por completo — nem override, nem fallback). Motivo: a carteira precisa ser ferramenta de **cobrança/monitoramento baseada em fato** (pedido), não em avaliação manual que pode estar desatualizada.
>
> **Vale SÓ para o `stats.js`, nestes três pontos:** card "Perfil de pagamento da carteira", lista "Por cliente" e ranking `top_clientes`. Regra: perfil = status do pedido mais recente mapeado; farmácia **sem pedido some** desses agregados (mesmo com manual definido).
>
> **NÃO muda** Ficha, filtro do Mapa e badge do marcador — esses continuam no `perfil_pagamento_efetivo` (override manual vence), exatamente como as Tasks 3 e 4 descrevem.
>
> **Implementação:** novo fragmento `sqlPerfilPedido(alias)` em `perfilPagamento.js` (só o `CASE` do pedido mais recente, NULL sem pedido); `sqlPerfilEfetivo` virou `COALESCE(perfil_pagamento, sqlPerfilPedido(alias))` — comportamento efetivo idêntico. Em `stats.js`, a query `pag` e a coluna do `fs` passam a usar `sqlPerfilPedido` (coluna `perfil_pagamento_pedido`), consumida por carteira, "por cliente" e score/saída do `top_clientes`. `perfil_pagamento_efetivo` deixou de ser referenciado no `stats.js`. Testes ajustados em `test/stats.perfil.test.js` (Task 2 abaixo descreve o comportamento **antigo**, superado por esta emenda).

**Tech Stack:** Node.js + Express + libSQL (SQLite), React Native (Expo SDK 57), `node:test`.

## Global Constraints

- **Perfil efetivo** = `COALESCE(perfil_pagamento_manual, map(status do pedido mais recente))`. Mais recente = `ORDER BY data_pedido DESC, id DESC LIMIT 1`. All-time.
- **Mapa status→perfil:** `pago→paga_em_dia`, `atrasado→atrasa`, `nao_pago→nao_paga`.
- **Alias do fragmento SQL** é sempre literal de código (`'f'`), nunca input do usuário.
- **Chaves das respostas do Painel não mudam** (`perfil_pagamento_carteira`, `perfil_pagamento_clientes[].perfil_pagamento`, `top_clientes[].perfil_pagamento`) — só o valor muda. ⚠️ Ver Emenda 2026-07-12: esses três valores passaram de **efetivo** para **só-por-pedido**.
- **Testes de servidor:** `cd server && node --test test/<arquivo>`.
- **Sem harness de testes de tela RN** → Task 4 verifica por grep + parse + app manual.

---

### Task 1: Helper `perfilPagamento.js` + testes SQL do efetivo

**Files:**
- Create: `server/src/lib/perfilPagamento.js`
- Test: `server/test/perfil-efetivo.test.js`

**Interfaces:**
- Produces:
  - `STATUS_PARA_PERFIL: { pago:'paga_em_dia', atrasado:'atrasa', nao_pago:'nao_paga' }`
  - `sqlPerfilEfetivo(alias='f') -> string` — fragmento SQL que devolve o perfil efetivo da farmácia aliasada por `alias`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/test/perfil-efetivo.test.js`:

```js
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
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd server && node --test test/perfil-efetivo.test.js`
Expected: FAIL — `Cannot find module '../src/lib/perfilPagamento.js'`.

- [ ] **Step 3: Implementar o helper**

Criar `server/src/lib/perfilPagamento.js`:

```js
// Perfil de pagamento EFETIVO da farmácia.
// Fonte única: override manual (farmacias.perfil_pagamento) vence; quando NULL,
// deriva do status do pedido mais recente. Sem manual e sem pedido → NULL.

export const STATUS_PARA_PERFIL = { pago: 'paga_em_dia', atrasado: 'atrasa', nao_pago: 'nao_paga' };

// Fragmento SQL do perfil efetivo. `alias` é o alias da tabela farmacias na
// query (sempre literal de código — NUNCA input do usuário).
export function sqlPerfilEfetivo(alias = 'f') {
  return `COALESCE(${alias}.perfil_pagamento,
    CASE (SELECT p.status_pagamento FROM pedidos p
          WHERE p.farmacia_id = ${alias}.id
          ORDER BY p.data_pedido DESC, p.id DESC LIMIT 1)
      WHEN 'pago'     THEN 'paga_em_dia'
      WHEN 'atrasado' THEN 'atrasa'
      WHEN 'nao_pago' THEN 'nao_paga'
    END)`;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd server && node --test test/perfil-efetivo.test.js`
Expected: PASS — 6 testes ok.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/perfilPagamento.js server/test/perfil-efetivo.test.js
git commit -m "feat(server): helper perfilPagamento (perfil efetivo via SQL)"
```

---

### Task 2: `stats.js` agrega/usa o perfil efetivo

**Files:**
- Modify: `server/src/routes/stats.js`
- Test: `server/test/stats.perfil.test.js`

**Interfaces:**
- Consumes: `sqlPerfilEfetivo` de `../lib/perfilPagamento.js`.
- Produces: `GET /stats` com `perfil_pagamento_carteira`, `perfil_pagamento_clientes` e `top_clientes` baseados no efetivo (mesmas chaves de antes).

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/test/stats.perfil.test.js`:

```js
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

  const f1 = await farmacia('nao_paga');       // override manual
  await pedido(f1, 'pago', '2026-07-10');       // ignorado pelo override
  const f2 = await farmacia(null);              // sem manual
  await pedido(f2, 'pago', '2026-07-10');       // → paga_em_dia
  await farmacia(null);                         // sem manual, sem pedido → não conta

  const app = express();
  app.use(express.json());
  app.use('/stats', statsRouter);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server?.close(); await db.close(); try { rmSync(DB_FILE); } catch { /* já removido */ } });

test('carteira conta por perfil efetivo (override + farmácia só-com-pedido)', async () => {
  const s = await (await req('/stats?periodo=30')).json();
  assert.equal(s.perfil_pagamento_carteira.nao_paga, 1);   // f1 override
  assert.equal(s.perfil_pagamento_carteira.paga_em_dia, 1); // f2 pelo pedido
  assert.equal(s.perfil_pagamento_carteira.atrasa, 0);
});

test('lista por cliente inclui a farmácia que só tem pedido', async () => {
  const s = await (await req('/stats?periodo=30')).json();
  const perfis = s.perfil_pagamento_clientes.map((c) => c.perfil_pagamento).sort();
  assert.deepEqual(perfis, ['nao_paga', 'paga_em_dia']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node --test test/stats.perfil.test.js`
Expected: FAIL — hoje `paga_em_dia` seria 0 (f2 sem manual não é contada) e a lista por cliente não incluiria f2.

- [ ] **Step 3: Editar `stats.js` — import**

Após a linha `import { ah } from '../lib/asyncHandler.js';`, adicionar:

```js
import { sqlPerfilEfetivo } from '../lib/perfilPagamento.js';
```

- [ ] **Step 4: Editar `stats.js` — query da carteira**

Substituir:

```js
  const pag = await db.execute(
    `SELECT perfil_pagamento, COUNT(*) AS n FROM farmacias
     WHERE perfil_pagamento IS NOT NULL GROUP BY perfil_pagamento`
  );
```

por:

```js
  const pag = await db.execute(
    `SELECT perfil, COUNT(*) AS n FROM (
       SELECT ${sqlPerfilEfetivo('f')} AS perfil FROM farmacias f
     ) WHERE perfil IS NOT NULL GROUP BY perfil`
  );
```

- [ ] **Step 5: Editar `stats.js` — query `fs` (adicionar coluna efetiva)**

Substituir:

```js
    `SELECT f.id, f.nome, f.bairro, f.eh_cliente, f.perfil_pagamento, f.perfil_compra,
            (SELECT COUNT(*) FROM relatorios_visita rv WHERE rv.farmacia_id = f.id) AS total_relatorios,
```

por:

```js
    `SELECT f.id, f.nome, f.bairro, f.eh_cliente, f.perfil_pagamento, f.perfil_compra,
            ${sqlPerfilEfetivo('f')} AS perfil_pagamento_efetivo,
            (SELECT COUNT(*) FROM relatorios_visita rv WHERE rv.farmacia_id = f.id) AS total_relatorios,
```

- [ ] **Step 6: Editar `stats.js` — usar o efetivo no score e nas saídas**

Substituir (score do topClientes):

```js
      score: (PESO_COMPRA[f.perfil_compra] || 0) + (PESO_PAGAMENTO[f.perfil_pagamento] || 0) + f.total_relatorios * 0.5,
```

por:

```js
      score: (PESO_COMPRA[f.perfil_compra] || 0) + (PESO_PAGAMENTO[f.perfil_pagamento_efetivo] || 0) + f.total_relatorios * 0.5,
```

Substituir (saída do topClientes):

```js
    .map((f) => ({ id: f.id, nome: f.nome, bairro: f.bairro, perfil_compra: f.perfil_compra, perfil_pagamento: f.perfil_pagamento }));
```

por:

```js
    .map((f) => ({ id: f.id, nome: f.nome, bairro: f.bairro, perfil_compra: f.perfil_compra, perfil_pagamento: f.perfil_pagamento_efetivo }));
```

Substituir (loop da carteira):

```js
  pag.rows.forEach((r) => { carteira[r.perfil_pagamento] = r.n; });
```

por:

```js
  pag.rows.forEach((r) => { carteira[r.perfil] = r.n; });
```

Substituir (perfilPagamentoClientes):

```js
  const perfilPagamentoClientes = linhas
    .filter((f) => f.perfil_pagamento)
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((f) => ({ id: f.id, nome: f.nome, bairro: f.bairro, perfil_pagamento: f.perfil_pagamento }));
```

por:

```js
  const perfilPagamentoClientes = linhas
    .filter((f) => f.perfil_pagamento_efetivo)
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((f) => ({ id: f.id, nome: f.nome, bairro: f.bairro, perfil_pagamento: f.perfil_pagamento_efetivo }));
```

- [ ] **Step 7: Rodar e ver passar (e não quebrar o resto)**

Run: `cd server && node --test test/stats.perfil.test.js`
Expected: PASS — 2 testes ok.

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/stats.js server/test/stats.perfil.test.js
git commit -m "feat(server): Painel usa perfil de pagamento efetivo (carteira, ranking, por cliente)"
```

---

### Task 3: `farmacias.js` expõe `perfil_pagamento_efetivo` e filtra por ele

**Files:**
- Modify: `server/src/routes/farmacias.js`
- Test: `server/test/farmacias.routes.test.js` (append)

**Interfaces:**
- Consumes: `sqlPerfilEfetivo` de `../lib/perfilPagamento.js`.
- Produces: `GET /farmacias` e `GET /farmacias/:id` e resposta do `PATCH` com o campo `perfil_pagamento_efetivo`; filtro `?perfil_pagamento=` pelo efetivo.

- [ ] **Step 1: Escrever os testes que falham (append)**

No fim de `server/test/farmacias.routes.test.js`, adicionar (usa os helpers `req`, `inserirFarmacia` e `db` já definidos no arquivo):

```js
async function inserirPedidoStatus(farmaciaId, status, data) {
  await db.execute({
    sql: 'INSERT INTO pedidos (farmacia_id, usuario_id, valor_centavos, status_pagamento, data_pedido) VALUES (?,?,?,?,?)',
    args: [farmaciaId, usuarioId, 1000, status, data],
  });
}

test('GET /:id expõe perfil_pagamento_efetivo do pedido mais recente', async () => {
  const id = Number(await inserirFarmacia('manual')); // sem perfil manual
  await inserirPedidoStatus(id, 'atrasado', '2026-07-10');
  const f = await (await req(`/farmacias/${id}`)).json();
  assert.equal(f.perfil_pagamento, null);
  assert.equal(f.perfil_pagamento_efetivo, 'atrasa');
});

test('GET / filtra por perfil efetivo', async () => {
  const id = Number(await inserirFarmacia('manual'));
  await inserirPedidoStatus(id, 'nao_pago', '2026-07-11');
  const lista = await (await req('/farmacias?perfil_pagamento=nao_paga')).json();
  assert.ok(lista.some((x) => x.id === id));
  assert.ok(lista.every((x) => x.perfil_pagamento_efetivo === 'nao_paga'));
});

test('PATCH que limpa o manual devolve efetivo vindo do pedido', async () => {
  const id = Number(await inserirFarmacia('manual'));
  await inserirPedidoStatus(id, 'pago', '2026-07-12');
  await req(`/farmacias/${id}`, { method: 'PATCH', body: JSON.stringify({ perfil_pagamento: 'nao_paga' }) });
  const r = await req(`/farmacias/${id}`, { method: 'PATCH', body: JSON.stringify({ perfil_pagamento: null }) });
  const f = await r.json();
  assert.equal(f.perfil_pagamento, null);
  assert.equal(f.perfil_pagamento_efetivo, 'paga_em_dia');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node --test test/farmacias.routes.test.js`
Expected: FAIL nos 3 novos testes — `perfil_pagamento_efetivo` é `undefined` e o filtro não reconhece o valor.

- [ ] **Step 3: Editar `farmacias.js` — import**

Após `import { avaliarExclusao } from '../lib/exclusao.js';`, adicionar:

```js
import { sqlPerfilEfetivo } from '../lib/perfilPagamento.js';
```

- [ ] **Step 4: Editar `farmacias.js` — filtro e SELECT do GET /**

Substituir:

```js
  if (perfil_pagamento) { where.push('perfil_pagamento = ?'); args.push(perfil_pagamento); }

  const sql =
    'SELECT * FROM farmacias' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY nome';
```

por:

```js
  if (perfil_pagamento) { where.push(`${sqlPerfilEfetivo('f')} = ?`); args.push(perfil_pagamento); }

  const sql =
    `SELECT f.*, ${sqlPerfilEfetivo('f')} AS perfil_pagamento_efetivo FROM farmacias f` +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY nome';
```

- [ ] **Step 5: Editar `farmacias.js` — SELECT do GET /:id**

Substituir:

```js
    sql: `SELECT f.*,
            (SELECT COUNT(*) FROM relatorios_visita WHERE farmacia_id = f.id) AS relatorios_count,
            (SELECT COUNT(*) FROM pedidos          WHERE farmacia_id = f.id) AS pedidos_count
          FROM farmacias f WHERE f.id = ?`,
```

por:

```js
    sql: `SELECT f.*,
            ${sqlPerfilEfetivo('f')} AS perfil_pagamento_efetivo,
            (SELECT COUNT(*) FROM relatorios_visita WHERE farmacia_id = f.id) AS relatorios_count,
            (SELECT COUNT(*) FROM pedidos          WHERE farmacia_id = f.id) AS pedidos_count
          FROM farmacias f WHERE f.id = ?`,
```

- [ ] **Step 6: Editar `farmacias.js` — SELECT de resposta do PATCH**

Substituir:

```js
  await db.execute({ sql: `UPDATE farmacias SET ${campos.join(', ')} WHERE id = ?`, args });
  const r = await db.execute({ sql: 'SELECT * FROM farmacias WHERE id = ?', args: [req.params.id] });
```

por:

```js
  await db.execute({ sql: `UPDATE farmacias SET ${campos.join(', ')} WHERE id = ?`, args });
  const r = await db.execute({
    sql: `SELECT f.*, ${sqlPerfilEfetivo('f')} AS perfil_pagamento_efetivo FROM farmacias f WHERE f.id = ?`,
    args: [req.params.id],
  });
```

- [ ] **Step 7: Rodar a suíte de farmácias inteira e ver passar**

Run: `cd server && node --test test/farmacias.routes.test.js`
Expected: PASS — testes antigos + 3 novos ok.

- [ ] **Step 8: Rodar TODA a suíte do servidor (garantir nada quebrado)**

Run: `cd server && node --test test/`
Expected: PASS em todos os arquivos.

- [ ] **Step 9: Commit**

```bash
git add server/src/routes/farmacias.js server/test/farmacias.routes.test.js
git commit -m "feat(server): farmacias expõem perfil_pagamento_efetivo e filtram por ele"
```

---

### Task 4: Cliente usa o perfil efetivo (Mapa, marcador, Ficha)

**Files:**
- Modify: `client/src/screens/MapaScreen.js`
- Modify: `client/src/components/BottomSheetFarmacia.js`
- Modify: `client/src/screens/FichaScreen.js`

**Interfaces:**
- Consumes: `farmacia.perfil_pagamento_efetivo` (novo campo do servidor) e `farmacia.perfil_pagamento` (manual). `PERFIL_PAGAMENTO` já importado na Ficha e no BottomSheet.

- [ ] **Step 1: MapaScreen — filtrar pelo efetivo**

Em `client/src/screens/MapaScreen.js`, substituir a linha do filtro (por volta da 79):

```js
    if (filtros.perfil_pagamento !== 'all' && f.perfil_pagamento !== filtros.perfil_pagamento) return false;
```

por:

```js
    if (filtros.perfil_pagamento !== 'all' && f.perfil_pagamento_efetivo !== filtros.perfil_pagamento) return false;
```

- [ ] **Step 2: BottomSheetFarmacia — badge pelo efetivo**

Em `client/src/components/BottomSheetFarmacia.js`, substituir (por volta da linha 15):

```js
  const pagamento = farmacia.perfil_pagamento ? PERFIL_PAGAMENTO[farmacia.perfil_pagamento] : null;
```

por:

```js
  const pagamento = farmacia.perfil_pagamento_efetivo ? PERFIL_PAGAMENTO[farmacia.perfil_pagamento_efetivo] : null;
```

- [ ] **Step 3: FichaScreen — dica de perfil (manual × automático)**

Em `client/src/screens/FichaScreen.js`, substituir:

```js
          <Text style={styles.grupoTitulo}>Perfil de pagamento</Text>
          <SegmentedControl opcoes={SEG_PAGAMENTO} valor={farmacia.perfil_pagamento} onMudar={(v) => mudar({ perfil_pagamento: v })} permiteLimpar />
```

por:

```js
          <Text style={styles.grupoTitulo}>Perfil de pagamento</Text>
          <SegmentedControl opcoes={SEG_PAGAMENTO} valor={farmacia.perfil_pagamento} onMudar={(v) => mudar({ perfil_pagamento: v })} permiteLimpar />
          <Text style={styles.perfilDica}>
            {farmacia.perfil_pagamento
              ? 'Definido manualmente. Limpe para voltar ao automático.'
              : farmacia.perfil_pagamento_efetivo
                ? `Automático: ${PERFIL_PAGAMENTO[farmacia.perfil_pagamento_efetivo].label} — do último pedido.`
                : 'Sem pedidos ainda.'}
          </Text>
```

- [ ] **Step 4: FichaScreen — estilo da dica**

No `StyleSheet.create` da Ficha, logo após a definição de `grupoTitulo: { ... },`, adicionar:

```js
  perfilDica: { fontSize: 12, color: cores.textoMudo, marginTop: 6 },
```

- [ ] **Step 5: Verificação estática**

Run:
```bash
cd client && node -e "const p=require('@babel/parser');const fs=require('fs');for(const f of ['src/screens/MapaScreen.js','src/components/BottomSheetFarmacia.js','src/screens/FichaScreen.js']){p.parse(fs.readFileSync(f,'utf8'),{sourceType:'module',plugins:['jsx']});console.log('OK',f);}"
```
Expected: `OK` para os três arquivos (sintaxe JSX válida).

Run:
```bash
cd client && grep -n "perfil_pagamento_efetivo\|perfilDica" src/screens/MapaScreen.js src/components/BottomSheetFarmacia.js src/screens/FichaScreen.js
```
Expected: o efetivo aparece no filtro do Mapa, no badge do BottomSheet e na dica da Ficha; `perfilDica` aparece no JSX e no StyleSheet da Ficha.

- [ ] **Step 6: Verificação manual no app**

Com o backend rodando e `npx expo start -c`:
1. **Painel** → card "Perfil de pagamento da carteira" e "Por cliente" agora incluem farmácias que só têm pedido (não só as marcadas à mão).
2. **Ficha** de uma farmácia com pedido e sem perfil manual → controle vazio + dica "Automático: … — do último pedido". Marcar um valor → dica vira "Definido manualmente…"; limpar → volta pra "Automático: …".
3. **Mapa** → filtrar por "Em dia/Atrasa/Não paga" reflete o perfil efetivo; tocar num marcador mostra o badge do perfil efetivo.

- [ ] **Step 7: Commit**

```bash
git add client/src/screens/MapaScreen.js client/src/components/BottomSheetFarmacia.js client/src/screens/FichaScreen.js
git commit -m "feat(client): usar perfil de pagamento efetivo (Mapa, marcador, Ficha)"
```

---

## Self-Review

**1. Spec coverage:**
- Regra (override ?? mais-recente, all-time, mapa de status) → Task 1 (`sqlPerfilEfetivo` + testes 1–6). ✓
- Painel usa efetivo (carteira, por cliente, ranking) → Task 2. ✓ ⚠️ Superado pela Emenda 2026-07-12: os três passaram a usar perfil só-por-pedido (`sqlPerfilPedido`).
- Farmácias expõem efetivo + filtro por efetivo → Task 3. ✓
- Cliente: Mapa filtro, badge do marcador, Ficha (dica manual×automático) → Task 4. ✓
- PainelScreen sem mudança (chaves iguais) → confirmado: Task 4 não toca PainelScreen. ✓
- Bordas (sem pedido → NULL; desempate por id) → Task 1 testes 4 e 5. ✓

**2. Placeholder scan:** As marcações `${sqlPerfilEfetivo('f')}` são interpolações reais de template string (código executável), não placeholders. Nenhum TBD/TODO. ✓

**3. Type/nome consistency:** `perfil_pagamento_efetivo` usado de forma idêntica no servidor (SELECT alias) e no cliente (campo consumido); `sqlPerfilEfetivo`/`STATUS_PARA_PERFIL` definidos na Task 1 e consumidos nas Tasks 2–3; chaves da resposta do Painel preservadas. ✓
