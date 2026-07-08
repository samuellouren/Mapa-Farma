import { View, Text, StyleSheet } from 'react-native';
import { cores } from '../theme';

// Marcador replicando o design: cliente = bolinha verde com "+"; não-cliente
// = bolinha branca com borda. Selecionado aumenta de escala; fora do filtro
// fica esmaecido. Com zoom próximo (mostrarNome), o nome aparece embaixo.
// O Marker pai usa anchor="top" + offset pra bolinha ficar exatamente sobre a
// coordenada — o label cresce pra baixo sem deslocar o pino.
export default function MarcadorFarmacia({ cliente, selecionado, apagado, nome, mostrarNome }) {
  const escala = selecionado ? 1.28 : 1;
  const opacidade = apagado ? 0.28 : 1;

  return (
    <View style={[styles.coluna, { opacity: opacidade }]}>
      {cliente ? (
        <View style={[styles.cliente, selecionado && styles.clienteSel, { transform: [{ scale: escala }] }]}>
          <View style={styles.cruzH} />
          <View style={styles.cruzV} />
        </View>
      ) : (
        <View style={[styles.naoCliente, selecionado && styles.naoClienteSel, { transform: [{ scale: escala }] }]} />
      )}
      {mostrarNome && (
        <Text style={styles.nome} numberOfLines={1}>
          {nome}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  coluna: { width: 110, alignItems: 'center' },
  cliente: {
    width: 27, height: 27, borderRadius: 13.5, backgroundColor: cores.verde,
    borderWidth: 2.5, borderColor: cores.branco, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowOffset: { width: 0, height: 2 }, shadowRadius: 7, elevation: 5,
  },
  clienteSel: { borderColor: cores.branco, shadowOpacity: 0.5 },
  cruzH: { position: 'absolute', width: 11, height: 3, borderRadius: 1, backgroundColor: cores.branco },
  cruzV: { position: 'absolute', width: 3, height: 11, borderRadius: 1, backgroundColor: cores.branco },
  naoCliente: {
    width: 16, height: 16, borderRadius: 8, backgroundColor: cores.branco,
    borderWidth: 2.5, borderColor: cores.cinzaNaoCliente,
    shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 3,
  },
  naoClienteSel: { borderColor: cores.vinho },
  nome: {
    maxWidth: 108, marginTop: 4, fontSize: 10, fontWeight: '600', color: cores.texto2,
    backgroundColor: 'rgba(255,255,255,.92)', borderRadius: 6, overflow: 'hidden',
    paddingHorizontal: 5, paddingVertical: 1,
  },
});
