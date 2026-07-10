import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores } from '../theme';
import { api } from '../api/client';
import { useAlturaTeclado } from '../lib/useAlturaTeclado';
import { dentroDaBboxMaceio } from '../lib/mapaConfig';

// Formulário de cadastro manual de farmácia. A coordenada NÃO é digitada — vem
// do seletor de mapa (SeletorLocalizacao), que também pré-preenche endereço/
// bairro por geocode reverso. Aqui os números lat/lng só existem por trás; o
// usuário vê "localização definida no mapa" e pode reabrir o seletor p/ ajustar.
export default function NovaFarmaciaSheet({ coordenada, valoresIniciais = {}, onFechar, onCriada, onAjustarLocal }) {
  const insets = useSafeAreaInsets();
  const alturaTeclado = useAlturaTeclado();
  const [nome, setNome] = useState(valoresIniciais.nome || '');
  const [endereco, setEndereco] = useState(valoresIniciais.endereco || '');
  const [bairro, setBairro] = useState(valoresIniciais.bairro || '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const { latitude, longitude } = coordenada;

  async function salvar() {
    if (!nome.trim()) return setErro('Informe o nome da farmácia.');
    // Guarda de bbox no cliente; o polígono fino é validado no servidor.
    if (!dentroDaBboxMaceio(longitude, latitude)) {
      return setErro('Localização fora de Maceió — ajuste no mapa.');
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
      <View style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onFechar} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 22, marginBottom: alturaTeclado }]}>
          <View style={styles.puxador} />
          <Text style={styles.titulo}>Nova farmácia</Text>

          {/* localização definida no mapa (lat/lng ocultos) */}
          <View style={styles.local}>
            <View style={styles.localEsq}>
              <Text style={styles.localPin}>📍</Text>
              <Text style={styles.localTexto}>Localização definida no mapa</Text>
            </View>
            {onAjustarLocal && (
              <TouchableOpacity onPress={() => onAjustarLocal({ nome, endereco, bairro })} activeOpacity={0.7}>
                <Text style={styles.localAjustar}>Ajustar</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.label}>Nome *</Text>
          <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Ex.: Farmácia São José" placeholderTextColor="#9a9aa2" />

          <Text style={styles.label}>Endereço</Text>
          <TextInput style={styles.input} value={endereco} onChangeText={setEndereco} placeholder="Rua, número" placeholderTextColor="#9a9aa2" />

          <Text style={styles.label}>Bairro</Text>
          <TextInput style={styles.input} value={bairro} onChangeText={setBairro} placeholder="Ex.: Ponta Verde" placeholderTextColor="#9a9aa2" />

          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          <TouchableOpacity style={[styles.botao, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando} activeOpacity={0.85}>
            <Text style={styles.botaoTexto}>{salvando ? 'Salvando…' : 'Salvar farmácia'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,15,17,.34)' },
  sheet: { backgroundColor: cores.branco, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8 },
  puxador: { width: 38, height: 4, borderRadius: 2, backgroundColor: cores.borda3, alignSelf: 'center', marginTop: 4, marginBottom: 14 },
  titulo: { fontSize: 18, fontWeight: '700', color: cores.texto, marginBottom: 12 },
  local: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: cores.fundo, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 4,
  },
  localEsq: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  localPin: { fontSize: 15 },
  localTexto: { fontSize: 13.5, fontWeight: '600', color: cores.texto2 },
  localAjustar: { fontSize: 13.5, fontWeight: '700', color: cores.vinho },
  label: { fontSize: 12, fontWeight: '600', color: cores.textoMudo, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5, marginTop: 8 },
  input: {
    height: 44, borderRadius: 11, borderWidth: 1.5, borderColor: cores.borda3,
    paddingHorizontal: 12, fontSize: 15, color: cores.texto, backgroundColor: cores.branco,
  },
  erro: { color: cores.vinho, fontSize: 13, fontWeight: '600', marginTop: 10 },
  botao: { height: 52, borderRadius: 12, backgroundColor: cores.vinho, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  botaoTexto: { color: cores.branco, fontSize: 16, fontWeight: '600' },
});
