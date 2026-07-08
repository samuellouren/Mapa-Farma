import { View, Text, StyleSheet } from 'react-native';
import { cores } from '../theme';

// Marcador replicando o design: cliente = bolinha verde com "+"; não-cliente
// = bolinha branca com borda. Selecionado aumenta de escala; fora do filtro
// fica esmaecido. Com zoom próximo (mostrarNome), o nome aparece embaixo.
//
// IMPORTANTE (área de toque): no Android o Marker nativo dimensiona sua área
// de toque pelo tamanho deste componente. Por isso a âncora encolhe até o
// pino (sem largura fixa) e o label fica como overlay ABSOLUTO com
// pointerEvents="none": assim o label não entra no cálculo de tamanho nem
// rouba/desvia o toque de marcadores vizinhos (que ficam densos na cidade).
export default function MarcadorFarmacia({ cliente, selecionado, apagado, nome, mostrarNome }) {
  const escala = selecionado ? 1.28 : 1;
  const opacidade = apagado ? 0.28 : 1;

  return (
    <View style={[styles.ancora, { opacity: opacidade }]}>
      {cliente ? (
        <View style={[styles.cliente, selecionado && styles.clienteSel, { transform: [{ scale: escala }] }]}>
          <View style={styles.cruzH} />
          <View style={styles.cruzV} />
        </View>
      ) : (
        <View style={[styles.naoCliente, selecionado && styles.naoClienteSel, { transform: [{ scale: escala }] }]} />
      )}
      {mostrarNome && (
        <View style={styles.labelWrap} pointerEvents="none">
          <Text style={styles.nome} numberOfLines={1}>
            {nome}
          </Text>
        </View>
      )}
    </View>
  );
}

const LABEL_W = 120;

const styles = StyleSheet.create({
  // Sem largura fixa: encolhe até o pino, mantendo a área de toque pequena.
  ancora: { alignItems: 'center', justifyContent: 'center' },
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
  // Overlay absoluto centrado sob o pino (left:50% + marginLeft:-W/2), fora do
  // fluxo — não afeta o tamanho da âncora nem captura toque.
  labelWrap: {
    position: 'absolute', top: '100%', left: '50%', marginLeft: -LABEL_W / 2, marginTop: 4,
    width: LABEL_W, alignItems: 'center',
  },
  nome: {
    maxWidth: LABEL_W - 4, fontSize: 10, fontWeight: '600', color: cores.texto2,
    backgroundColor: 'rgba(255,255,255,.92)', borderRadius: 6, overflow: 'hidden',
    paddingHorizontal: 5, paddingVertical: 1,
  },
});
