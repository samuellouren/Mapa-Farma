import { useMemo, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, Pressable, FlatList, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores } from '../theme';

// Seletor de farmácia: pressable que abre um modal com busca + lista.
// Substitui o <select> do design (não existe nativo em RN).
export default function FarmaciaPicker({ farmacias, valor, onSelecionar, placeholder = 'Selecione a farmácia…' }) {
  const insets = useSafeAreaInsets();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return farmacias;
    return farmacias.filter((f) => `${f.nome} ${f.bairro || ''}`.toLowerCase().includes(q));
  }, [farmacias, busca]);

  return (
    <>
      <TouchableOpacity style={styles.campo} onPress={() => setAberto(true)} activeOpacity={0.8}>
        <Text style={[styles.campoTexto, !valor && styles.campoPlaceholder]} numberOfLines={1}>
          {valor ? valor.nome : placeholder}
        </Text>
        <Text style={styles.seta}>▾</Text>
      </TouchableOpacity>

      <Modal visible={aberto} transparent animationType="slide" onRequestClose={() => setAberto(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAberto(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.puxador} />
          <TextInput
            style={styles.busca}
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar farmácia"
            placeholderTextColor="#9a9aa2"
            autoFocus
          />
          <FlatList
            data={filtradas}
            keyExtractor={(f) => String(f.id)}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 380 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.item}
                onPress={() => { onSelecionar(item); setAberto(false); setBusca(''); }}
                activeOpacity={0.7}
              >
                <Text style={styles.itemNome}>{item.nome}</Text>
                {!!item.bairro && <Text style={styles.itemBairro}>{item.bairro}</Text>}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.vazio}>Nenhuma farmácia encontrada.</Text>}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  campo: {
    height: 46, borderRadius: 11, borderWidth: 1.5, borderColor: cores.borda3,
    paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  campoTexto: { flex: 1, fontSize: 15, color: cores.texto },
  campoPlaceholder: { color: '#9a9aa2' },
  seta: { fontSize: 14, color: cores.textoMudo, marginLeft: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,15,17,.34)' },
  sheet: { backgroundColor: cores.branco, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 8 },
  puxador: { width: 38, height: 4, borderRadius: 2, backgroundColor: cores.borda3, alignSelf: 'center', marginTop: 4, marginBottom: 12 },
  busca: {
    height: 44, borderRadius: 11, borderWidth: 1.5, borderColor: cores.borda3,
    paddingHorizontal: 12, fontSize: 15, color: cores.texto, marginBottom: 8,
  },
  item: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: cores.borda },
  itemNome: { fontSize: 15, fontWeight: '600', color: cores.texto },
  itemBairro: { fontSize: 12.5, color: cores.textoMudo, marginTop: 1 },
  vazio: { fontSize: 14, color: cores.textoFraco, textAlign: 'center', paddingVertical: 24 },
});
