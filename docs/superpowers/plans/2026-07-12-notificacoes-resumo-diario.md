# Notificações + resumo diário + Painel nunca-visitada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema real de notificações push (digest de alertas 8h + resumo diário por vendedor 22h30) e um card no Painel de farmácias nunca-visitadas ordenadas por proximidade do vendedor.

**Architecture:** Migration `003` adiciona `pedidos.data_vencimento` e prefs/token em `usuarios`. Backend expõe prefs/token via `/auth/me`, agrega números de alerta/resumo em módulo `notificacoes/` isolado do envio, e dispara via `node-cron` + `expo-server-sdk`. Client registra Expo push token, mostra toggles reais e calcula proximidade client-side (Haversine já existente).

**Tech Stack:** Node.js + Express + libSQL (SQLite), React Native (Expo SDK 57), `node:test`, `node-cron`, `expo-server-sdk`, `expo-notifications`, `expo-device`.

## Global Constraints

- **Timezone das queries de data:** `date('now')` do SQLite é UTC. Maceió é UTC-3 sem horário de verão. TODA comparação de "hoje"/"-30 dias" usa offset fixo `date('now','-3 hours')` (e encadeia `'-30 days'` quando preciso).
- **Horários (timezone `America/Maceio`):** digest de alertas `0 8 * * *`; resumo diário `30 22 * * *`.
- **Limiar "sem visita":** 30 dias. **Top N** do card de distância: 5.
- **Perfil de pagamento:** tipo 2 usa `sqlPerfilEfetivo('f')` de `../lib/perfilPagamento.js` (manual-ou-pedido). Ver [[mapafarma-dev-server-restart]]: reiniciar o servidor após mudanças de backend.
- **Enums de status do pedido (banco):** `pago | atrasado | nao_pago`. Perfil: `paga_em_dia | atrasa | nao_paga`.
- **Testes server:** `cd server && node --test test/<arquivo>`. **Testes client:** `cd client && npm test` (`node --test test/*.test.mjs`).
- **Migrations nos testes:** cada teste server carrega os `.sql` em ordem via `db.executeMultiple` — incluir `003_notificacoes.sql` na lista.

---

## FASE 1 — Migration 003 + input de vencimento

### Task 1: Migration 003 + rota de pedidos aceita/retorna `data_vencimento`

**Files:**
- Create: `server/src/migrations/003_notificacoes.sql`
- Modify: `server/src/routes/pedidos.js` (POST ~32-55, PATCH ~59-91)
- Test: `server/test/pedidos.vencimento.test.js`

**Interfaces:**
- Produces: `POST /pedidos` e `PATCH /pedidos/:id` aceitam `data_vencimento` (string `YYYY-MM-DD` ou `null`); `GET /pedidos` já retorna via `p.*`.

- [ ] **Step 1: Criar a migration**

Criar `server/src/migrations/003_notificacoes.sql`:

```sql
-- 003_notificacoes.sql — vencimento de pedido + push token e preferências de
-- notificação por usuário. Colunas de usuarios ficam sem uso até a Fase 3.
ALTER TABLE pedidos  ADD COLUMN data_vencimento date;               -- null nos pedidos antigos
ALTER TABLE usuarios ADD COLUMN expo_push_token  text;              -- null até o device registrar
ALTER TABLE usuarios ADD COLUMN notif_alertas    integer DEFAULT 1; -- recebe o digest das 8h
ALTER TABLE usuarios ADD COLUMN notif_resumo     integer DEFAULT 1; -- recebe o resumo das 22h30
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `server/test/pedidos.vencimento.test.js`:

```js
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
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd server && node --test test/pedidos.vencimento.test.js`
Expected: FAIL — POST devolve `data_vencimento` `undefined` (coluna não é inserida) e o inválido não dá 400.

- [ ] **Step 4: Validador de data compartilhado**

Em `server/src/lib/` criar `datas.js`:

```js
// 'YYYY-MM-DD' válido? (formato estrito + data real). Vazio/null → tratado fora.
export function dataISOValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
}
```

- [ ] **Step 5: POST aceita `data_vencimento`**

Em `server/src/routes/pedidos.js`, no topo adicionar o import:

```js
import { dataISOValida } from '../lib/datas.js';
```

No handler POST, trocar a desestruturação e adicionar validação + coluna. Substituir:

```js
  const { farmacia_id, valor_centavos, status_pagamento, data_pedido } = req.body || {};
  if (!farmacia_id || !Number.isInteger(valor_centavos)) {
    return res.status(400).json({ erro: 'farmacia_id e valor_centavos (inteiro em centavos) são obrigatórios' });
  }
  const status = status_pagamento ?? 'pago';
  if (!STATUS_PAGAMENTO.includes(status)) return res.status(400).json({ erro: 'status_pagamento inválido' });
  const data = data_pedido || new Date().toISOString().slice(0, 10);

  const far = await db.execute({ sql: 'SELECT id FROM farmacias WHERE id = ?', args: [farmacia_id] });
  if (!far.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });

  const ins = await db.execute({
    sql: `INSERT INTO pedidos (farmacia_id, usuario_id, valor_centavos, status_pagamento, data_pedido)
          VALUES (?,?,?,?,?)`,
    args: [farmacia_id, req.usuario.id, valor_centavos, status, data],
  });
```

por:

```js
  const { farmacia_id, valor_centavos, status_pagamento, data_pedido, data_vencimento } = req.body || {};
  if (!farmacia_id || !Number.isInteger(valor_centavos)) {
    return res.status(400).json({ erro: 'farmacia_id e valor_centavos (inteiro em centavos) são obrigatórios' });
  }
  const status = status_pagamento ?? 'pago';
  if (!STATUS_PAGAMENTO.includes(status)) return res.status(400).json({ erro: 'status_pagamento inválido' });
  if (data_vencimento != null && !dataISOValida(data_vencimento)) {
    return res.status(400).json({ erro: 'data_vencimento deve ser YYYY-MM-DD ou null' });
  }
  const data = data_pedido || new Date().toISOString().slice(0, 10);

  const far = await db.execute({ sql: 'SELECT id FROM farmacias WHERE id = ?', args: [farmacia_id] });
  if (!far.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });

  const ins = await db.execute({
    sql: `INSERT INTO pedidos (farmacia_id, usuario_id, valor_centavos, status_pagamento, data_pedido, data_vencimento)
          VALUES (?,?,?,?,?,?)`,
    args: [farmacia_id, req.usuario.id, valor_centavos, status, data, data_vencimento ?? null],
  });
```

- [ ] **Step 6: PATCH aceita `data_vencimento`**

No handler PATCH, na desestruturação trocar:

```js
  const { status_pagamento, valor_centavos, farmacia_id } = b;
```

por:

```js
  const { status_pagamento, valor_centavos, farmacia_id, data_vencimento } = b;
```

E logo antes de `if (!campos.length)`, adicionar o bloco:

```js
  if (data_vencimento !== undefined) {
    if (data_vencimento !== null && !dataISOValida(data_vencimento)) {
      return res.status(400).json({ erro: 'data_vencimento deve ser YYYY-MM-DD ou null' });
    }
    campos.push('data_vencimento = ?'); args.push(data_vencimento);
  }
