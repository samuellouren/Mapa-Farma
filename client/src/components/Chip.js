import { View, Text, StyleSheet } from 'react-native';
import { cores } from '../theme';

// Chip de status (relação/visita/pagamento). `preenchido` = fundo colorido
// sólido (usado na relação cliente); senão = fundo claro com texto colorido.
export default function Chip({ label, cor, preenchido }) {
  if (preenchido) {
    return (
      <View style={[styles.base, { backgroundColor: cor }]}>
        <Text style={[styles.texto, { color: cores.branco }]}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.base, { backgroundColor: cores.fundo, borderWidth: 1, borderColor: cor + '33' }]}>
      <Text style={[styles.texto, { color: cor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 20, alignSelf: 'flex-start' },
  texto: { fontSize: 12.5, fontWeight: '600' },
});
