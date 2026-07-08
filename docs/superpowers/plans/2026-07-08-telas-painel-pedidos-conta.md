# Telas Histórico + Painel + Pedidos + Conta — Implementation Plan (levas 2 e 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Completar as 4 telas restantes do app: Histórico (timeline), Painel (estatísticas), Pedidos (totais/gráfico/lista/novo) e Conta (perfil/equipe/preferências/sair).

**Architecture:** Todas contra endpoints já existentes (`/stats`, `/pedidos`, `/usuarios`, `/farmacias`, `/auth/me`). Única mudança de backend: `/stats` passa a devolver `perfil_pagamento_clientes` (lista por cliente) — stats sempre server-side. Totais e gráfico de Pedidos são derivados client-side da lista (escala 3-5 vendedores). Preferências da Conta são locais (AsyncStorage).

**Tech Stack:** React Native/Expo, Express/libSQL, `node:test`. Sem dependência nova. Gráfico de barras em `View`s (sem lib).

## Global Constraints

- Fidelidade ao `Mapa_Farma.html` via tokens de `client/src/theme`; enums de `lib/enums.js` (valores do banco).
- Dinheiro sempre em centavos no banco/API; formatação BRL só na exibição (`lib/formato.js`).
- Datas pt-BR sem `Intl`.
- Telas de aba (Pedidos/Painel/Conta) substituem os stubs `EmBreve` no `TabNavigator`; Histórico substitui o stub no stack do Mapa.

---

### Task 1: `/stats` devolve lista de pagamento por cliente (+ helpers BRL)

**Files:**
- Modify: `server/src/routes/stats.js`
- Test: `server/test/stats-carteira.test.js` (helper puro extraído) — OU verificação por curl se não valer extrair.
- Modify: `client/src/lib/formato.js` (moedaBRL, dataCurtaMes, iniciais)

**Interfaces:**
- Produces: resposta de `/stats` ganha `perfil_pagamento_clientes: [{ id, nome, perfil_pagamento }]` (só farmácias com perfil definido, ordenado por nome). `moedaBRL(centavos)→'R$ 1.234,56'`, `dataCurtaMes(iso)→'07 jul 2026'`, `iniciais(nome)→'RC'`.

- [ ] **Step 1:** Em `stats.js`, montar a lista a partir de `linhas` (já carregadas) e incluir no JSON:
```js
const perfilPagamentoClientes = linhas
  .filter((f) => f.perfil_pagamento)
  .sort((a, b) => a.nome.localeCompare(b.nome))
  .map((f) => ({ id: f.id, nome: f.nome, perfil_pagamento: f.perfil_pagamento }));
```
Adicionar `perfil_pagamento_clientes: perfilPagamentoClientes` ao `res.json`.

