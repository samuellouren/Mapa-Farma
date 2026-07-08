import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores } from '../theme';
import { api } from '../api/client';
import { STATUS_PAGAMENTO } from '../lib/enums';
import { dataCurtaMes } from '../lib/formato';
import FarmaciaPicker from './FarmaciaPicker';

const SEG_STATUS = Object.entries(STATUS_PAGAMENTO).map(([v, { label }]) => [v, label]);

// 'R$ 1.234,56' | '1234,5' | '1234' → centavos (inteiro). null se inválido.
function centavosDe(texto) {
  let s = String(texto).replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export default function NovoPedidoSheet({ farmacias, onFechar, onCriado }) {
  const insets = useSafeAreaInsets();
  const [farmacia, setFarmacia] = useState(null);
  const [valor, setValor] = useState('');
  const [status, setStatus] = useState('pago');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const hoje = dataCurtaMes(new Date().toISOString());

  async function salvar() {
    if (!farmacia) return setErro('Selecione a farmácia.');
    const centavos = centavosDe(valor);
    if (centavos == null || centavos <= 0) return setErro('Informe um valor válido.');
    setErro('');
    setSalvando(true);
    try {
      const p = await api.criarPedido({
        farmacia_id: farmacia.id,
        valor_centavos: centavos,
        status_pagamento: status,
      });
      onCriado(p);
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar o pedido.');
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onFechar}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onFechar} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 22 }]}>
          <View style={styles.puxador} />
          <Text style={styles.titulo}>Novo pedido</Text>
          <Text style={styles.subtitulo}>Registrado em {hoje}</Text>

          <Text style={styles.label}>Farmácia</Text>
          <FarmaciaPicker farmacias={farmacias} valor={farmacia} onSelecionar={setFarmacia} />

          <Text style={styles.label}>Valor do pedido (R$)</Text>
          <TextInput
            style={styles.input}
            value={valor}
            onChangeText={setValor}
            placeholder="0,00"
            placeholderTextColor="#9a9aa2"
            keyboardType="numbers-and-punctuation"
          />

          <Text style={styles.label}>Status de pagamento</Text>
          <View style={styles.seg}>
            {SEG_STATUS.map(([v, label]) => {
              const ativo = v === status;
              return (
                <TouchableOpacity
                  key={v}
                  style={[styles.segItem, ativo && styles.segItemAtivo]}
                  onPress={() => setStatus(v)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segTexto, ativo && styles.segTextoAtivo]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          <TouchableOpacity style={[styles.botao, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando} activeOpacity={0.85}>
            <Text style={styles.botaoTexto}>{salvando ? 'Salvando…' : 'Salvar pedido'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,15,17,.34)' },
  sheet: { backgroundColor: cores.branco, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8 },
  puxador: { width: 38, height: 4, borderRadius: 2, backgroundColor: cores.borda3, alignSelf: 'center', marginTop: 4, marginBottom: 12 },
  titulo: { fontSize: 18, fontWeight: '700', color: cores.texto },
  subtitulo: { fontSize: 12.5, color: cores.textoMudo, marginTop: 2, marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '600', color: cores.textoMudo, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  input: {
    height: 46, borderRadius: 11, borderWidth: 1.5, borderColor: cores.borda3,
    paddingHorizontal: 12, fontSize: 15, color: cores.texto,
  },
  seg: { flexDirection: 'row', backgroundColor: cores.fundo, borderRadius: 11, borderWidth: 1, borderColor: cores.borda2, padding: 3, gap: 3 },
  segItem: { flex: 1, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segItemAtivo: { backgroundColor: cores.vinho },
  segTexto: { fontSize: 12.5, fontWeight: '600', color: cores.textoSuave },
  segTextoAtivo: { color: cores.branco },
  erro: { color: cores.vermelho, fontSize: 13, fontWeight: '600', marginTop: 12 },
  botao: { height: 52, borderRadius: 12, backgroundColor: cores.vinho, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  botaoTexto: { color: cores.branco, fontSize: 16, fontWeight: '600' },
});
