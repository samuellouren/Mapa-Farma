# Editar e Excluir Pedidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar e excluir um pedido a partir da tela Pedidos, via long-press no card.

**Architecture:** Backend estende `PATCH /pedidos/:id` (valor/farmácia) e adiciona `DELETE /pedidos/:id` (sem cascade — pedido é registro-folha). Cliente reusa `NovoPedidoSheet` em modo edição e adiciona um menu de long-press na `PedidosScreen`. Sem alteração de schema.

**Tech Stack:** Node + Express + Turso/libSQL (servidor); React Native / Expo 57 (cliente). Testes: `node --test`.

## Global Constraints

- **Sem alteração de schema** — a tabela `pedidos` já tem todos os campos. Nenhuma migration.
- **`data_pedido` é imutável** — nunca aceita no corpo do PATCH; a data reflete o registro original (mesma regra do relatório de visita, por integridade financeira).
- Todo pedido é editável/excluível (sem restrição de origem).
- `PATCH /pedidos/:id` aplica só os campos presentes no corpo: `status_pagamento` (enum), `valor_centavos` (inteiro > 0), `farmacia_id` (deve existir). Corpo sem nenhum desses → 400.
- `DELETE /pedidos/:id` → 404 se não existir; senão apaga e retorna `{ ok: true }`. Sem cascade/escalonamento.
- Editar reusa `NovoPedidoSheet` (farmácia + valor + status), pré-preenchido; salvar faz PATCH.
- Dinheiro sempre em centavos (inteiro). Expo 57 mudou — consultar `https://docs.expo.dev/versions/v57.0.0/` antes de escrever código de cliente novo.
- Commits frequentes, um por task.

---

## File Structure

**Servidor:**
- `server/src/routes/pedidos.js` (modificar) — PATCH estendido; DELETE novo.
- `server/test/pedidos.routes.test.js` (novo) — integração.

**Cliente:**
- `client/src/lib/formato.js` (modificar) — `centavosParaInput`.
- `client/test/formato.test.mjs` (modificar) — teste de `centavosParaInput`.
- `client/src/api/client.js` (modificar) — `excluirPedido`.
- `client/src/components/NovoPedidoSheet.js` (modificar) — modo criar/editar; `onCriado` → `onSalvo`.
- `client/src/screens/PedidosScreen.js` (modificar) — call-site do sheet (`onSalvo`) + long-press → menu editar/excluir.

---

## Task 1: Backend — PATCH estendido + DELETE + integração

**Files:**
- Modify: `server/src/routes/pedidos.js`
- Test: `server/test/pedidos.routes.test.js`

**Interfaces:**
- Produces:
  - `PATCH /pedidos/:id` aceita `{ status_pagamento?, valor_centavos?, farmacia_id? }` (só os presentes); `data_pedido` nunca muda; responde a linha com join `farmacia_nome`/`farmacia_bairro`.
  - `DELETE /pedidos/:id` → 404 | `{ ok: true }`.

- [ ] **Step 1: Escrever o teste de integração que falha**

