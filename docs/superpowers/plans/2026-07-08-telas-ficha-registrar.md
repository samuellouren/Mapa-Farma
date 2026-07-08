# Telas Ficha + Registrar Visita — Implementation Plan (leva 1 de 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ciclo completo visita→registro: tocar farmácia no mapa → abrir Ficha (toggle cliente, 3 segmented controls, resumo do histórico) → Registrar visita → refletir status/histórico ao voltar.

**Architecture:** Ficha e Registrar entram no stack da aba Mapa (`MapaHome → Ficha → Registrar`). A Ficha busca a farmácia por id numa rota nova `GET /farmacias/:id` e recarrega ao ganhar foco (volta do Registrar); o MapaScreen também recarrega a lista ao ganhar foco pra refletir cor/status do marcador. Mudanças de toggle/segments fazem PATCH imediato.

**Tech Stack:** React Native/Expo + React Navigation (native-stack), Express/libSQL. Sem dependência nova.

## Global Constraints

- Fidelidade ao design `Mapa_Farma.html` via tokens de `client/src/theme` (vinho #7a2833, chips/enums de `lib/enums.js`).
- Valores de enum SEMPRE os do banco (`a_visitar`, `paga_em_dia`, …) — tradução só na exibição (skill schema-turso).
- Nomes de código em português; padrão visual dos componentes existentes (BottomSheetFarmacia, FiltroSheet).
- `data_visita` é sempre a data real do sistema — o client NÃO envia data (o servidor já grava hoje).
- Datas pt-BR sem depender de `Intl` (Hermes) — helpers manuais em `lib/formato.js`.

---

### Task 1: `GET /farmacias/:id` no server + `api.farmacia(id)` no client

**Files:**
- Modify: `server/src/routes/farmacias.js` (inserir ANTES de `GET /:id/relatorios`? Não é necessário — paths distintos; inserir depois do PATCH)
- Modify: `client/src/api/client.js`

**Interfaces:**
- Produces: `GET /farmacias/:id` → 200 linha completa | 404 `{ erro: 'Farmácia não encontrada' }`; `api.farmacia(id)` no client (Task 3 consome).

- [ ] **Step 1: Rota no server**

Em `server/src/routes/farmacias.js`, logo após o handler do `GET /'` (lista), adicionar:

```js
// GET /farmacias/:id  (ficha)
farmaciasRouter.get('/:id(\\d+)', ah(async (req, res) => {
  const r = await db.execute({ sql: 'SELECT * FROM farmacias WHERE id = ?', args: [req.params.id] });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });
  res.json(r.rows[0]);
}));
```

(`(\\d+)` evita colisão com rotas futuras não numéricas.)

- [ ] **Step 2: Método no client**

Em `client/src/api/client.js`, junto de `listarFarmacias`:

```js
farmacia: (id) => request(`/farmacias/${id}`),
```

- [ ] **Step 3: Testar com curl**

Subir o server, logar (ricardo@mapafarma.com / mapafarma123, porta 3001) e:

```bash
curl -s http://localhost:3001/farmacias/38 -H "Authorization: Bearer $TOKEN"   # → 200 Pague Menos
curl -s http://localhost:3001/farmacias/99999 -H "Authorization: Bearer $TOKEN" # → 404
```

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/farmacias.js client/src/api/client.js
git commit -m "feat: GET /farmacias/:id para a tela Ficha"
```

---

### Task 2: Componentes/helpers compartilhados (`SegmentedControl`, `formato.js`)

**Files:**
- Create: `client/src/components/SegmentedControl.js`
- Create: `client/src/lib/formato.js`

**Interfaces:**
- Produces: `<SegmentedControl opcoes={[[valor,label],...]} valor onMudar={fn(valor|null)} />` — tocar num segmento seleciona; tocar no já selecionado desmarca (volta `null`) SÓ se `permiteLimpar` (perfis são anuláveis; status de visita não).
- Produces: `dataHojeExtenso(): string` ("terça-feira, 8 de julho"), `dataCurta(iso): string` ("08/07/2026"), `duracaoLabel(min): string` ("30 min").

- [ ] **Step 1: SegmentedControl**

`client/src/components/SegmentedControl.js`:

```js
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { cores } from '../theme';

// Segmented control do design (Ficha): trilho claro, segmento ativo vinho.
// `permiteLimpar`: tocar no segmento já ativo desmarca (perfis anuláveis).
export default function SegmentedControl({ opcoes, valor, onMudar, permiteLimpar }) {
  return (
    <View style={styles.trilho}>
      {opcoes.map(([v, label]) => {
        const ativo = v === valor;
        return (
          <TouchableOpacity
            key={v}
            style={[styles.seg, ativo && styles.segAtivo]}
            onPress={() => onMudar(ativo ? (permiteLimpar ? null : v) : v)}
            activeOpacity={0.8}
          >
            <Text style={[styles.segTexto, ativo && styles.segTextoAtivo]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  trilho: {
    flexDirection: 'row', backgroundColor: cores.fundo, borderRadius: 11,
    borderWidth: 1, borderColor: cores.borda2, padding: 3, gap: 3,
  },
  seg: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segAtivo: { backgroundColor: cores.vinho },
  segTexto: { fontSize: 12.5, fontWeight: '600', color: cores.textoSuave },
  segTextoAtivo: { color: cores.branco },
});
```

- [ ] **Step 2: formato.js**

`client/src/lib/formato.js`:

```js
// Datas/números pt-BR sem depender de Intl (Hermes nem sempre traz ICU completo).
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function dataHojeExtenso() {
  const d = new Date();
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

// 'AAAA-MM-DD...' → 'DD/MM/AAAA'
export function dataCurta(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export const duracaoLabel = (min) => (min ? `${min} min` : '');
```

- [ ] **Step 3: Sintaxe + commit**

Run: `cd client && node -e "for (const f of ['src/components/SegmentedControl.js','src/lib/formato.js']) require('@babel/parser').parse(require('fs').readFileSync(f,'utf8'), {sourceType:'module', plugins:['jsx']}); console.log('OK')"`

```bash
git add client/src/components/SegmentedControl.js client/src/lib/formato.js
git commit -m "feat(client): SegmentedControl e helpers de formatação pt-BR"
```

---

### Task 3: Tela Ficha + navegação + refresh-on-focus do Mapa

**Files:**
- Create: `client/src/screens/FichaScreen.js`
- Modify: `client/src/navigation/TabNavigator.js` (Ficha real; adicionar rotas Registrar e Historico — Historico ainda stub EmBreve)
- Modify: `client/src/screens/MapaScreen.js` (recarregar lista ao ganhar foco)

**Interfaces:**
- Consumes: `api.farmacia(id)`, `api.atualizarFarmacia(id, patch)`, `api.relatorios(id)` (existentes); `SegmentedControl`, `formato.js` (Task 2); enums de `lib/enums.js`; rota recebe `route.params.id`.
- Produces: navegação `navigation.navigate('Registrar', { id, nome })` e `navigation.navigate('Historico', { id, nome })` (Task 4 e leva 2 consomem esses nomes de rota/params).

- [ ] **Step 1: FichaScreen**

`client/src/screens/FichaScreen.js`:

```js
import { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Linking, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { cores } from '../theme';
import { api } from '../api/client';
import { STATUS_VISITA, PERFIL_PAGAMENTO, PERFIL_COMPRA } from '../lib/enums';
import { dataCurta, duracaoLabel } from '../lib/formato';
import SegmentedControl from '../components/SegmentedControl';
import { IconeVoltar, IconeRota } from '../components/Icones';

const SEG_VISITA = Object.entries(STATUS_VISITA).map(([v, { label }]) => [v, label]);
const SEG_PAGAMENTO = Object.entries(PERFIL_PAGAMENTO).map(([v, { label }]) => [v, label]);
const SEG_COMPRA = Object.entries(PERFIL_COMPRA).map(([v, { label }]) => [v, label]);

export default function FichaScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { id } = route.params;
  const [farmacia, setFarmacia] = useState(null);
  const [relatorios, setRelatorios] = useState([]);
  const [erro, setErro] = useState('');

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      (async () => {
        try {
          setErro('');
          const [f, rels] = await Promise.all([api.farmacia(id), api.relatorios(id)]);
          if (ativo) { setFarmacia(f); setRelatorios(rels); }
        } catch {
          if (ativo) setErro('Não foi possível carregar a farmácia.');
        }
      })();
      return () => { ativo = false; };
    }, [id])
  );

  async function mudar(patch) {
    const anterior = farmacia;
    setFarmacia({ ...farmacia, ...patch }); // otimista
    try {
      const f = await api.atualizarFarmacia(id, patch);
      setFarmacia(f);
    } catch {
      setFarmacia(anterior);
      setErro('Não foi possível salvar a alteração.');
    }
  }

  function abrirRota() {
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${farmacia.latitude},${farmacia.longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${farmacia.latitude},${farmacia.longitude}`,
    });
    Linking.openURL(url);
  }

  if (!farmacia) {
    return (
      <View style={styles.tela}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={styles.voltar} onPress={() => navigation.goBack()}>
            <IconeVoltar />
          </TouchableOpacity>
          <Text style={styles.headerTitulo}>Ficha da farmácia</Text>
        </View>
        <View style={styles.centro}>
          {erro ? <Text style={styles.erroTexto}>{erro}</Text> : <ActivityIndicator color={cores.vinho} size="large" />}
        </View>
      </View>
    );
  }

  const cliente = !!farmacia.eh_cliente;
  const recentes = relatorios.slice(0, 2);

  return (
    <View style={styles.tela}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.voltar} onPress={() => navigation.goBack()}>
          <IconeVoltar />
        </TouchableOpacity>
        <Text style={styles.headerTitulo}>Ficha da farmácia</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}>
        {/* cabeçalho da farmácia */}
        <View style={styles.card}>
          <View style={styles.cabecalho}>
            <View style={[styles.icone, cliente ? styles.iconeCliente : styles.iconeNao]}>
              {cliente && (
                <View style={{ width: 14, height: 14 }}>
                  <View style={styles.cruzH} />
                  <View style={styles.cruzV} />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nome}>{farmacia.nome}</Text>
              {!!farmacia.endereco && <Text style={styles.sub}>{farmacia.endereco}</Text>}
              {!!farmacia.bairro && <Text style={styles.sub}>{farmacia.bairro}</Text>}
            </View>
          </View>
          <TouchableOpacity style={styles.botaoRota} onPress={abrirRota} activeOpacity={0.8}>
            <IconeRota />
            <Text style={styles.botaoRotaTexto}>Traçar rota até a farmácia</Text>
          </TouchableOpacity>
        </View>

        {/* toggle + segments */}
        <View style={styles.card}>
          <View style={styles.linhaToggle}>
            <View>
              <Text style={styles.toggleTitulo}>É cliente?</Text>
              <Text style={styles.toggleHint}>{cliente ? 'Marcador verde no mapa' : 'Marcador branco no mapa'}</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggle, cliente && styles.toggleOn]}
              onPress={() => mudar({ eh_cliente: !cliente })}
              activeOpacity={0.85}
            >
              <View style={[styles.toggleBola, cliente && styles.toggleBolaOn]} />
            </TouchableOpacity>
          </View>

          <Text style={styles.grupoTitulo}>Status de visita</Text>
          <SegmentedControl opcoes={SEG_VISITA} valor={farmacia.status_visita} onMudar={(v) => mudar({ status_visita: v })} />

          <Text style={styles.grupoTitulo}>Perfil de pagamento</Text>
          <SegmentedControl opcoes={SEG_PAGAMENTO} valor={farmacia.perfil_pagamento} onMudar={(v) => mudar({ perfil_pagamento: v })} permiteLimpar />

          <Text style={styles.grupoTitulo}>Perfil de compra</Text>
          <SegmentedControl opcoes={SEG_COMPRA} valor={farmacia.perfil_compra} onMudar={(v) => mudar({ perfil_compra: v })} permiteLimpar />

          {!!erro && <Text style={styles.erroTexto}>{erro}</Text>}
        </View>

        <TouchableOpacity
          style={styles.botaoRegistrar}
          onPress={() => navigation.navigate('Registrar', { id, nome: farmacia.nome })}
          activeOpacity={0.85}
        >
          <Text style={styles.botaoRegistrarMais}>+</Text>
          <Text style={styles.botaoRegistrarTexto}>Registrar visita</Text>
        </TouchableOpacity>

        {/* histórico resumo */}
        <View style={styles.card}>
          <View style={styles.historicoTopo}>
            <Text style={styles.historicoTitulo}>Histórico de visitas</Text>
            {relatorios.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate('Historico', { id, nome: farmacia.nome })}>
                <Text style={styles.verTudo}>Ver tudo ({relatorios.length})</Text>
              </TouchableOpacity>
            )}
          </View>
          {recentes.length === 0 && <Text style={styles.vazio}>Nenhuma visita registrada ainda.</Text>}
          {recentes.map((r) => (
            <View key={r.id} style={styles.relatorio}>
              <View style={styles.relatorioLinha}>
                <Text style={styles.relatorioData}>
                  {dataCurta(r.data_visita)}{r.horario_chegada ? ` · ${r.horario_chegada}` : ''}
                </Text>
                <Text style={styles.relatorioDur}>{duracaoLabel(r.duracao_minutos)}</Text>
              </View>
              {!!r.observacao && <Text style={styles.relatorioNota}>{r.observacao}</Text>}
              <Text style={styles.relatorioPor}>por {r.usuario_nome}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  header: {
    backgroundColor: cores.vinho, paddingHorizontal: 10, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitulo: { color: cores.branco, fontSize: 18, fontWeight: '700' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: cores.branco, borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: cores.borda,
  },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icone: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconeCliente: { backgroundColor: cores.verde },
  iconeNao: { backgroundColor: cores.borda2, borderWidth: 2, borderColor: '#b8bcc2' },
  cruzH: { position: 'absolute', top: 5.5, width: 14, height: 3, borderRadius: 1, backgroundColor: cores.branco },
  cruzV: { position: 'absolute', left: 5.5, width: 3, height: 14, borderRadius: 1, backgroundColor: cores.branco },
  nome: { fontSize: 18, fontWeight: '700', color: cores.texto, lineHeight: 22 },
  sub: { fontSize: 13.5, color: cores.textoMudo, marginTop: 2 },
  botaoRota: {
    marginTop: 12, height: 46, borderRadius: 11, borderWidth: 1.5, borderColor: cores.borda3,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  botaoRotaTexto: { color: cores.vinho, fontSize: 14.5, fontWeight: '600' },
  linhaToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: cores.borda, marginBottom: 4,
  },
  toggleTitulo: { fontSize: 15, fontWeight: '700', color: cores.texto },
  toggleHint: { fontSize: 12, color: cores.textoMudo, marginTop: 2 },
  toggle: {
    width: 50, height: 30, borderRadius: 15, backgroundColor: cores.borda3,
    padding: 3, justifyContent: 'center',
  },
  toggleOn: { backgroundColor: cores.verde },
  toggleBola: { width: 24, height: 24, borderRadius: 12, backgroundColor: cores.branco },
  toggleBolaOn: { alignSelf: 'flex-end' },
  grupoTitulo: {
    fontSize: 12, fontWeight: '600', color: cores.textoMudo, textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 12, marginBottom: 7,
  },
  botaoRegistrar: {
    height: 52, borderRadius: 12, backgroundColor: cores.vinho, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  botaoRegistrarMais: { color: cores.branco, fontSize: 22, fontWeight: '600', marginTop: -2 },
  botaoRegistrarTexto: { color: cores.branco, fontSize: 16, fontWeight: '600' },
  historicoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  historicoTitulo: { fontSize: 15, fontWeight: '700', color: cores.texto },
  verTudo: { fontSize: 13, fontWeight: '600', color: cores.vinho },
  vazio: { fontSize: 13.5, color: cores.textoFraco, paddingVertical: 6 },
  relatorio: { borderTopWidth: 1, borderTopColor: cores.borda, paddingVertical: 10 },
  relatorioLinha: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  relatorioData: { fontSize: 13, fontWeight: '600', color: cores.texto2 },
  relatorioDur: { fontSize: 12.5, color: cores.textoMudo },
  relatorioNota: { fontSize: 13.5, color: cores.textoSuave, lineHeight: 19 },
  relatorioPor: { fontSize: 12, color: cores.textoFraco, marginTop: 4 },
  erroTexto: { color: cores.vermelho, fontSize: 13, fontWeight: '600', marginTop: 10 },
});
```

Se `IconeVoltar` não existir em `components/Icones.js`, criar lá (mesmo padrão dos outros ícones, seta `M13.5 4.5 7 11l6.5 6.5` branca do design).

- [ ] **Step 2: Navegação**

Em `client/src/navigation/TabNavigator.js`: importar `FichaScreen` e `RegistrarScreen` (Task 4), remover `FichaStub`, adicionar stub `HistoricoStub = () => <EmBreve titulo="Histórico" />` e as telas:

```jsx
<MapaStack.Screen name="Ficha" component={FichaScreen} />
<MapaStack.Screen name="Registrar" component={RegistrarScreen} />
<MapaStack.Screen name="Historico" component={HistoricoStub} />
```

- [ ] **Step 3: MapaScreen recarrega ao ganhar foco**

Em `client/src/screens/MapaScreen.js`, trocar o `useEffect` de carga por `useFocusEffect` (import de `@react-navigation/native`), preservando `irParaMinhaLocalizacao(15)` num `useEffect([], )` separado pra rodar SÓ na montagem (não a cada volta de foco):

```js
useEffect(() => {
  irParaMinhaLocalizacao(15);
}, []);

useFocusEffect(
  useCallback(() => {
    let ativo = true;
    (async () => {
      try {
        setErro('');
        const dados = await api.listarFarmacias();
        if (ativo) setFarmacias(dados);
      } catch {
        if (ativo) setErro('Não foi possível carregar as farmácias.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [])
);
```

(adicionar `useCallback` ao import de react.)

- [ ] **Step 4: Sintaxe + commit**

Run: sintaxe via `@babel/parser` nos 3 arquivos alterados/criados.

```bash
git add client/src/screens/FichaScreen.js client/src/navigation/TabNavigator.js client/src/screens/MapaScreen.js client/src/components/Icones.js
git commit -m "feat(client): tela Ficha da farmácia + refresh do mapa ao voltar"
```

---

### Task 4: Tela Registrar visita

**Files:**
- Create: `client/src/screens/RegistrarScreen.js`

**Interfaces:**
- Consumes: `api.registrarRelatorio(id, { horario_chegada, duracao_minutos, observacao })` (existente — servidor grava a data de hoje e marca `visitada`); `dataHojeExtenso()` (Task 2); rota recebe `route.params.{id, nome}` (Task 3).

- [ ] **Step 1: RegistrarScreen**

`client/src/screens/RegistrarScreen.js`:

```js
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores } from '../theme';
import { api } from '../api/client';
import { dataHojeExtenso } from '../lib/formato';
import { IconeVoltar } from '../components/Icones';

const DURACOES = [10, 20, 30, 45];
const RE_HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;

export default function RegistrarScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { id, nome } = route.params;
  const [chegada, setChegada] = useState('');
  const [duracao, setDuracao] = useState(null);
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (chegada.trim() && !RE_HORA.test(chegada.trim())) {
      return setErro('Horário de chegada inválido — use HH:MM (ex.: 14:30).');
    }
    setErro('');
    setSalvando(true);
    try {
      await api.registrarRelatorio(id, {
        horario_chegada: chegada.trim() || null,
        duracao_minutos: duracao,
        observacao: observacao.trim() || null,
      });
      navigation.goBack(); // Ficha recarrega no focus
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar o relatório.');
      setSalvando(false);
    }
  }

  return (
    <View style={styles.tela}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.voltar} onPress={() => navigation.goBack()}>
          <IconeVoltar />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitulo}>Registrar visita</Text>
          <Text style={styles.headerSub}>{nome}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}>
          <View style={styles.card}>
            <View style={styles.linhaDataHora}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Data</Text>
                <Text style={styles.dataHoje}>{dataHojeExtenso()}</Text>
              </View>
              <View style={{ width: 110 }}>
                <Text style={styles.label}>Chegada</Text>
                <TextInput
                  style={styles.inputHora}
                  value={chegada}
                  onChangeText={setChegada}
                  placeholder="14:30"
                  placeholderTextColor="#9a9aa2"
                  maxLength={5}
                />
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Duração da visita</Text>
            <View style={styles.duracoes}>
              {DURACOES.map((min) => {
                const ativo = duracao === min;
                return (
                  <TouchableOpacity
                    key={min}
                    style={[styles.pilula, ativo ? styles.pilulaAtiva : styles.pilulaInativa]}
                    onPress={() => setDuracao(ativo ? null : min)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.pilulaTexto, { color: ativo ? cores.branco : cores.textoSuave }]}>
                      {min} min
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Observação</Text>
            <TextInput
              style={styles.observacao}
              value={observacao}
              onChangeText={setObservacao}
              placeholder="O que foi conversado, pedidos, pendências…"
              placeholderTextColor="#9a9aa2"
              multiline
              textAlignVertical="top"
            />
          </View>

          {!!erro && <Text style={styles.erroTexto}>{erro}</Text>}

          <TouchableOpacity
            style={[styles.botao, salvando && { opacity: 0.6 }]}
            onPress={salvar}
            disabled={salvando}
            activeOpacity={0.85}
          >
            <Text style={styles.botaoTexto}>{salvando ? 'Salvando…' : 'Salvar relatório'}</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>Registrado por você · marca a farmácia como visitada</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  header: {
    backgroundColor: cores.vinho, paddingHorizontal: 10, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitulo: { color: cores.branco, fontSize: 18, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,.75)', fontSize: 12.5, marginTop: 1 },
  card: {
    backgroundColor: cores.branco, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: cores.borda,
  },
  linhaDataHora: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  label: {
    fontSize: 12, fontWeight: '600', color: cores.textoMudo, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6,
  },
  dataHoje: { fontSize: 15, fontWeight: '600', color: cores.texto, paddingVertical: 11 },
  inputHora: {
    height: 44, borderRadius: 11, borderWidth: 1.5, borderColor: cores.borda3,
    paddingHorizontal: 12, fontSize: 15, color: cores.texto, textAlign: 'center',
  },
  duracoes: { flexDirection: 'row', gap: 8 },
  pilula: { flex: 1, height: 40, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pilulaAtiva: { backgroundColor: cores.vinho, borderColor: cores.vinho },
  pilulaInativa: { backgroundColor: cores.branco, borderColor: cores.borda3 },
  pilulaTexto: { fontSize: 13.5, fontWeight: '600' },
  observacao: {
    minHeight: 96, borderRadius: 11, borderWidth: 1.5, borderColor: cores.borda3,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: cores.texto,
  },
  erroTexto: { color: cores.vermelho, fontSize: 13, fontWeight: '600', marginTop: 12 },
  botao: {
    height: 52, borderRadius: 12, backgroundColor: cores.vinho, marginTop: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  botaoTexto: { color: cores.branco, fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, color: cores.textoFraco, textAlign: 'center', marginTop: 10 },
});
```

- [ ] **Step 2: Sintaxe + verificação de ponta a ponta no server**

Sintaxe via `@babel/parser`. Depois, com o server rodando, simular o ciclo via curl: `POST /farmacias/38/relatorios` com `{"horario_chegada":"14:30","duracao_minutos":20,"observacao":"teste ciclo"}` → 201 com `usuario_nome`; `GET /farmacias/38` → `status_visita: "visitada"`; `GET /farmacias/38/relatorios` → relatório na lista. Ao final, apagar o relatório de teste e restaurar `status_visita` anterior da #38 via node/db.

- [ ] **Step 3: Commit**

```bash
git add client/src/screens/RegistrarScreen.js
git commit -m "feat(client): tela Registrar visita"
```

---

## Verificação final (dispositivo) — checkpoint com o usuário

Mapa → tocar farmácia → "Abrir ficha" → mexer toggle/segments (persistem) → "Registrar visita" → salvar → volta pra Ficha com histórico atualizado e status "Visitada" → voltar ao mapa com marcador/label refletindo. Apresentar ao usuário ANTES de seguir pra leva 2 (Histórico, Painel) e leva 3 (Pedidos, Conta).
