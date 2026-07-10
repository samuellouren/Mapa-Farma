import { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Linking, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { cores } from '../theme';
import { api } from '../api/client';
import { STATUS_VISITA, PERFIL_PAGAMENTO, PERFIL_COMPRA } from '../lib/enums';
import { dataCurta, duracaoLabel, formatarEnderecoFarmacia } from '../lib/formato';
import SegmentedControl from '../components/SegmentedControl';
import { IconeVoltar, IconeRota } from '../components/Icones';
import NovaFarmaciaSheet from '../components/NovaFarmaciaSheet';
import SeletorLocalizacao from '../components/SeletorLocalizacao';

const SEG_VISITA = Object.entries(STATUS_VISITA).map(([v, { label }]) => [v, label]);
const SEG_PAGAMENTO = Object.entries(PERFIL_PAGAMENTO).map(([v, { label }]) => [v, label]);
const SEG_COMPRA = Object.entries(PERFIL_COMPRA).map(([v, { label }]) => [v, label]);

export default function FichaScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { id } = route.params;
  const [farmacia, setFarmacia] = useState(null);
  const [relatorios, setRelatorios] = useState([]);
  const [erro, setErro] = useState('');
  const [edicao, setEdicao] = useState(null); // { coordenada:{latitude,longitude}, valores:{nome,endereco,bairro} }
  const [seletor, setSeletor] = useState(null); // { centro:[lng,lat], rascunho:{nome,endereco,bairro} }

  // Recarrega ao ganhar foco (inclusive na volta do Registrar).
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

  function abrirEdicao() {
    setEdicao({
      coordenada: { latitude: farmacia.latitude, longitude: farmacia.longitude },
      valores: { nome: farmacia.nome, endereco: farmacia.endereco || '', bairro: farmacia.bairro || '' },
    });
  }

  function excluir() {
    const nPed = farmacia.pedidos_count || 0;
    const nVis = farmacia.relatorios_count || 0;
    if (nPed > 0) {
      Alert.alert(
        'Não é possível excluir',
        `Esta farmácia tem ${nPed} pedido(s) registrado(s). Edite os dados se precisar corrigir.`,
        [{ text: 'Entendi' }]
      );
      return;
    }
    const msg = nVis > 0
      ? `Isso também apagará ${nVis} visita(s) registrada(s). Não pode ser desfeito.`
      : 'Isso não pode ser desfeito.';
    Alert.alert('Excluir farmácia?', msg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.excluirFarmacia(id);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Erro', e.message || 'Não foi possível excluir.');
          }
        },
      },
    ]);
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
              {(() => {
                const endereco = formatarEnderecoFarmacia(farmacia);
                return endereco ? <Text style={styles.sub}>{endereco}</Text> : null;
              })()}
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

        {farmacia.origem === 'manual' && (
          <View style={styles.acoesManual}>
            <TouchableOpacity onPress={abrirEdicao} activeOpacity={0.7}>
              <Text style={styles.acaoEditar}>Editar dados</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={excluir} activeOpacity={0.7}>
              <Text style={styles.acaoExcluir}>Excluir farmácia</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {edicao && (
        <NovaFarmaciaSheet
          modo="editar"
          idAlvo={id}
          coordenada={edicao.coordenada}
          valoresIniciais={edicao.valores}
          onAjustarLocal={({ nome, endereco, bairro }) => {
            setSeletor({
              centro: [edicao.coordenada.longitude, edicao.coordenada.latitude],
              rascunho: { nome, endereco, bairro },
            });
            setEdicao(null);
          }}
          onFechar={() => setEdicao(null)}
          onSalvo={(f) => { setEdicao(null); setFarmacia((prev) => ({ ...prev, ...f })); }}
        />
      )}

      {seletor && (
        <SeletorLocalizacao
          centroInicial={seletor.centro}
          onCancelar={() => {
            // volta pro sheet com o rascunho e a coordenada anteriores
            setEdicao({
              coordenada: { latitude: seletor.centro[1], longitude: seletor.centro[0] },
              valores: seletor.rascunho,
            });
            setSeletor(null);
          }}
          onConfirmar={({ latitude, longitude, endereco, bairro }) => {
            const rascunho = seletor.rascunho;
            setSeletor(null);
            setEdicao({
              coordenada: { latitude, longitude },
              valores: { nome: rascunho?.nome || '', endereco: endereco || '', bairro: bairro || '' },
            });
          }}
        />
      )}
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
  acoesManual: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 6, paddingTop: 2, paddingBottom: 4,
  },
  acaoEditar: { fontSize: 14, fontWeight: '600', color: cores.textoSuave },
  acaoExcluir: { fontSize: 14, fontWeight: '600', color: cores.vermelho },
});
