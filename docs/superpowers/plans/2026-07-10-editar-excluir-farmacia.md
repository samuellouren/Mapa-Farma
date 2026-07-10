# Editar e Excluir Farmácias Manuais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar e excluir farmácias na Ficha, mas somente as adicionadas manualmente pela equipe (não as vindas dos seeds Overpass/CNES).

**Architecture:** Uma coluna `origem` distingue farmácia manual de seed. O backend valida `origem='manual'` para editar campos de identidade e para excluir (não confia na UI). A exclusão é escalonada (bloqueia se há pedidos; cascata se só há visitas). O cliente mostra ações discretas na Ficha só para manuais e reusa o `NovaFarmaciaSheet` em modo edição.

**Tech Stack:** Node + Express + Turso/libSQL (servidor); React Native / Expo 57 + MapLibre (cliente). Testes: `node --test`.

## Global Constraints

- Schema é migration versionada em `server/src/migrations/` (`NNN_nome.sql`), aplicada por `npm run migrate`; nunca ALTER TABLE fora de migration. Fonte de verdade: `.claude/skills/schema-turso`.
- Enum `origem`: `'overpass' | 'cnes' | 'manual' | 'seed'`. Só `'manual'` habilita editar/excluir. Seeds gravam `'seed'`; POST manual grava `'manual'`; existentes viram `'seed'` no backfill.
- Guarda `origem='manual'` no PATCH vale **só para campos de identidade** (`nome`, `endereco`, `bairro`, `latitude`, `longitude`); campos de negócio (`eh_cliente`, `status_visita`, `perfil_pagamento`, `perfil_compra`) continuam livres para todas.
- Exclusão escalonada: `origem!='manual'` → 403; com `pedidos_count>0` → 409 (bloqueia, preserva financeiro); senão → DELETE (cascade apaga `relatorios_visita`).
- Coordenadas sempre reais e dentro de Maceió (`dentroDeMaceio(lng, lat)` no servidor); dinheiro em centavos (não relevante aqui).
- Expo mudou: consultar `https://docs.expo.dev/versions/v57.0.0/` antes de escrever código de cliente novo.
- Commits frequentes, um por task.

---

## File Structure

**Servidor:**
- `server/src/migrations/002_origem.sql` (novo) — adiciona coluna + backfill.
- `server/src/seed/overpass.js`, `server/src/seed/cnes.js` (modificar) — INSERT grava `origem='seed'`.
- `server/src/lib/exclusao.js` (novo) — política de exclusão, pura.
- `server/src/routes/farmacias.js` (modificar) — POST origem; GET detalhe com contadores; PATCH guarda de identidade; DELETE novo.
- `.claude/skills/schema-turso/SKILL.md` (modificar) — documentar a coluna.
- `server/test/exclusao.test.js` (novo) — testa a política pura.
- `server/test/farmacias.routes.test.js` (novo) — integração das rotas (403/409/200).

**Cliente:**
- `client/src/api/client.js` (modificar) — `excluirFarmacia`.
- `client/src/components/NovaFarmaciaSheet.js` (modificar) — modo criar/editar; `onCriada` → `onSalvo`.
- `client/src/screens/MapaScreen.js` (modificar) — atualizar call site do sheet.
- `client/src/screens/FichaScreen.js` (modificar) — ações editar/excluir; orquestração; confirmação.

---

## Task 1: Migration `origem` + seeds + doc de schema

**Files:**
- Create: `server/src/migrations/002_origem.sql`
- Modify: `server/src/seed/overpass.js:68-71`, `server/src/seed/cnes.js:143-147`
- Modify: `.claude/skills/schema-turso/SKILL.md` (tabela `farmacias`)

**Interfaces:**
- Produces: coluna `farmacias.origem TEXT NOT NULL` com valores `'overpass'|'cnes'|'manual'|'seed'`; existentes = `'seed'`; default de novos INSERT = `'manual'`.

- [ ] **Step 1: Criar a migration**

Create `server/src/migrations/002_origem.sql`:

