import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores } from '../theme';
import { IconeMapa, IconePedidos, IconePainel, IconeConta } from './Icones';

const ABAS = {
  Mapa: { Icone: IconeMapa, label: 'Mapa' },
  Pedidos: { Icone: IconePedidos, label: 'Pedidos' },
  Painel: { Icone: IconePainel, label: 'Painel' },
  Conta: { Icone: IconeConta, label: 'Conta' },
};

export default function TabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.barra, { paddingBottom: insets.bottom || 6 }]}>
      {state.routes.map((route, index) => {
        const foco = state.index === index;
        const { Icone, label } = ABAS[route.name];
        const cor = foco ? cores.vinho : cores.textoFraco;

        const aoTocar = () => {
          const evento = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!foco && !evento.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <TouchableOpacity key={route.key} style={styles.item} onPress={aoTocar} activeOpacity={0.7}>
            <Icone cor={cor} preenchido={foco ? 'rgba(122,40,51,.14)' : 'none'} />
            <Text style={[styles.rotulo, { color: cor, fontWeight: foco ? '700' : '600' }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    backgroundColor: cores.branco,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 12,
    elevation: 8,
  },
  item: { flex: 1, alignItems: 'center', gap: 3, paddingTop: 9, paddingBottom: 6 },
  rotulo: { fontSize: 11 },
});