```

- [ ] **Step 7: Rodar e ver passar**

Run: `cd server && node --test test/pedidos.vencimento.test.js`
Expected: PASS — 4 testes ok.

- [ ] **Step 8: Rodar TODA a suíte do servidor**

Run: `cd server && node --test test/`
Expected: PASS em tudo (nada quebrado nas rotas de pedidos existentes).

- [ ] **Step 9: Commit**

```bash
git add server/src/migrations/003_notificacoes.sql server/src/lib/datas.js server/src/routes/pedidos.js server/test/pedidos.vencimento.test.js
git commit -m "feat(server): pedidos aceitam data_vencimento (migration 003)"
```

- [ ] **Step 10: Aplicar a migration no banco de dev**

Run: `cd server && npm run migrate`
Expected: `✓ aplicada: 003_notificacoes.sql`. Reiniciar o servidor de dev (ver Global Constraints).

---

### Task 2: Input de vencimento no NovoPedidoSheet

**Files:**
- Modify: `client/src/lib/formato.js` (append)
- Test: `client/test/formato.test.mjs` (append)
- Modify: `client/src/api/client.js` (não precisa: `criarPedido`/`atualizarPedido` já mandam o objeto inteiro)
- Modify: `client/src/components/NovoPedidoSheet.js`
- Modify: `client/src/screens/PedidosScreen.js` (passar `data_vencimento` em `valoresIniciais` na edição)

**Interfaces:**
- Consumes: `dataVencimentoDe(texto) -> 'YYYY-MM-DD' | null`.
- Produces: sheet envia `data_vencimento` no payload de criar/editar.

- [ ] **Step 1: Escrever o teste que falha**

Em `client/test/formato.test.mjs`, adicionar o import de `dataVencimentoDe` na linha de import existente e no fim do arquivo:

```js
test('dataVencimentoDe: dd/mm/aaaa → YYYY-MM-DD', () => {
  assert.equal(dataVencimentoDe('01/08/2026'), '2026-08-01');
});
test('dataVencimentoDe: aceita já-ISO', () => {
  assert.equal(dataVencimentoDe('2026-08-01'), '2026-08-01');
});
test('dataVencimentoDe: vazio → null (opcional)', () => {
  assert.equal(dataVencimentoDe(''), null);
  assert.equal(dataVencimentoDe('  '), null);
});
test('dataVencimentoDe: incompleto/ inválido → null', () => {
  assert.equal(dataVencimentoDe('01/08'), null);
  assert.equal(dataVencimentoDe('32/01/2026'), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd client && npm test`
Expected: FAIL — `dataVencimentoDe` não existe.

- [ ] **Step 3: Implementar `dataVencimentoDe`**

Em `client/src/lib/formato.js`, adicionar:

```js
// Texto opcional de vencimento → 'YYYY-MM-DD' ou null. Aceita 'dd/mm/aaaa' e
// 'aaaa-mm-dd'. Vazio → null (campo é opcional). Data irreal → null.
export function dataVencimentoDe(texto) {
  const s = String(texto ?? '').trim();
  if (!s) return null;
  let ano, mes, dia;
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) { [, dia, mes, ano] = m; }
  else { m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) { [, ano, mes, dia] = m; } }
  if (!m) return null;
  const iso = `${ano}-${mes}-${dia}`;
  const d = new Date(iso + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd client && npm test`
Expected: PASS.

- [ ] **Step 5: Adicionar o campo no NovoPedidoSheet**

Em `client/src/components/NovoPedidoSheet.js`:

Trocar o import de formato:

```js
import { dataCurtaMes } from '../lib/formato';
```
por:
```js
import { dataCurtaMes, dataVencimentoDe } from '../lib/formato';
```

Adicionar estado inicial (após a linha `const [status, setStatus] = ...`):

```js
  const [vencimento, setVencimento] = useState(valoresIniciais.vencimento || '');
```

No `salvar`, trocar a montagem de `dados`:

```js
      const dados = { farmacia_id: farmacia.id, valor_centavos: centavos, status_pagamento: status };
```
por:
```js
      const dados = {
        farmacia_id: farmacia.id, valor_centavos: centavos, status_pagamento: status,
        data_vencimento: dataVencimentoDe(vencimento),
      };
```

No JSX, logo após o bloco do campo "Valor do pedido (R$)" (o `<TextInput>` de valor), adicionar:

```jsx
          <Text style={styles.label}>Vencimento (opcional)</Text>
          <TextInput
            style={styles.input}
            value={vencimento}
            onChangeText={setVencimento}
            placeholder="dd/mm/aaaa"
            placeholderTextColor="#9a9aa2"
            keyboardType="numbers-and-punctuation"
          />
```

- [ ] **Step 6: Pré-preencher o vencimento na edição**

Em `client/src/screens/PedidosScreen.js`, no `valoresIniciais` do `NovoPedidoSheet` de edição (bloco `editando &&`), adicionar a linha `vencimento` ao objeto:

```js
            status: editando.status_pagamento,
            data: editando.data_pedido,
            vencimento: editando.data_vencimento || '',
```

(o `data_vencimento` vem do `GET /pedidos` via `p.*`; formato ISO no input é aceito por `dataVencimentoDe`).

- [ ] **Step 7: Verificação estática**

Run:
```bash
cd client && node -e "const p=require('@babel/parser');const fs=require('fs');for(const f of ['src/components/NovoPedidoSheet.js','src/screens/PedidosScreen.js','src/lib/formato.js']){p.parse(fs.readFileSync(f,'utf8'),{sourceType:'module',plugins:['jsx']});console.log('OK',f);}"
```
Expected: `OK` nos três.

- [ ] **Step 8: Verificação manual (Metro, sem rebuild)**

Com backend rodando e `npx expo start -c`: criar um pedido com vencimento `dd/mm/aaaa`; reabrir em edição e conferir que o campo volta preenchido; salvar sem vencimento e conferir que fica em branco.

- [ ] **Step 9: Commit**

```bash
git add client/src/lib/formato.js client/test/formato.test.mjs client/src/components/NovoPedidoSheet.js client/src/screens/PedidosScreen.js
git commit -m "feat(client): input opcional de vencimento no pedido"
```

---

## FASE 2 — Painel: nunca visitada por distância

### Task 3: `/stats` expõe `nunca_visitadas` e exclui nunca-visitadas de `sem_visita_ha_mais_tempo`

**Files:**
- Modify: `server/src/routes/stats.js`
- Test: `server/test/stats.nunca-visitada.test.js`

**Interfaces:**
- Produces: `GET /stats` com `nunca_visitadas: [{id, nome, bairro, latitude, longitude}]` (farmácias sem nenhum relatório e com coordenada) e `sem_visita_ha_mais_tempo` só de farmácias já-visitadas.

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/test/stats.nunca-visitada.test.js`:

```js
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node --test test/stats.nunca-visitada.test.js`
Expected: FAIL — `nunca_visitadas` é `undefined`; e nunca-visitadas aparecem no `sem_visita_ha_mais_tempo` (null vira `1e9` no sort atual).

- [ ] **Step 3: Excluir nunca-visitadas do `semVisita`**

Em `server/src/routes/stats.js`, no cálculo de `semVisita`, adicionar o filtro `ultima_visita != null` antes do sort. Substituir:

```js
  const semVisita = linhas
    .slice()
    .sort((a, b) => (b.dias_sem_visita ?? 1e9) - (a.dias_sem_visita ?? 1e9))
    .slice(0, 4)
    .map((f) => ({ id: f.id, nome: f.nome, bairro: f.bairro, dias_sem_visita: f.dias_sem_visita }));
```

por:

```js
  const semVisita = linhas
    .filter((f) => f.ultima_visita != null)   // só já-visitadas; nunca-visitadas vão pro card de distância
    .sort((a, b) => (b.dias_sem_visita ?? 0) - (a.dias_sem_visita ?? 0))
    .slice(0, 4)
    .map((f) => ({ id: f.id, nome: f.nome, bairro: f.bairro, dias_sem_visita: f.dias_sem_visita }));
```

- [ ] **Step 4: Consultar e devolver `nunca_visitadas`**

Em `server/src/routes/stats.js`, antes do `res.json({...})`, adicionar a query:

```js
  const nuncaVisitadas = await db.execute(
    `SELECT f.id, f.nome, f.bairro, f.latitude, f.longitude
     FROM farmacias f
     WHERE f.latitude IS NOT NULL AND f.longitude IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM relatorios_visita rv WHERE rv.farmacia_id = f.id)`
  );
```

E incluir no corpo do `res.json`:

```js
    sem_visita_ha_mais_tempo: semVisita,
    nunca_visitadas: nuncaVisitadas.rows,
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd server && node --test test/stats.nunca-visitada.test.js`
Expected: PASS — 2 testes.

- [ ] **Step 6: Rodar TODA a suíte do servidor**

Run: `cd server && node --test test/`
Expected: PASS (inclusive `stats.perfil.test.js`).

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/stats.js server/test/stats.nunca-visitada.test.js
git commit -m "feat(server): /stats expõe nunca_visitadas e separa do sem-visita-há-mais-tempo"
```

---

### Task 4: Função pura `farmaciasMaisProximas` (client)

**Files:**
- Modify: `client/src/lib/hitTest.js` (append)
- Test: `client/test/proximidade.test.mjs`

**Interfaces:**
- Produces: `farmaciasMaisProximas(farmacias, lat, lng, n=5) -> [{...farmacia, distancia_m}]` ordenado por distância crescente, top `n`, ignorando sem coordenada.

- [ ] **Step 1: Escrever o teste que falha**

Criar `client/test/proximidade.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { farmaciasMaisProximas } from '../src/lib/hitTest.js';

const base = { lat: -9.6498, lng: -35.7089 };
const lista = [
  { id: 1, nome: 'Longe',  latitude: -9.70, longitude: -35.75 },
  { id: 2, nome: 'Perto',  latitude: -9.6499, longitude: -35.7090 },
  { id: 3, nome: 'Médio',  latitude: -9.66, longitude: -35.72 },
  { id: 4, nome: 'SemCoord', latitude: null, longitude: null },
];

test('ordena por distância crescente e anexa distancia_m', () => {
  const r = farmaciasMaisProximas(lista, base.lat, base.lng, 5);
  assert.deepEqual(r.map((f) => f.id), [2, 3, 1]);
  assert.ok(r[0].distancia_m < r[1].distancia_m);
});

test('respeita o top N', () => {
  const r = farmaciasMaisProximas(lista, base.lat, base.lng, 2);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((f) => f.id), [2, 3]);
});

test('ignora farmácia sem coordenada', () => {
  const r = farmaciasMaisProximas(lista, base.lat, base.lng, 5);
  assert.ok(!r.some((f) => f.id === 4));
});

test('lista vazia → []', () => {
  assert.deepEqual(farmaciasMaisProximas([], base.lat, base.lng, 5), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd client && npm test`
Expected: FAIL — `farmaciasMaisProximas` não existe.

- [ ] **Step 3: Implementar em `hitTest.js`**

Em `client/src/lib/hitTest.js`, adicionar ao final (reusa `distanciaMetros` já exportada):

```js
// As `n` farmácias mais próximas de (lat,lng), ordenadas por distância, cada
// uma com `distancia_m` anexado. Ignora as sem coordenada.
export function farmaciasMaisProximas(farmacias, lat, lng, n = 5) {
  return farmacias
    .filter((f) => f && f.latitude != null && f.longitude != null)
    .map((f) => ({ ...f, distancia_m: distanciaMetros(lat, lng, f.latitude, f.longitude) }))
    .sort((a, b) => a.distancia_m - b.distancia_m)
    .slice(0, n);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd client && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/hitTest.js client/test/proximidade.test.mjs
git commit -m "feat(client): farmaciasMaisProximas (ordena por distância)"
```

---

### Task 5: Card "Nunca visitadas · perto de você" no Painel

**Files:**
- Modify: `client/src/lib/formato.js` (append — `distanciaCurta`)
- Test: `client/test/formato.test.mjs` (append)
- Modify: `client/src/screens/PainelScreen.js`

**Interfaces:**
- Consumes: `stats.nunca_visitadas`, `farmaciasMaisProximas`, `distanciaCurta(m)`, `expo-location`.
- Produces: card novo com top 5 por distância; card existente renomeado; estado de "sem localização".

- [ ] **Step 1: Teste do formatador de distância (falha)**

Em `client/test/formato.test.mjs`, adicionar `distanciaCurta` ao import e no fim:

```js
test('distanciaCurta: <1km em metros, >=1km em km com vírgula', () => {
  assert.equal(distanciaCurta(850), '850 m');
  assert.equal(distanciaCurta(1200), '1,2 km');
  assert.equal(distanciaCurta(15400), '15,4 km');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd client && npm test`
Expected: FAIL — `distanciaCurta` não existe.

- [ ] **Step 3: Implementar `distanciaCurta`**

Em `client/src/lib/formato.js`, adicionar:

```js
// Metros → rótulo curto: '850 m' abaixo de 1km, senão '1,2 km'.
export function distanciaCurta(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd client && npm test`
Expected: PASS.

- [ ] **Step 5: Adicionar GPS + card no PainelScreen**

Em `client/src/screens/PainelScreen.js`:

Ampliar os imports do topo:

```js
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
```
→ adicionar `Platform` não é preciso; adicionar `* as Location` e helpers:
```js
import * as Location from 'expo-location';
import { farmaciasMaisProximas } from '../lib/hitTest';
import { formatarNomeFarmaciaCompacto, distanciaCurta } from '../lib/formato';
```
(substituindo a linha de import de `formato` existente, que hoje traz só `formatarNomeFarmaciaCompacto`.)

Dentro do componente, após `const [erro, setErro] = useState('');`, adicionar estado de localização:

```js
  const [coord, setCoord] = useState(null);       // {lat, lng} | null
  const [semLocal, setSemLocal] = useState(false); // permissão negada/GPS off
```

Adicionar um efeito que pede localização ao focar (mesmo `coordValida` do MapaScreen):

```js
  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') { if (ativo) setSemLocal(true); return; }
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { latitude, longitude } = pos.coords;
          if (ativo && Number.isFinite(latitude) && Number.isFinite(longitude)
              && latitude > -11 && latitude < -8 && longitude > -37 && longitude < -34) {
            setCoord({ lat: latitude, lng: longitude });
          } else if (ativo) { setSemLocal(true); }
        } catch { if (ativo) setSemLocal(true); }
      })();
      return () => { ativo = false; };
    }, [])
  );
```

Calcular as próximas (após os `const carteira`/`maxVend`):

```js
  const proximas = coord && stats?.nunca_visitadas
    ? farmaciasMaisProximas(stats.nunca_visitadas, coord.lat, coord.lng, 5)
    : [];
```

No JSX, renomear o título do ranking existente:

```jsx
          <Ranking
            titulo="Visitadas há mais tempo"
            subtitulo="priorize estas na próxima rota"
            itens={stats.sem_visita_ha_mais_tempo}
            vazio="Sem dados de visita ainda."
            render={(it) => (
              <Text style={styles.desde}>{it.dias_sem_visita == null ? '—' : `${it.dias_sem_visita}d`}</Text>
            )}
          />
```

E, logo após esse card, adicionar o card novo:

```jsx
          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Nunca visitadas · perto de você</Text>
            <Text style={styles.cardSub}>as mais próximas de onde você está</Text>
            {semLocal ? (
              <Text style={styles.vazio}>Ative a localização para ver farmácias próximas.</Text>
            ) : proximas.length === 0 ? (
              <Text style={styles.vazio}>Nenhuma farmácia sem visita por perto.</Text>
            ) : (
              proximas.map((it, i) => (
                <View key={it.id} style={styles.rankLinha}>
                  <Text style={styles.rankNum}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rankNome} numberOfLines={1}>{formatarNomeFarmaciaCompacto(it)}</Text>
                  </View>
                  <Text style={styles.desde}>{distanciaCurta(it.distancia_m)}</Text>
                </View>
              ))
            )}
          </View>
```

- [ ] **Step 6: Verificação estática**

Run:
```bash
cd client && node -e "const p=require('@babel/parser');const fs=require('fs');for(const f of ['src/screens/PainelScreen.js','src/lib/formato.js']){p.parse(fs.readFileSync(f,'utf8'),{sourceType:'module',plugins:['jsx']});console.log('OK',f);}"
```
Expected: `OK` nos dois.

- [ ] **Step 7: Verificação manual (Metro, sem rebuild)**

Backend rodando + `npx expo start -c`: abrir o Painel; conceder localização → card lista nunca-visitadas por km (mais perto no topo). Negar localização → card mostra "Ative a localização…". Card "Visitadas há mais tempo" não mostra mais "nunca".

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/formato.js client/test/formato.test.mjs client/src/screens/PainelScreen.js
git commit -m "feat(client): Painel card 'nunca visitadas perto de você' (por distância)"
```

---

## FASE 3 — Infra de push (deps nativas: exige rebuild do dev-client)

> A partir daqui há dependências **nativas** (`expo-notifications`, `expo-device`). Após instalá-las é preciso um novo build do dev-client/APK (EAS) — não basta o Metro. Testar em **device físico** (push não funciona em emulador/Expo Go no SDK 57 com nativo custom).

### Task 6: `/auth/me` expõe e grava prefs + push token

**Files:**
- Modify: `server/src/routes/auth.js`
- Test: `server/test/auth.prefs.test.js`

**Interfaces:**
- Produces: `GET /auth/me` retorna `notif_alertas` (0/1), `notif_resumo` (0/1), `tem_push_token` (bool). `PATCH /auth/me` aceita `{ expo_push_token?, notif_alertas?, notif_resumo? }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/test/auth.prefs.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `_test_auth_prefs_${process.pid}.db`);
process.env.TURSO_URL = `file:${DB_FILE}`;
process.env.JWT_SECRET = 'test-secret';

const { db, enableForeignKeys } = await import('../src/db.js');
const { authRouter } = await import('../src/routes/auth.js');
const { gerarToken } = await import('../src/lib/auth.js');
const express = (await import('express')).default;

const migDir = join(__dirname, '..', 'src', 'migrations');
let server, base, token, usuarioId;
function req(path, opts = {}) {
  return fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}

test.before(async () => {
  await enableForeignKeys();
  for (const arq of ['001_init.sql', '002_origem.sql', '003_notificacoes.sql']) {
    await db.executeMultiple(readFileSync(join(migDir, arq), 'utf8'));
  }
  const u = await db.execute("INSERT INTO usuarios (nome, email, senha_hash) VALUES ('T','t@t.com','x')");
  usuarioId = Number(u.lastInsertRowid);
  token = gerarToken({ id: usuarioId, nome: 'T', email: 't@t.com' });
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server?.close(); await db.close(); try { rmSync(DB_FILE); } catch { /* ok */ } });

test('GET /me traz prefs default (1/1) e tem_push_token false', async () => {
  const me = await (await req('/me')).json();
  assert.equal(me.notif_alertas, 1);
  assert.equal(me.notif_resumo, 1);
  assert.equal(me.tem_push_token, false);
});

test('PATCH /me grava token e prefs', async () => {
  await req('/me', { method: 'PATCH', body: JSON.stringify({ expo_push_token: 'ExponentPushToken[abc]', notif_resumo: 0 }) });
  const me = await (await req('/me')).json();
  assert.equal(me.tem_push_token, true);
  assert.equal(me.notif_resumo, 0);
  assert.equal(me.notif_alertas, 1); // não mexido
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node --test test/auth.prefs.test.js`
Expected: FAIL — `GET /me` não traz `notif_*`/`tem_push_token`; não há `PATCH /me`.

- [ ] **Step 3: Atualizar `GET /me`**

Em `server/src/routes/auth.js`, substituir o handler `GET /me` por:

```js
authRouter.get('/me', autenticar, ah(async (req, res) => {
  const r = await db.execute({
    sql: `SELECT id, nome, email, criado_em, notif_alertas, notif_resumo,
            (expo_push_token IS NOT NULL) AS tem_push_token
          FROM usuarios WHERE id = ?`,
    args: [req.usuario.id],
  });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado' });
  const u = r.rows[0];
  res.json({ ...u, tem_push_token: !!u.tem_push_token });
}));
```

- [ ] **Step 4: Adicionar `PATCH /me`**

Logo após o `GET /me`, adicionar:

```js
// PATCH /auth/me  { expo_push_token?, notif_alertas?, notif_resumo? }
authRouter.patch('/me', autenticar, ah(async (req, res) => {
  const b = req.body || {};
  const campos = [];
  const args = [];
  if (b.expo_push_token !== undefined) { campos.push('expo_push_token = ?'); args.push(b.expo_push_token || null); }
  if (b.notif_alertas !== undefined) { campos.push('notif_alertas = ?'); args.push(b.notif_alertas ? 1 : 0); }
  if (b.notif_resumo !== undefined) { campos.push('notif_resumo = ?'); args.push(b.notif_resumo ? 1 : 0); }
  if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar' });
  args.push(req.usuario.id);
  await db.execute({ sql: `UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, args });
  res.json({ ok: true });
}));
```

- [ ] **Step 5: Rodar e ver passar; depois a suíte toda**

Run: `cd server && node --test test/auth.prefs.test.js`
Expected: PASS.
Run: `cd server && node --test test/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/auth.js server/test/auth.prefs.test.js
git commit -m "feat(server): /auth/me lê e grava prefs de notificação + push token"
```

---

### Task 7: Registro do Expo push token no client

**Files:**
- Install: `expo-notifications`, `expo-device`
- Modify: `client/src/api/client.js` (novo método `atualizarPerfil`)
- Create: `client/src/lib/push.js`
- Modify: `client/src/lib/auth.js` (chamar registro após autenticar)

**Interfaces:**
- Produces: `api.atualizarPerfil(patch)` → `PATCH /auth/me`; `registrarPush()` pede permissão, obtém token e faz PATCH.

- [ ] **Step 1: Instalar as deps nativas**

Run: `cd client && npx expo install expo-notifications expo-device`
Expected: adiciona as duas ao `package.json` nas versões do SDK 57.

- [ ] **Step 2: Método de API**

Em `client/src/api/client.js`, no objeto `api`, adicionar após `me`:

```js
  atualizarPerfil: (patch) => request('/auth/me', { method: 'PATCH', body: patch }),
