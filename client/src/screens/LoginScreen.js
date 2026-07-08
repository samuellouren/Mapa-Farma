import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';
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

// Olho aberto/fechado para revelar/ocultar a senha.
function IconeOlho({ aberto }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke={cores.textoMudo} strokeWidth={1.7} strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3} stroke={cores.textoMudo} strokeWidth={1.7} />
      {!aberto && <Line x1={4} y1={4} x2={20} y2={20} stroke={cores.textoMudo} strokeWidth={1.7} strokeLinecap="round" />}
    </Svg>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
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
        <View style={styles.senhaLinha}>
          <TextInput
            style={[styles.input, styles.senhaInput]}
            value={senha}
            onChangeText={setSenha}
            placeholder="••••••••"
            placeholderTextColor={cores.textoFraco}
            secureTextEntry={!mostrarSenha}
            autoCapitalize="none"
            onSubmitEditing={podeEntrar ? aoEntrar : undefined}
          />
          <TouchableOpacity
            style={styles.olho}
            onPress={() => setMostrarSenha((v) => !v)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            activeOpacity={0.7}
          >
            <IconeOlho aberto={mostrarSenha} />
          </TouchableOpacity>
        </View>

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
  senhaLinha: { position: 'relative', justifyContent: 'center' },
  senhaInput: { paddingRight: 50 },
  olho: { position: 'absolute', right: 0, top: 0, width: 50, height: 52, alignItems: 'center', justifyContent: 'center' },
  erro: { color: cores.vermelho, fontSize: 13.5, marginBottom: 8 },
  botao: {
    height: 54, borderRadius: raio.lg, backgroundColor: cores.vinho,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  botaoDesativado: { backgroundColor: cores.borda2 },
  botaoTexto: { color: cores.branco, fontSize: 17, fontWeight: '700' },
});
