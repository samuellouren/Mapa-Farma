import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores } from '../theme';
import { api } from '../api/client';
import { STATUS_PAGAMENTO } from '../lib/enums';
import { dataCurtaMes, dataVencimentoDe, dataLocalYMD } from '../lib/formato';
import { useAlturaTeclado } from '../lib/useAlturaTeclado';
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

export default function NovoPedidoSheet({ modo = 'criar', idAlvo = null, farmacias, valoresIniciais = {}, onFechar, onSalvo }) {
  const insets = useSafeAreaInsets();
  const alturaTeclado = useAlturaTeclado();
  const [farmacia, setFarmacia] = useState(valoresIniciais.farmacia || null);
  const [valor, setValor] = useState(valoresIniciais.valor || '');
  const [status, setStatus] = useState(valoresIniciais.status || 'pago');
  const [vencimento, setVencimento] = useState(valoresIniciais.vencimento || '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const subtitulo = modo === 'editar'
    ? `Registrado em ${dataCurtaMes(valoresIniciais.data)}`
    : `Registrado em ${dataCurtaMes(new Date().toISOString())}`;

  async function salvar() {
    if (!farmacia) return setErro('Selecione a farmácia.');
    const centavos = centavosDe(valor);
    if (centavos == null || centavos <= 0) return setErro('Informe um valor válido.');
    const venc = dataVencimentoDe(vencimento);
    if (vencimento.trim() && venc == null) return setErro('Vencimento inválido. Use dd/mm/aaaa (com zero à esquerda).');
    setErro('');
    setSalvando(true);
    try {
      const dados = {
        farmacia_id: farmacia.id, valor_centavos: centavos, status_pagamento: status,
        data_vencimento: venc,
      };
      // data_pedido = dia LOCAL do aparelho (não a data UTC do servidor). Só ao
      // criar; ao editar, data_pedido é imutável no backend.
      if (modo !== 'editar') dados.data_pedido = dataLocalYMD();
      const p = modo === 'editar'
        ? await api.atualizarPedido(idAlvo, dados)
        : await api.criarPedido(dados);
      onSalvo(p);
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar o pedido.');
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onFechar}>
      <View style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onFechar} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 22, marginBottom: alturaTeclado }]}>
          <View style={styles.puxador} />
          <Text style={styles.titulo}>{modo === 'editar' ? 'Editar pedido' : 'Novo pedido'}</Text>
          <Text style={styles.subtitulo}>{subtitulo}</Text>

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

          <Text style={styles.label}>Vencimento (opcional)</Text>
          <TextInput
            style={styles.input}
            value={vencimento}
            onChangeText={setVencimento}
            placeholder="dd/mm/aaaa"
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
            <Text style={styles.botaoTexto}>
              {salvando ? 'Salvando…' : (modo === 'editar' ? 'Salvar alterações' : 'Salvar pedido')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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
