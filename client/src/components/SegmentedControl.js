import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { cores } from '../theme';

// Segmented control do design (Ficha): trilho claro, segmento ativo vinho.
// `permiteLimpar`: tocar no segmento já ativo desmarca (perfis anuláveis).
export default function SegmentedControl({ opcoes, valor, onMudar, permiteLimpar }) {
  return (
    <View style={styles.trilho}>
      {opcoes.map(([v, label]) => {
        const ativo = v === valor;
        return (
          <TouchableOpacity
            key={v}
            style={[styles.seg, ativo && styles.segAtivo]}
            onPress={() => onMudar(ativo ? (permiteLimpar ? null : v) : v)}
            activeOpacity={0.8}
          >
            <Text style={[styles.segTexto, ativo && styles.segTextoAtivo]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  trilho: {
    flexDirection: 'row', backgroundColor: cores.fundo, borderRadius: 11,
    borderWidth: 1, borderColor: cores.borda2, padding: 3, gap: 3,
  },
  seg: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segAtivo: { backgroundColor: cores.vinho },
  segTexto: { fontSize: 12.5, fontWeight: '600', color: cores.textoSuave },
  segTextoAtivo: { color: cores.branco },
});
