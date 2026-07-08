# Adicionar Farmácia Manualmente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro manual de farmácia pela tela Mapa (FAB "+" e long press), com `POST /farmacias` validando a coordenada contra o polígono real de Maceió.

**Architecture:** O point-in-polygon hoje embutido em `seed/cnes.js` vira módulo compartilhado (`server/src/lib/limite-maceio.js`) que lê um GeoJSON commitado; a rota POST e o seed passam a usá-lo. No client, um novo `NovaFarmaciaSheet` (padrão visual do `FiltroSheet`) é aberto pelo FAB ou pelo long press do MapLibre, e a farmácia criada entra direto no estado da tela.

**Tech Stack:** Node/Express + libSQL (server), React Native/Expo + `@maplibre/maplibre-react-native` v11 (client), `node:test` nativo.

## Global Constraints

- Sem Google Maps e sem chave de API; mapa é MapLibre + tiles OSM (nunca `react-native-maps`/Leaflet).
- Nomes de código/campos em português, seguindo o padrão dos arquivos existentes.
- Nenhuma dependência npm nova (testes com `node:test`; HTTP com `fetch` nativo).
- Requests a Nominatim/Overpass sempre com `User-Agent: MapaFarma/1.0 (apoio comercial; contato: samuel.lourenco.sls@gmail.com)`.
- Client segue o design vinho (`cores.vinho`), componentes nativos, docs Expo v57.
- `latitude`/`longitude` reais sempre — nunca coordenada fake.

---

### Task 1: Módulo `limite-maceio` + script de download + testes

**Files:**
- Create: `server/src/scripts/atualizar-limite.js`
- Create: `server/src/lib/limite-maceio.js`
- Create: `server/src/lib/maceio-limite.json` (gerado pelo script, commitado)
- Test: `server/test/limite-maceio.test.js`
- Modify: `server/package.json` (scripts `test` e `limite:atualizar`)

**Interfaces:**
- Produces: `dentroDeMaceio(lng: number, lat: number): boolean` exportado de `server/src/lib/limite-maceio.js` (ordem lng, lat — igual ao GeoJSON). Retorna `false` para entrada não numérica; usa bbox como fallback se o JSON faltar.

- [ ] **Step 1: Escrever o script de download do polígono**

`server/src/scripts/atualizar-limite.js`:

```js
// Baixa o polígono do município de Maceió (Nominatim/OSM) e salva em
// src/lib/maceio-limite.json. Rodar só quando o limite municipal mudar:
//   npm run limite:atualizar
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const URL_NOMINATIM =
  'https://nominatim.openstreetmap.org/search?q=Macei%C3%B3%2C%20Alagoas%2C%20Brasil&format=json&polygon_geojson=1&limit=1';
const UA = 'MapaFarma/1.0 (apoio comercial; contato: samuel.lourenco.sls@gmail.com)';

const r = await fetch(URL_NOMINATIM, { headers: { 'User-Agent': UA } });
if (!r.ok) {
  console.error(`Nominatim respondeu ${r.status}`);
  process.exit(1);
}
const j = await r.json();
const geo = j[0]?.geojson;
if (!geo || !['Polygon', 'MultiPolygon'].includes(geo.type)) {
  console.error('Resposta do Nominatim sem polígono utilizável.');
  process.exit(1);
}
const destino = fileURLToPath(new URL('../lib/maceio-limite.json', import.meta.url));
writeFileSync(destino, JSON.stringify(geo));
console.log(`Polígono ${geo.type} salvo em ${destino}`);
```

- [ ] **Step 2: Adicionar os scripts npm**

Em `server/package.json`, dentro de `"scripts"`, acrescentar:

```json
"test": "node --test test/",
"limite:atualizar": "node src/scripts/atualizar-limite.js"
```

- [ ] **Step 3: Rodar o script e conferir o JSON**

Run: `cd server && npm run limite:atualizar`
Expected: `Polígono MultiPolygon salvo em ...maceio-limite.json` (ou `Polygon`); arquivo criado com `"type"` e `"coordinates"`.

- [ ] **Step 4: Escrever os testes (falham — módulo não existe)**

