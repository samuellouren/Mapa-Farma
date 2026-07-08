import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { cores, raio } from '../theme';
import { useAuth } from '../lib/auth';

function Logo() {
  return (
    <Svg width={58} height={70} viewBox="0 0 44 56">
      <Path
        d="M22 2C11 2 2 10.7 2 21.4 2 37 22 54 22 54s20-17 20-32.6C42 10.7 33 2 22 2Z"
        fill={cores.verde} stroke={cores.branco} strokeWidth={3}
      />
      <Rect x={13.5} y={19.5} width={17} height={5} rx={1.5} fill={cores.branco} />
      <Rect x={19.5} y={13.5} width={5} height={17} rx={1.5} fill={cores.branco} />
    </Svg>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const podeEntrar = email.trim() && senha && !carregando;

  async function aoEntrar() {
    setErro('');
    setCarregando(true);
    try {
      await entrar(email.trim(), senha);
    } catch (e) {
      setErro(e?.status === 401 ? 'Email ou senha incorretos.' : 'Não foi possível entrar. Verifique a conexão.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.tela}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topo, { paddingTop: insets.top + 40 }]}>
        <Logo />
        <Text style={styles.titulo}>Mapa Farma</Text>
        <Text style={styles.subtitulo}>Apoio comercial · equipe de vendas</Text>
      </View>

      <View style={[styles.card, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.cardTitulo}>Entrar</Text>

        <Text style={styles.rotulo}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="seu@email.com"
          placeholderTextColor={cores.textoFraco}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Text style={styles.rotulo}>Senha</Text>
        <TextInput
          style={styles.input}
          value={senha}
          onChangeText={setSenha}
          placeholder="••••••••"
          placeholderTextColor={cores.textoFraco}
          secureTextEntry
          onSubmitEditing={podeEntrar ? aoEntrar : undefined}
        />

        {erro ? <Text style={styles.erro}>{erro}</Text> : null}

        <TouchableOpacity
          style={[styles.botao, !podeEntrar && styles.botaoDesativado]}
          onPress={aoEntrar}
          disabled={!podeEntrar}
          activeOpacity={0.85}
        >
          {carregando
            ? <ActivityIndicator color={cores.branco} />
            : <Text style={styles.botaoTexto}>Entrar</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.vinho },
  topo: { alignItems: 'center', paddingBottom: 36, gap: 4 },
  titulo: { color: cores.branco, fontSize: 28, fontWeight: '700', marginTop: 14 },
  subtitulo: { color: 'rgba(255,255,255,.72)', fontSize: 13.5 },
  card: {
    flex: 1,
    backgroundColor: cores.branco,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 26,
  },
  cardTitulo: { fontSize: 20, fontWeight: '700', color: cores.texto, marginBottom: 18 },
  rotulo: {
    fontSize: 12, fontWeight: '600', color: cores.textoMudo,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7, marginTop: 4,
  },
  input: {
    height: 52, borderRadius: raio.md, borderWidth: 1.5, borderColor: cores.borda3,
    backgroundColor: cores.branco, paddingHorizontal: 14, fontSize: 15,
    color: cores.texto, marginBottom: 14,
  },
  erro: { color: cores.vermelho, fontSize: 13.5, marginBottom: 8 },
  botao: {
    height: 54, borderRadius: raio.lg, backgroundColor: cores.vinho,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  botaoDesativado: { backgroundColor: cores.borda2 },
  botaoTexto: { color: cores.branco, fontSize: 17, fontWeight: '700' },
});
