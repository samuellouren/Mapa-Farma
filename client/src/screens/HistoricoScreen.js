import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { cores } from '../theme';
import { api } from '../api/client';
import { dataCurta, duracaoLabel } from '../lib/formato';
import { IconeVoltar } from '../components/Icones';

export default function HistoricoScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { id, nome } = route.params;
  const [relatorios, setRelatorios] = useState(null);
  const [erro, setErro] = useState('');

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      (async () => {
        try {
          setErro('');
          const rels = await api.relatorios(id);
          if (ativo) setRelatorios(rels);
        } catch {
          if (ativo) { setErro('Não foi possível carregar o histórico.'); setRelatorios([]); }
        }
      })();
      return () => { ativo = false; };
    }, [id])
  );

  return (
    <View style={styles.tela}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.voltar} onPress={() => navigation.goBack()}>
          <IconeVoltar />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitulo}>Histórico</Text>
          <Text style={styles.headerSub}>{nome}</Text>
        </View>
      </View>

      {relatorios === null ? (
        <View style={styles.centro}><ActivityIndicator color={cores.vinho} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          {!!erro && <Text style={styles.erroTexto}>{erro}</Text>}
          {relatorios.length === 0 && !erro && (
            <Text style={styles.vazio}>Nenhuma visita registrada ainda.</Text>
          )}
          {relatorios.map((r, i) => (
            <View key={r.id} style={styles.linha}>
              <View style={styles.trilhoCol}>
                <View style={styles.bolinha} />
                {i < relatorios.length - 1 && <View style={styles.trilho} />}
              </View>
              <View style={styles.cartao}>
                <View style={styles.cartaoTopo}>
                  <Text style={styles.data}>
                    {dataCurta(r.data_visita)}{r.horario_chegada ? ` · ${r.horario_chegada}` : ''}
                  </Text>
                  {!!r.duracao_minutos && <Text style={styles.dur}>{duracaoLabel(r.duracao_minutos)}</Text>}
                </View>
                {!!r.observacao && <Text style={styles.nota}>{r.observacao}</Text>}
                <Text style={styles.por}>por {r.usuario_nome}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
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
  headerSub: { color: 'rgba(255,255,255,.75)', fontSize: 12.5, marginTop: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vazio: { fontSize: 14, color: cores.textoFraco, textAlign: 'center', marginTop: 40 },
  erroTexto: { color: cores.vermelho, fontSize: 13, fontWeight: '600', marginBottom: 12 },
  linha: { flexDirection: 'row', gap: 12 },
  trilhoCol: { alignItems: 'center', width: 16 },
  bolinha: { width: 12, height: 12, borderRadius: 6, backgroundColor: cores.vinho, marginTop: 6 },
  trilho: { flex: 1, width: 2, backgroundColor: cores.borda3, marginTop: 2 },
  cartao: {
    flex: 1, backgroundColor: cores.branco, borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: cores.borda,
  },
  cartaoTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  data: { fontSize: 13.5, fontWeight: '700', color: cores.texto2 },
  dur: { fontSize: 12.5, color: cores.textoMudo },
  nota: { fontSize: 13.5, color: cores.textoSuave, lineHeight: 19, marginBottom: 4 },
  por: { fontSize: 12, color: cores.textoFraco },
});
