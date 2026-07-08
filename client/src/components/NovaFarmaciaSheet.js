import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores } from '../theme';
import { api } from '../api/client';

// Bbox de Maceió pra feedback imediato; o polígono fino é validado no servidor.
const BBOX = { latMin: -9.72, latMax: -9.38, lngMin: -35.80, lngMax: -35.60 };

const parseCoord = (s) => {
  const n = Number(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Formulário de cadastro manual de farmácia (padrão visual do FiltroSheet).
// O pai monta este componente só quando aberto — o estado zera a cada abertura.
export default function NovaFarmaciaSheet({ coordenada, onFechar, onCriada }) {
  const insets = useSafeAreaInsets();
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [bairro, setBairro] = useState('');
  const [lat, setLat] = useState(coordenada.latitude.toFixed(6));
  const [lng, setLng] = useState(coordenada.longitude.toFixed(6));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const latitude = parseCoord(lat);
    const longitude = parseCoord(lng);
    if (!nome.trim()) return setErro('Informe o nome da farmácia.');
    if (latitude == null || longitude == null) return setErro('Latitude e longitude devem ser números.');
    if (latitude < BBOX.latMin || latitude > BBOX.latMax || longitude < BBOX.lngMin || longitude > BBOX.lngMax) {
      return setErro('Coordenada fora de Maceió.');
    }
    setErro('');
    setSalvando(true);
    try {
      const f = await api.criarFarmacia({
        nome: nome.trim(),
        endereco: endereco.trim() || null,
        bairro: bairro.trim() || null,
        latitude,
        longitude,
      });
      onCriada(f);
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar.');
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onFechar}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onFechar} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 22 }]}>
          <View style={styles.puxador} />
          <Text style={styles.titulo}>Nova farmácia</Text>

          <Text style={styles.label}>Nome *</Text>
          <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Ex.: Farmácia São José" placeholderTextColor="#9a9aa2" />

          <Text style={styles.label}>Endereço</Text>
          <TextInput style={styles.input} value={endereco} onChangeText={setEndereco} placeholder="Rua, número" placeholderTextColor="#9a9aa2" />

          <Text style={styles.label}>Bairro</Text>
          <TextInput style={styles.input} value={bairro} onChangeText={setBairro} placeholder="Ex.: Ponta Verde" placeholderTextColor="#9a9aa2" />

          <View style={styles.linhaCoord}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Latitude *</Text>
              <TextInput style={styles.input} value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Longitude *</Text>
              <TextInput style={styles.input} value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" />
            </View>
          </View>

          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          <TouchableOpacity style={[styles.botao, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando} activeOpacity={0.85}>
            <Text style={styles.botaoTexto}>{salvando ? 'Salvando…' : 'Salvar farmácia'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,15,17,.34)' },
  sheet: { backgroundColor: cores.branco, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8 },
  puxador: { width: 38, height: 4, borderRadius: 2, backgroundColor: cores.borda3, alignSelf: 'center', marginTop: 4, marginBottom: 14 },
  titulo: { fontSize: 18, fontWeight: '700', color: cores.texto, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: cores.textoMudo, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5, marginTop: 8 },
  input: {
    height: 44, borderRadius: 11, borderWidth: 1.5, borderColor: cores.borda3,
    paddingHorizontal: 12, fontSize: 15, color: cores.texto, backgroundColor: cores.branco,
  },
  linhaCoord: { flexDirection: 'row', gap: 10 },
  erro: { color: cores.vinho, fontSize: 13, fontWeight: '600', marginTop: 10 },
  botao: { height: 52, borderRadius: 12, backgroundColor: cores.vinho, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  botaoTexto: { color: cores.branco, fontSize: 16, fontWeight: '600' },
});