```

- [ ] **Step 3: Módulo de push**

Criar `client/src/lib/push.js`:

```js
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '../api/client';

// Pede permissão, obtém o Expo push token e envia ao servidor. Silencioso em
// falha (sem permissão, emulador, sem rede) — nunca quebra o fluxo de login.
export async function registrarPush() {
  try {
    if (!Device.isDevice) return;
    const { status: atual } = await Notifications.getPermissionsAsync();
    let status = atual;
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token) await api.atualizarPerfil({ expo_push_token: token });
  } catch {
    /* silencioso */
  }
}
```

- [ ] **Step 4: Chamar no fluxo de auth**

Em `client/src/lib/auth.js`, importar e chamar `registrarPush()` após validar/entrar (não-bloqueante):

Adicionar import:
```js
import { registrarPush } from './push';
```

No `useEffect` de abertura, após `setUsuario(u); setTok(t);` adicionar:
```js
          registrarPush();
```

No `entrar`, após `setUsuario(u);` adicionar:
```js
    registrarPush();
```

- [ ] **Step 5: Verificação estática**

Run:
```bash
cd client && node -e "const p=require('@babel/parser');const fs=require('fs');for(const f of ['src/lib/push.js','src/lib/auth.js','src/api/client.js']){p.parse(fs.readFileSync(f,'utf8'),{sourceType:'module',plugins:['jsx']});console.log('OK',f);}"
```
Expected: `OK` nos três.

- [ ] **Step 6: Rebuild + verificação manual (device físico)**

Gerar novo dev-client/APK (deps nativas novas): `cd client && eas build --profile development --platform android` (ou o perfil de dev do projeto). Instalar no aparelho, logar, aceitar a permissão de notificação. Conferir no banco que `usuarios.expo_push_token` foi preenchido para o usuário logado.

- [ ] **Step 7: Commit**

```bash
git add client/package.json client/src/api/client.js client/src/lib/push.js client/src/lib/auth.js
git commit -m "feat(client): registra Expo push token no login"
```

---

### Task 8: Toggles reais na Conta

**Files:**
- Modify: `client/src/screens/ContaScreen.js`

**Interfaces:**
- Consumes: `api.me()`, `api.atualizarPerfil({ notif_alertas?, notif_resumo? })`.

- [ ] **Step 1: Ler prefs do servidor e gravar via PATCH**

Em `client/src/screens/ContaScreen.js`, substituir o modelo local por servidor:

Remover o import e as constantes de AsyncStorage:
```js
import AsyncStorage from '@react-native-async-storage/async-storage';
```
```js
const PREFS_KEY = 'mapafarma_prefs';
const PREFS_PADRAO = { notificacoes: true, resumo_diario: false };
```
e o `useEffect` que lê `AsyncStorage.getItem(PREFS_KEY)`.

Trocar o estado inicial:
```js
  const [prefs, setPrefs] = useState(PREFS_PADRAO);
