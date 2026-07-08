import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores } from '../theme';

const GRUPOS = [
  {
    chave: 'relacao', titulo: 'Relação',
    opcoes: [['all', 'Todas'], ['cliente', 'Clientes'], ['nao', 'Não clientes']],
  },
  {
    chave: 'status_visita', titulo: 'Status de visita',
    opcoes: [['all', 'Todas'], ['visitada', 'Visitada'], ['a_visitar', 'A visitar'], ['nao_visitada', 'Não visitada']],
  },
  {
    chave: 'perfil_pagamento', titulo: 'Perfil de pagamento',
    opcoes: [['all', 'Todas'], ['paga_em_dia', 'Em dia'], ['atrasa', 'Atrasa'], ['nao_paga', 'Não paga']],
  },
];

function Pilula({ ativo, label, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.pilula, ativo ? styles.pilulaAtiva : styles.pilulaInativa]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.pilulaTexto, { color: ativo ? cores.branco : cores.textoSuave, fontWeight: ativo ? '600' : '500' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function FiltroSheet({ aberto, filtros, onMudar, onFechar, contagem }) {
  const insets = useSafeAreaInsets();
  if (!aberto) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onFechar}>
      <Pressable style={styles.backdrop} onPress={onFechar} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 22 }]}>
        <View style={styles.puxador} />
        <Text style={styles.titulo}>Filtrar farmácias</Text>

        {GRUPOS.map((g) => (
          <View key={g.chave}>
            <Text style={styles.grupoTitulo}>{g.titulo}</Text>
            <View style={styles.linha}>
              {g.opcoes.map(([valor, label]) => (
                <Pilula
                  key={valor}
                  label={label}
                  ativo={(filtros[g.chave] || 'all') === valor}
                  onPress={() => onMudar(g.chave, valor)}
                />
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.botao} onPress={onFechar} activeOpacity={0.85}>
          <Text style={styles.botaoTexto}>Ver {contagem} farmácias</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,15,17,.34)' },
  sheet: { backgroundColor: cores.branco, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8 },
  puxador: { width: 38, height: 4, borderRadius: 2, backgroundColor: cores.borda3, alignSelf: 'center', marginTop: 4, marginBottom: 14 },
  titulo: { fontSize: 18, fontWeight: '700', color: cores.texto, marginBottom: 16 },
  grupoTitulo: { fontSize: 12, fontWeight: '600', color: cores.textoMudo, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  pilula: { paddingVertical: 9, paddingHorizontal: 15, borderRadius: 22, borderWidth: 1.5 },
  pilulaAtiva: { backgroundColor: cores.vinho, borderColor: cores.vinho },
  pilulaInativa: { backgroundColor: cores.branco, borderColor: cores.borda3 },
  pilulaTexto: { fontSize: 14 },
  botao: { height: 52, borderRadius: 12, backgroundColor: cores.vinho, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  botaoTexto: { color: cores.branco, fontSize: 16, fontWeight: '600' },
});