- [ ] **Step 2:** Helpers em `formato.js`:
```js
export function moedaBRL(centavos) {
  const v = (Number(centavos || 0) / 100).toFixed(2);
  const [int, dec] = v.split('.');
  return 'R$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}
const MESES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
export function dataCurtaMes(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d} ${MESES_ABREV[Number(m) - 1]} ${a}`;
}
export function iniciais(nome) {
  const p = String(nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
```

- [ ] **Step 3:** Verificar via curl que `/stats?periodo=30` inclui `perfil_pagamento_clientes`; sintaxe de formato.js. Commit.

---

### Task 2: Tela Histórico (timeline completa)

**Files:**
- Create: `client/src/screens/HistoricoScreen.js`
- Modify: `client/src/navigation/TabNavigator.js` (Historico real)

**Interfaces:**
- Consumes: `api.relatorios(id)`, `route.params.{id, nome}`, `dataCurta`, `duracaoLabel`, `IconeVoltar`.

- [ ] **Step 1:** Header vinho com voltar + "Histórico"/nome; `ScrollView` com timeline vertical (bolinha + linha) dos relatórios: data/hora, duração, observação, "por {usuario_nome}". Vazio → "Nenhuma visita registrada ainda."
- [ ] **Step 2:** No `TabNavigator`, `import HistoricoScreen` e trocar `HistoricoStub` pela tela real. Sintaxe + commit.

---

### Task 3: Tela Painel (estatísticas)

**Files:**
- Create: `client/src/screens/PainelScreen.js`
- Modify: `client/src/navigation/TabNavigator.js` (Painel real)

**Interfaces:**
- Consumes: `api.stats(periodo)`; enums `PERFIL_PAGAMENTO`, `PERFIL_COMPRA`; `useFocusEffect`.

- [ ] **Step 1:** Header "Estatísticas" + segment período (7/30/90, refaz fetch). Blocos: dois números grandes (visitas_periodo / farmacias_visitadas); "Melhores clientes" (rank, nome, bairro, chip do perfil_compra); "Sem visita há mais tempo" (rank, nome, bairro, "{dias}d" ou "nunca"); "Perfil de pagamento da carteira" (barra empilhada verde/âmbar/vermelho + legenda com contagens + lista por cliente de `perfil_pagamento_clientes`); "Visitas por vendedor" (nome, count, barra proporcional). `useFocusEffect` recarrega.
- [ ] **Step 2:** `TabNavigator` Painel real. Sintaxe + commit.

---

### Task 4: FarmaciaPicker + Tela Pedidos + sheet Novo pedido

**Files:**
- Create: `client/src/components/FarmaciaPicker.js`
- Create: `client/src/components/NovoPedidoSheet.js`
- Create: `client/src/screens/PedidosScreen.js`
- Modify: `client/src/navigation/TabNavigator.js` (Pedidos real)

**Interfaces:**
- Consumes: `api.listarPedidos`, `api.criarPedido`, `api.atualizarPedido`, `api.listarFarmacias`; `STATUS_PAGAMENTO`; `moedaBRL`, `dataCurtaMes`.
- `FarmaciaPicker`: `<FarmaciaPicker valor onSelecionar={fn(farmacia)} />` — pressable abre modal com busca + FlatList.
- `NovoPedidoSheet`: `<NovoPedidoSheet farmacias onFechar onCriado={fn(pedido)} />`.

- [ ] **Step 1: FarmaciaPicker** — Modal com TextInput de busca e FlatList filtrada por nome/bairro; ao tocar, retorna a farmácia e fecha.
- [ ] **Step 2: NovoPedidoSheet** — Modal slide (padrão FiltroSheet): FarmaciaPicker, valor em R$ (input numérico → centavos), segment de status (pago/atrasado/nao_pago), "Salvar pedido" → `api.criarPedido({ farmacia_id, valor_centavos, status_pagamento })`. Erro no sheet.
- [ ] **Step 3: PedidosScreen** — Header "Pedidos" + botão "Novo". Totais (Vendido = Σ; Recebido = Σ pago; A receber = Σ ≠ pago). Gráfico "Vendas em R$" com toggle mês/semana (barras `View` a partir dos pedidos agrupados). Lista "Pedidos recentes" com segment de status inline (PATCH otimista). Abre `NovoPedidoSheet`; `onCriado` insere na lista. `useFocusEffect` recarrega. Valor: parse "1.234,56"/"1234" → centavos.
- [ ] **Step 4:** `TabNavigator` Pedidos real. Sintaxe + commit.

---

### Task 5: Tela Conta

**Files:**
- Create: `client/src/screens/ContaScreen.js`
- Modify: `client/src/navigation/TabNavigator.js` (Conta real)

**Interfaces:**
- Consumes: `useAuth()` (`usuario`, `sair`), `api.usuarios`, `api.listarFarmacias`, `api.listarPedidos`, `iniciais`, AsyncStorage p/ preferências.

- [ ] **Step 1:** Header "Conta". Perfil (avatar iniciais, nome, "Mapa Farma Distribuidora", email). Contadores (Farmácias = total, Clientes = eh_cliente, Pedidos = total). Equipe (`/usuarios`: avatar iniciais, nome, email). Preferências: 2 toggles (Notificações, Resumo diário) persistidos em AsyncStorage (`mapafarma_prefs`). "Sair da conta" → `sair()`. Rodapé "Mapa Farma · versão 1.0".
- [ ] **Step 2:** `TabNavigator` Conta real. Sintaxe + commit.

---

## Verificação final (dispositivo)
Percorrer as 4 abas: Painel muda com período; Pedidos cria pedido + troca status inline + totais/gráfico atualizam; Conta mostra contadores/equipe, toggles persistem, "Sair" volta ao Login; Histórico abre da Ficha com a timeline. Backend exercido por curl durante a implementação.