Create `server/test/pedidos.routes.test.js`:
```js
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run:
```bash
cd server && node --test test/pedidos.routes.test.js
```
Expected: FAIL (PATCH ignora valor/farmacia; DELETE responde 404 pois a rota não existe).

- [ ] **Step 3: Estender o PATCH**

In `server/src/routes/pedidos.js`, substituir o handler `PATCH /:id` inteiro:
```js
// PATCH /pedidos/:id  { status_pagamento?, valor_centavos?, farmacia_id? }
// Aplica só os campos presentes. data_pedido é imutável (não aceito).
pedidosRouter.patch('/:id', ah(async (req, res) => {
  const b = req.body || {};
  const { status_pagamento, valor_centavos, farmacia_id } = b;
  const campos = [];
  const args = [];

  if (status_pagamento !== undefined) {
    if (!STATUS_PAGAMENTO.includes(status_pagamento)) return res.status(400).json({ erro: 'status_pagamento inválido' });
    campos.push('status_pagamento = ?'); args.push(status_pagamento);
  }
  if (valor_centavos !== undefined) {
    if (!Number.isInteger(valor_centavos) || valor_centavos <= 0) {
      return res.status(400).json({ erro: 'valor_centavos deve ser inteiro em centavos maior que zero' });
    }
    campos.push('valor_centavos = ?'); args.push(valor_centavos);
  }
  if (farmacia_id !== undefined) {
    const far = await db.execute({ sql: 'SELECT id FROM farmacias WHERE id = ?', args: [farmacia_id] });
    if (!far.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });
    campos.push('farmacia_id = ?'); args.push(farmacia_id);
  }
  if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar' });

  args.push(req.params.id);
  await db.execute({ sql: `UPDATE pedidos SET ${campos.join(', ')} WHERE id = ?`, args });
  const r = await db.execute({
    sql: `SELECT p.*, f.nome AS farmacia_nome, f.bairro AS farmacia_bairro
          FROM pedidos p JOIN farmacias f ON f.id = p.farmacia_id WHERE p.id = ?`,
    args: [req.params.id],
  });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Pedido não encontrado' });
  res.json(r.rows[0]);
}));
```

- [ ] **Step 4: Adicionar o DELETE**

In `server/src/routes/pedidos.js`, adicionar após o PATCH:
```js
// DELETE /pedidos/:id  — pedido é registro-folha, sem cascade
pedidosRouter.delete('/:id(\\d+)', ah(async (req, res) => {
  const r = await db.execute({ sql: 'SELECT id FROM pedidos WHERE id = ?', args: [req.params.id] });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Pedido não encontrado' });
  await db.execute({ sql: 'DELETE FROM pedidos WHERE id = ?', args: [req.params.id] });
  res.json({ ok: true });
}));
```

- [ ] **Step 5: Rodar o teste do arquivo e ver passar**

Run:
```bash
cd server && node --test test/pedidos.routes.test.js
```
Expected: PASS — 8 testes. Nenhum `_test_pedidos_*.db` deve sobrar.

- [ ] **Step 6: Rodar a suíte inteira (sem regressão)**

Run:
```bash
cd server && node --test
```
Expected: PASS — inclui `limite-maceio`, `geocode`, `exclusao`, `farmacias.routes`, `pedidos.routes`.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/pedidos.js server/test/pedidos.routes.test.js
git commit -m "feat(server): PATCH de pedido estendido (valor/farmácia) + DELETE"
```

---

## Task 2: Helper `centavosParaInput` (pré-preenche o valor)

**Files:**
- Modify: `client/src/lib/formato.js`
- Test: `client/test/formato.test.mjs`

**Interfaces:**
- Produces: `centavosParaInput(centavos) → string` no formato que o parser `centavosDe` do `NovoPedidoSheet` aceita de volta (ex. `123456 → "1234,56"`). Round-trip: `centavosDe(centavosParaInput(c)) === c`.

- [ ] **Step 1: Escrever o teste que falha**

In `client/test/formato.test.mjs`, adicionar ao import e novos testes ao final:
```js
// (adicionar `centavosParaInput` ao import existente de '../src/lib/formato.js')

test('centavosParaInput: centavos → string com vírgula decimal, sem milhar', () => {
  assert.equal(centavosParaInput(123456), '1234,56');
  assert.equal(centavosParaInput(100), '1,00');
  assert.equal(centavosParaInput(5), '0,05');
  assert.equal(centavosParaInput(0), '0,00');
});

test('centavosParaInput: round-trip com o parser do sheet', () => {
  // parser equivalente ao centavosDe do NovoPedidoSheet
  const centavosDe = (texto) => {
    let s = String(texto).replace(/[^\d.,]/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  };
  for (const c of [1, 5, 100, 999, 123456, 1000000]) {
    assert.equal(centavosDe(centavosParaInput(c)), c);
  }
});
```
Atualizar a linha de import no topo do arquivo para incluir `centavosParaInput`:
```js
import {
  formatarNomeFarmacia, formatarNomeFarmaciaCompacto, formatarEnderecoFarmacia, centavosParaInput,
} from '../src/lib/formato.js';
```

