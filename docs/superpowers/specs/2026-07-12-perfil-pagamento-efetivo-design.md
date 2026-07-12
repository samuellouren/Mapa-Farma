# Perfil de pagamento efetivo (fase 2) — design

Data: 2026-07-12

## Objetivo

Calcular automaticamente o perfil de pagamento de cada farmácia a partir dos
seus pedidos, mantendo o campo manual como override. O perfil "efetivo" passa a
ser a fonte única usada em todo o app (Painel, Ficha, Mapa, ranking), no lugar
do campo manual cru.

## Premissa

O pedido **não tem data de vencimento**; `pedidos.status_pagamento`
(`pago`/`atrasado`/`nao_pago`) é marcado à mão em cada pedido. Esta feature é
**agregação automática desses status já marcados**, não detecção de atraso por
data. Detecção real de vencido exigiria um campo de vencimento (fora de escopo).

## Decisões (brainstorming aprovado)

1. **Regra de agregação: pedido mais recente.** O perfil vem do status do último
   pedido da farmácia (por `data_pedido DESC, id DESC`), all-time.
2. **Campo manual: override vence.** Se `farmacias.perfil_pagamento` está
   preenchido, ele é o perfil. Só quando está `NULL` o cálculo automático
   assume.
3. **Escopo: efetivo em todo lugar.** Painel (card da carteira, lista por
   cliente, ranking melhores clientes), Ficha, Mapa (filtro + badge do marcador).
4. **Janela: all-time.** O card do Painel segue independente do seletor 7/30/90
   (como já é hoje).

## Definição do perfil efetivo

```
perfil_efetivo(f) =
  f.perfil_pagamento (manual)                          se não NULL
  senão map(status do pedido mais recente de f)        se f tem pedidos
  senão NULL
```

Mapa status→perfil: `pago → paga_em_dia`, `atrasado → atrasa`,
`nao_pago → nao_paga`.

Sem manual e sem pedidos → `NULL` (farmácia não entra na carteira/ranking).

## Onde é calculado

No **servidor, via SQL**, para todos os consumidores verem o mesmo valor.

Novo módulo `server/src/lib/perfilPagamento.js`:

```js
// Mapeia o status de um pedido para o perfil de pagamento da farmácia.
export const STATUS_PARA_PERFIL = { pago: 'paga_em_dia', atrasado: 'atrasa', nao_pago: 'nao_paga' };

// Fragmento SQL do perfil efetivo: override manual, senão o perfil do pedido
// mais recente da farmácia. `alias` é o alias da tabela farmacias na query
// (sempre literal de código — NUNCA input do usuário).
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

## Mudanças no servidor

### `server/src/routes/stats.js`
- **Card da carteira**: hoje `GROUP BY perfil_pagamento` sobre `farmacias`. Passa
  a agrupar pelo perfil efetivo:
  ```sql
  SELECT perfil, COUNT(*) AS n FROM (
    SELECT <sqlPerfilEfetivo('f')> AS perfil FROM farmacias f
  ) WHERE perfil IS NOT NULL GROUP BY perfil
  ```
- **Query `fs`** (usada em `top_clientes` e `perfil_pagamento_clientes`): adiciona
  `<sqlPerfilEfetivo('f')> AS perfil_pagamento_efetivo`.
  - `topClientes.score`: `PESO_PAGAMENTO[f.perfil_pagamento]` → usar
    `f.perfil_pagamento_efetivo`.
  - saída de `topClientes`: `perfil_pagamento` = efetivo.
  - `perfilPagamentoClientes`: filtra por efetivo (`f.perfil_pagamento_efetivo`) e
    devolve na chave `perfil_pagamento` (valor efetivo).
- **Chaves da resposta não mudam** (`perfil_pagamento_carteira`,
  `perfil_pagamento_clientes[].perfil_pagamento`, `top_clientes[].perfil_pagamento`)
  — só o valor passa a ser o efetivo. Cliente do Painel não muda.

### `server/src/routes/farmacias.js`
- `GET /` (lista): aliasar `FROM farmacias f`, `SELECT f.*,
  <sqlPerfilEfetivo('f')> AS perfil_pagamento_efetivo`. O filtro
  `?perfil_pagamento=` passa a comparar o efetivo:
  `WHERE <sqlPerfilEfetivo('f')> = ?`.
- `GET /:id` (ficha): adicionar `<sqlPerfilEfetivo('f')> AS
  perfil_pagamento_efetivo` ao SELECT (mantendo `f.*`, que traz o
  `perfil_pagamento` manual).
- `PATCH /:id`: o SELECT final de resposta passa a incluir
  `perfil_pagamento_efetivo` (para a Ficha atualizar a dica após editar/limpar).

## Mudanças no cliente

- **`PainelScreen.js`**: nenhuma. Consome as mesmas chaves, agora com valor
  efetivo.
- **`MapaScreen.js`** (linha ~79): filtro passa a comparar
  `f.perfil_pagamento_efetivo` no lugar de `f.perfil_pagamento`.
- **`BottomSheetFarmacia.js`** (linha ~15): badge usa
  `farmacia.perfil_pagamento_efetivo`.
- **`FichaScreen.js`**: `SegmentedControl` segue ligado ao campo manual
  (`farmacia.perfil_pagamento`; selecionar = override, limpar = volta ao
  automático). Adicionar uma linha de dica abaixo do controle:
  - manual `null` + efetivo != `null` →
    `Automático: {PERFIL_PAGAMENTO[efetivo].label} — do último pedido.`
  - manual preenchido → `Definido manualmente. Limpe para voltar ao automático.`
  - manual `null` + efetivo `null` → `Sem pedidos ainda.`

## Fluxo de dados

1. Servidor calcula `perfil_pagamento_efetivo` por SQL em toda leitura de
   farmácia e nas agregações do Painel.
2. Ao criar/editar/excluir um pedido, ou ao editar o perfil manual na Ficha, o
   próximo GET reflete o novo efetivo (as telas já recarregam no foco / após
   mutação).
3. Override manual na Ficha grava `perfil_pagamento`; limpar volta a `NULL` e o
   efetivo passa a vir do pedido mais recente.

## Tratamento de erro / bordas

- Farmácia sem pedidos e sem manual → efetivo `NULL`; não entra na carteira nem
  no ranking; Ficha mostra "Sem pedidos ainda".
- Empate de `data_pedido` → desempate por `id DESC` (determinístico).
- Alias do fragmento SQL é sempre literal de código — sem risco de injeção.
- Performance: subquery correlacionada por farmácia; ~105 farmácias, índice
  `idx_pedidos_farmacia` já existe. Custo desprezível.

## Testes (servidor)

Novos testes (lógica de negócio, testável no servidor):

1. Override vence: farmácia com `perfil_pagamento` manual + pedidos de status
   diferente → efetivo = manual.
2. Sem manual, usa o pedido mais recente: pedidos `[01/07 nao_pago, 10/07 pago]`
   → efetivo `paga_em_dia`.
3. Mapeamento: `atrasado → atrasa`, `nao_pago → nao_paga`.
4. Sem manual e sem pedido → efetivo `NULL` (não aparece na carteira).
5. Desempate: dois pedidos na mesma `data_pedido`, o de maior `id` decide.
6. Carteira do `/stats` conta por efetivo (inclui farmácias que só têm pedido).