`server/test/limite-maceio.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { dentroDeMaceio } from '../src/lib/limite-maceio.js';

// Pontos reais do saneamento de 2026-07-08 (ver spec).
test('centro de Maceió está dentro', () => {
  assert.equal(dentroDeMaceio(-35.7089, -9.6498), true);
});

test('Benedito Bentes (extremo norte, pegadinha da bbox) está dentro', () => {
  assert.equal(dentroDeMaceio(-35.7298841, -9.5552054), true);
});

test('Lagoa Mundaú está fora (bbox aceitaria)', () => {
  assert.equal(dentroDeMaceio(-35.7881228, -9.6241022), false);
});

test('Rio Largo está fora', () => {
  assert.equal(dentroDeMaceio(-35.9452453, -9.6071743), false);
});

test('litoral norte (90km) está fora', () => {
  assert.equal(dentroDeMaceio(-35.2170054, -9.0077239), false);
});

test('entrada não numérica retorna false', () => {
  assert.equal(dentroDeMaceio('a', null), false);
  assert.equal(dentroDeMaceio(NaN, -9.6), false);
  assert.equal(dentroDeMaceio(undefined, undefined), false);
});
```

- [ ] **Step 5: Rodar os testes e ver falhar**

Run: `cd server && npm test`
Expected: FAIL — `Cannot find module ... limite-maceio.js`.

- [ ] **Step 6: Implementar o módulo**

`server/src/lib/limite-maceio.js`:

```js
// Limite geográfico do município de Maceió (point-in-polygon por ray
// casting). O polígono vem de src/lib/maceio-limite.json (gerado por
// `npm run limite:atualizar`); se o arquivo faltar, cai numa bounding box
// aproximada (menos precisa perto da lagoa e das bordas).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BBOX = { latMin: -9.72, latMax: -9.38, lngMin: -35.80, lngMax: -35.60 };

function pontoNoAnel(lng, lat, anel) {
  let dentro = false;
  for (let i = 0, k = anel.length - 1; i < anel.length; k = i++) {
    const xi = anel[i][0], yi = anel[i][1], xj = anel[k][0], yj = anel[k][1];
    const cruza = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function carregarPoligonos() {
  try {
    const caminho = fileURLToPath(new URL('./maceio-limite.json', import.meta.url));
    const geo = JSON.parse(readFileSync(caminho, 'utf8'));
    const polis = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates;
    if (!Array.isArray(polis) || !polis.length) throw new Error('geojson vazio');
    return polis;
  } catch {
    console.warn('maceio-limite.json indisponível — usando bounding box de Maceió como fallback.');
    return null;
  }
}

const poligonos = carregarPoligonos();

export function dentroDeMaceio(lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  if (!poligonos) {
    return lat <= BBOX.latMax && lat >= BBOX.latMin && lng <= BBOX.lngMax && lng >= BBOX.lngMin;
  }
  return poligonos.some((poly) => pontoNoAnel(lng, lat, poly[0]));
}
```

- [ ] **Step 7: Rodar os testes e ver passar**

Run: `cd server && npm test`
Expected: PASS — 6 testes, 0 falhas (o da Lagoa Mundaú só passa com o JSON presente; se falhar, o Step 3 não gerou o arquivo).

- [ ] **Step 8: Commit**

```bash
git add server/src/lib/limite-maceio.js server/src/lib/maceio-limite.json server/src/scripts/atualizar-limite.js server/test/limite-maceio.test.js server/package.json
git commit -m "feat(server): módulo compartilhado do limite de Maceió (polígono commitado + testes)"
```

---

### Task 2: `seed/cnes.js` passa a usar o módulo compartilhado

**Files:**
- Modify: `server/src/seed/cnes.js` (remover `NOMINATIM`, `BBOX`, `pontoNoAnel`, `carregarLimiteMaceio`; importar o módulo)

**Interfaces:**
- Consumes: `dentroDeMaceio(lng, lat)` de `../lib/limite-maceio.js` (Task 1).

- [ ] **Step 1: Refatorar o seed**

Em `server/src/seed/cnes.js`:
1. Adicionar ao topo: `import { dentroDeMaceio } from '../lib/limite-maceio.js';`
2. Remover a constante `NOMINATIM`, a constante `BBOX`, as funções `pontoNoAnel` e `carregarLimiteMaceio` (o comentário sobre o filtro FORA DE MACEIÓ fica).
3. Remover a linha `const dentroDeMaceio = await carregarLimiteMaceio();` — a chamada `if (!dentroDeMaceio(lon, lat)) { foraDeMaceio++; continue; }` no loop fica como está.

- [ ] **Step 2: Verificar com dry-run**