- [ ] **Step 2: Rodar e ver falhar**

Run:
```bash
cd client && node --test test/formato.test.mjs
```
Expected: FAIL — `centavosParaInput is not a function` / import indefinido.

- [ ] **Step 3: Implementar o helper**

In `client/src/lib/formato.js`, adicionar após `moedaBRL`:
```js
// centavos (inteiro) → string editável 'inteiro,decimais' (sem separador de
// milhar), no formato que o parser de valor do NovoPedidoSheet aceita de volta.
// Ex.: 123456 → '1234,56'. Usado para pré-preencher o campo ao editar um pedido.
export function centavosParaInput(centavos) {
  return (Number(centavos || 0) / 100).toFixed(2).replace('.', ',');
}
```

- [ ] **Step 4: Rodar e ver passar**

Run:
```bash
cd client && node --test test/formato.test.mjs
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/formato.js client/test/formato.test.mjs
git commit -m "feat(client): centavosParaInput (pré-preenche valor na edição de pedido)"
```

---

## Task 3: Cliente — `excluirPedido` + `NovoPedidoSheet` criar/editar

**Files:**
- Modify: `client/src/api/client.js`
- Modify: `client/src/components/NovoPedidoSheet.js`
- Modify: `client/src/screens/PedidosScreen.js` (só o call-site do sheet)

**Interfaces:**
- Consumes: `PATCH /pedidos/:id`, `DELETE /pedidos/:id`.
- Produces:
  - `api.excluirPedido(id) → Promise`.
  - `NovoPedidoSheet` props: `modo='criar'|'editar'` (default `'criar'`), `idAlvo`, `valoresIniciais` (`{ farmacia, valor, status, data }`), `onSalvo(pedido)` (substitui `onCriado`).

- [ ] **Step 1: Adicionar `excluirPedido` na API**

In `client/src/api/client.js`, no objeto `api` (após `atualizarPedido`):
```js
  excluirPedido: (id) => request(`/pedidos/${id}`, { method: 'DELETE' }),
```

- [ ] **Step 2: Parametrizar `NovoPedidoSheet`**

In `client/src/components/NovoPedidoSheet.js`, trocar a assinatura:
```js
export default function NovoPedidoSheet({ modo = 'criar', idAlvo = null, farmacias, valoresIniciais = {}, onFechar, onSalvo }) {
```

Trocar a inicialização dos estados:
```js
  const [farmacia, setFarmacia] = useState(valoresIniciais.farmacia || null);
  const [valor, setValor] = useState(valoresIniciais.valor || '');
  const [status, setStatus] = useState(valoresIniciais.status || 'pago');
```

Trocar a linha do `hoje` por um subtítulo que serve aos dois modos:
```js
  const subtitulo = modo === 'editar'
    ? `Registrado em ${dataCurtaMes(valoresIniciais.data)}`
    : `Registrado em ${dataCurtaMes(new Date().toISOString())}`;
```

Trocar o corpo do `try` de `salvar()`:
```js
    try {
      const dados = { farmacia_id: farmacia.id, valor_centavos: centavos, status_pagamento: status };
      const p = modo === 'editar'
        ? await api.atualizarPedido(idAlvo, dados)
        : await api.criarPedido(dados);
      onSalvo(p);
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar o pedido.');
      setSalvando(false);
    }
```

Trocar o título e o subtítulo no JSX:
```jsx
          <Text style={styles.titulo}>{modo === 'editar' ? 'Editar pedido' : 'Novo pedido'}</Text>
          <Text style={styles.subtitulo}>{subtitulo}</Text>
```

