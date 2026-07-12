# Registrar pedido a partir da Ficha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um botão "Registrar pedido" na Ficha que abre o `NovoPedidoSheet` existente com a farmácia da Ficha travada como pré-seleção.

**Architecture:** Alteração de UI/wiring em um único arquivo (`FichaScreen.js`). Reaproveita 100% do `NovoPedidoSheet` (que já aceita `valoresIniciais.farmacia`, mesmo mecanismo do modo editar). Passar `farmacias={[farmacia]}` deixa o seletor efetivamente travado. Nenhuma mudança em componentes, api ou servidor.

**Tech Stack:** React Native (Expo SDK 57), React hooks.

## Global Constraints

- **Escopo restrito a `client/src/screens/FichaScreen.js`.** Não tocar em `NovoPedidoSheet`, `FarmaciaPicker`, `client/src/api/client.js`, rotas do servidor ou schema.
- **Rótulo do botão: exatamente `Registrar pedido`** (paraleliza `Registrar visita`).
- **Seletor travado:** `farmacias={[farmacia]}` (lista de um só elemento).
- **Expo SDK 57:** consultar `https://docs.expo.dev/versions/v57.0.0/` antes de qualquer API nova do Expo/RN (não há API nova neste plano — só componentes RN já usados no arquivo).
- Sem harness de testes de tela RN neste repo → verificação é estática (grep) + manual no app.

---

### Task 1: Botão "Registrar pedido" na Ficha abrindo o NovoPedidoSheet travado

**Files:**
- Modify: `client/src/screens/FichaScreen.js`

**Interfaces:**
- Consumes (já existentes, sem mudança):
  - `NovoPedidoSheet({ modo='criar', idAlvo=null, farmacias, valoresIniciais={}, onFechar, onSalvo })` — de `../components/NovoPedidoSheet`. No modo padrão `criar`, usa `new Date()` como data e `status='pago'`; ao salvar chama `onSalvo(pedidoCriado)`.
  - `api.farmacia(id)` — retorna a farmácia completa, incluindo `pedidos_count`.
  - `Alert` (de `react-native`) e `api` já estão importados no arquivo (linhas 4 e 9).
  - Estado `farmacia` e setter `setFarmacia`, e `const { id } = route.params` já existentes.
- Produces: nenhuma interface nova consumida por outros arquivos.

- [ ] **Step 1: Importar o NovoPedidoSheet**

Em `client/src/screens/FichaScreen.js`, logo após a linha 14 (`import NovaFarmaciaSheet from '../components/NovaFarmaciaSheet';`), adicionar o import. Alterar:

```js
import NovaFarmaciaSheet from '../components/NovaFarmaciaSheet';
import SeletorLocalizacao from '../components/SeletorLocalizacao';
```

para:

```js
import NovaFarmaciaSheet from '../components/NovaFarmaciaSheet';
import NovoPedidoSheet from '../components/NovoPedidoSheet';
import SeletorLocalizacao from '../components/SeletorLocalizacao';
```

- [ ] **Step 2: Adicionar o estado `pedidoAberto`**

Logo após a linha `const [seletor, setSeletor] = useState(null); // ...` (por volta da linha 28), adicionar:

```js
  const [pedidoAberto, setPedidoAberto] = useState(false); // sheet de novo pedido
```

- [ ] **Step 3: Trocar o botão único "Registrar visita" por um par de botões**

Substituir o bloco atual (por volta das linhas 187-194):

```js
        <TouchableOpacity
          style={styles.botaoRegistrar}
          onPress={() => navigation.navigate('Registrar', { id, nome: farmacia.nome })}
          activeOpacity={0.85}
        >
          <Text style={styles.botaoRegistrarMais}>+</Text>
          <Text style={styles.botaoRegistrarTexto}>Registrar visita</Text>
        </TouchableOpacity>
```

por:

```js
        <View style={styles.botoesAcao}>
          <TouchableOpacity
            style={styles.botaoAcao}
            onPress={() => navigation.navigate('Registrar', { id, nome: farmacia.nome })}
            activeOpacity={0.85}
          >
            <Text style={styles.botaoAcaoMais}>+</Text>
            <Text style={styles.botaoAcaoTexto}>Registrar visita</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.botaoAcao}
            onPress={() => setPedidoAberto(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.botaoAcaoMais}>+</Text>
            <Text style={styles.botaoAcaoTexto}>Registrar pedido</Text>
          </TouchableOpacity>
        </View>
```

- [ ] **Step 4: Renderizar o NovoPedidoSheet**

No fim do componente, junto dos outros modais condicionais, logo antes do bloco `{edicao && (` (por volta da linha 233), adicionar:

