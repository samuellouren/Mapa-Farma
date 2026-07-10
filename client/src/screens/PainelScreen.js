import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { cores, fontes } from '../theme';
import { api } from '../api/client';
import { PERFIL_PAGAMENTO, PERFIL_COMPRA } from '../lib/enums';
import { formatarNomeFarmaciaCompacto } from '../lib/formato';

const PERIODOS = [7, 30, 90];

// Barra empilhada da carteira (verde/âmbar/vermelho).
function BarraCarteira({ carteira }) {
  const total = carteira.paga_em_dia + carteira.atrasa + carteira.nao_paga;
  if (!total) return <View style={[styles.barra, { backgroundColor: cores.borda2 }]} />;
  const seg = (n, cor) => (n > 0 ? <View key={cor} style={{ flex: n, backgroundColor: cor }} /> : null);
  return (
    <View style={styles.barra}>
      {seg(carteira.paga_em_dia, cores.verdeEscuro)}
      {seg(carteira.atrasa, cores.ambar)}
      {seg(carteira.nao_paga, cores.vermelho)}
    </View>
  );
}

function Ranking({ titulo, subtitulo, itens, render, vazio }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitulo}>{titulo}</Text>
      {!!subtitulo && <Text style={styles.cardSub}>{subtitulo}</Text>}
      {itens.length === 0 ? (
        <Text style={styles.vazio}>{vazio}</Text>
      ) : (
        itens.map((it, i) => (
          <View key={it.id} style={styles.rankLinha}>
            <Text style={styles.rankNum}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rankNome} numberOfLines={1}>{formatarNomeFarmaciaCompacto(it)}</Text>
            </View>
            {render(it)}
          </View>
        ))
      )}
    </View>
  );
}

