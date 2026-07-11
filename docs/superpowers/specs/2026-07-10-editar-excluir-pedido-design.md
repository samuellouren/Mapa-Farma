# Editar e excluir pedidos — design

**Data:** 2026-07-10
**Status:** aprovado para planejamento

## Objetivo

Permitir **editar** e **excluir** um pedido a partir da tela Pedidos, via
**long-press** no card do pedido. Diferente de farmácias, **todo pedido é
editável/excluível** — pedidos são sempre criados pela equipe, não há conceito
de origem/seed. A **data do pedido não é editável** (mesma regra do relatório de
visita: a data reflete o registro original; reescrevê-la abriria brecha para
adulterar quando algo financeiro aconteceu).

## Decisões travadas (com o cliente)

1. **Editar = formulário completo** (farmácia + valor + status), reusando o
   `NovoPedidoSheet` em modo edição — mesmo padrão do `NovaFarmaciaSheet`.
2. **Data não-editável** — preservada como a data original do registro.
3. Sem restrição de origem: todos os pedidos podem ser editados/excluídos.

## Schema

**Nenhuma alteração de schema.** A tabela `pedidos` já tem todos os campos
(`farmacia_id`, `valor_centavos`, `status_pagamento`, `data_pedido`). Esta
feature só estende o `PATCH` e adiciona o `DELETE`. Sem migration.

## Interação (tela Pedidos)

Cada card de pedido passa a ser **long-pressável**. Long-press → `Alert` de menu
com **[Editar · Excluir · Cancelar]**.
- O controle de status inline (pago/atrasado/não pago) no card **permanece** —
  é a via rápida para trocar só o status sem abrir nada.
- **Editar** → abre `NovoPedidoSheet` em `modo="editar"`, pré-preenchido com
  farmácia, valor e status atuais. Salvar faz `PATCH`.
- **Excluir** → segundo `Alert` de confirmação ("Excluir pedido? Isso não pode
  ser desfeito.") → `DELETE` → some da lista.

## Backend (`server/src/routes/pedidos.js`)

### PATCH /pedidos/:id — passa a aceitar mais campos
Hoje só atualiza `status_pagamento`. Passa a aceitar também `farmacia_id` e
`valor_centavos` (edição parcial: aplica só os campos presentes no corpo).
- `status_pagamento` (se presente): validado contra o enum.
- `valor_centavos` (se presente): inteiro `> 0` (400 senão).
- `farmacia_id` (se presente): a farmácia deve existir (404/400 senão).
- **`data_pedido` nunca é alterada** (não aceita no corpo).
- Nenhum campo presente → 400 "Nada para atualizar".
- Responde a linha atualizada com o join de `farmacia_nome`/`farmacia_bairro`
  (mesma forma que o POST/GET retornam), para o cliente atualizar a lista.

### DELETE /pedidos/:id — novo
- 404 se não existir; senão `DELETE FROM pedidos WHERE id = ?` → `{ ok: true }`.
- Pedido é registro-folha (nenhuma tabela referencia `pedidos`) → sem cascade,
  sem escalonamento. Simples.

### Sem lib de política
Diferente de farmácia, não há regra condicional (nada de origem, nada de
vínculos a proteger), então não se cria `lib` de política — a validação vive
direto na rota.

## Cliente

### API (`client/src/api/client.js`)
- `excluirPedido: (id) => request('/pedidos/' + id, { method: 'DELETE' })`.
- `atualizarPedido(id, patch)` **já existe** (PATCH) — reusado para a edição
  (envia `{ farmacia_id, valor_centavos, status_pagamento }`).

### `NovoPedidoSheet` parametrizado
Novas props (mantendo compatibilidade com o uso atual):
- `modo = 'criar' | 'editar'` (default `'criar'`).
- `idAlvo` (id do pedido em edição; `null` na criação).
- `valoresIniciais` (`{ farmacia, valor, status }`) — `farmacia` é o objeto da
  farmácia atual (para o `FarmaciaPicker`), `valor` é uma string pré-formatada.
- `onSalvo(pedido)` — callback unificado (substitui/generaliza `onCriado`).
- Internamente: título ("Novo pedido" vs "Editar pedido") e texto do botão
  ("Salvar pedido" vs "Salvar alterações") variam por `modo`; ao salvar, chama
  `api.atualizarPedido(idAlvo, dados)` (editar) ou `api.criarPedido(dados)`
  (criar). O subtítulo: na criação, "Registrado em <hoje>"; na edição,
  "Registrado em <data original do pedido>" — read-only, reforçando que a data
  é imutável.
- **Pré-preenchimento do valor:** um helper converte `valor_centavos` (inteiro)
  para a string que o parser `centavosDe` já existente aceita de volta — ex.
  `123456 → "1234,56"`. Fica em `client/src/lib/formato.js` (junto de `moedaBRL`),
  testável e reusável: `centavosParaInput(centavos)`.

### `PedidosScreen`
- O card de pedido vira `Pressable` com `onLongPress` → `Alert` de menu.
  O long-press cobre a área do card; os botões de status inline continuam
  recebendo tap normalmente (são `TouchableOpacity` próprios dentro do card).
- `editarPedido(p)` → abre o sheet em modo edição com `valoresIniciais` a partir
  de `p` (acha o objeto da farmácia em `farmacias` por `p.farmacia_id`; valor via
  `centavosParaInput`).
- `excluirPedido(p)` → `Alert` de confirmação → `api.excluirPedido(p.id)` →
  remove da lista (`setPedidos(prev => prev.filter(...))`).
- Ao salvar edição → atualiza o item na lista
  (`setPedidos(prev => prev.map(x => x.id === pedido.id ? pedido : x))`).
- Totais e gráfico já são `useMemo` sobre `pedidos` → recalculam sozinhos; a
  correção de valor/exclusão reflete no financeiro na hora.

## Arquivos afetados

**Servidor:**
- `src/routes/pedidos.js` (PATCH estendido; DELETE novo).
- `test/pedidos.routes.test.js` (novo — integração, mesmo estilo do de farmácia).

**Cliente:**
- `src/api/client.js` (`excluirPedido`).
- `src/lib/formato.js` (`centavosParaInput`).
- `src/components/NovoPedidoSheet.js` (modo criar/editar; `onCriado` → `onSalvo`).
- `src/screens/PedidosScreen.js` (long-press → menu; editar/excluir; atualização
  da lista; call site do sheet passa a usar `onSalvo`).

## Testes
- `server/test/pedidos.routes.test.js` (novo): integração cobrindo PATCH de
  `valor_centavos`, PATCH de `farmacia_id` (com farmácia inexistente → erro),
  PATCH que NÃO altera `data_pedido`, validações (valor ≤ 0 → 400, status
  inválido → 400), e DELETE (200 + some; 404 em id inexistente).
- `client/test/` (node --test): teste puro de `centavosParaInput` (round-trip
  com `centavosDe`).
- Bundle Android (`expo export`) limpo.
- Verificação manual no aparelho (o que só o device confirma): long-press abre o
  menu; editar altera valor/farmácia/status e reflete na lista e nos totais;
  excluir remove; status inline continua funcionando.

## Fora de escopo (YAGNI)
- Edição da data do pedido (decisão travada: não-editável).
- Seleção/edição/exclusão em massa.
- Qualquer alteração de schema.