```js
      {pedidoAberto && (
        <NovoPedidoSheet
          farmacias={[farmacia]}
          valoresIniciais={{ farmacia }}
          onFechar={() => setPedidoAberto(false)}
          onSalvo={async () => {
            setPedidoAberto(false);
            Alert.alert('Pedido registrado', farmacia.nome);
            try {
              const f = await api.farmacia(id);
              setFarmacia((prev) => ({ ...prev, ...f }));
            } catch {
              // pedidos_count reatualiza no próximo foco; o servidor
              // bloqueia exclusão indevida via 409 de qualquer forma
            }
          }}
        />
      )}

```

- [ ] **Step 5: Substituir os estilos do botão**

No `StyleSheet.create`, substituir os três estilos atuais (por volta das linhas 319-324):

```js
  botaoRegistrar: {
    height: 52, borderRadius: 12, backgroundColor: cores.vinho, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  botaoRegistrarMais: { color: cores.branco, fontSize: 22, fontWeight: '600', marginTop: -2 },
  botaoRegistrarTexto: { color: cores.branco, fontSize: 16, fontWeight: '600' },
```

por:

```js
  botoesAcao: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  botaoAcao: {
    flex: 1, height: 52, borderRadius: 12, backgroundColor: cores.vinho,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  botaoAcaoMais: { color: cores.branco, fontSize: 20, fontWeight: '600', marginTop: -2 },
  botaoAcaoTexto: { color: cores.branco, fontSize: 14.5, fontWeight: '600' },
```

- [ ] **Step 6: Verificação estática de consistência**

Confirmar que nenhuma referência antiga sobrou e que os novos nomes casam.

Run:
```bash
cd client && grep -n "botaoRegistrar" src/screens/FichaScreen.js; grep -n "botoesAcao\|botaoAcao\|pedidoAberto\|NovoPedidoSheet" src/screens/FichaScreen.js
```

Expected:
- O primeiro `grep` (`botaoRegistrar`) **não retorna nada** (todas as referências antigas foram trocadas).
- O segundo `grep` mostra: o import do `NovoPedidoSheet`, o estado `pedidoAberto` (declaração + `setPedidoAberto` no botão + no sheet), a `View style={styles.botoesAcao}`, os dois `styles.botaoAcao`, e as definições de estilo `botoesAcao`/`botaoAcao`/`botaoAcaoMais`/`botaoAcaoTexto`.

Se o primeiro `grep` retornar qualquer linha, corrigir antes de seguir.

- [ ] **Step 7: Verificação manual no app**

Rebuildar com bundle limpo e exercitar o fluxo:

Run:
```bash
cd client && npx expo start -c
```

Checklist (abrir o app no device/emulador):
1. Abrir a Ficha de uma farmácia. Confirmar que agora há **dois botões vinho lado a lado**: "Registrar visita" e "Registrar pedido", mesma altura, sem estourar a largura.
2. Tocar "Registrar visita" → ainda navega para a tela Registrar (não quebrou).
3. Voltar. Tocar "Registrar pedido" → o sheet "Novo pedido" abre com **a farmácia da Ficha já preenchida** no seletor.
4. Tocar no seletor de farmácia → a lista mostra **apenas essa farmácia** (travado).
5. Preencher um valor (ex.: `50`), status "Pago", salvar → o sheet fecha e aparece o Alert "Pedido registrado".
6. (Se a farmácia for `origem='manual'`) tocar "Excluir farmácia" → deve aparecer o bloqueio "Não é possível excluir… tem N pedido(s)" refletindo o pedido recém-criado (prova que o reload de `pedidos_count` funcionou).

- [ ] **Step 8: Commit**

```bash
git add client/src/screens/FichaScreen.js docs/superpowers/plans/2026-07-12-registrar-pedido-da-ficha.md
git commit -m "feat(client): botão Registrar pedido na Ficha (NovoPedidoSheet pré-selecionado)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Seletor travado nesta farmácia → Step 3 (`onPress` do botão) + Step 4 (`farmacias={[farmacia]}`). ✓
- Botão em par com "Registrar visita" → Step 3 + Step 5 (estilos `botoesAcao`/`botaoAcao`). ✓
- Pós-salvar: fecha + confirmação + atualiza a Ficha → Step 4 (`onSalvo`: `setPedidoAberto(false)` + `Alert.alert` + `api.farmacia(id)` → `setFarmacia`). ✓
- Rótulo "Registrar pedido" → Step 3. ✓
- Só `FichaScreen.js` muda → todos os steps tocam só esse arquivo (+ o próprio plano no commit). ✓
- Tratamento de erro do reload silencioso → Step 4 (`catch` vazio comentado). ✓

**2. Placeholder scan:** Nenhum TBD/TODO; todo código está completo e literal. ✓

**3. Type consistency:** `pedidoAberto`/`setPedidoAberto` (Steps 2, 3, 4) casam; estilos `botoesAcao`/`botaoAcao`/`botaoAcaoMais`/`botaoAcaoTexto` definidos no Step 5 e usados no Step 3; `NovoPedidoSheet` importado (Step 1) e usado (Step 4); props passadas casam com a assinatura do componente (`farmacias`, `valoresIniciais`, `onFechar`, `onSalvo`). ✓