```
por:
```js
  const [prefs, setPrefs] = useState({ notif_alertas: 1, notif_resumo: 1 });
```

No `useFocusEffect`, dentro do `Promise.all`, incluir `api.me()` e setar as prefs. Trocar:
```js
          const [usuarios, farmacias, pedidosResp] = await Promise.all([
            api.usuarios(), api.listarFarmacias(), api.listarPedidos(),
          ]);
          if (!ativo) return;
          setEquipe(usuarios);
```
por:
```js
          const [usuarios, farmacias, pedidosResp, me] = await Promise.all([
            api.usuarios(), api.listarFarmacias(), api.listarPedidos(), api.me(),
          ]);
          if (!ativo) return;
          setEquipe(usuarios);
          setPrefs({ notif_alertas: me.notif_alertas, notif_resumo: me.notif_resumo });
```

Trocar `alternarPref`:
```js
  function alternarPref(chave) {
    const novo = { ...prefs, [chave]: !prefs[chave] };
    setPrefs(novo);
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(novo));
  }
```
por:
```js
  function alternarPref(chave) {
    const novo = { ...prefs, [chave]: prefs[chave] ? 0 : 1 };
    setPrefs(novo);
    api.atualizarPerfil({ [chave]: novo[chave] }).catch(() => setPrefs(prefs)); // reverte em erro
  }
