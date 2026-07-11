import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cores, fontes } from '../theme';
import { api } from '../api/client';
import { useAuth } from '../lib/auth';
import { iniciais } from '../lib/formato';

const PREFS_KEY = 'mapafarma_prefs';
const PREFS_PADRAO = { notificacoes: true, resumo_diario: false };

export default function ContaScreen() {
  const insets = useSafeAreaInsets();
  const { usuario, sair } = useAuth();
  const [equipe, setEquipe] = useState([]);
  const [contadores, setContadores] = useState(null);
  const [prefs, setPrefs] = useState(PREFS_PADRAO);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (raw) { try { setPrefs({ ...PREFS_PADRAO, ...JSON.parse(raw) }); } catch { /* ignora */ } }
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      (async () => {
        try {
          const [usuarios, farmacias, pedidosResp] = await Promise.all([
            api.usuarios(), api.listarFarmacias(), api.listarPedidos(),
          ]);
          if (!ativo) return;
          setEquipe(usuarios);
          setContadores({
            farmacias: farmacias.length,
            clientes: farmacias.filter((f) => f.eh_cliente).length,
            pedidos: pedidosResp.pedidos.length,
          });
        } catch {
          if (ativo) setContadores({ farmacias: '–', clientes: '–', pedidos: '–' });
        }
      })();
      return () => { ativo = false; };
    }, [])
  );

  function alternarPref(chave) {
    const novo = { ...prefs, [chave]: !prefs[chave] };
    setPrefs(novo);
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(novo));
  }

  function confirmarSair() {
    Alert.alert('Sair da conta', 'Deseja encerrar a sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => sair() },
    ]);
  }

  return (
    <View style={styles.tela}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitulo}>Conta</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}>
        {/* perfil */}
        <View style={styles.perfil}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTexto}>{iniciais(usuario?.nome)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.perfilNome}>{usuario?.nome || '—'}</Text>
            <Text style={styles.perfilSub}>Mapa Farma Distribuidora</Text>
            <Text style={styles.perfilSub}>{usuario?.email}</Text>
          </View>
        </View>

        {/* contadores */}
        <View style={styles.contadores}>
          {[['Farmácias', contadores?.farmacias], ['Clientes', contadores?.clientes], ['Pedidos', contadores?.pedidos]].map(([lbl, val]) => (
            <View key={lbl} style={styles.contadorBox}>
              <Text style={styles.contadorNum}>{val ?? '·'}</Text>
              <Text style={styles.contadorLabel}>{lbl}</Text>
            </View>
          ))}
        </View>

        {/* equipe */}
        <Text style={styles.secaoTitulo}>Equipe</Text>
        <View style={styles.card}>
          {equipe.map((t, i) => (
            <View key={t.id} style={[styles.membro, i > 0 && styles.membroBorda]}>
              <View style={styles.membroAvatar}>
                <Text style={styles.membroIni}>{iniciais(t.nome)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.membroNome}>{t.nome}</Text>
                <Text style={styles.membroEmail}>{t.email}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* preferências */}
        <Text style={styles.secaoTitulo}>Preferências</Text>
        <View style={styles.card}>
          <Pref
            titulo="Notificações"
            descricao="Alertas de visitas e cobranças"
            ativo={prefs.notificacoes}
            onToggle={() => alternarPref('notificacoes')}
            borda={false}
          />
          <Pref
            titulo="Resumo diário"
            descricao="Relatório do dia às 18h"
            ativo={prefs.resumo_diario}
            onToggle={() => alternarPref('resumo_diario')}
            borda
          />
        </View>

        <TouchableOpacity style={styles.botaoSair} onPress={confirmarSair} activeOpacity={0.85}>
          <Text style={styles.botaoSairTexto}>Sair da conta</Text>
        </TouchableOpacity>
        <Text style={styles.versao}>Mapa Farma · versão 1.0</Text>
      </ScrollView>
    </View>
  );
}

function Pref({ titulo, descricao, ativo, onToggle, borda }) {
  return (
    <View style={[styles.pref, borda && styles.prefBorda]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.prefTitulo}>{titulo}</Text>
        <Text style={styles.prefDesc}>{descricao}</Text>
      </View>
      <TouchableOpacity style={[styles.toggle, ativo && styles.toggleOn]} onPress={onToggle} activeOpacity={0.85}>
        <View style={[styles.toggleBola, ativo && styles.toggleBolaOn]} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  header: { backgroundColor: cores.vinho, paddingHorizontal: 16, paddingBottom: 14 },
  headerTitulo: { color: cores.branco, fontSize: 22, fontWeight: '700' },
  perfil: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: cores.branco, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: cores.borda },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: cores.vinho, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: cores.branco, fontFamily: fontes.mono600, fontSize: 20 },
  perfilNome: { fontSize: 18, fontWeight: '700', color: cores.texto },
  perfilSub: { fontSize: 13, color: cores.textoMudo, marginTop: 1 },
  contadores: { flexDirection: 'row', gap: 10, marginTop: 12 },
  contadorBox: { flex: 1, backgroundColor: cores.branco, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: cores.borda },
  contadorNum: { fontFamily: fontes.mono600, fontSize: 22, color: cores.vinho, minHeight: 26 },
  contadorLabel: { fontSize: 12, color: cores.textoMudo, marginTop: 3 },
  secaoTitulo: { fontSize: 13, fontWeight: '700', color: cores.textoSuave, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  card: { backgroundColor: cores.branco, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: cores.borda },
  membro: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  membroBorda: { borderTopWidth: 1, borderTopColor: cores.borda },
  membroAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: cores.fundo, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: cores.borda2 },
  membroIni: { fontFamily: fontes.mono600, fontSize: 14, color: cores.vinho },
  membroNome: { fontSize: 14.5, fontWeight: '600', color: cores.texto },
  membroEmail: { fontSize: 12.5, color: cores.textoMudo, marginTop: 1 },
  pref: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  prefBorda: { borderTopWidth: 1, borderTopColor: cores.borda },
  prefTitulo: { fontSize: 14.5, fontWeight: '600', color: cores.texto },
  prefDesc: { fontSize: 12.5, color: cores.textoMudo, marginTop: 2 },
  toggle: { width: 50, height: 30, borderRadius: 15, backgroundColor: cores.borda3, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: cores.verde },
  toggleBola: { width: 24, height: 24, borderRadius: 12, backgroundColor: cores.branco },
  toggleBolaOn: { alignSelf: 'flex-end' },
  botaoSair: { height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: cores.vermelho, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  botaoSairTexto: { color: cores.vermelho, fontSize: 15, fontWeight: '700' },
  versao: { fontSize: 12, color: cores.textoFraco, textAlign: 'center', marginTop: 16 },
});