Trocar o texto do botão salvar:
```jsx
            <Text style={styles.botaoTexto}>
              {salvando ? 'Salvando…' : (modo === 'editar' ? 'Salvar alterações' : 'Salvar pedido')}
            </Text>
```

(O `import { dataCurtaMes } from '../lib/formato'` já existe no arquivo.)

- [ ] **Step 3: Atualizar o call-site atual no `PedidosScreen`**

In `client/src/screens/PedidosScreen.js`, no bloco `{novoAberto && (...)}`, trocar `onCriado` por `onSalvo` (corpo idêntico):
```jsx
      {novoAberto && (
        <NovoPedidoSheet
          farmacias={farmacias}
          onFechar={() => setNovoAberto(false)}
          onSalvo={(p) => {
            setNovoAberto(false);
            setPedidos((prev) => [p, ...(prev || [])]);
          }}
        />
      )}
```

- [ ] **Step 4: Verificar que o bundle compila (regressão do criar)**

Run:
```bash
cd client && rm -rf dist && npx expo export --platform android 2>&1 | grep -Ei "bundled|error|failed" ; rm -rf dist
```
Expected: `Android Bundled ... index.js (N modules)` sem `error`/`failed`.

- [ ] **Step 5: Commit**

```bash
git add client/src/api/client.js client/src/components/NovoPedidoSheet.js client/src/screens/PedidosScreen.js
git commit -m "feat(client): NovoPedidoSheet em modo editar + api.excluirPedido"
```

---

## Task 4: Cliente — long-press → editar/excluir na tela Pedidos

**Files:**
- Modify: `client/src/screens/PedidosScreen.js`

**Interfaces:**
- Consumes: `NovoPedidoSheet` (modo editar), `api.excluirPedido`, `centavosParaInput`, `moedaBRL`, `dataCurtaMes`.

- [ ] **Step 1: Imports, estado e funções de menu/edição/exclusão**

In `client/src/screens/PedidosScreen.js`, adicionar `Alert` e `Pressable` ao import de `react-native`:
```js
import { View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
```

Adicionar `centavosParaInput` ao import de `../lib/formato`:
```js
import { moedaBRL, dataCurtaMes, centavosParaInput } from '../lib/formato';
```

Adicionar o estado (após `const [novoAberto, setNovoAberto] = useState(false)`):
```js
  const [editando, setEditando] = useState(null); // pedido em edição | null
```

Adicionar as funções (após `trocarStatus`):
```js
  function menuPedido(p) {
    Alert.alert(
      p.farmacia_nome,
      `${moedaBRL(p.valor_centavos)} · ${dataCurtaMes(p.data_pedido)}`,
      [
        { text: 'Editar', onPress: () => setEditando(p) },
        { text: 'Excluir', style: 'destructive', onPress: () => confirmarExcluir(p) },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  }

  function confirmarExcluir(p) {
    Alert.alert('Excluir pedido?', 'Isso não pode ser desfeito.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.excluirPedido(p.id);
            setPedidos((prev) => prev.filter((x) => x.id !== p.id));
          } catch {
            setErro('Não foi possível excluir o pedido.');
          }
        },
      },
    ]);
  }
```

- [ ] **Step 2: Card long-pressável**

