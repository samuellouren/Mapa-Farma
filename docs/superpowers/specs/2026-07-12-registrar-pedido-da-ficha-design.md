# Registrar pedido a partir da Ficha — design

Data: 2026-07-12

## Objetivo

Permitir registrar um pedido para uma farmácia direto da tela **Ficha**, sem
passar pela tela Pedidos e sem escolher a farmácia no seletor. Reaproveita o
`NovoPedidoSheet` existente, apenas abrindo-o com a farmácia da Ficha já
pré-selecionada e travada.

## Decisões (brainstorming aprovado)

1. **Seletor travado nesta farmácia** — o sheet recebe uma lista de uma única
   farmácia (a da Ficha), então o `FarmaciaPicker` mostra ela e não permite
   trocar. Semântica clara ("pedido PARA esta farmácia") e zero fetch extra.
2. **Botão em par com "Registrar visita"** — o botão de largura cheia atual
   "Registrar visita" passa a ser um par lado a lado (`flex: 1` cada), ambos em
   vinho, de mesmo peso visual.
3. **Pós-salvar: fecha + confirmação + atualiza a Ficha** — ao salvar, fecha o
   sheet, mostra um `Alert` curto de confirmação e recarrega a farmácia para
   manter `pedidos_count` correto (a trava de exclusão da farmácia depende dele).
4. **Rótulo do botão: "Registrar pedido"** — paraleliza "Registrar visita".

## Escopo

Alteração de UI/wiring **somente em `client/src/screens/FichaScreen.js`**.

**Não muda:** `NovoPedidoSheet`, `FarmaciaPicker`, `client/src/api/client.js`,
rotas do servidor, schema. O `NovoPedidoSheet` já aceita
`valoresIniciais.farmacia` (mesmo mecanismo do modo editar), então a feature é
puro reaproveitamento.

## Detalhe da implementação

### UI — par de botões

O botão único de largura cheia "Registrar visita" vira uma linha com dois botões
`flex: 1`, ambos no estilo vinho já existente:

```
┌─────────────────────┬─────────────────────┐
│  + Registrar visita │  + Registrar pedido │
└─────────────────────┴─────────────────────┘
```

- "Registrar visita" mantém `navigation.navigate('Registrar', { id, nome })`.
- "Registrar pedido" faz `setPedidoAberto(true)`.
- Ambos preservam o "+" e o mesmo tamanho/altura. O container passa a ser uma
  `View` em `flexDirection: 'row'` com `gap`.

### Estado

Novo estado local na `FichaScreen`: `const [pedidoAberto, setPedidoAberto] = useState(false);`

### Renderização do sheet

Quando `pedidoAberto`, renderiza (modo padrão `criar`):

```js
<NovoPedidoSheet
  farmacias={[farmacia]}                 // lista de 1 → seletor travado
  valoresIniciais={{ farmacia }}         // pré-seleção
  onFechar={() => setPedidoAberto(false)}
  onSalvo={async () => {
    setPedidoAberto(false);
    Alert.alert('Pedido registrado', farmacia.nome);
    try {
      const f = await api.farmacia(id);  // atualiza pedidos_count
      setFarmacia((prev) => ({ ...prev, ...f }));
    } catch {
      // silencioso: pedidos_count reatualiza no próximo foco; servidor
      // continua bloqueando exclusão indevida via 409
    }
  }}
/>
```

Notas:
- O `NovoPedidoSheet` no modo criar já usa `new Date()` como data (pedido datado
  de hoje) e `status` default `pago` — nada a ajustar nele.
- O objeto `farmacia` da Ficha já traz `id`, `nome`, `bairro`, `endereco`,
  suficientes para o `FarmaciaPicker` exibir via `formatarNomeFarmacia`.
- O reload usa apenas `api.farmacia(id)` (não precisa recarregar relatórios).

## Fluxo de dados

1. Toca "Registrar pedido" → `setPedidoAberto(true)`.
2. Sheet abre com a farmácia preenchida e travada, valor vazio, status "Pago".
3. Salva → `api.criarPedido` → `POST /pedidos` (inalterado).
4. `onSalvo` fecha o sheet, mostra confirmação e recarrega a farmácia.
5. `pedidos_count` atualizado → a trava de exclusão da farmácia fica coerente na
   hora, sem esperar refocar a tela.

## Tratamento de erro

- Falha no `POST /pedidos`: o próprio `NovoPedidoSheet` já trata (mostra o erro
  dentro do sheet e não chama `onSalvo`). Sem mudança.
- Falha no reload da farmácia pós-salvar: silenciosa (o pedido já foi criado com
  sucesso); `pedidos_count` reatualiza no próximo foco e o servidor bloqueia
  exclusão indevida via 409 de qualquer forma.

## Testes / verificação

Não há harness de testes de tela React Native neste repo (os testes são de
servidor, e a rota `POST /pedidos` já é coberta por `pedidos.routes.test.js`).
A verificação é manual, no app rebuildado:

1. Abrir a Ficha de uma farmácia → tocar "Registrar pedido".
2. Confirmar que o sheet abre com a farmácia preenchida e o seletor travado.
3. Preencher valor, salvar.
4. Ver a confirmação e confirmar que, ao tentar excluir a farmácia (se manual),
   a trava por pedidos passa a bloquear (reflete o `pedidos_count` atualizado).