```

Atualizar os dois `<Pref>` (mapeamento de chaves e descrição do horário):
```jsx
          <Pref
            titulo="Notificações"
            descricao="Alertas de visitas e cobranças (8h)"
            ativo={!!prefs.notif_alertas}
            onToggle={() => alternarPref('notif_alertas')}
            borda={false}
          />
          <Pref
            titulo="Resumo diário"
            descricao="Relatório do seu dia às 22h30"
            ativo={!!prefs.notif_resumo}
            onToggle={() => alternarPref('notif_resumo')}
            borda
          />
```

- [ ] **Step 2: Verificação estática**

Run:
```bash
cd client && node -e "const p=require('@babel/parser');const fs=require('fs');p.parse(fs.readFileSync('src/screens/ContaScreen.js','utf8'),{sourceType:'module',plugins:['jsx']});console.log('OK');"
```
Expected: `OK`.

- [ ] **Step 3: Verificação manual**

Abrir Conta: toggles refletem o servidor; alternar e conferir via `GET /auth/me` (ou no banco) que `notif_alertas`/`notif_resumo` mudaram.

- [ ] **Step 4: Commit**

```bash
git add client/src/screens/ContaScreen.js
git commit -m "feat(client): toggles de notificação lêem/gravam no servidor"
```

---

## FASE 4 — Lógica dos números + agendamento

### Task 9: Números do digest e do resumo (`notificacoes/dados.js`)

**Files:**
- Create: `server/src/notificacoes/dados.js`
- Test: `server/test/notificacoes.dados.test.js`

**Interfaces:**
- Produces:
  - `numerosDigest(db) -> { sem_visita, atraso, vencidos }` (todos inteiros).
  - `resumoDoDia(db, usuarioId) -> { visitas, pedidos, total_centavos }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/test/notificacoes.dados.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `_test_notif_dados_${process.pid}.db`);
