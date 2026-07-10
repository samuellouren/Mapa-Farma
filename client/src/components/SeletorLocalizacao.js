import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Map, Camera } from '@maplibre/maplibre-react-native';
import { cores } from '../theme';
import { api } from '../api/client';
import { IconeBusca } from './Icones';
import { OSM_STYLE, ZOOM_MAX, dentroDaBboxMaceio } from '../lib/mapaConfig';

// Diagnóstico do pino: com `true`, a área do pino ganha um fundo magenta
// semitransparente e uma borda grossa. Serve pra confirmar NO APARELHO se a
// view está presente e composta acima do mapa (aí o problema seria só a forma
// do pino) ou se nem o retângulo aparece (aí é composição/elevation sobre o
// SurfaceView). Deixe `false` em produção.
const DEBUG_PINO = false;

// Seletor de localização estilo 99/Uber: pino FIXO no centro da tela, o usuário
// arrasta o MAPA por baixo. A coordenada é sempre o centro. Complementarmente,
// uma barra de busca por endereço (geocode direto) move o mapa até o local — o
// pino, fixo, acompanha; o usuário ainda pode arrastar pra ajustar fino. Ao
// confirmar, faz geocode reverso (preenche endereço/bairro) e valida Maceió.
export default function SeletorLocalizacao({ centroInicial, onCancelar, onConfirmar }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  // Centro corrente do mapa; começa no ponto de abertura.
  const centroRef = useRef(centroInicial);
  const [foraDeMaceio, setForaDeMaceio] = useState(!dentroDaBboxMaceio(centroInicial[0], centroInicial[1]));
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState('');

  // Busca por endereço (sugestões em tempo real, estilo Uber/99/iFood).
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [buscaErro, setBuscaErro] = useState('');
  // Sequência da última requisição disparada; descarta respostas fora de ordem
  // (rede lenta pode devolver uma busca antiga depois de uma nova).
  const buscaSeq = useRef(0);
  // Enquanto o usuário escolhe um resultado, evita reabrir a lista pelo debounce.
  const buscaPausada = useRef(false);

  // Debounce: 350ms depois de parar de digitar, busca sozinho — sem enter/botão.
  useEffect(() => {
    const q = busca.trim();
    if (buscaPausada.current) { buscaPausada.current = false; return; }
    if (q.length < 3) {
      setResultados([]);
      setBuscando(false);
      setBuscaErro('');
      return;
    }
    setBuscando(true);
    const seq = ++buscaSeq.current;
    const t = setTimeout(async () => {
      try {
        const { resultados: rs } = await api.buscarEndereco(q);
        if (seq !== buscaSeq.current) return; // chegou uma busca mais nova; ignora
        setResultados(rs || []);
        setBuscaErro(rs && rs.length ? '' : 'Nenhum endereço encontrado em Maceió.');
      } catch (e) {
        if (seq !== buscaSeq.current) return;
        setResultados([]);
        setBuscaErro(e.message || 'Não foi possível buscar agora.');
      } finally {
        if (seq === buscaSeq.current) setBuscando(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  function aoMover(e) {
    const c = e.nativeEvent.center; // [lng, lat]
    if (!c) return;
    centroRef.current = c;
    const fora = !dentroDaBboxMaceio(c[0], c[1]);
    // setState só quando cruza a borda, pra não re-renderizar a cada frame.
    setForaDeMaceio((atual) => (atual !== fora ? fora : atual));
    if (aviso) setAviso('');
  }

  // Toca numa sugestão: fecha a lista, voa o mapa até o local e o pino fixo
  // (no centro) marca o ponto. O usuário ainda pode arrastar pra ajustar fino.
  function irPara(r) {
    Keyboard.dismiss();
    buscaSeq.current++;        // invalida qualquer resposta de busca em voo
    buscaPausada.current = true; // o setBusca abaixo não deve reabrir a lista
    setBusca(r.label);
    setResultados([]);
    setBuscando(false);
    setBuscaErro('');
    centroRef.current = [r.longitude, r.latitude];
    setForaDeMaceio(false); // resultado já veio filtrado dentro de Maceió
    cameraRef.current?.flyTo({ center: [r.longitude, r.latitude], zoom: 17, duration: 700 });
  }

  async function confirmar() {
    let centro = centroRef.current;
    try {
      const c = await mapRef.current?.getCenter();
      if (c) centro = c;
    } catch {
      /* usa o último centro conhecido */
    }
    const [lng, lat] = centro;

    if (!dentroDaBboxMaceio(lng, lat)) {
      setAviso('Arraste o mapa para dentro de Maceió.');
      return;
    }

    setConfirmando(true);
    try {
      const { endereco, bairro, dentro_maceio } = await api.reverseGeocode(lat, lng);
      if (!dentro_maceio) {
        setAviso('Esse ponto está fora de Maceió. Arraste para um local dentro da cidade.');
        setConfirmando(false);
        return;
      }
      onConfirmar({ latitude: lat, longitude: lng, endereco, bairro });
    } catch {
      // Geocode falhou (rede): confirma mesmo assim sem endereço — o usuário
      // digita depois; a coordenada é válida (bbox ok + polígono no save).
      onConfirmar({ latitude: lat, longitude: lng, endereco: null, bairro: null });
    }
  }

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onCancelar}>
      <View style={styles.tela}>
        <Map
          ref={mapRef}
          style={{ flex: 1 }}
          mapStyle={OSM_STYLE}
          doubleTapZoom={false}
          onRegionIsChanging={aoMover}
          onRegionDidChange={aoMover}
        >
          <Camera ref={cameraRef} initialViewState={{ center: centroInicial, zoom: 16 }} maxZoom={ZOOM_MAX} />
        </Map>

        {/* PINO FIXO no centro — não recebe toque, o mapa passa por baixo.
            É uma view PEQUENA ancorada no centro (não um absoluteFill), porque
            no Android um overlay transparente cobrindo todo o SurfaceView do
            mapa não compõe acima dele — já uma view pequena e elevada sim (é o
            mesmo padrão do btnAdicionar/legenda do MapaScreen, que aparecem). */}
        <View
          style={[styles.pinoArea, DEBUG_PINO && styles.pinoDebug]}
          pointerEvents="none"
        >
          <View style={styles.pinoCabeca}>
            <View style={styles.pinoFuro} />
          </View>
          <View style={styles.pinoPonta} />
        </View>

        {/* topo: cancelar + busca + resultados */}
        <View style={[styles.topo, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <View style={styles.topoLinha}>
            <TouchableOpacity style={styles.btnCancelar} onPress={onCancelar} activeOpacity={0.85}>
              <Text style={styles.btnCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
            <View style={styles.buscaCampo}>
              <IconeBusca />
              <TextInput
                style={styles.buscaInput}
                value={busca}
                onChangeText={setBusca}
                placeholder="Buscar endereço"
                placeholderTextColor="#9a9aa2"
                returnKeyType="search"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              {buscando && <ActivityIndicator size="small" color={cores.vinho} />}
            </View>
          </View>

          {!!buscaErro && <Text style={styles.buscaErro}>{buscaErro}</Text>}

          {resultados.length > 0 && (
            <View style={styles.resultados}>
              {resultados.map((r, i) => (
                <TouchableOpacity
                  key={`${r.latitude},${r.longitude},${i}`}
                  style={[styles.resultItem, i > 0 && styles.resultBorda]}
                  onPress={() => irPara(r)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resultLabel} numberOfLines={2}>{r.label}</Text>
                  {!r.preciso && (
                    <Text style={styles.resultDica}>Rua encontrada — arraste o pino pra ajustar o número</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* rodapé: aviso + confirmar */}
        <View style={[styles.rodape, { paddingBottom: insets.bottom + 14 }]}>
          {foraDeMaceio || !!aviso ? (
            <Text style={styles.aviso}>{aviso || 'Fora dos limites de Maceió.'}</Text>
          ) : (
            <Text style={styles.dica}>Arraste o mapa para posicionar o pino no local exato</Text>
          )}
          <TouchableOpacity
            style={[styles.btnConfirmar, (foraDeMaceio || confirmando) && { opacity: 0.5 }]}
            onPress={confirmar}
            disabled={foraDeMaceio || confirmando}
            activeOpacity={0.85}
          >
            {confirmando ? (
              <View style={styles.linhaConfirmar}>
                <ActivityIndicator color={cores.branco} size="small" />
                <Text style={styles.btnConfirmarTexto}>Localizando endereço…</Text>
              </View>
            ) : (
              <Text style={styles.btnConfirmarTexto}>Confirmar localização</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const PIN_H = 38; // altura total: cabeça (28) + ponta (11) − 1 de sobreposição
const PIN_W = 28; // largura da cabeça (elemento mais largo)

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundoMapa },
  // Pino ancorado no CENTRO da tela (= centro do mapa = coordenada usada). A
  // ponta (base) fica exatamente em (50%, 50%): move-se meia-largura à esquerda
  // e a altura toda pra cima, deixando a base no ponto central.
  // É uma view PEQUENA com elevation (não um absoluteFill): no Android só views
  // pequenas e elevadas compõem acima do SurfaceView do mapa — um overlay que
  // cobre o surface inteiro fica atrás. Mesmo padrão da legenda/FAB do
  // MapaScreen (elevation 4/5), que aparecem sobre o mesmo mapa.
  pinoArea: {
    position: 'absolute', left: '50%', top: '50%',
    width: PIN_W, height: PIN_H, alignItems: 'center',
    transform: [{ translateX: -PIN_W / 2 }, { translateY: -PIN_H }],
    zIndex: 8, elevation: 8,
  },
  pinoDebug: {
    backgroundColor: 'rgba(255,0,255,0.35)', borderWidth: 2, borderColor: '#ff00ff',
  },
  pinoCabeca: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: cores.vinho,
    borderWidth: 3, borderColor: cores.branco, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4,
  },
  pinoFuro: { width: 8, height: 8, borderRadius: 4, backgroundColor: cores.branco },
  pinoPonta: {
    width: 0, height: 0, marginTop: -1,
    borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 11,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: cores.vinho,
  },
  topo: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, zIndex: 10, elevation: 10 },
  topoLinha: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  btnCancelar: {
    backgroundColor: cores.branco, borderRadius: 11, paddingHorizontal: 14, height: 44, justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 6,
  },
  btnCancelarTexto: { color: cores.vinho, fontSize: 15, fontWeight: '600' },
  buscaCampo: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: cores.branco, borderRadius: 11, paddingHorizontal: 12, height: 44,
    shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 6,
  },
  buscaInput: { flex: 1, fontSize: 15, color: cores.texto, padding: 0 },
  buscaErro: { color: cores.vinho, fontSize: 13, fontWeight: '600', marginTop: 8, marginLeft: 4 },
  resultados: {
    backgroundColor: cores.branco, borderRadius: 12, marginTop: 8, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 3 }, shadowRadius: 12, elevation: 8,
  },
  resultItem: { paddingVertical: 12, paddingHorizontal: 14 },
  resultBorda: { borderTopWidth: 1, borderTopColor: cores.borda },
  resultLabel: { fontSize: 14.5, color: cores.texto, fontWeight: '500' },
  resultDica: { fontSize: 11.5, color: cores.textoMudo, fontWeight: '500', marginTop: 3 },
  rodape: {
    position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: cores.branco, borderTopLeftRadius: 20, borderTopRightRadius: 20, zIndex: 10, elevation: 10,
    shadowColor: '#000', shadowOpacity: 0.14, shadowOffset: { width: 0, height: -3 }, shadowRadius: 12,
  },
  aviso: { color: cores.vinho, fontSize: 13.5, fontWeight: '600', textAlign: 'center', marginBottom: 10 },
  dica: { color: cores.textoMudo, fontSize: 13, fontWeight: '500', textAlign: 'center', marginBottom: 10 },
  btnConfirmar: { height: 52, borderRadius: 12, backgroundColor: cores.vinho, alignItems: 'center', justifyContent: 'center' },
  linhaConfirmar: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  btnConfirmarTexto: { color: cores.branco, fontSize: 16, fontWeight: '600' },
});
