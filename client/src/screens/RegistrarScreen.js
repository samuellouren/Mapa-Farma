import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores } from '../theme';
import { api } from '../api/client';
import { dataHojeExtenso } from '../lib/formato';
import { IconeVoltar } from '../components/Icones';

const DURACOES = [10, 20, 30, 45];
const RE_HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;

export default function RegistrarScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { id, nome } = route.params;
  const [chegada, setChegada] = useState('');
  const [duracao, setDuracao] = useState(null);
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (chegada.trim() && !RE_HORA.test(chegada.trim())) {
      return setErro('Horário de chegada inválido — use HH:MM (ex.: 14:30).');
    }
    setErro('');
    setSalvando(true);
    try {
      await api.registrarRelatorio(id, {
        horario_chegada: chegada.trim() || null,
        duracao_minutos: duracao,
        observacao: observacao.trim() || null,
      });
      navigation.goBack(); // Ficha recarrega no focus
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar o relatório.');
      setSalvando(false);
    }
  }

  return (
    <View style={styles.tela}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.voltar} onPress={() => navigation.goBack()}>
          <IconeVoltar />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitulo}>Registrar visita</Text>
          <Text style={styles.headerSub}>{nome}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}>
          <View style={styles.card}>
            <View style={styles.linhaDataHora}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Data</Text>
                <Text style={styles.dataHoje}>{dataHojeExtenso()}</Text>
              </View>
              <View style={{ width: 110 }}>
                <Text style={styles.label}>Chegada</Text>
                <TextInput
                  style={styles.inputHora}
                  value={chegada}
                  onChangeText={setChegada}
                  placeholder="14:30"
                  placeholderTextColor="#9a9aa2"
                  maxLength={5}
                />
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Duração da visita</Text>
            <View style={styles.duracoes}>
              {DURACOES.map((min) => {
                const ativo = duracao === min;
                return (
                  <TouchableOpacity
                    key={min}
                    style={[styles.pilula, ativo ? styles.pilulaAtiva : styles.pilulaInativa]}
                    onPress={() => setDuracao(ativo ? null : min)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.pilulaTexto, { color: ativo ? cores.branco : cores.textoSuave }]}>
                      {min} min
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Observação</Text>
            <TextInput
              style={styles.observacao}
              value={observacao}
              onChangeText={setObservacao}
              placeholder="O que foi conversado, pedidos, pendências…"
              placeholderTextColor="#9a9aa2"
              multiline
              textAlignVertical="top"
            />
          </View>

          {!!erro && <Text style={styles.erroTexto}>{erro}</Text>}

          <TouchableOpacity
            style={[styles.botao, salvando && { opacity: 0.6 }]}
            onPress={salvar}
            disabled={salvando}
            activeOpacity={0.85}
          >
            <Text style={styles.botaoTexto}>{salvando ? 'Salvando…' : 'Salvar relatório'}</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>Registrado por você · marca a farmácia como visitada</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  header: {
    backgroundColor: cores.vinho, paddingHorizontal: 10, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitulo: { color: cores.branco, fontSize: 18, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,.75)', fontSize: 12.5, marginTop: 1 },
  card: {
    backgroundColor: cores.branco, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: cores.borda,
  },
  linhaDataHora: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  label: {
    fontSize: 12, fontWeight: '600', color: cores.textoMudo, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6,
  },
  dataHoje: { fontSize: 15, fontWeight: '600', color: cores.texto, paddingVertical: 11 },
  inputHora: {
    height: 44, borderRadius: 11, borderWidth: 1.5, borderColor: cores.borda3,
    paddingHorizontal: 12, fontSize: 15, color: cores.texto, textAlign: 'center',
  },
  duracoes: { flexDirection: 'row', gap: 8 },
  pilula: { flex: 1, height: 40, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pilulaAtiva: { backgroundColor: cores.vinho, borderColor: cores.vinho },
  pilulaInativa: { backgroundColor: cores.branco, borderColor: cores.borda3 },
  pilulaTexto: { fontSize: 13.5, fontWeight: '600' },
  observacao: {
    minHeight: 96, borderRadius: 11, borderWidth: 1.5, borderColor: cores.borda3,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: cores.texto,
  },
  erroTexto: { color: cores.vermelho, fontSize: 13, fontWeight: '600', marginTop: 12 },
  botao: {
    height: 52, borderRadius: 12, backgroundColor: cores.vinho, marginTop: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  botaoTexto: { color: cores.branco, fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, color: cores.textoFraco, textAlign: 'center', marginTop: 10 },
});