process.env.TURSO_URL = `file:${DB_FILE}`;

const { db, enableForeignKeys } = await import('../src/db.js');
const { numerosDigest, resumoDoDia } = await import('../src/notificacoes/dados.js');

const migDir = join(__dirname, '..', 'src', 'migrations');
let usuarioId;
// "hoje" na convenção do servidor (UTC-3), pra casar com date('now','-3 hours').
const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const diasAtras = (n) => new Date(Date.now() - 3 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);

async function farmacia(perfilManual = null) {
  const r = await db.execute({ sql: "INSERT INTO farmacias (nome, latitude, longitude, perfil_pagamento) VALUES ('F',-9.65,-35.71,?)", args: [perfilManual] });
  return Number(r.lastInsertRowid);
}
async function visita(fid, data) { await db.execute({ sql: "INSERT INTO relatorios_visita (farmacia_id, usuario_id, data_visita) VALUES (?,?,?)", args: [fid, usuarioId, data] }); }
async function pedido(fid, valor, status, dataPedido, vencimento = null) {
  await db.execute({ sql: "INSERT INTO pedidos (farmacia_id, usuario_id, valor_centavos, status_pagamento, data_pedido, data_vencimento) VALUES (?,?,?,?,?,?)", args: [fid, usuarioId, valor, status, dataPedido, vencimento] });
}

test.before(async () => {
  await enableForeignKeys();
  for (const arq of ['001_init.sql', '002_origem.sql', '003_notificacoes.sql']) {
    await db.executeMultiple(readFileSync(join(migDir, arq), 'utf8'));
  }
  const u = await db.execute("INSERT INTO usuarios (nome, email, senha_hash) VALUES ('T','t@t.com','x')");
  usuarioId = Number(u.lastInsertRowid);
});
test.after(async () => { await db.close(); try { rmSync(DB_FILE); } catch { /* ok */ } });

test('numerosDigest: tipo1 conta visitada-há-+30d, não a nunca-visitada nem a recente', async () => {
  const antiga = await farmacia();  await visita(antiga, diasAtras(40));
  const recente = await farmacia(); await visita(recente, diasAtras(5));
  await farmacia(); // nunca visitada → NÃO conta no tipo 1
  const n = await numerosDigest(db);
  assert.equal(n.sem_visita, 1);
});

test('numerosDigest: tipo2 conta efetivo atrasa/nao_paga (manual ou pedido)', async () => {
  const fManual = await farmacia('nao_paga');
  const fPedido = await farmacia(); await pedido(fPedido, 1000, 'atrasado', hoje);
  const n = await numerosDigest(db);
  assert.ok(n.atraso >= 2, `esperava >=2, veio ${n.atraso}`);
});

test('numerosDigest: tipo3 conta vencido não-pago, ignora pago e futuro', async () => {
  const f = await farmacia();
  await pedido(f, 1000, 'atrasado', diasAtras(10), diasAtras(2)); // vencido, não pago → conta
  await pedido(f, 1000, 'pago', diasAtras(10), diasAtras(2));      // vencido, pago → não
  await pedido(f, 1000, 'atrasado', hoje, diasAtras(-5));          // vence no futuro → não
  const n = await numerosDigest(db);
  assert.equal(n.vencidos, 1);
});

