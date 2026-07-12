import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores, raio } from '../theme';
import { STATUS_VISITA, PERFIL_PAGAMENTO, relacaoLabel } from '../lib/enums';
import Chip from './Chip';
import { IconeRota } from './Icones';

// Bottom sheet exibido ao tocar num marcador (design: sheet, não popup).
export default function BottomSheetFarmacia({ farmacia, onFechar, onAbrirFicha, onRota }) {
  const insets = useSafeAreaInsets();
  if (!farmacia) return null;

  const cliente = !!farmacia.eh_cliente;
  const visita = STATUS_VISITA[farmacia.status_visita];
  const pagamento = farmacia.perfil_pagamento_efetivo ? PERFIL_PAGAMENTO[farmacia.perfil_pagamento_efetivo] : null;
  const endereco = [farmacia.endereco, farmacia.bairro].filter(Boolean).join(' · ');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onFechar}>
      <Pressable style={styles.backdrop} onPress={onFechar} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.puxador} />

        <View style={styles.cabecalho}>
          <View style={[styles.icone, cliente ? styles.iconeCliente : styles.iconeNao]}>
            {cliente && (
              <View style={{ width: 14, height: 14 }}>
                <View style={styles.cruzH} />
                <View style={styles.cruzV} />
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nome}>{farmacia.nome}</Text>
            {!!endereco && <Text style={styles.endereco}>{endereco}</Text>}
          </View>
        </View>

        <View style={styles.chips}>
          <Chip label={relacaoLabel(cliente)} cor={cliente ? cores.verde : cores.textoMudo} preenchido={cliente} />
          {visita && <Chip label={visita.label} cor={visita.cor} />}
          {pagamento && <Chip label={pagamento.label} cor={pagamento.cor} />}
        </View>

        <View style={styles.botoes}>
          <TouchableOpacity style={styles.botaoRota} onPress={onRota} activeOpacity={0.8}>
            <IconeRota />
            <Text style={styles.botaoRotaTexto}>Rota</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.botaoFicha} onPress={onAbrirFicha} activeOpacity={0.85}>
            <Text style={styles.botaoFichaTexto}>Abrir ficha</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,15,17,.28)' },
  sheet: {
    backgroundColor: cores.branco, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 18, paddingTop: 8,
  },
  puxador: { width: 38, height: 4, borderRadius: 2, backgroundColor: cores.borda3, alignSelf: 'center', marginTop: 4, marginBottom: 12 },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icone: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconeCliente: { backgroundColor: cores.verde },
  iconeNao: { backgroundColor: cores.borda2, borderWidth: 2, borderColor: '#b8bcc2' },
  cruzH: { position: 'absolute', top: 5.5, width: 14, height: 3, borderRadius: 1, backgroundColor: cores.branco },
  cruzV: { position: 'absolute', left: 5.5, width: 3, height: 14, borderRadius: 1, backgroundColor: cores.branco },
  nome: { fontSize: 18, fontWeight: '700', color: cores.texto, lineHeight: 22 },
  endereco: { fontSize: 13.5, color: cores.textoMudo, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 },
  botoes: { flexDirection: 'row', gap: 10, marginTop: 16 },
  botaoRota: {
    flex: 1, height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: cores.borda3,
    backgroundColor: cores.branco, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  botaoRotaTexto: { color: cores.vinho, fontSize: 15, fontWeight: '600' },
  botaoFicha: { flex: 2, height: 50, borderRadius: 12, backgroundColor: cores.vinho, alignItems: 'center', justifyContent: 'center' },
  botaoFichaTexto: { color: cores.branco, fontSize: 15, fontWeight: '600' },
});
