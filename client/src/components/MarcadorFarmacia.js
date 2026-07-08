import { View, Text, StyleSheet } from 'react-native';
import { cores } from '../theme';

// Marcador replicando o design: cliente = bolinha verde com "+"; não-cliente
// = bolinha branca com borda. Selecionado aumenta de escala; fora do filtro
// fica esmaecido. Com zoom próximo (mostrarNome), o nome aparece embaixo.
//
// ÁREA DE TOQUE (crítico p/ o onPress do Marker funcionar no Android):
// o toque NÃO é o child recebendo o gesto — é o MapView que, no clique,
// projeta o ponto e testa um retângulo do tamanho de getContentSize() (o
// tamanho MEDIDO deste componente-raiz) centrado na coordenada. Por isso a
// raiz tem tamanho fixo (ALVO x ALVO): garante um retângulo de toque sólido,
// não-zero e amigável ao dedo. O pino visual fica menor, centralizado dentro
// dessa área. O label é overlay ABSOLUTO (fora do fluxo) — não altera o
// tamanho medido nem, portanto, a área de toque.
const ALVO = 44;

export default function MarcadorFarmacia({ cliente, selecionado, apagado, nome, mostrarNome }) {
  const escala = selecionado ? 1.28 : 1;
  const opacidade = apagado ? 0.28 : 1;

  return (
    <View style={styles.area}>
      {cliente ? (
        <View style={[styles.cliente, selecionado && styles.clienteSel, { transform: [{ scale: escala }], opacity: opacidade }]}>
          <View style={styles.cruzH} />
          <View style={styles.cruzV} />
        </View>
      ) : (
        <View style={[styles.naoCliente, selecionado && styles.naoClienteSel, { transform: [{ scale: escala }], opacity: opacidade }]} />
      )}
      {mostrarNome && (
        <View style={styles.labelWrap} pointerEvents="none">
          <Text style={[styles.nome, { opacity: opacidade }]} numberOfLines={1}>
            {nome}
          </Text>
        </View>
      )}
    </View>
  );
}

const LABEL_W = 120;

const styles = StyleSheet.create({
  // Tamanho fixo = área de toque sólida centrada na coordenada (anchor center).
  area: { width: ALVO, height: ALVO, alignItems: 'center', justifyContent: 'center' },
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
  // Overlay absoluto logo abaixo do pino, centrado; fora do fluxo (não mede).
  labelWrap: {
    position: 'absolute', top: ALVO / 2 + 14, left: '50%', marginLeft: -LABEL_W / 2,
    width: LABEL_W, alignItems: 'center',
  },
  nome: {
    maxWidth: LABEL_W - 4, fontSize: 10, fontWeight: '600', color: cores.texto2,
    backgroundColor: 'rgba(255,255,255,.92)', borderRadius: 6, overflow: 'hidden',
    paddingHorizontal: 5, paddingVertical: 1,
  },
});
