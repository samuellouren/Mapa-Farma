import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores } from '../theme';

// Placeholder temporário para as telas ainda não construídas (Pedidos,
// Painel, Conta, Ficha, etc.). Será substituído quando cada tela for feita.
export default function EmBreve({ titulo = 'Em breve' }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.tela}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.headerTexto}>{titulo}</Text>
      </View>
      <View style={styles.corpo}>
        <Text style={styles.aviso}>Esta tela ainda será construída.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  header: { backgroundColor: cores.vinho, paddingHorizontal: 18, paddingBottom: 16 },
  headerTexto: { color: cores.branco, fontSize: 22, fontWeight: '700' },
  corpo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  aviso: { color: cores.textoFraco, fontSize: 14 },
});