```sql
-- 002_origem.sql — origem da farmácia (seed automático vs cadastro manual).
-- Só 'manual' pode ser editada/excluída pela equipe. 'overpass'/'cnes' ficam
-- reservados no enum para uma eventual re-derivação precisa futura; por ora os
-- seeds gravam 'seed' e o POST manual grava 'manual'.
ALTER TABLE farmacias ADD COLUMN origem TEXT NOT NULL DEFAULT 'manual'
  CHECK (origem IN ('overpass', 'cnes', 'manual', 'seed'));

-- Backfill: todo registro pré-existente veio de seed automático e é
-- não-editável. Não há sinal no banco para separar overpass de cnes
-- retroativamente; usa-se o valor genérico 'seed' (honesto). O UPDATE é
-- obrigatório: sem ele, as linhas ficariam com o default 'manual' e viriam
-- editáveis por engano.
UPDATE farmacias SET origem = 'seed';
```

- [ ] **Step 2: Validar a migration num banco de rascunho**

Run (Bash tool / Git Bash):
```bash
cd server && TURSO_URL="file:./_scratch_migrate.db" npm run migrate
```
Expected: imprime `✓ aplicada: 001_init.sql` e `✓ aplicada: 002_origem.sql` e `Migrations concluídas.` sem erro.

- [ ] **Step 3: Confirmar a coluna e limpar o rascunho**

Run:
```bash
cd server && TURSO_URL="file:./_scratch_migrate.db" node -e "import('./src/db.js').then(async ({db})=>{const r=await db.execute('PRAGMA table_info(farmacias)'); console.log(r.rows.map(c=>c.name).join(',')); process.exit(0);})" && rm -f _scratch_migrate.db
```
Expected: a lista de colunas inclui `origem`.

- [ ] **Step 4: Seeds gravam `origem='seed'`**

In `server/src/seed/overpass.js`, change the INSERT (around line 68):
```js
  await db.execute({
    sql: 'INSERT INTO farmacias (nome, endereco, bairro, latitude, longitude, origem) VALUES (?,?,?,?,?, \'seed\')',
    args: [nome, endereco, bairro, lat, lon],
  });
```

In `server/src/seed/cnes.js`, change the INSERT of new rows (around line 143):
```js
      const ins = await db.execute({
        sql: 'INSERT INTO farmacias (nome, endereco, bairro, latitude, longitude, origem) VALUES (?,?,?,?,?, \'seed\')',
        args: [nome, endereco, bairro, lat, lon],
      });
```

- [ ] **Step 5: Verificar que os seeds gravam origem**

Run:
```bash
cd server && grep -n "origem" src/seed/overpass.js src/seed/cnes.js
```
Expected: ambos os arquivos mostram a linha do INSERT com `origem` e `'seed'`.

- [ ] **Step 6: Documentar a coluna na skill de schema**

In `.claude/skills/schema-turso/SKILL.md`, na tabela `farmacias`, adicionar a linha (após `perfil_compra`, antes de `criado_em`):
```
| origem | text | `overpass` \| `cnes` \| `manual` \| `seed` — quem inseriu a farmácia. Só `manual` (cadastro pela equipe) pode ser editada/excluída. Seeds gravam `seed`; registros pré-migration `002` viraram `seed` no backfill. `overpass`/`cnes` reservados p/ re-derivação futura |
```

- [ ] **Step 7: Commit**

```bash
git add server/src/migrations/002_origem.sql server/src/seed/overpass.js server/src/seed/cnes.js .claude/skills/schema-turso/SKILL.md
git commit -m "feat(db): coluna origem em farmacias + seeds gravam 'seed'"
```

---

## Task 2: Lib de política de exclusão (`exclusao.js`)

**Files:**
- Create: `server/src/lib/exclusao.js`
- Test: `server/test/exclusao.test.js`

**Interfaces:**
- Produces: `avaliarExclusao({ origem, pedidos_count, relatorios_count }) → { permitido, motivo?, apagaVisitas? }`. `motivo` ∈ `'nao_manual' | 'tem_pedidos'`. Quando `permitido:true`, traz `apagaVisitas` (número de visitas que a cascata removerá).

- [ ] **Step 1: Escrever o teste que falha**

