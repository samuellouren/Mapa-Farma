import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, clearToken, getToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [token, setTok] = useState(null);
  const [carregando, setCarregando] = useState(true);

  // Ao abrir o app: se há token salvo, valida chamando /auth/me.
  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        if (t) {
          const u = await api.me();
          setUsuario(u);
          setTok(t);
        }
      } catch {
        await clearToken(); // token inválido/expirado
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  async function entrar(email, senha) {
    const { token: novoToken, usuario: u } = await api.login(email, senha);
    await setToken(novoToken);
    setTok(novoToken);
    setUsuario(u);
  }

  async function sair() {
    await clearToken();
    setTok(null);
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, token, carregando, entrar, sair }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
