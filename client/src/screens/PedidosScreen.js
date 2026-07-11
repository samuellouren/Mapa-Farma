import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { cores, fontes } from '../theme';
import { api } from '../api/client';
import { STATUS_PAGAMENTO } from '../lib/enums';
import { moedaBRL, dataCurtaMes } from '../lib/formato';
import NovoPedidoSheet from '../components/NovoPedidoSheet';

const SEG_STATUS = Object.entries(STATUS_PAGAMENTO).map(([v, { label }]) => [v, label]);
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Agrupa pedidos por mês ('AAAA-MM') ou semana (segunda-feira), soma valores,
// devolve os 7 buckets mais recentes em ordem cronológica.
function agrupar(pedidos, modo) {
  const buckets = new Map();
  for (const p of pedidos) {
    const d = new Date(String(p.data_pedido).slice(0, 10) + 'T00:00:00');
    let chave, label;
    if (modo === 'mes') {
      chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      label = MESES_ABREV[d.getMonth()];
    } else {
      const seg = new Date(d);
      seg.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // segunda da semana
      chave = seg.toISOString().slice(0, 10);
      label = `${String(seg.getDate()).padStart(2, '0')}/${String(seg.getMonth() + 1).padStart(2, '0')}`;
    }
    const b = buckets.get(chave) || { chave, label, total: 0 };
    b.total += p.valor_centavos;
    buckets.set(chave, b);
  }
  return [...buckets.values()].sort((a, b) => a.chave.localeCompare(b.chave)).slice(-7);
}