Create `server/test/exclusao.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { avaliarExclusao } from '../src/lib/exclusao.js';

test('não-manual (seed) não pode ser excluída', () => {
  assert.deepEqual(
    avaliarExclusao({ origem: 'seed', pedidos_count: 0, relatorios_count: 0 }),
    { permitido: false, motivo: 'nao_manual' }
  );
});

test('manual com pedidos → bloqueia (preserva financeiro)', () => {
  assert.deepEqual(
    avaliarExclusao({ origem: 'manual', pedidos_count: 2, relatorios_count: 5 }),
    { permitido: false, motivo: 'tem_pedidos' }
  );
});

test('manual só com visitas → permite e informa quantas apaga', () => {
  assert.deepEqual(
    avaliarExclusao({ origem: 'manual', pedidos_count: 0, relatorios_count: 3 }),
    { permitido: true, apagaVisitas: 3 }
  );
});

test('manual sem vínculo → permite direto', () => {
  assert.deepEqual(
    avaliarExclusao({ origem: 'manual', pedidos_count: 0, relatorios_count: 0 }),
    { permitido: true, apagaVisitas: 0 }
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run:
```bash
cd server && node --test test/exclusao.test.js
```
Expected: FAIL — `Cannot find module '../src/lib/exclusao.js'`.

- [ ] **Step 3: Implementar a lib**

Create `server/src/lib/exclusao.js`:
```js
// Política de exclusão de farmácia — pura e testável, consumida pela rota
// DELETE /farmacias/:id. Regras (decisão do cliente):
//  - só 'manual' pode ser excluída;
//  - pedidos vinculados BLOQUEIAM (alimentam o financeiro do Painel/Pedidos —
//    apagar mudaria totais de venda retroativamente);
//  - visitas (relatorios) são apagadas em cascata, consentido no cliente.
export function avaliarExclusao({ origem, pedidos_count = 0, relatorios_count = 0 }) {
  if (origem !== 'manual') return { permitido: false, motivo: 'nao_manual' };
  if (pedidos_count > 0) return { permitido: false, motivo: 'tem_pedidos' };
  return { permitido: true, apagaVisitas: relatorios_count };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run:
```bash
cd server && node --test test/exclusao.test.js
```
Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/exclusao.js server/test/exclusao.test.js
git commit -m "feat(server): lib avaliarExclusao (política de exclusão)"
```

---

## Task 3: Rotas — POST origem, GET contadores, PATCH guarda, DELETE

**Files:**
- Modify: `server/src/routes/farmacias.js`
- Test: `server/test/farmacias.routes.test.js`

**Interfaces:**
- Consumes: `avaliarExclusao` (Task 2); `dentroDeMaceio` (já importado).
- Produces:
  - `POST /farmacias` grava `origem='manual'`.
  - `GET /farmacias/:id` retorna a farmácia + `relatorios_count` + `pedidos_count`.
  - `PATCH /farmacias/:id` aceita identidade (`nome/endereco/bairro/latitude/longitude`) só se `origem='manual'` (403 senão); negócio segue livre.
  - `DELETE /farmacias/:id` → 403 (não-manual) | 409 (`{ pedidos_count }`) | 200 (`{ ok:true, visitas_apagadas }`).

- [ ] **Step 1: Escrever o teste de integração que falha**

Create `server/test/farmacias.routes.test.js`:
```js
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
  usuarioId = u.lastInsertRowid;
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run:
```bash
cd server && node --test test/farmacias.routes.test.js
```
Expected: FAIL (ex.: GET não traz `relatorios_count`; DELETE responde 404/inexistente; PATCH nome em seed responde 200).

- [ ] **Step 3: POST grava `origem='manual'`**

In `server/src/routes/farmacias.js`, no handler POST, trocar o INSERT:
```js
  const ins = await db.execute({
    sql: 'INSERT INTO farmacias (nome, endereco, bairro, latitude, longitude, origem) VALUES (?,?,?,?,?, \'manual\')',
    args: [String(nome).trim(), endereco ?? null, bairro ?? null, lat, lng],
  });
```

- [ ] **Step 4: GET detalhe com contadores**

Substituir o handler `GET /:id(\\d+)`:
```js
// GET /farmacias/:id  (ficha) — inclui contagem de vínculos p/ a exclusão
farmaciasRouter.get('/:id(\\d+)', ah(async (req, res) => {
  const r = await db.execute({
    sql: `SELECT f.*,
            (SELECT COUNT(*) FROM relatorios_visita WHERE farmacia_id = f.id) AS relatorios_count,
            (SELECT COUNT(*) FROM pedidos          WHERE farmacia_id = f.id) AS pedidos_count
          FROM farmacias f WHERE f.id = ?`,
    args: [req.params.id],
  });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });
  res.json(r.rows[0]);
}));
```

- [ ] **Step 5: PATCH com guarda de identidade**

Substituir o handler `PATCH /:id` inteiro:
```js
// PATCH /farmacias/:id
//  - negócio (eh_cliente, status_visita, perfis): livre p/ qualquer farmácia.
//  - identidade (nome, endereco, bairro, latitude, longitude): só origem='manual'.
farmaciasRouter.patch('/:id', ah(async (req, res) => {
  const b = req.body || {};
  const { eh_cliente, status_visita, perfil_pagamento, perfil_compra,
          nome, endereco, bairro, latitude, longitude } = b;

  const CAMPOS_IDENTIDADE = ['nome', 'endereco', 'bairro', 'latitude', 'longitude'];
  const temIdentidade = CAMPOS_IDENTIDADE.some((k) => b[k] !== undefined);

  if (temIdentidade) {
    const atual = await db.execute({ sql: 'SELECT origem FROM farmacias WHERE id = ?', args: [req.params.id] });
    if (!atual.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });
    if (atual.rows[0].origem !== 'manual') {
      return res.status(403).json({ erro: 'Só farmácias adicionadas manualmente podem ser editadas.' });
    }
  }

  const campos = [];
  const args = [];

  if (eh_cliente !== undefined) { campos.push('eh_cliente = ?'); args.push(eh_cliente ? 1 : 0); }
  if (status_visita !== undefined) {
    if (!STATUS_VISITA.includes(status_visita)) return res.status(400).json({ erro: 'status_visita inválido' });
    campos.push('status_visita = ?'); args.push(status_visita);
  }
  if (perfil_pagamento !== undefined) {
    if (perfil_pagamento !== null && !PERFIL_PAGAMENTO.includes(perfil_pagamento))
      return res.status(400).json({ erro: 'perfil_pagamento inválido' });
    campos.push('perfil_pagamento = ?'); args.push(perfil_pagamento);
  }
  if (perfil_compra !== undefined) {
    if (perfil_compra !== null && !PERFIL_COMPRA.includes(perfil_compra))
      return res.status(400).json({ erro: 'perfil_compra inválido' });
    campos.push('perfil_compra = ?'); args.push(perfil_compra);
  }

  if (nome !== undefined) {
    if (!String(nome).trim()) return res.status(400).json({ erro: 'nome não pode ser vazio' });
    campos.push('nome = ?'); args.push(String(nome).trim());
  }
  if (endereco !== undefined) { campos.push('endereco = ?'); args.push(endereco ? String(endereco).trim() : null); }
  if (bairro !== undefined) { campos.push('bairro = ?'); args.push(bairro ? String(bairro).trim() : null); }
  if (latitude !== undefined || longitude !== undefined) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
      return res.status(400).json({ erro: 'latitude e longitude devem ser numéricas' });
    if (!dentroDeMaceio(lng, lat))
      return res.status(400).json({ erro: 'Coordenada fora dos limites de Maceió' });
    campos.push('latitude = ?', 'longitude = ?'); args.push(lat, lng);
  }

  if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar' });

  args.push(req.params.id);
  await db.execute({ sql: `UPDATE farmacias SET ${campos.join(', ')} WHERE id = ?`, args });
  const r = await db.execute({ sql: 'SELECT * FROM farmacias WHERE id = ?', args: [req.params.id] });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });
  res.json(r.rows[0]);
}));
```

- [ ] **Step 6: DELETE com política escalonada**

Adicionar o import no topo do arquivo (junto aos outros):
```js
import { avaliarExclusao } from '../lib/exclusao.js';
```

Adicionar o handler (ex.: logo após o PATCH):
```js
// DELETE /farmacias/:id  — só manual; bloqueia se houver pedidos; cascata em visitas
farmaciasRouter.delete('/:id(\\d+)', ah(async (req, res) => {
  const r = await db.execute({
    sql: `SELECT origem,
            (SELECT COUNT(*) FROM relatorios_visita WHERE farmacia_id = ?) AS relatorios_count,
            (SELECT COUNT(*) FROM pedidos          WHERE farmacia_id = ?) AS pedidos_count
          FROM farmacias WHERE id = ?`,
    args: [req.params.id, req.params.id, req.params.id],
  });
  const row = r.rows[0];
  if (!row) return res.status(404).json({ erro: 'Farmácia não encontrada' });

  const d = avaliarExclusao(row);
  if (!d.permitido) {
    if (d.motivo === 'nao_manual') {
      return res.status(403).json({ erro: 'Só farmácias adicionadas manualmente podem ser excluídas.' });
    }
    return res.status(409).json({
      erro: 'Esta farmácia tem pedidos registrados e não pode ser excluída (preserva o histórico de vendas).',
      pedidos_count: row.pedidos_count,
    });
  }

  await db.execute({ sql: 'DELETE FROM farmacias WHERE id = ?', args: [req.params.id] });
  res.json({ ok: true, visitas_apagadas: d.apagaVisitas });
}));
```

- [ ] **Step 7: Rodar e ver passar**

Run:
```bash
cd server && node --test test/farmacias.routes.test.js
```
Expected: PASS — todos os testes. Nenhum arquivo `_test_farmacias_*.db` deve sobrar (limpo no `test.after`).

- [ ] **Step 8: Rodar a suíte inteira do servidor (sem regressão)**

Run:
```bash
cd server && node --test
```
Expected: PASS — inclui `geocode`, `exclusao`, `farmacias.routes`.

- [ ] **Step 9: Commit**

```bash
git add server/src/routes/farmacias.js server/test/farmacias.routes.test.js
git commit -m "feat(server): guarda de origem no PATCH/DELETE de farmacias + contadores"
```

---

## Task 4: Cliente — API + `NovaFarmaciaSheet` em modo criar/editar

**Files:**
- Modify: `client/src/api/client.js:60`
- Modify: `client/src/components/NovaFarmaciaSheet.js`
- Modify: `client/src/screens/MapaScreen.js:319-331`

**Interfaces:**
- Consumes: `PATCH /farmacias/:id` (identidade), `DELETE /farmacias/:id`.
- Produces:
  - `api.excluirFarmacia(id) → Promise`.
  - `NovaFarmaciaSheet` props: `modo='criar'|'editar'` (default `'criar'`), `idAlvo` (id na edição), `onSalvo(farmacia)` (substitui `onCriada`).

- [ ] **Step 1: Adicionar `excluirFarmacia` na API**

In `client/src/api/client.js`, dentro do objeto `api` (após `atualizarFarmacia`):
```js
  excluirFarmacia: (id) => request(`/farmacias/${id}`, { method: 'DELETE' }),
```

- [ ] **Step 2: Parametrizar `NovaFarmaciaSheet` (assinatura + salvar + textos)**

In `client/src/components/NovaFarmaciaSheet.js`, trocar a assinatura:
```js
export default function NovaFarmaciaSheet({ modo = 'criar', idAlvo = null, coordenada, valoresIniciais = {}, onFechar, onSalvo, onAjustarLocal }) {
```

Trocar o corpo de `salvar()` (o bloco dentro do `try`):
```js
    try {
      const dados = {
        nome: nome.trim(),
        endereco: endereco.trim() || null,
        bairro: bairro.trim() || null,
        latitude,
        longitude,
      };
      const f = modo === 'editar'
        ? await api.atualizarFarmacia(idAlvo, dados)
        : await api.criarFarmacia(dados);
      onSalvo(f);
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar.');
      setSalvando(false);
    }
```

Trocar o título (linha do `<Text style={styles.titulo}>`):
```jsx
          <Text style={styles.titulo}>{modo === 'editar' ? 'Editar farmácia' : 'Nova farmácia'}</Text>
```

Trocar o texto do botão salvar:
```jsx
            <Text style={styles.botaoTexto}>
              {salvando ? 'Salvando…' : (modo === 'editar' ? 'Salvar alterações' : 'Salvar farmácia')}
            </Text>
```

- [ ] **Step 3: Atualizar o call site no `MapaScreen`**

In `client/src/screens/MapaScreen.js`, no bloco `{novaFarmacia && (...)}`, trocar `onCriada` por `onSalvo` (o corpo do callback é o mesmo):
```jsx
      {novaFarmacia && (
        <NovaFarmaciaSheet
          coordenada={novaFarmacia}
          valoresIniciais={novaFarmacia.valoresIniciais}
          onAjustarLocal={ajustarLocal}
          onFechar={() => setNovaFarmacia(null)}
          onSalvo={(f) => {
            setNovaFarmacia(null);
            setFarmacias((prev) => [...prev, f]);
            setSelecionada(f);
            cameraRef.current?.flyTo({ center: [f.longitude, f.latitude], zoom: 16, duration: 800 });
          }}
        />
      )}
```

- [ ] **Step 4: Verificar que o bundle compila (regressão do cadastro)**

Run:
```bash
cd client && rm -rf dist && npx expo export --platform android 2>&1 | grep -Ei "bundled|error|failed" ; rm -rf dist
```
Expected: `Android Bundled ... index.js (N modules)` sem `error`/`failed`.

- [ ] **Step 5: Commit**

```bash
git add client/src/api/client.js client/src/components/NovaFarmaciaSheet.js client/src/screens/MapaScreen.js
git commit -m "feat(client): NovaFarmaciaSheet em modo editar + api.excluirFarmacia"
```

---

## Task 5: Cliente — Ficha: ações editar/excluir (só manual)

**Files:**
- Modify: `client/src/screens/FichaScreen.js`

**Interfaces:**
- Consumes: `NovaFarmaciaSheet` (modo editar), `SeletorLocalizacao`, `api.atualizarFarmacia`, `api.excluirFarmacia`; `farmacia.origem`, `farmacia.relatorios_count`, `farmacia.pedidos_count` (do GET detalhe da Task 3).

- [ ] **Step 1: Imports e estado de edição/exclusão**

In `client/src/screens/FichaScreen.js`, adicionar `Alert` ao import de `react-native`:
```js
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Linking, Platform, Alert,
} from 'react-native';
```

Adicionar os imports dos componentes (após o import de `Icones`):
```js
import NovaFarmaciaSheet from '../components/NovaFarmaciaSheet';
import SeletorLocalizacao from '../components/SeletorLocalizacao';
```

Adicionar o estado (após `const [erro, setErro] = useState('')`):
```js
  const [edicao, setEdicao] = useState(null); // { coordenada:{latitude,longitude}, valores:{nome,endereco,bairro} }
  const [seletor, setSeletor] = useState(null); // { centro:[lng,lat], rascunho:{nome,endereco,bairro} }
```

- [ ] **Step 2: Funções de edição e exclusão**

Adicionar dentro do componente (ex.: após `abrirRota`):
```js
  function abrirEdicao() {
    setEdicao({
      coordenada: { latitude: farmacia.latitude, longitude: farmacia.longitude },
      valores: { nome: farmacia.nome, endereco: farmacia.endereco || '', bairro: farmacia.bairro || '' },
    });
  }

  function excluir() {
    const nPed = farmacia.pedidos_count || 0;
    const nVis = farmacia.relatorios_count || 0;
    if (nPed > 0) {
      Alert.alert(
        'Não é possível excluir',
        `Esta farmácia tem ${nPed} pedido(s) registrado(s). Edite os dados se precisar corrigir.`,
        [{ text: 'Entendi' }]
      );
      return;
    }
    const msg = nVis > 0
      ? `Isso também apagará ${nVis} visita(s) registrada(s). Não pode ser desfeito.`
      : 'Isso não pode ser desfeito.';
    Alert.alert('Excluir farmácia?', msg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.excluirFarmacia(id);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Erro', e.message || 'Não foi possível excluir.');
          }
        },
      },
    ]);
  }
```

- [ ] **Step 3: Botões discretos no rodapé (só manual)**

Dentro do `<ScrollView>`, logo após o card "histórico resumo" (antes de fechar `</ScrollView>`), adicionar:
```jsx
        {farmacia.origem === 'manual' && (
          <View style={styles.acoesManual}>
            <TouchableOpacity onPress={abrirEdicao} activeOpacity={0.7}>
              <Text style={styles.acaoEditar}>Editar dados</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={excluir} activeOpacity={0.7}>
              <Text style={styles.acaoExcluir}>Excluir farmácia</Text>
            </TouchableOpacity>
          </View>
        )}
```

- [ ] **Step 4: Modais de edição e ajuste de local**

Após o fechamento do `</ScrollView>` e antes de fechar o `</View>` raiz, adicionar:
```jsx
      {edicao && (
        <NovaFarmaciaSheet
          modo="editar"
          idAlvo={id}
          coordenada={edicao.coordenada}
          valoresIniciais={edicao.valores}
          onAjustarLocal={({ nome, endereco, bairro }) => {
            setSeletor({
              centro: [edicao.coordenada.longitude, edicao.coordenada.latitude],
              rascunho: { nome, endereco, bairro },
            });
            setEdicao(null);
          }}
          onFechar={() => setEdicao(null)}
          onSalvo={(f) => { setEdicao(null); setFarmacia((prev) => ({ ...prev, ...f })); }}
        />
      )}

      {seletor && (
        <SeletorLocalizacao
          centroInicial={seletor.centro}
          onCancelar={() => {
            // volta pro sheet com o rascunho e a coordenada anteriores
            setEdicao({
              coordenada: { latitude: seletor.centro[1], longitude: seletor.centro[0] },
              valores: seletor.rascunho,
            });
            setSeletor(null);
          }}
          onConfirmar={({ latitude, longitude, endereco, bairro }) => {
            const rascunho = seletor.rascunho;
            setSeletor(null);
            setEdicao({
              coordenada: { latitude, longitude },
              valores: { nome: rascunho?.nome || '', endereco: endereco || '', bairro: bairro || '' },
            });
          }}
        />
      )}
```

- [ ] **Step 5: Estilos das ações**

Adicionar no `StyleSheet.create` (ex.: após `erroTexto`):
```js
  acoesManual: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 6, paddingTop: 2, paddingBottom: 4,
  },
  acaoEditar: { fontSize: 14, fontWeight: '600', color: cores.textoSuave },
  acaoExcluir: { fontSize: 14, fontWeight: '600', color: cores.vermelho },
```

- [ ] **Step 6: Verificar que o bundle compila**

Run:
```bash
cd client && rm -rf dist && npx expo export --platform android 2>&1 | grep -Ei "bundled|error|failed" ; rm -rf dist
```
Expected: `Android Bundled ... index.js (N modules)` sem `error`/`failed`.

- [ ] **Step 7: Commit**

```bash
git add client/src/screens/FichaScreen.js
git commit -m "feat(client): editar/excluir farmácia manual na Ficha"
```

- [ ] **Step 8: Verificação manual no aparelho (o que só o device confirma)**

Rodar `npx expo start -c` e conferir:
1. Farmácia de **seed** (qualquer uma do mapa que não foi você que cadastrou): a Ficha **não** mostra "Editar dados"/"Excluir".
2. Farmácia **manual** (cadastre uma pelo "+"): aparecem os dois links no rodapé.
3. **Editar** → sheet pré-preenchido; alterar nome/endereço/bairro e salvar → Ficha reflete.
4. **Editar → Ajustar** → seletor abre no ponto atual; confirmar novo ponto → volta ao sheet com endereço/bairro do geocode; salvar → coordenada muda.
5. **Excluir** sem histórico → confirma → some do mapa (volta pra tela anterior).
6. **Excluir** com visita registrada → alerta cita a contagem de visitas; confirmar apaga.
7. **Excluir** com pedido registrado → alerta bloqueia (só "Entendi"), não exclui.

---

## Self-Review (feito na escrita do plano)

- **Cobertura do spec:** schema/backfill (Task 1) ✓; seeds gravam origem (Task 1) ✓; doc de schema (Task 1) ✓; política pura testada (Task 2) ✓; POST origem, GET contadores, PATCH guarda de identidade, DELETE escalonado (Task 3) ✓; API cliente (Task 4) ✓; sheet criar/editar + MapaScreen (Task 4) ✓; UI Ficha + orquestração + confirmação (Task 5) ✓.
- **Sem placeholders:** todos os steps trazem código/comando reais.
- **Consistência de tipos:** `avaliarExclusao` (retorno `{permitido, motivo, apagaVisitas}`) é definido na Task 2 e consumido igual na Task 3; `onSalvo`/`modo`/`idAlvo` definidos na Task 4 e usados na Task 5; contadores `relatorios_count`/`pedidos_count` produzidos na Task 3 e consumidos na Task 5.
```
