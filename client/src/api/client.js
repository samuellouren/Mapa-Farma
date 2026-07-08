import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './config';

const TOKEN_KEY = 'mapafarma_token';

export const getToken = () => AsyncStorage.getItem(TOKEN_KEY);
export const setToken = (t) => AsyncStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => AsyncStorage.removeItem(TOKEN_KEY);

function toQuery(params = {}) {
  const q = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return q ? `?${q}` : '';
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = await getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    const erro = new Error(dados?.erro || `Erro ${res.status}`);
    erro.status = res.status;
    throw erro;
  }
  return dados;
}

export const api = {
  login: (email, senha) => request('/auth/login', { method: 'POST', body: { email, senha }, auth: false }),
  me: () => request('/auth/me'),

  listarFarmacias: (params) => request('/farmacias' + toQuery(params)),
  farmacia: (id) => request(`/farmacias/${id}`),
  criarFarmacia: (dados) => request('/farmacias', { method: 'POST', body: dados }),
  atualizarFarmacia: (id, patch) => request(`/farmacias/${id}`, { method: 'PATCH', body: patch }),
  relatorios: (id) => request(`/farmacias/${id}/relatorios`),
  registrarRelatorio: (id, dados) => request(`/farmacias/${id}/relatorios`, { method: 'POST', body: dados }),

  listarPedidos: () => request('/pedidos'),
  criarPedido: (dados) => request('/pedidos', { method: 'POST', body: dados }),
  atualizarPedido: (id, patch) => request(`/pedidos/${id}`, { method: 'PATCH', body: patch }),

  stats: (periodo) => request('/stats' + toQuery({ periodo })),
  usuarios: () => request('/usuarios'),
};