export default function PedidosScreen() {
  const insets = useSafeAreaInsets();
  const [pedidos, setPedidos] = useState(null);
  const [farmacias, setFarmacias] = useState([]);
  const [modoGrafico, setModoGrafico] = useState('mes');
  const [novoAberto, setNovoAberto] = useState(false);
  const [erro, setErro] = useState('');

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      (async () => {
        try {
          setErro('');
          const [peds, fs] = await Promise.all([api.listarPedidos(), api.listarFarmacias()]);
          if (ativo) { setPedidos(peds); setFarmacias(fs); }
        } catch {
          if (ativo) { setErro('Não foi possível carregar os pedidos.'); setPedidos([]); }
        }
      })();
      return () => { ativo = false; };
    }, [])
  );

  const totais = useMemo(() => {
    const t = { vendido: 0, recebido: 0, areceber: 0 };
    for (const p of pedidos || []) {
      t.vendido += p.valor_centavos;
      if (p.status_pagamento === 'pago') t.recebido += p.valor_centavos;
      else t.areceber += p.valor_centavos;
    }
    return t;
  }, [pedidos]);

  const barras = useMemo(() => agrupar(pedidos || [], modoGrafico), [pedidos, modoGrafico]);
  const maxBarra = Math.max(1, ...barras.map((b) => b.total));

  async function trocarStatus(pedido, novo) {
    if (pedido.status_pagamento === novo) return;
    const anterior = pedidos;
    setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? { ...p, status_pagamento: novo } : p)));
    try {
      await api.atualizarPedido(pedido.id, { status_pagamento: novo });
    } catch {
      setPedidos(anterior);
      setErro('Não foi possível atualizar o status.');
    }
  }

  return (
    <View style={styles.tela}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.headerTitulo}>Pedidos</Text>
          <Text style={styles.headerSub}>Vendas e status de pagamento</Text>
        </View>
        <TouchableOpacity style={styles.botaoNovo} onPress={() => setNovoAberto(true)} activeOpacity={0.85}>
          <Text style={styles.botaoNovoMais}>+</Text>
          <Text style={styles.botaoNovoTexto}>Novo</Text>
        </TouchableOpacity>
      </View>

      {!pedidos ? (
        <View style={styles.centro}><ActivityIndicator color={cores.vinho} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}>
          {/* totais */}
          <View style={styles.totais}>
            {[['Vendido', totais.vendido, cores.texto], ['Recebido', totais.recebido, cores.verdeEscuro], ['A receber', totais.areceber, cores.ambar]].map(([lbl, val, cor]) => (
              <View key={lbl} style={styles.totalBox}>
                <Text style={styles.totalLabel}>{lbl}</Text>
                <Text style={[styles.totalValor, { color: cor }]}>{moedaBRL(val)}</Text>
              </View>
            ))}
          </View>

          {/* gráfico */}
          <View style={styles.card}>
            <View style={styles.graficoTopo}>
              <Text style={styles.cardTitulo}>Vendas em R$</Text>
              <View style={styles.toggle}>
                {[['mes', 'Mês'], ['semana', 'Semana']].map(([v, label]) => {
                  const ativo = v === modoGrafico;
                  return (
                    <TouchableOpacity key={v} style={[styles.toggleItem, ativo && styles.toggleAtivo]} onPress={() => setModoGrafico(v)} activeOpacity={0.8}>
                      <Text style={[styles.toggleTexto, { color: ativo ? cores.branco : cores.textoSuave }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            {barras.length === 0 ? (
              <Text style={styles.vazio}>Nenhum pedido para exibir.</Text>
            ) : (
              <View style={styles.grafico}>
                {barras.map((b) => (
                  <View key={b.chave} style={styles.barraCol}>
                    <Text style={styles.barraValor}>{Math.round(b.total / 100)}</Text>
                    <View style={styles.barraTrilho}>
                      <View style={[styles.barraFill, { height: `${(b.total / maxBarra) * 100}%` }]} />
                    </View>
                    <Text style={styles.barraLabel}>{b.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {!!erro && <Text style={styles.erroTexto}>{erro}</Text>}

          {/* lista */}
          <Text style={styles.secaoTitulo}>Pedidos recentes</Text>
          {pedidos.length === 0 && <Text style={styles.vazio}>Nenhum pedido registrado ainda.</Text>}
          {pedidos.map((p) => (
            <View key={p.id} style={styles.pedido}>
              <View style={styles.pedidoTopo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pedidoNome} numberOfLines={1}>{p.farmacia_nome}</Text>
                  <Text style={styles.pedidoMeta}>{[p.farmacia_bairro, dataCurtaMes(p.data_pedido)].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={styles.pedidoValor}>{moedaBRL(p.valor_centavos)}</Text>
              </View>
              <View style={styles.seg}>
                {SEG_STATUS.map(([v, label]) => {
                  const ativo = v === p.status_pagamento;
                  return (
                    <TouchableOpacity key={v} style={[styles.segItem, ativo && styles.segItemAtivo]} onPress={() => trocarStatus(p, v)} activeOpacity={0.8}>
                      <Text style={[styles.segTexto, ativo && styles.segTextoAtivo]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {novoAberto && (
        <NovoPedidoSheet
          farmacias={farmacias}
          onFechar={() => setNovoAberto(false)}
          onSalvo={(p) => {
            setNovoAberto(false);
            setPedidos((prev) => [p, ...(prev || [])]);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  header: {
    backgroundColor: cores.vinho, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  headerTitulo: { color: cores.branco, fontSize: 22, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,.75)', fontSize: 12.5, marginTop: 2 },
  botaoNovo: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: cores.branco,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
  },
  botaoNovoMais: { color: cores.vinho, fontSize: 17, fontWeight: '700', marginTop: -1 },
  botaoNovoTexto: { color: cores.vinho, fontSize: 14, fontWeight: '700' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  totais: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  totalBox: { flex: 1, backgroundColor: cores.branco, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: cores.borda },
  totalLabel: { fontSize: 11.5, color: cores.textoMudo, marginBottom: 4 },
  totalValor: { fontFamily: fontes.mono600, fontSize: 14 },
  card: { backgroundColor: cores.branco, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: cores.borda },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: cores.texto },
  graficoTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  toggle: { flexDirection: 'row', backgroundColor: cores.fundo, borderRadius: 9, padding: 3, gap: 3 },
  toggleItem: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 6 },
  toggleAtivo: { backgroundColor: cores.vinho },
  toggleTexto: { fontSize: 12.5, fontWeight: '600' },
  grafico: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 130, gap: 6 },
  barraCol: { flex: 1, alignItems: 'center' },
  barraValor: { fontSize: 10, color: cores.textoMudo, marginBottom: 4 },
  barraTrilho: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  barraFill: { width: '100%', backgroundColor: cores.vinho, borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 2 },
  barraLabel: { fontSize: 10.5, color: cores.textoMudo, marginTop: 5 },
  secaoTitulo: { fontSize: 13, fontWeight: '700', color: cores.textoSuave, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  pedido: { backgroundColor: cores.branco, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: cores.borda },
  pedidoTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  pedidoNome: { fontSize: 14.5, fontWeight: '700', color: cores.texto },
  pedidoMeta: { fontSize: 12, color: cores.textoMudo, marginTop: 2 },
  pedidoValor: { fontFamily: fontes.mono600, fontSize: 14, color: cores.texto },
  seg: { flexDirection: 'row', backgroundColor: cores.fundo, borderRadius: 10, borderWidth: 1, borderColor: cores.borda2, padding: 3, gap: 3 },
  segItem: { flex: 1, height: 34, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segItemAtivo: { backgroundColor: cores.vinho },
  segTexto: { fontSize: 12, fontWeight: '600', color: cores.textoSuave },
  segTextoAtivo: { color: cores.branco },
  vazio: { fontSize: 13, color: cores.textoFraco, paddingVertical: 8 },
  erroTexto: { color: cores.vermelho, fontSize: 13, fontWeight: '600', marginBottom: 10 },
});
