import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Map, Camera, Marker, UserLocation } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { cores, fontes } from '../theme';
import { api } from '../api/client';
import { IconeBusca, IconeFiltro, IconeLocalizacao } from '../components/Icones';
import MarcadorFarmacia from '../components/MarcadorFarmacia';
import BottomSheetFarmacia from '../components/BottomSheetFarmacia';
import FiltroSheet from '../components/FiltroSheet';
import NovaFarmaciaSheet from '../components/NovaFarmaciaSheet';

// Maceió/AL como centro inicial (fallback se o GPS for negado/indisponível).
const MACEIO = { center: [-35.7089, -9.6498], zoom: 11.5 };

// A partir deste zoom os marcadores mostram o nome da farmácia.
const ZOOM_COM_NOMES = 14.5;

// Estilo MapLibre com tiles OpenStreetMap — sem Google, sem chave de API.
const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const FILTRO_VAZIO = { relacao: 'all', status_visita: 'all', perfil_pagamento: 'all' };

export default function MapaScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef(null);
  const mapRef = useRef(null);

  const [farmacias, setFarmacias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useState(FILTRO_VAZIO);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [selecionada, setSelecionada] = useState(null);
  const [mostrarNomes, setMostrarNomes] = useState(false);
  const [novaFarmacia, setNovaFarmacia] = useState(null); // {latitude, longitude} | null
  const [localizando, setLocalizando] = useState(false);

  // Só na montagem: abre centralizado na posição do vendedor (fallback: centro).
  useEffect(() => {
    irParaMinhaLocalizacao(15);
  }, []);

  // Recarrega a lista ao ganhar foco (reflete status/cor após Ficha/Registrar).
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

  const temFiltro =
    filtros.relacao !== 'all' || filtros.status_visita !== 'all' || filtros.perfil_pagamento !== 'all';

  function corresponde(f) {
    const q = busca.trim().toLowerCase();
    if (q && !`${f.nome} ${f.bairro || ''}`.toLowerCase().includes(q)) return false;
    if (filtros.relacao === 'cliente' && !f.eh_cliente) return false;
    if (filtros.relacao === 'nao' && f.eh_cliente) return false;
    if (filtros.status_visita !== 'all' && f.status_visita !== filtros.status_visita) return false;
    if (filtros.perfil_pagamento !== 'all' && f.perfil_pagamento !== filtros.perfil_pagamento) return false;
    return true;
  }

  const correspondentes = farmacias.filter(corresponde);
  const nClientes = correspondentes.filter((f) => f.eh_cliente).length;

  // Só voa se o GPS retornar uma coordenada plausível na região de Maceió/AL.
  // Sem isso, um fix ruim (0,0, cache, localização de emulador) levaria a
  // câmera pro oceano; o fallback é ficar em Maceió (initialViewState).
  function coordValida(lng, lat) {
    return Number.isFinite(lng) && Number.isFinite(lat)
      && lat > -11 && lat < -8 && lng > -37 && lng < -34;
  }

  async function irParaMinhaLocalizacao(zoom = 16) {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      setLocalizando(true);
      // Caminho rápido: última posição conhecida costuma retornar na hora,
      // enquanto o fix atual (GPS real) pode levar alguns segundos.
      const ultima = await Location.getLastKnownPositionAsync();
      if (ultima && coordValida(ultima.coords.longitude, ultima.coords.latitude)) {
        cameraRef.current?.flyTo({ center: [ultima.coords.longitude, ultima.coords.latitude], zoom, duration: 800 });
      }
      // Fix atual, mais preciso.
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { longitude, latitude } = pos.coords;
      if (coordValida(longitude, latitude)) {
        cameraRef.current?.flyTo({ center: [longitude, latitude], zoom, duration: 800 });
      }
    } catch {
      /* silencioso: sem permissão ou GPS off → fica em Maceió */
    } finally {
      setLocalizando(false);
    }
  }

  async function abrirNovaFarmacia() {
    let centro = MACEIO.center;
    try {
      const c = await mapRef.current?.getCenter();
      if (c) centro = c;
    } catch {
      /* usa o centro padrão */
    }
    setSelecionada(null);
    setNovaFarmacia({ latitude: centro[1], longitude: centro[0] });
  }

  function abrirRota(f) {
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${f.latitude},${f.longitude}`,
      android: `https://www.google.com/maps/dir/?api=1&destination=${f.latitude},${f.longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${f.latitude},${f.longitude}`,
    });
    Linking.openURL(url);
  }

  return (
    <View style={styles.tela}>
      {/* HEADER vinho: busca + filtro + contador */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.barraTopo}>
          <View style={styles.busca}>
            <IconeBusca />
            <TextInput
              style={styles.buscaInput}
              value={busca}
              onChangeText={setBusca}
              placeholder="Buscar por nome ou bairro"
              placeholderTextColor="#9a9aa2"
            />
          </View>
          <TouchableOpacity
            style={[styles.botaoFiltro, { backgroundColor: temFiltro ? cores.branco : 'rgba(255,255,255,.9)' }]}
            onPress={() => setFiltroAberto(true)}
            activeOpacity={0.85}
          >
            <IconeFiltro />
            {temFiltro && <View style={styles.badge} />}
          </TouchableOpacity>
        </View>
        <View style={styles.contadorLinha}>
          <Text style={styles.contador}>
            {correspondentes.length} farmácias · {nClientes} clientes
          </Text>
          {temFiltro && (
            <TouchableOpacity onPress={() => setFiltros(FILTRO_VAZIO)}>
              <Text style={styles.limpar}>limpar filtro ✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* MAPA */}
      <View style={styles.mapaArea}>
        <Map
          ref={mapRef}
          style={{ flex: 1 }}
          mapStyle={OSM_STYLE}
          onPress={() => setSelecionada(null)}
          onLongPress={(e) => {
            const [lng, lat] = e.nativeEvent.lngLat;
            setSelecionada(null);
            setNovaFarmacia({ latitude: lat, longitude: lng });
          }}
          onRegionDidChange={(e) => setMostrarNomes(e.nativeEvent.zoom >= ZOOM_COM_NOMES)}
        >
          <Camera ref={cameraRef} initialViewState={MACEIO} />
          <UserLocation visible />
          {farmacias.map((f) =>
            f.latitude != null && f.longitude != null ? (
              <Marker
                key={f.id}
                id={String(f.id)}
                lngLat={[f.longitude, f.latitude]}
                onPress={() => setSelecionada(f)}
              >
                <MarcadorFarmacia
                  cliente={!!f.eh_cliente}
                  selecionado={selecionada?.id === f.id}
                  apagado={!corresponde(f)}
                  nome={f.nome}
                  mostrarNome={mostrarNomes}
                />
              </Marker>
            ) : null
          )}
        </Map>

        {/* legenda */}
        <View style={styles.legenda}>
          <View style={styles.legendaLinha}>
            <View style={styles.pontoCliente} />
            <Text style={styles.legendaTexto}>Cliente</Text>
          </View>
          <View style={styles.legendaLinha}>
            <View style={styles.pontoNao} />
            <Text style={[styles.legendaTexto, { fontWeight: '500', color: cores.textoSuave }]}>Não cliente</Text>
          </View>
        </View>

        {/* adicionar farmácia */}
        <TouchableOpacity style={styles.btnAdicionar} onPress={abrirNovaFarmacia} activeOpacity={0.85}>
          <Text style={styles.btnAdicionarTexto}>+</Text>
        </TouchableOpacity>

        {/* minha localização */}
        <TouchableOpacity
          style={styles.btnLocal}
          onPress={() => irParaMinhaLocalizacao()}
          disabled={localizando}
          activeOpacity={0.85}
        >
          {localizando ? <ActivityIndicator color={cores.vinho} size="small" /> : <IconeLocalizacao />}
        </TouchableOpacity>

        {carregando && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color={cores.vinho} />
          </View>
        )}
        {!!erro && !carregando && (
          <View style={styles.overlay}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}
      </View>

      <BottomSheetFarmacia
        farmacia={selecionada}
        onFechar={() => setSelecionada(null)}
        onRota={() => abrirRota(selecionada)}
        onAbrirFicha={() => {
          const f = selecionada;
          setSelecionada(null);
          navigation.navigate('Ficha', { id: f.id });
        }}
      />

      <FiltroSheet
        aberto={filtroAberto}
        filtros={filtros}
        onMudar={(chave, valor) => setFiltros((p) => ({ ...p, [chave]: valor }))}
        onFechar={() => setFiltroAberto(false)}
        contagem={correspondentes.length}
      />

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
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  header: {
    backgroundColor: cores.vinho, paddingHorizontal: 14, paddingBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 2 }, shadowRadius: 10, zIndex: 20,
  },
  barraTopo: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  busca: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: cores.branco, borderRadius: 11, paddingHorizontal: 12, height: 44,
  },
  buscaInput: { flex: 1, fontSize: 15, color: cores.texto, padding: 0 },
  botaoFiltro: { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 4,
    backgroundColor: cores.verde, borderWidth: 1.5, borderColor: cores.branco,
  },
  contadorLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9, paddingLeft: 3 },
  contador: { fontFamily: fontes.mono600, fontSize: 12.5, color: cores.branco },
  limpar: {
    color: cores.branco, fontSize: 11, fontWeight: '600', overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,.16)', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20,
  },
  mapaArea: { flex: 1, backgroundColor: cores.fundoMapa },
  legenda: {
    position: 'absolute', left: 12, bottom: 14, backgroundColor: cores.branco, borderRadius: 11,
    paddingVertical: 9, paddingHorizontal: 12, gap: 7,
    shadowColor: '#000', shadowOpacity: 0.16, shadowOffset: { width: 0, height: 3 }, shadowRadius: 14, elevation: 4,
  },
  legendaLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pontoCliente: { width: 15, height: 15, borderRadius: 7.5, backgroundColor: cores.verde, borderWidth: 2, borderColor: cores.branco },
  pontoNao: { width: 13, height: 13, borderRadius: 6.5, backgroundColor: cores.branco, borderWidth: 2.5, borderColor: cores.cinzaNaoCliente },
  legendaTexto: { fontSize: 12, fontWeight: '600', color: cores.texto2 },
  btnAdicionar: {
    position: 'absolute', right: 12, bottom: 72, width: 46, height: 46, borderRadius: 12,
    backgroundColor: cores.vinho, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 3 }, shadowRadius: 12, elevation: 5,
  },
  btnAdicionarTexto: { color: cores.branco, fontSize: 26, fontWeight: '600', lineHeight: 30, marginTop: -2 },
  btnLocal: {
    position: 'absolute', right: 12, bottom: 14, width: 46, height: 46, borderRadius: 12,
    backgroundColor: cores.branco, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 3 }, shadowRadius: 12, elevation: 4,
  },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(233,230,223,.6)' },
  erroTexto: { color: cores.textoMudo, fontSize: 14, paddingHorizontal: 30, textAlign: 'center' },
});