test('resumoDoDia: conta visitas/pedidos/total do usuário no dia', async () => {
  const f = await farmacia();
  await visita(f, hoje);
  await pedido(f, 25000, 'pago', hoje);
  await pedido(f, 75000, 'pago', hoje);
  await pedido(f, 999, 'pago', diasAtras(1)); // ontem → não entra
  const r = await resumoDoDia(db, usuarioId);
  assert.equal(r.visitas, 1);
  assert.equal(r.pedidos, 2);
  assert.equal(r.total_centavos, 100000);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node --test test/notificacoes.dados.test.js`
Expected: FAIL — módulo `notificacoes/dados.js` não existe.

- [ ] **Step 3: Implementar `dados.js`**

Criar `server/src/notificacoes/dados.js`:

```js
import { sqlPerfilEfetivo } from '../lib/perfilPagamento.js';

// "Hoje" do servidor em UTC-3 (Maceió, sem horário de verão).
const HOJE = "date('now','-3 hours')";

// Números do digest de alertas (snapshot atual).
export async function numerosDigest(db) {
  const semVisita = await db.execute(
    `SELECT COUNT(*) AS n FROM farmacias f
     WHERE EXISTS (SELECT 1 FROM relatorios_visita rv WHERE rv.farmacia_id = f.id)
       AND (SELECT MAX(rv.data_visita) FROM relatorios_visita rv WHERE rv.farmacia_id = f.id) < date(${HOJE}, '-30 days')`
  );
  const atraso = await db.execute(
    `SELECT COUNT(*) AS n FROM (SELECT ${sqlPerfilEfetivo('f')} AS p FROM farmacias f)
     WHERE p IN ('atrasa', 'nao_paga')`
  );
  const vencidos = await db.execute(
    `SELECT COUNT(*) AS n FROM pedidos
     WHERE data_vencimento IS NOT NULL AND data_vencimento < ${HOJE} AND status_pagamento != 'pago'`
  );
  return {
    sem_visita: semVisita.rows[0].n,
    atraso: atraso.rows[0].n,
    vencidos: vencidos.rows[0].n,
  };
}

// Números do dia de um vendedor (visitas/pedidos/total que ELE registrou hoje).
export async function resumoDoDia(db, usuarioId) {
  const v = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM relatorios_visita WHERE usuario_id = ? AND data_visita = ${HOJE}`,
    args: [usuarioId],
  });
  const p = await db.execute({
    sql: `SELECT COUNT(*) AS n, COALESCE(SUM(valor_centavos), 0) AS total
          FROM pedidos WHERE usuario_id = ? AND data_pedido = ${HOJE}`,
    args: [usuarioId],
  });
  return { visitas: v.rows[0].n, pedidos: p.rows[0].n, total_centavos: p.rows[0].total };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && node --test test/notificacoes.dados.test.js`
Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add server/src/notificacoes/dados.js server/test/notificacoes.dados.test.js
git commit -m "feat(server): números do digest e do resumo diário (notificacoes/dados)"
```

---

### Task 10: Mensagens e destinatários (`mensagens.js`, `destinatarios.js`)

**Files:**
- Create: `server/src/notificacoes/mensagens.js`
- Create: `server/src/notificacoes/destinatarios.js`
- Test: `server/test/notificacoes.mensagens.test.js`
- Test: `server/test/notificacoes.destinatarios.test.js`

**Interfaces:**
- Produces:
  - `mensagemDigest({ sem_visita, atraso, vencidos }) -> string | null` (null se tudo 0).
  - `mensagemResumo({ visitas, pedidos, total_centavos }) -> string | null` (null se tudo 0).
  - `destinatariosAlertas(db) -> [{ id, expo_push_token }]`.
  - `destinatariosResumo(db) -> [{ id, expo_push_token }]`.

- [ ] **Step 1: Testes de mensagens (falha)**

Criar `server/test/notificacoes.mensagens.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mensagemDigest, mensagemResumo } from '../src/notificacoes/mensagens.js';

test('digest: junta só os itens > 0', () => {
  assert.equal(mensagemDigest({ sem_visita: 3, atraso: 0, vencidos: 1 }), '3 sem visita há +30d · 1 pedido vencido');
});
test('digest: tudo zero → null', () => {
  assert.equal(mensagemDigest({ sem_visita: 0, atraso: 0, vencidos: 0 }), null);
});
test('digest: singular/plural de pedido vencido', () => {
  assert.equal(mensagemDigest({ sem_visita: 0, atraso: 0, vencidos: 2 }), '2 pedidos vencidos');
});
test('resumo: formata total em BRL', () => {
  assert.equal(mensagemResumo({ visitas: 5, pedidos: 3, total_centavos: 125000 }), 'Seu dia: 5 visitas · 3 pedidos · R$ 1.250,00 vendido');
});
test('resumo: sem atividade → null', () => {
  assert.equal(mensagemResumo({ visitas: 0, pedidos: 0, total_centavos: 0 }), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node --test test/notificacoes.mensagens.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `mensagens.js`**

Criar `server/src/notificacoes/mensagens.js`:

```js
const brl = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Digest de alertas: só inclui os itens com contagem > 0. Null se nada.
export function mensagemDigest({ sem_visita, atraso, vencidos }) {
  const partes = [];
  if (sem_visita > 0) partes.push(`${sem_visita} sem visita há +30d`);
  if (atraso > 0) partes.push(`${atraso} em atraso`);
  if (vencidos > 0) partes.push(`${vencidos} ${vencidos === 1 ? 'pedido vencido' : 'pedidos vencidos'}`);
  return partes.length ? partes.join(' · ') : null;
}

// Resumo do dia do vendedor. Null se não houve atividade nenhuma.
export function mensagemResumo({ visitas, pedidos, total_centavos }) {
  if (!visitas && !pedidos && !total_centavos) return null;
  return `Seu dia: ${visitas} visitas · ${pedidos} pedidos · ${brl(total_centavos)} vendido`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && node --test test/notificacoes.mensagens.test.js`
Expected: PASS.

- [ ] **Step 5: Teste de destinatários (falha)**

Criar `server/test/notificacoes.destinatarios.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `_test_notif_dest_${process.pid}.db`);
process.env.TURSO_URL = `file:${DB_FILE}`;

const { db, enableForeignKeys } = await import('../src/db.js');
const { destinatariosAlertas, destinatariosResumo } = await import('../src/notificacoes/destinatarios.js');

const migDir = join(__dirname, '..', 'src', 'migrations');
async function user(nome, token, alertas, resumo) {
  await db.execute({
    sql: "INSERT INTO usuarios (nome, email, senha_hash, expo_push_token, notif_alertas, notif_resumo) VALUES (?,?,?,?,?,?)",
    args: [nome, `${nome}@t.com`, 'x', token, alertas, resumo],
  });
}

test.before(async () => {
  await enableForeignKeys();
  for (const arq of ['001_init.sql', '002_origem.sql', '003_notificacoes.sql']) {
    await db.executeMultiple(readFileSync(join(migDir, arq), 'utf8'));
  }
  await user('ComTudo', 'ExponentPushToken[a]', 1, 1);
  await user('SemToken', null, 1, 1);          // sem token → nunca recebe
  await user('SoAlertas', 'ExponentPushToken[b]', 1, 0);
  await user('SoResumo', 'ExponentPushToken[c]', 0, 1);
});
test.after(async () => { await db.close(); try { rmSync(DB_FILE); } catch { /* ok */ } });

test('destinatariosAlertas: token não-nulo E notif_alertas=1', async () => {
  const nomes = (await destinatariosAlertas(db)).map((u) => u.nome).sort();
  assert.deepEqual(nomes, ['ComTudo', 'SoAlertas']);
});
test('destinatariosResumo: token não-nulo E notif_resumo=1', async () => {
  const nomes = (await destinatariosResumo(db)).map((u) => u.nome).sort();
  assert.deepEqual(nomes, ['ComTudo', 'SoResumo']);
});
```

(o SELECT devolve também `nome` pra facilitar o teste; a interface consumida em produção usa só `id`/`expo_push_token`.)

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd server && node --test test/notificacoes.destinatarios.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 7: Implementar `destinatarios.js`**

Criar `server/src/notificacoes/destinatarios.js`:

```js
export async function destinatariosAlertas(db) {
  const r = await db.execute(
    `SELECT id, nome, expo_push_token FROM usuarios
     WHERE expo_push_token IS NOT NULL AND notif_alertas = 1`
  );
  return r.rows;
}

export async function destinatariosResumo(db) {
  const r = await db.execute(
    `SELECT id, nome, expo_push_token FROM usuarios
     WHERE expo_push_token IS NOT NULL AND notif_resumo = 1`
  );
  return r.rows;
}
```

- [ ] **Step 8: Rodar e ver passar (ambos)**

Run: `cd server && node --test test/notificacoes.mensagens.test.js test/notificacoes.destinatarios.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/src/notificacoes/mensagens.js server/src/notificacoes/destinatarios.js server/test/notificacoes.mensagens.test.js server/test/notificacoes.destinatarios.test.js
git commit -m "feat(server): mensagens e seleção de destinatários das notificações"
```

---

### Task 11: Envio (`envio.js`) + agendamento (`agenda.js`) + wiring no `index.js`

**Files:**
- Install: `node-cron`, `expo-server-sdk`
- Create: `server/src/notificacoes/envio.js`
- Create: `server/src/notificacoes/agenda.js`
- Modify: `server/src/index.js`
- Test: `server/test/notificacoes.agenda.test.js`

**Interfaces:**
- Consumes: `numerosDigest`, `resumoDoDia`, `mensagemDigest`, `mensagemResumo`, `destinatariosAlertas`, `destinatariosResumo`.
- Produces:
  - `criarEnviador() -> enviar(mensagens)` (mensagens: `[{ to, title, body }]`).
  - `dispararDigest(db, enviar) -> Promise<number>` (nº de pushes enfileirados).
  - `dispararResumo(db, enviar) -> Promise<number>`.
  - `iniciarAgenda(db, enviar)` — registra os dois cron jobs.

- [ ] **Step 1: Instalar as deps**

Run: `cd server && npm install node-cron expo-server-sdk`
Expected: adiciona ambas ao `package.json`.

- [ ] **Step 2: Teste do disparo (falha) — com enviador fake**

Criar `server/test/notificacoes.agenda.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `_test_notif_agenda_${process.pid}.db`);
process.env.TURSO_URL = `file:${DB_FILE}`;

const { db, enableForeignKeys } = await import('../src/db.js');
const { dispararDigest, dispararResumo } = await import('../src/notificacoes/agenda.js');

const migDir = join(__dirname, '..', 'src', 'migrations');
const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
let usuarioId;

test.before(async () => {
  await enableForeignKeys();
  for (const arq of ['001_init.sql', '002_origem.sql', '003_notificacoes.sql']) {
    await db.executeMultiple(readFileSync(join(migDir, arq), 'utf8'));
  }
  const u = await db.execute("INSERT INTO usuarios (nome, email, senha_hash, expo_push_token, notif_alertas, notif_resumo) VALUES ('T','t@t.com','x','ExponentPushToken[a]',1,1)");
  usuarioId = Number(u.lastInsertRowid);
  const f = await db.execute("INSERT INTO farmacias (nome, latitude, longitude, perfil_pagamento) VALUES ('F',-9.65,-35.71,'nao_paga')");
  const fid = Number(f.lastInsertRowid);
  await db.execute({ sql: "INSERT INTO pedidos (farmacia_id, usuario_id, valor_centavos, status_pagamento, data_pedido) VALUES (?,?,?,?,?)", args: [fid, usuarioId, 50000, 'pago', hoje] });
});
test.after(async () => { await db.close(); try { rmSync(DB_FILE); } catch { /* ok */ } });

test('dispararDigest envia 1 push (há atraso) com o texto certo', async () => {
  const enviados = [];
  const n = await dispararDigest(db, async (msgs) => enviados.push(...msgs));
  assert.equal(n, 1);
  assert.equal(enviados[0].to, 'ExponentPushToken[a]');
  assert.match(enviados[0].body, /em atraso/);
});

test('dispararResumo envia o resumo do vendedor com atividade', async () => {
  const enviados = [];
  const n = await dispararResumo(db, async (msgs) => enviados.push(...msgs));
  assert.equal(n, 1);
  assert.match(enviados[0].body, /Seu dia:/);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd server && node --test test/notificacoes.agenda.test.js`
Expected: FAIL — `agenda.js` não existe.

- [ ] **Step 4: Implementar `envio.js`**

Criar `server/src/notificacoes/envio.js`:

```js
import { Expo } from 'expo-server-sdk';

// Enviador real: manda os pushes via Expo em chunks. `mensagens` é
// [{ to, title, body }]. Ignora tokens em formato inválido.
export function criarEnviador() {
  const expo = new Expo();
  return async function enviar(mensagens) {
    const validas = mensagens.filter((m) => Expo.isExpoPushToken(m.to));
    for (const chunk of expo.chunkPushNotifications(validas)) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (e) {
        console.error('Falha ao enviar push:', e?.message || e);
      }
    }
  };
}
```

- [ ] **Step 5: Implementar `agenda.js`**

Criar `server/src/notificacoes/agenda.js`:

```js
import cron from 'node-cron';
import { numerosDigest, resumoDoDia } from './dados.js';
import { mensagemDigest, mensagemResumo } from './mensagens.js';
import { destinatariosAlertas, destinatariosResumo } from './destinatarios.js';

const TZ = 'America/Maceio';

// Digest de alertas → broadcast pra todos com notif_alertas + token. Uma mesma
// mensagem pra todos. Devolve quantos pushes foram enfileirados.
export async function dispararDigest(db, enviar) {
  const corpo = mensagemDigest(await numerosDigest(db));
  if (!corpo) return 0;
  const alvos = await destinatariosAlertas(db);
  const msgs = alvos.map((u) => ({ to: u.expo_push_token, title: '☀️ Mapa Farma', body: corpo }));
  if (msgs.length) await enviar(msgs);
  return msgs.length;
}

// Resumo diário → por vendedor, com os próprios números; pula quem não teve
// atividade. Devolve quantos pushes foram enfileirados.
export async function dispararResumo(db, enviar) {
  const alvos = await destinatariosResumo(db);
  const msgs = [];
  for (const u of alvos) {
    const corpo = mensagemResumo(await resumoDoDia(db, u.id));
    if (corpo) msgs.push({ to: u.expo_push_token, title: '📋 Mapa Farma', body: corpo });
  }
  if (msgs.length) await enviar(msgs);
  return msgs.length;
}

// Registra os dois jobs no fuso de Maceió. Chamado no start do servidor.
export function iniciarAgenda(db, enviar) {
  cron.schedule('0 8 * * *', () => { dispararDigest(db, enviar).catch(console.error); }, { timezone: TZ });
  cron.schedule('30 22 * * *', () => { dispararResumo(db, enviar).catch(console.error); }, { timezone: TZ });
  console.log('Agenda de notificações ativa (digest 08h, resumo 22h30, TZ ' + TZ + ')');
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd server && node --test test/notificacoes.agenda.test.js`
Expected: PASS — 2 testes.

- [ ] **Step 7: Ligar no `index.js`**

Em `server/src/index.js`, adicionar os imports:

```js
import { db } from './db.js';
import { iniciarAgenda } from './notificacoes/agenda.js';
import { criarEnviador } from './notificacoes/envio.js';
```

(nota: `enableForeignKeys` já é importado de `./db.js`; adicionar `db` à mesma linha de import ou numa nova.)

E antes do `app.listen`, iniciar a agenda:

```js
await enableForeignKeys();
iniciarAgenda(db, criarEnviador());
app.listen(PORT, () => console.log(`Mapa Farma API em http://localhost:${PORT}`));
```

- [ ] **Step 8: Rodar TODA a suíte do servidor**

Run: `cd server && node --test test/`
Expected: PASS em tudo.

- [ ] **Step 9: Fumaça manual do disparo (sem esperar o cron)**

Criar um script temporário `server/_smoke_notif.mjs` que chama `dispararDigest`/`dispararResumo` com um enviador que só faz `console.log`, rodar `node _smoke_notif.mjs`, conferir o texto, e apagar o arquivo. (Push real só chega em device com token válido — ver limitação de hospedagem.)

- [ ] **Step 10: Commit**

```bash
git add server/package.json server/package-lock.json server/src/notificacoes/envio.js server/src/notificacoes/agenda.js server/src/index.js server/test/notificacoes.agenda.test.js
git commit -m "feat(server): agenda cron do digest 8h e resumo 22h30 + envio Expo"
```

---

## Self-Review (feito na escrita)

**Spec coverage:**
- Migration 003 (data_vencimento + colunas usuarios) → Task 1. ✓
- Input de vencimento → Task 2. ✓
- `/stats.nunca_visitadas` + card existente só já-visitadas → Task 3. ✓
- Distância client-side (Haversine) + card Painel + GPS-ao-focar/esconder → Tasks 4-5. ✓
- Prefs/token no `/auth/me` → Task 6; registro de token → Task 7; toggles reais → Task 8. ✓
- Tipos 1-3 (tipo1 exclui nunca-visitada; tipo2 efetivo; tipo3 vencido não-pago) + resumo por vendedor → Task 9. ✓
- Digest snapshot sem dedup, broadcast; resumo pula sem-atividade → Tasks 9-11. ✓
- Cron 8h/22h30 TZ America/Maceio + envio Expo → Task 11. ✓
- Fuso `date('now','-3 hours')` em todas as datas → Task 9 (`HOJE`). ✓

**Placeholder scan:** sem TBD/TODO; todo passo de código traz o código. ✓

**Type consistency:** `numerosDigest`/`resumoDoDia` (Task 9) consumidos com as mesmas chaves em `mensagens` (Task 10) e `agenda` (Task 11); `destinatarios*` devolvem `{id, expo_push_token}` usados no `agenda`; `farmaciasMaisProximas(...,n=5)` anexa `distancia_m`, consumido no Painel via `distanciaCurta`. ✓