Run: `cd server && node src/seed/cnes.js --dry`
Expected: roda sem erro e o resumo reporta `3 fora de Maceió` descartadas (os mesmos registros ruins do CNES), banco inalterado.

- [ ] **Step 3: Commit**

```bash
git add server/src/seed/cnes.js
git commit -m "refactor(server): seed CNES usa o módulo compartilhado de limite de Maceió"
```

---

### Task 3: Validação geográfica no `POST /farmacias`

**Files:**
- Modify: `server/src/routes/farmacias.js` (handler do POST, linhas ~35-47)

**Interfaces:**
- Consumes: `dentroDeMaceio(lng, lat)` de `../lib/limite-maceio.js` (Task 1).
- Produces: `POST /farmacias` responde 400 `{ erro: 'nome é obrigatório' }`, 400 `{ erro: 'latitude e longitude são obrigatórias e numéricas' }`, 400 `{ erro: 'Coordenada fora dos limites de Maceió' }`, ou 201 com a linha completa da farmácia (o client da Task 5 depende do 201 devolver a linha inteira, e do texto do `erro` pra exibir no sheet).

- [ ] **Step 1: Implementar a validação**

Em `server/src/routes/farmacias.js`, adicionar o import no topo:

```js
import { dentroDeMaceio } from '../lib/limite-maceio.js';
```

e substituir o corpo do handler `POST /` por:

```js
farmaciasRouter.post('/', ah(async (req, res) => {
  const { nome, endereco, bairro, latitude, longitude } = req.body || {};
  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ erro: 'nome é obrigatório' });
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (latitude == null || longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ erro: 'latitude e longitude são obrigatórias e numéricas' });
  }
  if (!dentroDeMaceio(lng, lat)) {
    return res.status(400).json({ erro: 'Coordenada fora dos limites de Maceió' });
  }
  const ins = await db.execute({
    sql: 'INSERT INTO farmacias (nome, endereco, bairro, latitude, longitude) VALUES (?,?,?,?,?)',
    args: [String(nome).trim(), endereco ?? null, bairro ?? null, lat, lng],
  });
  const r = await db.execute({ sql: 'SELECT * FROM farmacias WHERE id = ?', args: [ins.lastInsertRowid] });
  res.status(201).json(r.rows[0]);
}));
```

- [ ] **Step 2: Testar a rota de ponta a ponta com curl**

Subir o servidor (`cd server && npm run dev`), pegar token com um usuário do seed (ver `server/src/seed/usuarios.js` pra credencial de dev):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"<email do seed>","senha":"<senha do seed>"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# sem nome → 400 "nome é obrigatório"
curl -s -X POST http://localhost:3000/farmacias -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"latitude":-9.65,"longitude":-35.71}'

# lat/lng não numéricos → 400 "latitude e longitude são obrigatórias e numéricas"
curl -s -X POST http://localhost:3000/farmacias -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"nome":"Teste","latitude":"abc","longitude":-35.71}'

# na Lagoa Mundaú → 400 "Coordenada fora dos limites de Maceió"
curl -s -X POST http://localhost:3000/farmacias -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"nome":"Teste Lagoa","latitude":-9.6241022,"longitude":-35.7881228}'

# válida (Ponta Verde) → 201 com a linha completa
curl -s -X POST http://localhost:3000/farmacias -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"nome":"Farmácia Teste Manual","bairro":"Ponta Verde","latitude":-9.6560,"longitude":-35.7080}'
```

Expected: os três primeiros devolvem os 400 com as mensagens exatas; o último devolve 201 com `eh_cliente: 0` e `status_visita: "nao_visitada"`. Ao final, apagar o registro de teste:

```bash
cd server && node -e "import('./src/db.js').then(async ({db}) => { await db.execute({sql: \"DELETE FROM farmacias WHERE nome = 'Farmácia Teste Manual'\"}); await db.close(); })"
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/farmacias.js
git commit -m "feat(server): POST /farmacias valida nome, números e limite de Maceió"
```

---

### Task 4: Componente `NovaFarmaciaSheet`

**Files:**
- Create: `client/src/components/NovaFarmaciaSheet.js`

**Interfaces:**
- Consumes: `api.criarFarmacia(dados)` (já existe em `client/src/api/client.js`; lança `Error` com a mensagem do campo `erro` do servidor); `cores` de `../theme`.
- Produces: componente `<NovaFarmaciaSheet coordenada={{latitude, longitude}} onFechar={fn} onCriada={fn(farmacia)} />`. O pai só renderiza quando aberto (montagem condicional zera o estado a cada abertura). `onCriada` recebe a linha completa devolvida pelo POST.

- [ ] **Step 1: Escrever o componente**

`client/src/components/NovaFarmaciaSheet.js`:

```js
import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores } from '../theme';
import { api } from '../api/client';