In `client/src/screens/PedidosScreen.js`, trocar o container do card na lista — de `<View key={p.id} style={styles.pedido}>` para um `Pressable` com `onLongPress`:
```jsx
          {pedidos.map((p) => (
            <Pressable key={p.id} style={styles.pedido} onLongPress={() => menuPedido(p)} delayLongPress={350}>
              <View style={styles.pedidoTopo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pedidoNome} numberOfLines={1}>{p.farmacia_nome}</Text>
                  <Text style={styles.pedidoMeta}>{[p.farmacia_bairro, dataCurtaMes(p.data_pedido)].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={styles.pedidoValor}>{moedaBRL(p.valor_centavos)}</Text>
              </View>
              <View style={styles.seg}>
                {SEG_STATUS.map(([v, label]) => {
                  const ativo = v === p.status_pagamento;
                  return (
                    <TouchableOpacity key={v} style={[styles.segItem, ativo && styles.segItemAtivo]} onPress={() => trocarStatus(p, v)} activeOpacity={0.8}>
                      <Text style={[styles.segTexto, ativo && styles.segTextoAtivo]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Pressable>
          ))}
```
(Só o elemento externo mudou de `View` para `Pressable` + `onLongPress`; o conteúdo é o mesmo. Os botões de status internos continuam recebendo o tap normalmente.)

- [ ] **Step 3: Renderizar o sheet de edição**

In `client/src/screens/PedidosScreen.js`, logo após o bloco `{novoAberto && (...)}`, adicionar:
```jsx
      {editando && (
        <NovoPedidoSheet
          modo="editar"
          idAlvo={editando.id}
          farmacias={farmacias}
          valoresIniciais={{
            farmacia: farmacias.find((f) => f.id === editando.farmacia_id)
              || { id: editando.farmacia_id, nome: editando.farmacia_nome, bairro: editando.farmacia_bairro },
            valor: centavosParaInput(editando.valor_centavos),
            status: editando.status_pagamento,
            data: editando.data_pedido,
          }}
          onFechar={() => setEditando(null)}
          onSalvo={(p) => {
            setEditando(null);
            setPedidos((prev) => prev.map((x) => (x.id === p.id ? p : x)));
          }}
        />
      )}
```

- [ ] **Step 4: Verificar que o bundle compila**

Run:
```bash
cd client && rm -rf dist && npx expo export --platform android 2>&1 | grep -Ei "bundled|error|failed" ; rm -rf dist
```
Expected: `Android Bundled ... index.js (N modules)` sem `error`/`failed`.

- [ ] **Step 5: Commit**

```bash
git add client/src/screens/PedidosScreen.js
git commit -m "feat(client): long-press no pedido para editar/excluir"
```

- [ ] **Step 6: Verificação manual no aparelho (o que só o device confirma)**

Rodar `npx expo start -c` (a partir do checkout principal) + o server do `main`, e conferir:
1. Long-press num pedido → menu **[Editar · Excluir · Cancelar]**.
2. **Editar** → sheet pré-preenchido (farmácia, valor, status); subtítulo mostra a **data original**. Alterar valor e/ou farmácia e salvar → card reflete e os **totais/gráfico** recalculam.
3. **Excluir** → confirmação → some da lista; totais recalculam.
4. Trocar status pelos **botões inline** continua funcionando (tap não dispara o menu).
5. **Novo** pedido (fluxo de criação) continua funcionando normalmente.

---

## Self-Review (feito na escrita do plano)

- **Cobertura do spec:** PATCH estendido (valor/farmácia, data imutável) + DELETE (Task 1) ✓; validações e teste de integração (Task 1) ✓; `centavosParaInput` + teste (Task 2) ✓; `api.excluirPedido` + `NovoPedidoSheet` criar/editar + call-site do criar (Task 3) ✓; long-press → menu, editar via sheet, excluir com confirmação, atualização de lista, status inline preservado (Task 4) ✓. Sem migration (constraint respeitada). Data não-editável (nunca no corpo do PATCH; subtítulo read-only).
- **Sem placeholders:** todos os steps trazem código/comando reais.
- **Consistência de tipos:** `centavosParaInput` definido na Task 2 e consumido na Task 4; `modo`/`idAlvo`/`valoresIniciais`/`onSalvo` definidos na Task 3 e usados na Task 4; a forma de resposta do PATCH (com `farmacia_nome`/`farmacia_bairro`) produzida na Task 1 e consumida pela atualização de lista da Task 4.