export default function PainelScreen() {
  const insets = useSafeAreaInsets();
  const [periodo, setPeriodo] = useState(30);
  const [stats, setStats] = useState(null);
  const [erro, setErro] = useState('');

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      (async () => {
        try {
          setErro('');
          const s = await api.stats(periodo);
          if (ativo) setStats(s);
        } catch {
          if (ativo) setErro('Não foi possível carregar as estatísticas.');
        }
      })();
      return () => { ativo = false; };
    }, [periodo])
  );

  const carteira = stats?.perfil_pagamento_carteira || { paga_em_dia: 0, atrasa: 0, nao_paga: 0 };
  const maxVend = Math.max(1, ...(stats?.por_vendedor || []).map((v) => v.visitas));

  return (
    <View style={styles.tela}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitulo}>Estatísticas</Text>
        <View style={styles.periodos}>
          {PERIODOS.map((p) => {
            const ativo = p === periodo;
            return (
              <TouchableOpacity
                key={p}
                style={[styles.periodo, ativo && styles.periodoAtivo]}
                onPress={() => setPeriodo(p)}
                activeOpacity={0.8}
              >
                <Text style={[styles.periodoTexto, { color: ativo ? cores.vinho : cores.branco }]}>{p} dias</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {!stats ? (
        <View style={styles.centro}>
          {erro ? <Text style={styles.erroTexto}>{erro}</Text> : <ActivityIndicator color={cores.vinho} size="large" />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}>
          {/* números do topo */}
          <View style={styles.numeros}>
            <View style={styles.numeroBox}>
              <Text style={styles.numeroGrande}>{stats.visitas_periodo}</Text>
              <Text style={styles.numeroLabel}>visitas no período</Text>
            </View>
            <View style={styles.numeroBox}>
              <Text style={styles.numeroGrande}>{stats.farmacias_visitadas}</Text>
              <Text style={styles.numeroLabel}>farmácias visitadas</Text>
            </View>
          </View>

          <Ranking
            titulo="Melhores clientes"
            subtitulo="por volume de compra e pagamento"
            itens={stats.top_clientes}
            vazio="Marque farmácias como clientes para ver o ranking."
            render={(it) => {
              const c = it.perfil_compra ? PERFIL_COMPRA[it.perfil_compra] : null;
              return c ? <View style={[styles.tag, { backgroundColor: c.cor + '1a' }]}><Text style={[styles.tagTexto, { color: c.cor }]}>{c.label}</Text></View> : null;
            }}
          />

          <Ranking
            titulo="Sem visita há mais tempo"
            subtitulo="priorize estas na próxima rota"
            itens={stats.sem_visita_ha_mais_tempo}
            vazio="Sem dados de visita ainda."
            render={(it) => (
              <Text style={styles.desde}>{it.dias_sem_visita == null ? 'nunca' : `${it.dias_sem_visita}d`}</Text>
            )}
          />

          {/* carteira */}
          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Perfil de pagamento da carteira</Text>
            <BarraCarteira carteira={carteira} />
            <View style={styles.legenda}>
              {[['paga_em_dia', cores.verdeEscuro], ['atrasa', cores.ambar], ['nao_paga', cores.vermelho]].map(([k, cor]) => (
                <View key={k} style={styles.legendaItem}>
                  <View style={[styles.legendaPonto, { backgroundColor: cor }]} />
                  <Text style={styles.legendaTexto}>{PERFIL_PAGAMENTO[k].label}</Text>
                  <Text style={styles.legendaNum}>{carteira[k]}</Text>
                </View>
              ))}
            </View>
            {stats.perfil_pagamento_clientes.length > 0 && (
              <View style={styles.porCliente}>
                <Text style={styles.porClienteTitulo}>Por cliente</Text>
                {stats.perfil_pagamento_clientes.map((c) => {
                  const p = PERFIL_PAGAMENTO[c.perfil_pagamento];
                  return (
                    <View key={c.id} style={styles.porClienteLinha}>
                      <View style={[styles.legendaPonto, { backgroundColor: p.cor }]} />
                      <Text style={styles.porClienteNome} numberOfLines={1}>{formatarNomeFarmaciaCompacto(c)}</Text>
                      <Text style={[styles.porClienteTag, { color: p.cor }]}>{p.label}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* por vendedor */}
          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Visitas por vendedor</Text>
            {stats.por_vendedor.length === 0 ? (
              <Text style={styles.vazio}>Nenhuma visita no período.</Text>
            ) : (
              stats.por_vendedor.map((v) => (
                <View key={v.id} style={styles.vendedor}>
                  <View style={styles.vendedorTopo}>
                    <Text style={styles.vendedorNome}>{v.nome}</Text>
                    <Text style={styles.vendedorNum}>{v.visitas}</Text>
                  </View>
                  <View style={styles.vendedorTrilho}>
                    <View style={[styles.vendedorBarra, { width: `${(v.visitas / maxVend) * 100}%` }]} />
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  header: { backgroundColor: cores.vinho, paddingHorizontal: 16, paddingBottom: 14 },
  headerTitulo: { color: cores.branco, fontSize: 22, fontWeight: '700', marginBottom: 12 },
  periodos: { flexDirection: 'row', gap: 8 },
  periodo: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.16)' },
  periodoAtivo: { backgroundColor: cores.branco },
  periodoTexto: { fontSize: 13, fontWeight: '600' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  erroTexto: { color: cores.vermelho, fontSize: 14, paddingHorizontal: 30, textAlign: 'center' },
  numeros: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  numeroBox: { flex: 1, backgroundColor: cores.branco, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: cores.borda },
  numeroGrande: { fontFamily: fontes.mono600, fontSize: 30, color: cores.vinho },
  numeroLabel: { fontSize: 12.5, color: cores.textoMudo, marginTop: 4 },
  card: { backgroundColor: cores.branco, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: cores.borda },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: cores.texto },
  cardSub: { fontSize: 12.5, color: cores.textoMudo, marginTop: 2, marginBottom: 6 },
  vazio: { fontSize: 13, color: cores.textoFraco, paddingVertical: 8 },
  rankLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: cores.borda },
  rankNum: { fontFamily: fontes.mono600, fontSize: 14, color: cores.textoFraco, width: 18 },
  rankNome: { fontSize: 14, fontWeight: '600', color: cores.texto },
  tag: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 20 },
  tagTexto: { fontSize: 11.5, fontWeight: '600' },
  desde: { fontFamily: fontes.mono600, fontSize: 13, color: cores.textoSuave },
  barra: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 12, marginBottom: 10 },
  legenda: { gap: 6 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendaPonto: { width: 10, height: 10, borderRadius: 5 },
  legendaTexto: { flex: 1, fontSize: 13, color: cores.textoSuave },
  legendaNum: { fontFamily: fontes.mono600, fontSize: 13, color: cores.texto2 },
  porCliente: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: cores.borda },
  porClienteTitulo: { fontSize: 12, fontWeight: '600', color: cores.textoMudo, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  porClienteLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  porClienteNome: { flex: 1, fontSize: 13.5, color: cores.texto },
  porClienteTag: { fontSize: 12, fontWeight: '600' },
  vendedor: { paddingTop: 10 },
  vendedorTopo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  vendedorNome: { fontSize: 13.5, fontWeight: '600', color: cores.texto },
  vendedorNum: { fontFamily: fontes.mono600, fontSize: 13.5, color: cores.vinho },
  vendedorTrilho: { height: 8, borderRadius: 4, backgroundColor: cores.fundo, overflow: 'hidden' },
  vendedorBarra: { height: 8, borderRadius: 4, backgroundColor: cores.vinho },
});