// Bbox de Maceió pra feedback imediato; o polígono fino é validado no servidor.
const BBOX = { latMin: -9.72, latMax: -9.38, lngMin: -35.80, lngMax: -35.60 };

const parseCoord = (s) => {
  const n = Number(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Formulário de cadastro manual de farmácia (padrão visual do FiltroSheet).
// O pai monta este componente só quando aberto — o estado zera a cada abertura.
export default function NovaFarmaciaSheet({ coordenada, onFechar, onCriada }) {
  const insets = useSafeAreaInsets();
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [bairro, setBairro] = useState('');
  const [lat, setLat] = useState(coordenada.latitude.toFixed(6));
  const [lng, setLng] = useState(coordenada.longitude.toFixed(6));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const latitude = parseCoord(lat);
    const longitude = parseCoord(lng);
    if (!nome.trim()) return setErro('Informe o nome da farmácia.');
    if (latitude == null || longitude == null) return setErro('Latitude e longitude devem ser números.');
    if (latitude < BBOX.latMin || latitude > BBOX.latMax || longitude < BBOX.lngMin || longitude > BBOX.lngMax) {
      return setErro('Coordenada fora de Maceió.');
    }
    setErro('');
    setSalvando(true);
    try {
      const f = await api.criarFarmacia({
        nome: nome.trim(),
        endereco: endereco.trim() || null,
        bairro: bairro.trim() || null,
        latitude,
        longitude,
      });
      onCriada(f);
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar.');
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onFechar}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onFechar} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 22 }]}>
          <View style={styles.puxador} />
          <Text style={styles.titulo}>Nova farmácia</Text>

          <Text style={styles.label}>Nome *</Text>
          <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Ex.: Farmácia São José" placeholderTextColor="#9a9aa2" />

          <Text style={styles.label}>Endereço</Text>
          <TextInput style={styles.input} value={endereco} onChangeText={setEndereco} placeholder="Rua, número" placeholderTextColor="#9a9aa2" />

          <Text style={styles.label}>Bairro</Text>
          <TextInput style={styles.input} value={bairro} onChangeText={setBairro} placeholder="Ex.: Ponta Verde" placeholderTextColor="#9a9aa2" />

          <View style={styles.linhaCoord}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Latitude *</Text>
              <TextInput style={styles.input} value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Longitude *</Text>
              <TextInput style={styles.input} value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" />
            </View>
          </View>

          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          <TouchableOpacity style={[styles.botao, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando} activeOpacity={0.85}>
            <Text style={styles.botaoTexto}>{salvando ? 'Salvando…' : 'Salvar farmácia'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,15,17,.34)' },
  sheet: { backgroundColor: cores.branco, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8 },
  puxador: { width: 38, height: 4, borderRadius: 2, backgroundColor: cores.borda3, alignSelf: 'center', marginTop: 4, marginBottom: 14 },
  titulo: { fontSize: 18, fontWeight: '700', color: cores.texto, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: cores.textoMudo, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5, marginTop: 8 },
  input: {
    height: 44, borderRadius: 11, borderWidth: 1.5, borderColor: cores.borda3,
    paddingHorizontal: 12, fontSize: 15, color: cores.texto, backgroundColor: cores.branco,
  },
  linhaCoord: { flexDirection: 'row', gap: 10 },
  erro: { color: cores.vinho, fontSize: 13, fontWeight: '600', marginTop: 10 },
  botao: { height: 52, borderRadius: 12, backgroundColor: cores.vinho, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  botaoTexto: { color: cores.branco, fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 2: Checar sintaxe**

Run: `cd client && node -e "require('@babel/parser').parse(require('fs').readFileSync('src/components/NovaFarmaciaSheet.js','utf8'), {sourceType:'module', plugins:['jsx']}); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/NovaFarmaciaSheet.js
git commit -m "feat(client): sheet de cadastro manual de farmácia"
```

---

### Task 5: Integração no MapaScreen (FAB, long press, pós-salvar)

**Files:**
- Modify: `client/src/screens/MapaScreen.js`

**Interfaces:**
- Consumes: `<NovaFarmaciaSheet coordenada onFechar onCriada />` (Task 4); `MapRef.getCenter(): Promise<[lng, lat]>` e `onLongPress` (`event.nativeEvent.lngLat: [lng, lat]`) do MapLibre v11.
- Produces: nada consumido por outras tasks (última task).

- [ ] **Step 1: Integrar no MapaScreen**

Em `client/src/screens/MapaScreen.js`:

1. Import: `import NovaFarmaciaSheet from '../components/NovaFarmaciaSheet';` e `IconeMais` não existe — usar `<Text>` no FAB.
2. Refs/estado (junto dos existentes):

```js
const mapRef = useRef(null);
const [novaFarmacia, setNovaFarmacia] = useState(null); // {latitude, longitude} | null
```

3. No `<Map ...>`, adicionar `ref={mapRef}` e:

```js
onLongPress={(e) => {
  const [lng, lat] = e.nativeEvent.lngLat;
  setSelecionada(null);
  setNovaFarmacia({ latitude: lat, longitude: lng });
}}
```

4. Handler do FAB (perto de `irParaMinhaLocalizacao`):

```js
async function abrirNovaFarmacia() {
  let centro = MACEIO.center;
  try {
    const c = await mapRef.current?.getCenter();
    if (c) centro = c;
  } catch { /* usa o centro padrão */ }
  setSelecionada(null);
  setNovaFarmacia({ latitude: centro[1], longitude: centro[0] });
}
```

5. FAB no JSX, logo antes do botão `styles.btnLocal`:

```jsx
<TouchableOpacity style={styles.btnAdicionar} onPress={abrirNovaFarmacia} activeOpacity={0.85}>
  <Text style={styles.btnAdicionarTexto}>+</Text>
</TouchableOpacity>
```

6. Sheet no JSX, depois do `<FiltroSheet ... />` (montagem condicional zera o formulário a cada abertura):

```jsx
{novaFarmacia && (
  <NovaFarmaciaSheet
    coordenada={novaFarmacia}
    onFechar={() => setNovaFarmacia(null)}
    onCriada={(f) => {
      setNovaFarmacia(null);
      setFarmacias((prev) => [...prev, f]);
      setSelecionada(f);
      cameraRef.current?.flyTo({ center: [f.longitude, f.latitude], zoom: 16, duration: 800 });
    }}
  />
)}
```

7. Estilos novos (FAB empilhado acima do botão de localização, que fica em `bottom: 14` com 46 de altura):

```js
btnAdicionar: {
  position: 'absolute', right: 12, bottom: 72, width: 46, height: 46, borderRadius: 12,
  backgroundColor: cores.vinho, alignItems: 'center', justifyContent: 'center',
  shadowColor: '#000', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 3 }, shadowRadius: 12, elevation: 5,
},
btnAdicionarTexto: { color: cores.branco, fontSize: 26, fontWeight: '600', lineHeight: 30, marginTop: -2 },
```

- [ ] **Step 2: Checar sintaxe**

Run: `cd client && node -e "require('@babel/parser').parse(require('fs').readFileSync('src/screens/MapaScreen.js','utf8'), {sourceType:'module', plugins:['jsx']}); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Conferir a forma do evento de long press**

Run: `grep -n "lngLat" client/node_modules/@maplibre/maplibre-react-native/lib/typescript/module/types/PressEvent.d.ts`
Expected: `lngLat: LngLat` (tupla `[lng, lat]`). Se o campo tiver outro nome, ajustar o handler do Step 1 antes de commitar.

- [ ] **Step 4: Commit**

```bash
git add client/src/screens/MapaScreen.js
git commit -m "feat(client): FAB e long press pra adicionar farmácia no mapa"
```

---

## Verificação final (manual, no dispositivo)

1. Abrir o app (Expo), tela Mapa: FAB "+" vinho acima do botão de localização.
2. Tocar o FAB → sheet abre com lat/lng do centro do mapa preenchidos.
3. Long press num ponto vazio → sheet abre com a coordenada do toque.
4. Salvar sem nome → erro no sheet, não fecha.
5. Lat na lagoa (-9.6241, -35.7881) → erro "Coordenada fora..." vindo do servidor (a bbox do client deixa passar; o polígono barra).
6. Salvar válida → sheet fecha, câmera voa até o ponto, marcador branco novo aparece selecionado com o BottomSheetFarmacia aberto.
